import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { getSiteUrl } from '@/lib/email/client';
import {
  buildPaymentReceiptUrl,
  parsePaymentReceiptItem,
  type PaymentReceiptItem,
} from '@/lib/payments/payment-receipt-url';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/payment-receipt-link
 * Admin-only helper that builds a signed payment-receipt URL.
 * Keeps the signing secret server-side; nothing is stored.
 * Query: name, date (MM/DD/YYYY, optional), method (optional),
 *        item (repeatable, "Label|qty|unitPrice"), ref (optional), note (optional).
 */
export async function GET(req: NextRequest) {
  const denied = await requireCapabilityApi('emails');
  if (denied) return denied;

  const q = req.nextUrl.searchParams;
  const name = (q.get('name') ?? '').trim();
  const method = (q.get('method') ?? '').trim() || undefined;
  const ref = (q.get('ref') ?? '').trim() || undefined;
  const note = (q.get('note') ?? '').trim() || undefined;
  const dateRaw = (q.get('date') ?? '').trim();

  const items: PaymentReceiptItem[] = q
    .getAll('item')
    .map(parsePaymentReceiptItem)
    .filter((item): item is PaymentReceiptItem => Boolean(item));

  if (!name) {
    return NextResponse.json({ error: 'name is required.' }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json(
      { error: 'At least one valid item ("Label|qty|unitPrice") is required.' },
      { status: 400 }
    );
  }

  let date: Date | undefined;
  if (dateRaw) {
    const mdy = dateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!mdy) {
      return NextResponse.json({ error: 'date must be MM/DD/YYYY.' }, { status: 400 });
    }
    date = new Date(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]));
  }

  const path = buildPaymentReceiptUrl({ name, date, method, items, ref, note });
  return NextResponse.json({ url: `${getSiteUrl()}${path}` });
}
