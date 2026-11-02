import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Reclassify ONE payment between donation and goods/services.
 * Runs as a single database transaction (reclassify_payment,
 * migration 0023): the row can never exist in both tables or
 * neither, the single ledger row is updated in place, and an
 * audit row is written atomically. Never sends email.
 * POST { confirm: true, paymentKey, toKind, goodsItemLabel?, goodsFmv?, includeInYearEnd?, note? }
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: {
    confirm?: boolean;
    paymentKey?: string;
    toKind?: string;
    goodsItemLabel?: string;
    goodsFmv?: number;
    includeInYearEnd?: boolean;
    note?: string;
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
  const toKind = (body.toKind ?? '').trim();
  if (!paymentKey) {
    return NextResponse.json({ error: 'paymentKey is required.' }, { status: 400 });
  }
  if (!['one_time', 'monthly', 'goods_services'].includes(toKind)) {
    return NextResponse.json(
      { error: "toKind must be 'one_time', 'monthly', or 'goods_services'." },
      { status: 400 },
    );
  }
  const goodsFmv = Number(body.goodsFmv);
  if (toKind !== 'goods_services' && body.goodsFmv != null && !Number.isFinite(goodsFmv)) {
    return NextResponse.json({ error: 'goodsFmv must be a number.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('reclassify_payment', {
    p_payment_key: paymentKey,
    p_to_kind: toKind,
    p_goods_item_label: (body.goodsItemLabel ?? '').trim() || null,
    p_goods_fmv: Number.isFinite(goodsFmv) ? goodsFmv : null,
    p_include_in_year_end: body.includeInYearEnd === true,
    p_changes: { note: (body.note ?? '').trim() || null },
    p_created_by: null,
  });
  if (error) {
    console.error('[reclassify-entry] failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(data as object) });
}
