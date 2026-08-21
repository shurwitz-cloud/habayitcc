import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { stripe } from '@/lib/stripe/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  paidEventInputFromPaymentIntentMetadata,
  persistPaidEventRegistration,
} from '@/lib/events/persist-paid-event-registration';
import { normalizeDonorEmail } from '@/lib/donations/normalize-donor';

export const dynamic = 'force-dynamic';

/**
 * Recover paid event registrations that charged in Stripe but never saved to CRM.
 *
 * POST /api/admin/recover-paid-event-registrations
 * Body: { confirm: true, email?: string, dryRun?: boolean, days?: number }
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let confirm = false;
  let dryRun = true;
  let emailFilter = '';
  let days = 14;
  try {
    const body = (await req.json()) as {
      confirm?: boolean;
      dryRun?: boolean;
      email?: string;
      days?: number;
    };
    confirm = body.confirm === true;
    dryRun = body.dryRun !== false;
    emailFilter = normalizeDonorEmail(body.email ?? '');
    days = Math.min(90, Math.max(1, Number(body.days) || 14));
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
      if (emailFilter && email !== emailFilter) continue;

      const { data: existing } = await supabase
        .from('event_registrations')
        .select('id')
        .eq('stripe_payment_intent_id', pi.id)
        .maybeSingle();

      if (existing?.id) {
        results.push({
          pi: pi.id,
          email,
          amount: pi.amount / 100,
          action: `already_registered:${existing.id}`,
        });
        continue;
      }

      // Older charges may lack rich metadata — still recover with donor_name + defaults.
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

      if (dryRun) {
        results.push({
          pi: pi.id,
          email,
          amount: pi.amount / 100,
          action: `would_create:${input.slug}`,
        });
        continue;
      }

      const persisted = await persistPaidEventRegistration({
        ...input,
        skipEmail: false,
        skipSheet: false,
      });

      results.push({
        pi: pi.id,
        email,
        amount: pi.amount / 100,
        action: persisted.success
          ? `created:${persisted.registrationId}`
          : `failed:${persisted.error}`,
      });
    }

    if (!list.has_more) break;
    startingAfter = list.data[list.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    days,
    emailFilter: emailFilter || null,
    count: results.length,
    created: results.filter((r) => r.action.startsWith('created')).length,
    wouldCreate: results.filter((r) => r.action.startsWith('would_create')).length,
    results,
  });
}
