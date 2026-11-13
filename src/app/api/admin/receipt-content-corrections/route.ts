import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { computeReceiptSig, readReceiptParam, verifyReceiptSearchParams } from '@/lib/donations/receipt-url';
import { formatReceiptDate } from '@/lib/donations/receipt-date';
import { bareDonationMemo, correctionConsistent, donationReceiptMethod } from '@/lib/donations/receipt-correction';

export const dynamic = 'force-dynamic';

/** Finance-only exact-link repair. No email or donation/payment mutations. */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;
  // UI requests must originate on this host; never accept cross-site writes.
  if (req.headers.get('origin') !== req.nextUrl.origin) {
    return NextResponse.json({ error: 'Origin mismatch' }, { status: 403 });
  }
  let body: { donationId?: string; receiptUrl?: string; confirm?: boolean; expectedCorrectedSig?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
  if (!body.donationId || !body.receiptUrl) return fail('Donation ID and actual sent URL required');
  let url: URL;
  try { url = new URL(body.receiptUrl); } catch { return fail('Invalid receipt URL'); }
  if (url.protocol !== 'https:' || !['habayitcc.org', 'www.habayitcc.org'].includes(url.hostname) || url.pathname !== '/receipt' || url.username || url.password || url.port || url.hash) return fail('Use the original official receipt URL');
  const allowed = new Set(['name', 'amount', 'date', 'method', 'campaign', 'memo', 'sig']);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) return fail('Unsupported or duplicate receipt fields');
  }
  const params = Object.fromEntries(url.searchParams);
  if (!verifyReceiptSearchParams(params)) return fail('Original receipt signature is invalid');
  const sig = readReceiptParam(params.sig)!;
  const supabase = createAdminClient();
  const { data: donation, error: donationError } = await supabase.from('donations')
    .select('id, first_name, last_name, company, amount, memo, campaign, donation_type, status')
    .eq('id', body.donationId).maybeSingle();
  if (donationError) return fail('Donation lookup failed', 500);
  if (!donation || donation.status !== 'succeeded') return fail('Succeeded donation required');
  const { data: payment, error: paymentError } = await supabase.from('payments').select('paid_at, status, payment_method')
    .eq('source_type', 'donation').eq('source_id', donation.id).order('paid_at', { ascending: true }).limit(1).maybeSingle();
  if (paymentError) return fail('Payment lookup failed', 500);
  if (!payment?.paid_at || payment.status !== 'succeeded' || Number.isNaN(new Date(payment.paid_at).getTime())) return fail('Succeeded dated payment required');
  const name = readReceiptParam(params.name)!;
  const amount = Number(readReceiptParam(params.amount));
  const method = readReceiptParam(params.method) || 'Credit Card';
  if (!Number.isFinite(amount) || amount <= 0 || !correctionConsistent({
    donationName: `${donation.first_name} ${donation.last_name}`.trim(), donationAmount: Number(donation.amount),
    donationMethod: payment.payment_method?.trim() || donationReceiptMethod(donation), donationCampaign: donation.campaign,
    linkName: name, linkAmount: amount, linkMethod: method, linkCampaign: readReceiptParam(params.campaign),
  })) return fail('Receipt does not match this donation');
  const date = formatReceiptDate(new Date(payment.paid_at));
  // This route is ONLY a company/memo repair, not a date or financial repair.
  if (readReceiptParam(params.date) !== date) return fail('Payment date differs; use date correction separately');
  const corrected = {
    name: donation.company?.trim() || `${donation.first_name} ${donation.last_name}`.trim(),
    memo: bareDonationMemo(donation.memo) || '', amount: Number(donation.amount).toFixed(2), date, method,
    campaign: donation.campaign?.trim() || undefined,
  };
  const originalMemo = readReceiptParam(params.memo);
  if (originalMemo && originalMemo !== corrected.memo) return fail('Existing nonblank memo differs; manual review required');
  const correctedSig = computeReceiptSig(corrected);
  const { data: existing, error: lookupError } = await supabase.from('receipt_corrections')
    .select('donation_id, correct_content, superseded_at').eq('original_sig', sig).maybeSingle();
  if (lookupError) return fail('Correction lookup failed; check migration', 500);
  if (existing && (existing.donation_id !== donation.id || existing.superseded_at)) return fail('Conflicting or superseded link', 409);
  if (body.confirm !== true) return NextResponse.json({ preview: true, original: params, corrected, correctedSig, emailsSent: false });
  if (!body.expectedCorrectedSig || body.expectedCorrectedSig !== correctedSig) return fail('Record changed or preview missing; preview again', 409);
  if (existing?.correct_content) return NextResponse.json({ success: true, alreadyExisted: true, emailsSent: false });
  const result = existing
    ? await supabase.from('receipt_corrections').update({ correct_content: true }).eq('original_sig', sig).eq('donation_id', donation.id).is('superseded_at', null).select('original_sig')
    : await supabase.from('receipt_corrections').insert({ original_sig: sig, donation_id: donation.id, correct_content: true }).select('original_sig');
  if (result.error || result.data?.length !== 1) return fail('Correction not recorded; nothing else changed', 409);
  return NextResponse.json({ success: true, emailsSent: false });
}
