import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { getSiteUrl } from '@/lib/email/client';
import { buildGoodsYearReceiptUrl } from '@/lib/goods/year-receipt-url';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/goods-year-receipt-link
 * Admin-only helper that builds a signed year-end goods/services
 * receipt URL for one payer. Query: email, year (e.g. 2026).
 * The receipt is clearly non-deductible — it is not a tax receipt.
 */
export async function GET(req: NextRequest) {
  const denied = await requireCapabilityApi('emails');
  if (denied) return denied;

  const q = req.nextUrl.searchParams;
  const email = (q.get('email') ?? '').trim().toLowerCase();
  const year = Number((q.get('year') ?? '').trim());

  if (!email.includes('@')) {
    return NextResponse.json({ error: 'email is required.' }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'year must be a 4-digit year.' }, { status: 400 });
  }

  const path = buildGoodsYearReceiptUrl({ email, year });
  return NextResponse.json({ url: `${getSiteUrl()}${path}` });
}
