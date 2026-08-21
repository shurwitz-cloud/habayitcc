import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { stripe } from '@/lib/stripe/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  paidEventInputFromPaymentIntentMetadata,
  persistPaidEventRegistration,
  type PaidEventPersistInput,
} from '@/lib/events/persist-paid-event-registration';
import { sendPaidEventDuplicateChargeApologyEmail } from '@/lib/email/paid-event-duplicate-apology';
import { getPaidEvent } from '@/lib/events/paid-events';
import { normalizeDonorEmail } from '@/lib/donations/normalize-donor';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';

type RecoverBody = {
  confirm?: boolean;
  dryRun?: boolean;
  email?: string;
  emails?: string[];
  days?: number;
  oneRegistrationPerPerson?: boolean;
  sendEmail?: boolean;
  sendApology?: boolean;
};

function parseEmailFilters(body: RecoverBody): string[] {
  const list = [...(body.emails ?? []), ...(body.email ? [body.email] : [])]
    .map((e) => normalizeDonorEmail(e))
    .filter(Boolean);
  return [...new Set(list)];
}

export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let confirm = false;
  let dryRun = true;
  let emailFilters: string[] = [];
  let days = 14;
  let oneRegistrationPerPerson = true;
  let sendEmail = true;
  let sendApology = true;
  try {
    const body = (await req.json()) as RecoverBody;
    confirm = body.confirm === true;
    dryRun = body.dryRun !== false;
    emailFilters = parseEmailFilters(body);
    days = Math.min(90, Math.max(1, Number(body.days) || 14));
    oneRegistrationPerPerson = body.oneRegistrationPerPerson !== false;
    sendEmail = body.sendEmail !== false;
    sendApology = body.sendApology !== false;
  } catch {
    // defaults
  }

  if (!confirm) {
    return NextResponse.json(
      { error: 'Pass { confirm: true }. Use dryRun: true first to preview.' },
      { status: 400 },
    );
  }

  const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const supabase = createAdminClient();

  type Candidate = {
    pi: Stripe.PaymentIntent;
    email: string;
    slug: string;
    input: PaidEventPersistInput;
  };

  const candidates: Candidate[] = [];
  const results: Array<{
    pi: string;
    email: string;
    amount: number;
    action: string;
  }> = [];

  let startingAfter: string | undefined;
  for (let page = 0; page < 10; page++) {
    const list = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: since },
      starting_after: startingAfter,
    });

    for (const pi of list.data) {
      if (pi.status !== 'succeeded') continue;
      const meta = (pi.metadata ?? {}) as Record<string, string>;
      if (meta.type !== 'paid_event_registration') continue;

      const email = normalizeDonorEmail(meta.donor_email ?? '');
      if (emailFilters.length && !emailFilters.includes(email)) continue;

      let input = paidEventInputFromPaymentIntentMetadata(meta, pi.id);
      if (!input && email && meta.event_slug && meta.donor_name) {
        const parts = meta.donor_name.trim().split(/\s+/);
        input = {
          slug: meta.event_slug,
          firstName: parts[0] || 'Guest',
          lastName: parts.slice(1).join(' ') || '',
          email,
          phone: meta.phone || '',
          coverFee: Number(meta.card_fee || 0) > 0,
          sponsorAmount: Number(meta.sponsor_amount || 0) || 0,
          paymentIntentId: pi.id,
          womens: { women: Number(meta.women || 1) || 1 },
        };
      }

      if (!input) {
        results.push({
          pi: pi.id,
          email,
          amount: pi.amount / 100,
          action: 'missing_metadata',
        });
        continue;
      }

      candidates.push({ pi, email, slug: input.slug, input });
    }

    if (!list.has_more) break;
    startingAfter = list.data[list.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  candidates.sort((a, b) => b.pi.created - a.pi.created);

  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = oneRegistrationPerPerson ? `${c.email}::${c.slug}` : `${c.pi.id}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  for (const [, group] of groups) {
    const primary = group[0];
    const extraPis = group.slice(1).map((g) => g.pi.id);
    const allPiIds = group.map((g) => g.pi.id);
    const event = getPaidEvent(primary.slug);

    let existingId: string | null = null;
    for (const g of group) {
      const { data: existing } = await supabase
        .from('event_registrations')
        .select('id')
        .eq('stripe_payment_intent_id', g.pi.id)
        .maybeSingle();
      if (existing?.id) {
        existingId = existing.id;
        break;
      }
    }

    if (!existingId) {
      const { data: byEmail } = await supabase
        .from('event_registrations')
        .select('id')
        .eq('event_slug', primary.slug)
        .ilike('email', primary.email)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byEmail?.id) existingId = byEmail.id;
    }

    if (existingId) {
      if (!dryRun && sendApology && event && group.length > 1) {
        await sendPaidEventDuplicateChargeApologyEmail({
          event,
          firstName: primary.input.firstName,
          email: primary.email,
          ticketAmount: Number(
            primary.pi.metadata?.ticket_subtotal || primary.pi.amount / 100,
          ),
        });
        results.push({
          pi: primary.pi.id,
          email: primary.email,
          amount: primary.pi.amount / 100,
          action: `already_registered:${existingId};apology_sent`,
        });
      } else {
        for (const g of group) {
          results.push({
            pi: g.pi.id,
            email: g.email,
            amount: g.pi.amount / 100,
            action: `already_registered:${existingId}`,
          });
        }
      }
      continue;
    }

    const refundNote =
      extraPis.length > 0
        ? `\n\nDuplicate Stripe charges (refund extras in Stripe):\n${allPiIds.map((id) => `- ${id}`).join('\n')}`
        : `\n\nStripe payment: ${primary.pi.id}`;

    if (dryRun) {
      results.push({
        pi: primary.pi.id,
        email: primary.email,
        amount: primary.pi.amount / 100,
        action: `would_create:${primary.slug};email=${sendEmail ? 'once' : 'skip'};apology=${sendApology && group.length > 1};extras=${extraPis.length}`,
      });
      for (const g of group.slice(1)) {
        results.push({
          pi: g.pi.id,
          email: g.email,
          amount: g.pi.amount / 100,
          action: `would_skip_duplicate_of:${primary.pi.id}`,
        });
      }
      continue;
    }

    const persisted = await persistPaidEventRegistration({
      ...primary.input,
      paymentIntentId: primary.pi.id,
      skipEmail: !sendEmail,
      skipSheet: false,
    });

    if (!persisted.success) {
      results.push({
        pi: primary.pi.id,
        email: primary.email,
        amount: primary.pi.amount / 100,
        action: `failed:${persisted.error}`,
      });
      continue;
    }

    try {
      const { data: row } = await supabase
        .from('event_registrations')
        .select('notes')
        .eq('id', persisted.registrationId)
        .maybeSingle();
      const notes = `${row?.notes ?? ''}${refundNote}`.trim();
      await supabase
        .from('event_registrations')
        .update({ notes })
        .eq('id', persisted.registrationId);
    } catch (noteErr) {
      console.error('[recover] note update failed', noteErr);
    }

    let apologySent = false;
    if (sendApology && event && group.length > 1) {
      apologySent = await sendPaidEventDuplicateChargeApologyEmail({
        event,
        firstName: primary.input.firstName,
        email: primary.email,
        ticketAmount: Number(
          primary.pi.metadata?.ticket_subtotal || primary.pi.amount / 100,
        ),
      });
    }

    results.push({
      pi: primary.pi.id,
      email: primary.email,
      amount: primary.pi.amount / 100,
      action: `created:${persisted.registrationId};emailed=${sendEmail && !persisted.alreadyExisted};apology=${apologySent}`,
    });
    for (const g of group.slice(1)) {
      results.push({
        pi: g.pi.id,
        email: g.email,
        amount: g.pi.amount / 100,
        action: `skipped_duplicate_of:${primary.pi.id}`,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    days,
    emailFilters: emailFilters.length ? emailFilters : null,
    oneRegistrationPerPerson,
    sendEmail,
    sendApology,
    count: results.length,
    created: results.filter((r) => r.action.startsWith('created')).length,
    wouldCreate: results.filter((r) => r.action.startsWith('would_create')).length,
    results,
  });
}
