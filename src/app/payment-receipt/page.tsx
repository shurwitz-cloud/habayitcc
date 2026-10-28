import type { Metadata } from 'next';
import Link from 'next/link';
import { PaymentReceiptDocument } from '@/components/receipt/PaymentReceiptDocument';
import { readReceiptParam } from '@/lib/donations/receipt-url';
import {
  parsePaymentReceiptItem,
  verifyPaymentReceiptSearchParams,
  type PaymentReceiptItem,
} from '@/lib/payments/payment-receipt-url';

export const metadata: Metadata = {
  title: 'Payment Receipt — HaBayit Israeli Jewish Center',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function PaymentReceiptPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  if (!verifyPaymentReceiptSearchParams(params)) {
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

  const name = readReceiptParam(params.name) ?? 'Friend';
  const method = readReceiptParam(params.method) ?? 'Zelle';
  const ref = readReceiptParam(params.ref);
  const note = readReceiptParam(params.note);

  const rawItems = params.item;
  const items: (PaymentReceiptItem & { amount: number })[] = (
    (Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [])
      .map((value) => readReceiptParam(value))
      .filter((value): value is string => Boolean(value))
      .map(parsePaymentReceiptItem)
      .filter((item): item is PaymentReceiptItem => Boolean(item))
  ).map((item) => ({ ...item, amount: item.qty * item.unit }));

  if (items.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="max-w-md text-center">
          <h1 className="text-navy font-display text-2xl mb-3">Receipt unavailable</h1>
          <p className="text-muted mb-6">This receipt link is invalid or has expired.</p>
          <Link href="/" className="text-gold hover:underline">
            Back to habayitcc.org
          </Link>
        </div>
      </main>
    );
  }

  const dateRaw = readReceiptParam(params.date);
  const dates = parseDates(dateRaw);

  return (
    <PaymentReceiptDocument
      name={name}
      dateLong={dates.long}
      items={items}
      total={items.reduce((sum, item) => sum + item.amount, 0)}
      method={method}
      refText={ref}
      note={note}
    />
  );
}

function parseDates(raw: string | undefined): { long: string } {
  const fallback = new Date();
  if (!raw?.trim()) {
    return {
      long: fallback.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    };
  }

  const mdy = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const parsed = new Date(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]));
    if (!Number.isNaN(parsed.getTime())) {
      return {
        long: parsed.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      };
    }
  }

  const parsed = new Date(raw);
  return {
    long: Number.isNaN(parsed.getTime())
      ? raw
      : parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  };
}
