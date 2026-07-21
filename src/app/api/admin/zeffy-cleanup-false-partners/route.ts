import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Cancel false Chai Partners created by the Zeffy import glitch (Friend Partner + today).
 *
 * POST /api/admin/zeffy-cleanup-false-partners
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
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { data: partners, error } = await supabase
    .from('chai_partners')
    .select('id, email, first_name, last_name, monthly_amount, status, created_at')
    .gte('created_at', startOfDay.toISOString())
    .eq('first_name', 'Friend')
    .eq('last_name', 'Partner')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = partners ?? [];
  const results: Array<{ id: string; email: string; amount: number; action: string }> = [];

  for (const p of list) {
    if (dryRun) {
      results.push({
        id: p.id,
        email: p.email,
        amount: Number(p.monthly_amount) || 0,
        action: 'would_cancel',
      });
      continue;
    }

    await supabase
      .from('chai_partners')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', p.id);

    // Soft-void related zeffy ledger rows for this partner created today.
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

  return NextResponse.json({
    ok: true,
    dryRun,
    count: results.length,
    results,
  });
}
