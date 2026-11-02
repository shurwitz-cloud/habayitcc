import type { Metadata } from 'next';
import Link from 'next/link';
import { GoodsYearReceiptDocument } from '@/components/receipt/GoodsYearReceiptDocument';
import { verifyGoodsYearReceiptSearchParams } from '@/lib/goods/year-receipt-url';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Year-End Goods & Services Receipt - HaBayit Israeli Jewish Center',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function Unavailable() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <h1 className="text-navy font-display text-2xl mb-3">Receipt unavailable</h1>
        <p className="text-muted mb-6">
          This receipt link is invalid or has expired. If you made a payment, check your email
          for the official receipt link we sent you.
        </p>
        <Link href="/" className="text-gold hover:underline">
          Back to habayitcc.org
        </Link>
      </div>
    </main>
  );
}

export default async function GoodsYearReceiptPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const verified = verifyGoodsYearReceiptSearchParams(params);
  if (!verified || !isServiceRoleConfigured()) {
    return <Unavailable />;
  }

  const supabase = createAdminClient();
  const yearStart = `${verified.year}-01-01T00:00:00Z`;
  const yearEnd = `${verified.year + 1}-01-01T00:00:00Z`;
  const { data, error } = await supabase
    .from('goods_payments')
    .select('id, first_name, last_name, item_label, quantity, unit_amount, amount, payment_method, paid_at, created_at')
    .eq('email', verified.email)
    .eq('include_in_year_end', true)
    .gte('paid_at', yearStart)
    .lt('paid_at', yearEnd)
    .order('paid_at', { ascending: true });

  if (error) {
    console.error('[goods-year-receipt] query failed:', error.message);
    return <Unavailable />;
  }

  const rows = data ?? [];
  const payerName =
    rows.length > 0
      ? `${rows[0].first_name} ${rows[0].last_name}`.trim() || verified.email
      : verified.email;

  return <GoodsYearReceiptDocument payerName={payerName} year={verified.year} rows={rows} />;
}
