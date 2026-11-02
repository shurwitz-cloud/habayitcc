import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { computeReceiptSig } from '@/lib/donations/receipt-url';
import {
  formatReceiptDate,
  formatReceiptDateUTC,
} from '@/lib/donations/receipt-date';
import {
  bareDonationMemo,
  donationReceiptMethod,
} from '@/lib/donations/receipt-correction';

export const dynamic = 'force-dynamic';

const EDITABLE = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'amount',
  'memo',
  'paid_at',
  'payment_method',
  'campaign',
  'item_label',
  'include_in_year_end',
] as const;

/**
 * Edit ONE payment's details (whitelisted fields). Single database
 * transaction (edit_payment, migration 0023): the record, the single
 * ledger row, and the audit log update atomically. Never sends email;
 * resending after an edit is a separate explicit admin choice.
 * POST { confirm: true, paymentKey, changes: { field: value }, note? }
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: {
    confirm?: boolean;
    paymentKey?: string;
    changes?: Record<string, unknown>;
    note?: string;
    supersedePriorReceipt?: boolean;
  };
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
  const changes = body.changes ?? {};
  const keys = Object.keys(changes).filter((k) =>
    (EDITABLE as readonly string[]).includes(k),
  );
  if (keys.length === 0) {
    return NextResponse.json(
      { error: `changes must include at least one of: ${EDITABLE.join(', ')}.` },
      { status: 400 },
    );
  }
  const clean: Record<string, unknown> = {};
  for (const k of keys) clean[k] = changes[k];
  if (clean.amount != null && !(Number(clean.amount) > 0)) {
    return NextResponse.json({ error: 'amount must be positive.' }, { status: 400 });
  }
  if (clean.email != null && !String(clean.email).includes('@')) {
    return NextResponse.json({ error: 'email is invalid.' }, { status: 400 });
  }
  if (clean.paid_at != null && Number.isNaN(new Date(String(clean.paid_at)).getTime())) {
    return NextResponse.json({ error: 'paid_at is invalid.' }, { status: 400 });
  }
  if (clean.item_label != null && String(clean.item_label).trim().length === 0) {
    return NextResponse.json({ error: 'item_label must be non-empty.' }, { status: 400 });
  }
  if (clean.include_in_year_end != null && typeof clean.include_in_year_end !== 'boolean') {
    return NextResponse.json(
      { error: 'include_in_year_end must be a boolean.' },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Optional, explicit: mark previously emailed signed receipt links for this
  // donation as replaced. Compute candidate signatures from the PRE-edit row
  // (both date conventions ever used), so only links actually minted from this
  // record stop rendering. Best-effort and reported, never silent.
  let supersedeSigs: string[] = [];
  let supersedeDonationId: string | null = null;
  if (body.supersedePriorReceipt === true) {
    const { data: don } = await supabase
      .from('donations')
      .select(
        'id, first_name, last_name, amount, memo, campaign, status, donation_type, goods_description, goods_fmv, dedication_name, dedication_type',
      )
      .eq('payment_key', paymentKey)
      .maybeSingle();
    if (don) {
      const { data: ledger } = await supabase
        .from('payments')
        .select('paid_at')
        .eq('source_type', 'donation')
        .eq('source_id', don.id)
        .order('paid_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const paidAt = ledger?.paid_at ? new Date(ledger.paid_at) : null;
      if (paidAt && !Number.isNaN(paidAt.getTime())) {
        const qpq =
          don.goods_fmv != null &&
          typeof don.goods_description === 'string' &&
          don.goods_description.trim().length > 0;
        const base = {
          name: `${don.first_name} ${don.last_name}`.trim(),
          amount: Number(don.amount).toFixed(2),
          method: donationReceiptMethod(don),
          campaign: don.campaign?.trim() || undefined,
          memo: bareDonationMemo(don.memo),
          dedication: don.dedication_name?.trim() || undefined,
          dedicationType: don.dedication_type ?? undefined,
          goodsDescription: qpq ? String(don.goods_description).trim() : undefined,
          goodsFmv: qpq ? Number(don.goods_fmv).toFixed(2) : undefined,
          deductibleAmount: qpq
            ? Math.max(0, Number(don.amount) - Number(don.goods_fmv)).toFixed(2)
            : undefined,
        };
        const sigs = new Set<string>();
        sigs.add(computeReceiptSig({ ...base, date: formatReceiptDate(paidAt) }));
        sigs.add(computeReceiptSig({ ...base, date: formatReceiptDateUTC(paidAt) }));
        supersedeSigs = [...sigs];
        supersedeDonationId = don.id;
      }
    }
  }

  const { data, error } = await supabase.rpc('edit_payment', {
    p_payment_key: paymentKey,
    p_changes: clean,
    p_created_by: null,
    p_note: (body.note ?? '').trim() || null,
  });
  if (error) {
    console.error('[edit-entry] failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let supersededLinks = 0;
  let supersedeWarning: string | undefined;
  if (supersedeDonationId && supersedeSigs.length > 0) {
    for (const sig of supersedeSigs) {
      const { data: existing } = await supabase
        .from('receipt_corrections')
        .select('donation_id, superseded_at')
        .eq('original_sig', sig)
        .maybeSingle();
      if (existing && existing.donation_id !== supersedeDonationId) continue;
      if (existing && existing.superseded_at != null) {
        supersededLinks += 1;
        continue;
      }
      if (existing) {
        const { error: updErr } = await supabase
          .from('receipt_corrections')
          .update({ superseded_at: new Date().toISOString() })
          .eq('original_sig', sig);
        if (!updErr) supersededLinks += 1;
      } else {
        const { error: insErr } = await supabase.from('receipt_corrections').insert({
          original_sig: sig,
          donation_id: supersedeDonationId,
          superseded_at: new Date().toISOString(),
        });
        if (!insErr) supersededLinks += 1;
      }
    }
  } else if (body.supersedePriorReceipt === true) {
    supersedeWarning =
      'No prior receipt link could be reconstructed for this entry; nothing superseded.';
  }

  return NextResponse.json({
    ok: true,
    ...(data as object),
    ...(body.supersedePriorReceipt === true
      ? { supersededLinks, supersedeWarning }
      : {}),
  });
}
