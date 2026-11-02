import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { ReceiptDocument } from '@/components/receipt/ReceiptDocument';
import type { ReceiptLine } from '@/lib/donations/receipt-types';
import { createAdminClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Admin - Annual Giving Summary',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function formatLineDate(raw: string | null): string {
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

export default async function AdminAnnualSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; year?: string }>;
}) {
  const authed = await isAdminAuthenticated();
  if (!authed) {
    return (
      <>
        <Header />
        <main className="flex-1">
          <Section background="cream">
            <AdminLoginForm
              title="Admin sign in"
              description="Sign in to generate an annual giving summary."
            />
          </Section>
        </main>
        <Footer />
      </>
    );
  }

  const params = await searchParams;
  const email = (params.email ?? '').trim().toLowerCase();
  const year = Number((params.year ?? '').trim());

  if (!email.includes('@') || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="max-w-md text-center">
          <h1 className="text-navy font-display text-2xl mb-3">Annual giving summary</h1>
          <p className="text-muted">
            Open this page with ?email=donor@example.com&amp;year=2026 to generate a summary.
          </p>
        </div>
      </main>
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('donations')
    .select('first_name, last_name, amount, memo, campaign, company, donation_type, created_at, goods_description, goods_fmv, deductible_amount')
    .eq('email', email)
    .eq('status', 'succeeded')
    .gte('created_at', `${year}-01-01T00:00:00Z`)
    .lt('created_at', `${year + 1}-01-01T00:00:00Z`)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[annual-summary] donations query failed:', error.message);
  }

  const rows = data ?? [];
  // Quid pro quo rows list only their deductible portion; the receipt
  // discloses the goods received instead of claiming none were provided.
  const lines: ReceiptLine[] = rows.map((d) => ({
    date: formatLineDate(d.created_at),
    memo: d.memo?.trim() || d.campaign?.trim() || 'Donation',
    method: d.donation_type === 'Monthly' ? 'Credit Card (monthly)' : 'Credit Card',
    amount: Number(d.deductible_amount ?? d.amount),
    goodsDescription: d.goods_description ?? undefined,
    goodsFmv: d.goods_fmv == null ? undefined : Number(d.goods_fmv),
  }));
  const name =
    rows.length > 0
      ? (rows[0] as { company?: string | null }).company?.trim() || `${rows[0].first_name} ${rows[0].last_name}`.trim()
      : email;

  if (lines.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="max-w-md text-center">
          <h1 className="text-navy font-display text-2xl mb-3">Nothing on record</h1>
          <p className="text-muted">
            No donations on record for {email} in {year}.
          </p>
        </div>
      </main>
    );
  }

  return (
    <ReceiptDocument
      name={name}
      lines={lines}
      variant="annual"
      taxYear={year}
    />
  );
}
