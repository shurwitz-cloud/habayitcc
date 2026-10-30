import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { computeReceiptSig } from '@/lib/donations/receipt-url';
import { formatReceiptDateUTC } from '@/lib/donations/receipt-date';
import { bareDonationMemo, donationReceiptMethod } from '@/lib/donations/receipt-correction';

export const dynamic = 'force-dynamic';

/**
 * Record a correction so ONE already-sent signed receipt link renders the
 * payment's real ET date. Never sends email. Never changes donation, payment,
 * or any other receipt.
 *
 * GET  ?donationId=…[&sig=…] — dry-run: reconstructs the original (pre-fix,
 * UTC-dated) link parameters for that donation and computes its signature.
 *      Pass the sig from the actually-sent link to prove the reconstruction
 *      reproduces that exact link before recording anything.
 * POST { confirm: true, donationId, expectedSig? } — records the mapping
 *      original_sig -> donation. If expectedSig is given and does not match
 *      the reconstruction, refuses. Never overwrites a mapping that points at
 *      a different donation (409).
 */

async function reconstruct(donationId: string) {
  const supabase = createAdminClient();

  const { data: donation } = await supabase
    .from('donations')
    .select('id, first_name, last_name, amount, memo, campaign, donation_type, status')
    .eq('id', donationId)
    .maybeSingle();
  if (!donation) return { error: 'Donation not found' as const, status: 404 as const };
  if (donation.status !== 'succeeded') {
    return { error: 'Donation is not in succeeded status' as const, status: 400 as const };
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('paid_at, status')
    .eq('source_type', 'donation')
    .eq('source_id', donation.id)
    .order('paid_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!payment?.paid_at) {
    return { error: 'Donation has no payment paid_at' as const, status: 400 as const };
  }
  if (payment.status !== 'succeeded') {
    return { error: 'Payment is not in succeeded status' as const, status: 400 as const };
  }
  const paidAtDate = new Date(payment.paid_at);
  if (Number.isNaN(paidAtDate.getTime())) {
    return { error: 'Invalid payment paid_at' as const, status: 400 as const };
  }

  const method = donationReceiptMethod(donation);

  // Original links were minted with the runtime-local (UTC) date.
  const params = {
    name: `${donation.first_name} ${donation.last_name}`.trim(),
    amount: Number(donation.amount).toFixed(2),
    date: formatReceiptDateUTC(paidAtDate),
    method,
    campaign: donation.campaign?.trim() || undefined,
    memo: bareDonationMemo(donation.memo),
  };
  const originalSig = computeReceiptSig(params);

  return { supabase, donation, params, originalSig };
}

export async function GET(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  const donationId = (req.nextUrl.searchParams.get('donationId') || '').trim();
  if (!donationId) {
    return NextResponse.json({ error: 'donationId required' }, { status: 400 });
  }
  const providedSig = (req.nextUrl.searchParams.get('sig') || '').trim() || undefined;

  const result = await reconstruct(donationId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { data: existing } = await result.supabase
    .from('receipt_corrections')
    .select('donation_id, created_at')
    .eq('original_sig', result.originalSig)
    .maybeSingle();

  return NextResponse.json({
    donationId,
    reconstructed: result.params,
    originalSig: result.originalSig,
    matchesProvidedSig: providedSig ? providedSig === result.originalSig : undefined,
    existingMapping: existing ?? null,
    emailsSent: false,
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: { confirm?: boolean; donationId?: string; expectedSig?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true }' }, { status: 400 });
  }
  const donationId = (body.donationId || '').trim();
  if (!donationId) {
    return NextResponse.json({ error: 'donationId required' }, { status: 400 });
  }

  const result = await reconstruct(donationId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (body.expectedSig && body.expectedSig !== result.originalSig) {
    return NextResponse.json(
      {
        error: 'Reconstruction does not match the sent link; nothing recorded',
        originalSig: result.originalSig,
      },
      { status: 400 },
    );
  }

  const { data: existing } = await result.supabase
    .from('receipt_corrections')
    .select('donation_id')
    .eq('original_sig', result.originalSig)
    .maybeSingle();

  if (existing) {
    if (existing.donation_id !== result.donation.id) {
      return NextResponse.json(
        { error: 'This link already has a correction for a different donation; refusing' },
        { status: 409 },
      );
    }
    return NextResponse.json({
      success: true,
      inserted: false,
      alreadyExisted: true,
      donationId,
      originalSig: result.originalSig,
      emailsSent: false,
    });
  }

  const { error: insertError } = await result.supabase
    .from('receipt_corrections')
    .insert({ original_sig: result.originalSig, donation_id: result.donation.id });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    inserted: true,
    donationId,
    originalSig: result.originalSig,
    emailsSent: false,
  });
}
