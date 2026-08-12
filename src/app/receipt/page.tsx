import type { Metadata } from 'next';
import Link from 'next/link';
import { ReceiptDocument } from '@/components/receipt/ReceiptDocument';
import {
  readReceiptParam,
  resolveReceiptMemoFromParams,
  verifyReceiptSearchParams,
} from '@/lib/donations/receipt-url';
import { resolveChaiPartnerReceiptPaidAt } from '@/lib/donations/resolve-chai-receipt-date';
import type { ReceiptLine } from '@/lib/donations/receipt-types';

export const metadata: Metadata = {
  title: 'Tax Receipt — HaBayit Israeli Jewish Center',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ReceiptPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  if (!verifyReceiptSearchParams(params)) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="max-w-md text-center">
          <h1 className="text-navy font-display text-2xl mb-3">Receipt unavailable</h1>
          <p className="text-muted mb-6">
            This receipt link is invalid or has expired. If you made a donation, check your email
            for the official receipt link we sent you.
          </p>
          <Link href="/donate" className="text-gold hover:underline">
            Make a donation
          </Link>
        </div>
      </main>
    );
  }

  const name = readReceiptParam(params.name) ?? 'Valued Donor';
  const amount = parseFloat(typeof params.amount === 'string' ? params.amount : '0');
  const dateRaw = readReceiptParam(params.date);
  const campaign = readReceiptParam(params.campaign);
  const method = readReceiptParam(params.method) ?? 'Credit Card';
  const memo = resolveReceiptMemoFromParams({
    campaign,
    dedication: readReceiptParam(params.dedication),
    dedicationType: readReceiptParam(params.dedicationType),
    memo: readReceiptParam(params.memo),
    method,
  });

  const crmPaidAt = await resolveChaiPartnerReceiptPaidAt({
    name,
    amount: Number.isNaN(amount) ? 0 : amount,
    campaign,
  });
  const dates = parseDates(crmPaidAt ? formatReceiptDate(crmPaidAt) : dateRaw);
  const line: ReceiptLine = {
    date: dates.short,
    memo,
    method,
    amount: Number.isNaN(amount) ? 0 : amount,
  };

  return (
    <ReceiptDocument
      name={name}
      lines={[line]}
      letterDate={dates.long}
      variant="single"
    />
  );
}

function formatReceiptDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function parseDates(raw: string | undefined): { long: string; short: string } {
  const fallback = new Date();
  if (!raw?.trim()) {
    return {
      long: fallback.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      short: formatReceiptDate(fallback),
    };
  }

  // Prefer explicit MM/DD/YYYY from receipt links (avoid locale parse quirks).
  const mdy = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    const parsed = new Date(year, month - 1, day);
    if (
      !Number.isNaN(parsed.getTime()) &&
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day
    ) {
      return {
        long: parsed.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
        short: formatReceiptDate(parsed),
      };
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { long: raw, short: raw };
  }

  return {
    long: parsed.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    short: formatReceiptDate(parsed),
  };
}
