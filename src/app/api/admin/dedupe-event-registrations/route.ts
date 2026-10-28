import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { normalizeDonorEmail } from '@/lib/donations/normalize-donor';
import { PAID_EVENTS } from '@/lib/events/paid-events';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  email: string | null;
  event_slug: string | null;
  created_at: string;
  amount: number | null;
  sponsor_amount: number | null;
  stripe_payment_intent_id: string | null;
  notes: string | null;
};

/**
 * Remove duplicate paid-event CRM submissions (form + webhook doubles).
 * Keeps one row per email+event: prefer row with Stripe PI, then higher amount, then newest.
 * Does NOT send emails.
 *
 * POST /api/admin/dedupe-event-registrations
 * Body: { confirm: true, dryRun?: boolean, slug?: string }
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let confirm = false;
  let dryRun = true;
  let slugFilter = '';
  try {
    const body = (await req.json()) as {
      confirm?: boolean;
      dryRun?: boolean;
      slug?: string;
    };
    confirm = body.confirm === true;
    dryRun = body.dryRun !== false;
    slugFilter = String(body.slug || '').trim();
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
  const paidSlugs = new Set(PAID_EVENTS.map((e) => e.slug));
  if (slugFilter && !paidSlugs.has(slugFilter as never)) {
    // Still allow filtering by any slug string
  }

  const { data: rows, error } = await supabase
    .from('event_registrations')
    .select(
      'id, email, event_slug, created_at, amount, sponsor_amount, stripe_payment_intent_id, notes',
    )
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filtered = ((rows ?? []) as Row[]).filter((r) => {
    if (!r.event_slug || !r.email) return false;
    if (slugFilter && r.event_slug !== slugFilter) return false;
    if (!slugFilter && !paidSlugs.has(r.event_slug as never)) return false;
    return true;
  });

  const groups = new Map<string, Row[]>();
  for (const r of filtered) {
    const key = `${normalizeDonorEmail(r.email || '')}::${r.event_slug}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const keepIds: string[] = [];
  const deleteIds: string[] = [];
  const plan: Array<{
    email: string;
    slug: string;
    keep: string;
    remove: string[];
  }> = [];

  function score(r: Row): number {
    let s = 0;
    if (r.stripe_payment_intent_id) s += 1000;
    s += Number(r.amount || 0) * 10;
    s += Number(r.sponsor_amount || 0);
    s += new Date(r.created_at).getTime() / 1e12;
    return s;
  }

  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => score(b) - score(a));
    const keep = sorted[0];
    const remove = sorted.slice(1);
    keepIds.push(keep.id);
    for (const r of remove) deleteIds.push(r.id);
    const [email, slug] = key.split('::');
    plan.push({
      email,
      slug,
      keep: keep.id,
      remove: remove.map((r) => r.id),
    });
  }

  // Map deleted registration id → kept id so payment rows stay linked.
  const idRemap: Record<string, string> = {};
  for (const g of plan) {
    for (const rid of g.remove) idRemap[rid] = g.keep;
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      duplicateGroups: plan.length,
      wouldDelete: deleteIds.length,
      wouldRemapPayments: Object.keys(idRemap).length,
      plan: plan.slice(0, 100),
    });
  }

  let remappedPayments = 0;
  for (const [fromId, toId] of Object.entries(idRemap)) {
    const { data: updated, error: payErr } = await supabase
      .from('payments')
      .update({ source_id: toId })
      .eq('source_type', 'event_registration')
      .eq('source_id', fromId)
      .select('id');
    if (payErr) {
      return NextResponse.json(
        { error: `Payment remap failed: ${payErr.message}`, plan },
        { status: 500 },
      );
    }
    remappedPayments += updated?.length ?? 0;
  }

  let deleted = 0;
  // Delete in chunks
  for (let i = 0; i < deleteIds.length; i += 50) {
    const chunk = deleteIds.slice(i, i + 50);
    const { error: delErr, count } = await supabase
      .from('event_registrations')
      .delete({ count: 'exact' })
      .in('id', chunk);
    if (delErr) {
      return NextResponse.json(
        {
          error: delErr.message,
          deletedSoFar: deleted,
          remappedPayments,
          plan,
        },
        { status: 500 },
      );
    }
    deleted += count ?? chunk.length;
  }

  return NextResponse.json({
    ok: true,
    dryRun: false,
    duplicateGroups: plan.length,
    deleted,
    remappedPayments,
    kept: keepIds.length,
    plan: plan.slice(0, 100),
  });
}
