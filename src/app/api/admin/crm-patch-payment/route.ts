import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Patch a payment ledger row (amount / method / coverage months).
 * POST /api/admin/crm-patch-payment
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: {
    confirm?: boolean;
    paymentId?: string;
    amount?: number;
    paymentMethod?: string;
    coverageMonths?: number;
    paidAt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }

  const paymentId = (body.paymentId ?? '').trim();
  if (!paymentId) {
    return NextResponse.json({ error: 'paymentId is required.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.amount != null) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be positive.' }, { status: 400 });
    }
    patch.amount = amount;
  }
  if (typeof body.paymentMethod === 'string' && body.paymentMethod.trim()) {
    patch.payment_method = body.paymentMethod.trim();
  }
  if (body.coverageMonths != null) {
    const months = Math.floor(Number(body.coverageMonths));
    if (!Number.isFinite(months) || months < 1) {
      return NextResponse.json({ error: 'coverageMonths must be ≥ 1.' }, { status: 400 });
    }
    patch.coverage_months = months;
  }
  if (typeof body.paidAt === 'string' && body.paidAt.trim()) {
    const d = new Date(body.paidAt);
    if (!Number.isNaN(d.getTime())) patch.paid_at = d.toISOString();
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  let { data, error } = await supabase
    .from('payments')
    .update(patch)
    .eq('id', paymentId)
    .select('id, amount, payment_method, coverage_months, paid_at, source_type, source_id')
    .maybeSingle();

  if (error && /payment_method|coverage_months|schema cache|column/i.test(error.message)) {
    const fallback = { ...patch };
    delete fallback.payment_method;
    delete fallback.coverage_months;
    ({ data, error } = await supabase
      .from('payments')
      .update(fallback)
      .eq('id', paymentId)
      .select('id, amount, paid_at, source_type, source_id')
      .maybeSingle());
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
  }

  // Keep chai form log in sync when we can match the intent key.
  if (data.source_type === 'chai_partner') {
    const { data: pay } = await supabase
      .from('payments')
      .select('stripe_payment_intent_id')
      .eq('id', paymentId)
      .maybeSingle();
    const intent = pay?.stripe_payment_intent_id;
    if (intent) {
      const key = intent.replace(/^zeffy:/, '');
      const { data: subs } = await supabase
        .from('form_submissions')
        .select('id, payload')
        .eq('form_type', 'chai_partner')
        .eq('source_id', data.source_id)
        .order('created_at', { ascending: false })
        .limit(20);
      const match = (subs || []).find((s) => {
        const p = (s.payload || {}) as Record<string, unknown>;
        const id = String(p.zeffyPaymentId || '');
        return id === key || id === intent || `zeffy:${id}` === intent;
      });
      if (match) {
        const payload = {
          ...((match.payload || {}) as Record<string, unknown>),
          ...(patch.amount != null ? { amountDollars: patch.amount } : {}),
          ...(patch.coverage_months != null
            ? { coverageMonths: patch.coverage_months }
            : {}),
          ...(patch.payment_method != null
            ? { paymentMethod: patch.payment_method }
            : {}),
        };
        await supabase
          .from('form_submissions')
          .update({ payload })
          .eq('id', match.id);
      }
    }
  }

  return NextResponse.json({ ok: true, payment: data });
}
