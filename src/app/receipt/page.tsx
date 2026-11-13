import type { Metadata } from 'next';
import Link from 'next/link';
import { ReceiptDocument } from '@/components/receipt/ReceiptDocument';
import {
  readReceiptParam,
  resolveReceiptMemoFromParams,
  verifyReceiptSearchParams,
} from '@/lib/donations/receipt-url';
import { resolveChaiPartnerReceiptPaidAt } from '@/lib/donations/resolve-chai-receipt-date';
import {
  formatReceiptDate,
  parseReceiptLinkDates,
} from '@/lib/donations/receipt-date';
import {
  isReceiptSuperseded,
  resolveReceiptCorrection,
} from '@/lib/donations/receipt-correction';
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

  // An admin can supersede one exact signed link after an edit made its
  // numbers stale. Only the recorded signature stops rendering.
  const linkSig = readReceiptParam(params.sig);
  if (linkSig && (await isReceiptSuperseded(linkSig))) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="max-w-md text-center">
          <h1 className="text-navy font-display text-2xl mb-3">Receipt replaced</h1>
          <p className="text-muted mb-6">
            This receipt was replaced by an updated version. Please use the newest
            receipt link we sent you, or reply to your receipt email and we will
            send it again.
          </p>
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

  // An admin-recorded correction binds this exact signed link (by verified
  // signature) to one payment. When present, render that payment's real ET
  // date; everything else about the link is untouched.
  const sig = readReceiptParam(params.sig);
  const correction =
    sig && !Number.isNaN(amount)
      ? await resolveReceiptCorrection({ sig, name, amount, method, campaign })
      : null;

  const crmPaidAt = correction
    ? null
    : await resolveChaiPartnerReceiptPaidAt({
        name,
        amount: Number.isNaN(amount) ? 0 : amount,
        campaign,
      });
  const dateForReceipt = correction
    ? formatReceiptDate(correction.paidAt)
    : crmPaidAt
      ? formatReceiptDate(crmPaidAt)
      : dateRaw;
  const dates = parseReceiptLinkDates(dateForReceipt);
  // Quid pro quo (signed gd/gf/da params): the line shows the DEDUCTIBLE
  // portion; the disclosure block names the goods and their good-faith value.
  const qpqDescription = readReceiptParam(params.gd);
  const qpqFmv = parseFloat(readReceiptParam(params.gf) ?? '');
  const qpqDeductible = parseFloat(readReceiptParam(params.da) ?? '');
  const hasQpq =
    !!qpqDescription && !Number.isNaN(qpqFmv) && !Number.isNaN(qpqDeductible);
  const line: ReceiptLine = {
    date: dates.short,
    memo: correction?.content?.memo ?? memo,
    method,
    amount: hasQpq ? qpqDeductible : Number.isNaN(amount) ? 0 : amount,
    goodsDescription: hasQpq ? qpqDescription : undefined,
    goodsFmv: hasQpq ? qpqFmv : undefined,
  };

  return (
    <ReceiptDocument
      name={correction?.content?.name ?? name}
      lines={[line]}
      letterDate={dates.long}
      variant="single"
    />
  );
}
