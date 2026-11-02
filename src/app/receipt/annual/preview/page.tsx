import type { Metadata } from 'next';
import { ReceiptDocument } from '@/components/receipt/ReceiptDocument';
import {
  ANNUAL_RECEIPT_PREVIEW,
  ANNUAL_RECEIPT_PREVIEW_COUNT,
  ANNUAL_RECEIPT_PREVIEW_QPQ,
  buildAnnualReceiptPreview,
} from '@/lib/donations/annual-receipt-sample';

export const metadata: Metadata = {
  title: 'Annual Tax Receipt Preview — HaBayit',
  robots: { index: false, follow: false },
};

export default async function AnnualReceiptPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ count?: string; goods?: string }>;
}) {
  const params = await searchParams;
  const raw = parseInt(params.count ?? String(ANNUAL_RECEIPT_PREVIEW_COUNT), 10);
  const count = Number.isFinite(raw) && raw > 0 && raw <= 40 ? raw : ANNUAL_RECEIPT_PREVIEW_COUNT;
  const withGoods = params.goods === '1';
  const preview =
    count === ANNUAL_RECEIPT_PREVIEW_COUNT
      ? buildAnnualReceiptPreview(25, withGoods)
      : buildAnnualReceiptPreview(count, withGoods);

  return <ReceiptDocument {...preview} />;
}
