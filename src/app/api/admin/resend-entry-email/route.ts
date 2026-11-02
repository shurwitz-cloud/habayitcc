import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { sendDonationReceiptEmailFromRecord } from '@/lib/email/donation-receipt';
import { sendGoodsPaymentEmail } from '@/lib/email/goods-payment';
import { buildPaymentReceiptUrl } from '@/lib/payments/payment-receipt-url';
import { getSiteUrl } from '@/lib/email/client';

export const dynamic = 'force-dynamic';

/**
 * Resend the receipt email for ONE payment with its CURRENT data,
 * after an explicit admin click (never automatic after an edit).
 * Writes an 'email_resent' audit row.
 * POST { confirm: true, paymentKey }
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: { confirm?: boolean; paymentKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }
  const paymentKey = (body.paymentKey ?? '').trim();
  if (!paymentKey) {
    return NextResponse.json({ error: 'paymentKey is required.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  let emailed = false;
  let kind: 'donation' | 'goods' | null = null;

  const { data: donation } = await supabase
    .from('donations')
    .select('*')
    .eq('stripe_payment_intent_id', paymentKey)
    .maybeSingle();

  if (donation) {
    kind = 'donation';
    const { data: ledger } = await supabase
      .from('payments')
      .select('payment_method, paid_at')
      .eq('stripe_payment_intent_id', paymentKey)
      .order('paid_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    emailed = await sendDonationReceiptEmailFromRecord({
      email: donation.email,
      firstName: donation.first_name,
      lastName: donation.last_name,
      amountDollars: Number(donation.amount),
      campaign: donation.campaign,
      memo: donation.memo,
      dedicationName: donation.dedication_name,
      dedicationType: donation.dedication_type,
      donationType: donation.donation_type === 'Monthly' ? 'Monthly' : 'One-Time',
      method: ledger?.payment_method ?? undefined,
      paidAt: ledger?.paid_at ?? donation.created_at,
    });
  } else {
    const { data: goods } = await supabase
      .from('goods_payments')
      .select('*')
      .eq('payment_key', paymentKey)
      .maybeSingle();
    if (!goods) {
      return NextResponse.json({ error: 'payment not found.' }, { status: 404 });
    }
    kind = 'goods';
    const paidAt = goods.paid_at ?? goods.created_at;
    const paidDate = new Date(paidAt);
    const receiptPath = buildPaymentReceiptUrl({
      name: `${goods.first_name} ${goods.last_name}`.trim(),
      date: paidDate,
      method: goods.payment_method ?? 'Zelle',
      items: [
        { label: goods.item_label, qty: goods.quantity, unit: Number(goods.unit_amount) },
      ],
      note: goods.memo || undefined,
    });
    emailed = await sendGoodsPaymentEmail({
      firstName: goods.first_name,
      email: goods.email,
      items: [
        { label: goods.item_label, qty: goods.quantity, unit: Number(goods.unit_amount) },
      ],
      total: Number(goods.amount),
      method: goods.payment_method ?? 'Zelle',
      dateLong: paidDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      receiptUrl: `${getSiteUrl()}${receiptPath}`,
    });
    if (emailed) {
      await supabase
        .from('goods_payments')
        .update({ receipt_emailed_at: new Date().toISOString() })
        .eq('id', goods.id);
    }
  }

  if (!emailed) {
    return NextResponse.json({ error: 'Email could not be sent.' }, { status: 500 });
  }

  await supabase.from('entry_audit_log').insert({
    payment_key: paymentKey,
    action: 'email_resent',
    from_kind: kind,
    changes: {},
  });

  return NextResponse.json({ ok: true, emailed: true, kind });
}
