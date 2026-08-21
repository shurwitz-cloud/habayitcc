import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Pricing = {
  ticketSubtotal?: number;
  sponsorAmount?: number;
  cardFee?: number;
  total?: number;
  fairChildLines?: unknown;
};

/**
 * Ensure paid-event money columns exist, then backfill amount/sponsor/details
 * from form_submissions payloads (where pricing was always logged).
 *
 * POST /api/admin/backfill-event-registration-money
 * Body: { confirm: true, dryRun?: boolean }
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let confirm = false;
  let dryRun = true;
  try {
    const body = (await req.json()) as { confirm?: boolean; dryRun?: boolean };
    confirm = body.confirm === true;
    dryRun = body.dryRun !== false;
  } catch {
    // defaults
  }

  if (!confirm) {
    return NextResponse.json(
      { error: 'Pass { confirm: true }. Use dryRun: true first to preview.' },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Best-effort schema ensure (ignore errors if already applied).
  const alters = [
    `alter table event_registrations add column if not exists amount numeric(10,2)`,
    `alter table event_registrations add column if not exists sponsor_amount numeric(10,2)`,
    `alter table event_registrations add column if not exists card_fee numeric(10,2)`,
    `alter table event_registrations add column if not exists stripe_payment_intent_id text`,
    `alter table event_registrations add column if not exists registration_details jsonb`,
  ];
  // Supabase JS can't run arbitrary SQL without rpc — skip if no exec function.
  // Columns must exist; probe with a select.
  const { error: probeError } = await supabase
    .from('event_registrations')
    .select('id, amount, sponsor_amount, card_fee, registration_details')
    .limit(1);

  if (probeError && /column|schema/i.test(probeError.message)) {
    return NextResponse.json(
      {
        error: `Paid-event columns missing on event_registrations: ${probeError.message}`,
        hint: 'Run supabase/migrations/0012_paid_event_registrations.sql in the Supabase SQL Editor, then retry this backfill.',
        alters,
      },
      { status: 500 },
    );
  }

  const { data: submissions, error: subErr } = await supabase
    .from('form_submissions')
    .select('id, email, payload, created_at')
    .eq('form_type', 'rsvp')
    .order('created_at', { ascending: false })
    .limit(2000);

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }

  const priced = (submissions ?? []).filter((s) => {
    const p = s.payload as Record<string, unknown> | null;
    const pricing = p?.pricing as Pricing | undefined;
    return pricing && Number(pricing.total) > 0;
  });

  const results: Array<{
    email: string;
    slug: string;
    amount: number;
    action: string;
  }> = [];

  for (const s of priced) {
    const p = s.payload as Record<string, unknown>;
    const pricing = p.pricing as Pricing;
    const slug = String(p.slug || '').trim();
    const email = String(s.email || p.email || '')
      .trim()
      .toLowerCase();
    if (!slug || !email.includes('@')) continue;

    const amount = Number(pricing.total) || 0;
    const sponsor = Number(pricing.sponsorAmount) || 0;
    const fee = Number(pricing.cardFee) || 0;
    const ticketSubtotal = Number(pricing.ticketSubtotal) || 0;

    const { data: regs, error: regErr } = await supabase
      .from('event_registrations')
      .select('id, amount, sponsor_amount, card_fee, registration_details, stripe_payment_intent_id')
      .eq('event_slug', slug)
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(5);

    if (regErr) {
      results.push({ email, slug, amount, action: `lookup_failed:${regErr.message}` });
      continue;
    }

    const needing = (regs ?? []).filter((r) => !(Number(r.amount) > 0));

    if (!needing.length) {
      results.push({ email, slug, amount, action: 'already_has_amount' });
      continue;
    }

    const target = needing[0];
    const details = {
      ...(typeof target.registration_details === 'object' && target.registration_details
        ? (target.registration_details as Record<string, unknown>)
        : {}),
      type:
        slug.includes('dinner')
          ? 'dinner'
          : slug.includes('fair')
            ? 'family-fair'
            : slug.includes('womens')
              ? 'womens'
              : undefined,
      dinner: p.dinner,
      fair: p.fair,
      womens: p.womens,
      fairChildLines: pricing.fairChildLines,
      ticketSubtotal,
      coverFee: Boolean(p.coverFee),
    };

    if (dryRun) {
      results.push({ email, slug, amount, action: `would_update:${target.id}` });
      continue;
    }

    const { error: updErr } = await supabase
      .from('event_registrations')
      .update({
        amount,
        sponsor_amount: sponsor,
        card_fee: fee,
        registration_details: details,
        stripe_payment_intent_id:
          target.stripe_payment_intent_id ||
          (typeof p.paymentIntentId === 'string' ? p.paymentIntentId : null),
      })
      .eq('id', target.id);

    results.push({
      email,
      slug,
      amount,
      action: updErr ? `update_failed:${updErr.message}` : `updated:${target.id}`,
    });
  }

  const updated = results.filter((r) => r.action.startsWith('updated')).length;
  const would = results.filter((r) => r.action.startsWith('would_update')).length;

  return NextResponse.json({
    ok: true,
    dryRun,
    pricedSubmissions: priced.length,
    updated,
    wouldUpdate: would,
    results: results.slice(0, 100),
  });
}
