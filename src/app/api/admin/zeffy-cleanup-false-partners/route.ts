import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Exact emails from the Jul 20 Zeffy import glitch. */
const FALSE_IMPORT_EMAILS = [
  'jackshamah@gmail.com',
  'scdalmao@gmail.com',
  'chayale93@gmail.com',
  'devoraraitman@gmail.com',
  'slavyhur@gmail.com',
  'adrian@amgad.com',
  'yakovbren@gmail.com',
  'jordyn.tarazi@gmail.com',
  'gurshrenker@gmail.com',
  'etaitarazi@yahoo.com',
  'adir@adiry.com',
  'zev@renegadefurniture.com',
  'tamir@noetic.io',
  'pessyr@gmail.com',
];

/**
 * Remove false Chai Partners created by the Zeffy import glitch.
 *
 * POST /api/admin/zeffy-cleanup-false-partners
 * Body: { confirm: true, dryRun?: boolean, hardDelete?: boolean }
 *
 * Default: cancel status. hardDelete: true removes partner + zeffy: payment rows.
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let confirm = false;
  let dryRun = true;
  let hardDelete = false;
  try {
    const body = (await req.json()) as {
      confirm?: boolean;
      dryRun?: boolean;
      hardDelete?: boolean;
    };
    confirm = body.confirm === true;
    dryRun = body.dryRun !== false;
    hardDelete = body.hardDelete === true;
  } catch {
    // defaults
  }

  if (!confirm) {
    return NextResponse.json(
      { error: 'Pass { confirm: true }. Use dryRun: true first to preview.' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const { data: byName, error: errName } = await supabase
    .from('chai_partners')
    .select('id, email, first_name, last_name, monthly_amount, status, created_at')
    .gte('created_at', since)
    .eq('first_name', 'Friend')
    .eq('last_name', 'Partner')
    .order('created_at', { ascending: false });

  if (errName) {
    return NextResponse.json({ error: errName.message }, { status: 500 });
  }

  const { data: byEmail, error: errEmail } = await supabase
    .from('chai_partners')
    .select('id, email, first_name, last_name, monthly_amount, status, created_at')
    .in('email', FALSE_IMPORT_EMAILS)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (errEmail) {
    return NextResponse.json({ error: errEmail.message }, { status: 500 });
  }

  const byId = new Map<string, (typeof byName extends (infer T)[] | null ? T : never)>();
  for (const p of [...(byName ?? []), ...(byEmail ?? [])]) {
    // Only remove the placeholder "Friend Partner" rows from this glitch — never real named partners.
    if (p.first_name === 'Friend' && p.last_name === 'Partner') {
      byId.set(p.id, p);
    }
  }
  const list = [...byId.values()];

  const results: Array<{
    id: string;
    email: string;
    amount: number;
    action: string;
  }> = [];

  for (const p of list) {
    if (dryRun) {
      results.push({
        id: p.id,
        email: p.email,
        amount: Number(p.monthly_amount) || 0,
        action: hardDelete ? 'would_delete' : 'would_cancel',
      });
      continue;
    }

    if (hardDelete) {
      await supabase
        .from('payments')
        .delete()
        .eq('source_type', 'chai_partner')
        .eq('source_id', p.id)
        .like('stripe_payment_intent_id', 'zeffy:%');

      const { error: delErr } = await supabase.from('chai_partners').delete().eq('id', p.id);
      results.push({
        id: p.id,
        email: p.email,
        amount: Number(p.monthly_amount) || 0,
        action: delErr ? `delete_failed:${delErr.message}` : 'deleted',
      });
    } else {
      await supabase
        .from('chai_partners')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', p.id);

      await supabase
        .from('payments')
        .update({ status: 'cancelled' })
        .eq('source_type', 'chai_partner')
        .eq('source_id', p.id)
        .like('stripe_payment_intent_id', 'zeffy:%');

      results.push({
        id: p.id,
        email: p.email,
        amount: Number(p.monthly_amount) || 0,
        action: 'cancelled',
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    hardDelete,
    count: results.length,
    results,
  });
}
