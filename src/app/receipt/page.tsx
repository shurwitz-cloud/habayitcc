import type { Metadata } from 'next';
import { ReceiptDocument } from '@/components/receipt/ReceiptDocument';
import { readReceiptParam, resolveReceiptMemoFromParams } from '@/lib/donations/receipt-url';
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
  const name = readReceiptParam(params.name) ?? 'Valued Donor';
  const amount = parseFloat(typeof params.amount === 'string' ? params.amount : '0');
  const dateRaw = readReceiptParam(params.date);
  const memo = resolveReceiptMemoFromParams({
    campaign: readReceiptParam(params.campaign),
    dedication: readReceiptParam(params.dedication),
    dedicationType: readReceiptParam(params.dedicationType),
    memo: readReceiptParam(params.memo),
  });
  const method = readReceiptParam(params.method) ?? 'Credit Card';

  const dates = parseDates(dateRaw);
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

function parseDates(raw: string | undefined): { long: string; short: string } {
  const fallback = new Date();
  if (!raw?.trim()) {
    return {
      long: fallback.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      short: `${String(fallback.getMonth() + 1).padStart(2, '0')}/${String(fallback.getDate()).padStart(2, '0')}/${fallback.getFullYear()}`,
    };
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
    short: `${String(parsed.getMonth() + 1).padStart(2, '0')}/${String(parsed.getDate()).padStart(2, '0')}/${parsed.getFullYear()}`,
  };
}
