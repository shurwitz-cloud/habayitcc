import type { ReceiptDocumentProps, ReceiptLine } from './receipt-types';

function buildPreviewLines(count: number): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  const oneOffs: Array<{ month: number; day: number; memo: string; amount: number }> = [
    { month: 3, day: 22, memo: 'Purim', amount: 72 },
    { month: 5, day: 18, memo: 'Lag BaOmer', amount: 36 },
    { month: 9, day: 14, memo: 'In honor of David Cohen', amount: 180 },
    { month: 10, day: 2, memo: 'Sukkot', amount: 54 },
    { month: 11, day: 20, memo: 'General Donation', amount: 100 },
    { month: 12, day: 15, memo: 'Chanukah', amount: 118 },
  ];

  let oneOffIndex = 0;
  for (let i = 0; i < count; i++) {
    const month = (i % 12) + 1;
    const day = 8 + (i % 3);
    const isOneOff = i % 4 === 3 && oneOffIndex < oneOffs.length;

    if (isOneOff) {
      const extra = oneOffs[oneOffIndex++];
      lines.push({
        date: `${String(extra.month).padStart(2, '0')}/${String(extra.day).padStart(2, '0')}/2025`,
        memo: extra.memo,
        method: 'Credit Card',
        amount: extra.amount,
      });
    } else {
      lines.push({
        date: `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/2025`,
        memo: 'Chai Partner',
        method: 'Credit Card',
        amount: 180,
      });
    }
  }

  return lines.sort((a, b) => {
    const [am, ad, ay] = a.date.split('/').map(Number);
    const [bm, bd, by] = b.date.split('/').map(Number);
    return new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime();
  });
}

/** Default preview — 25 gifts to test one-page fit rules. */
export const ANNUAL_RECEIPT_PREVIEW_COUNT = 25;

export const ANNUAL_RECEIPT_PREVIEW: ReceiptDocumentProps = {
  name: 'Shmuel Hurwitz',
  taxYear: 2025,
  variant: 'annual',
  letterDate: 'December 31, 2025',
  lines: buildPreviewLines(ANNUAL_RECEIPT_PREVIEW_COUNT),
};

export function buildAnnualReceiptPreview(count: number): ReceiptDocumentProps {
  return {
    ...ANNUAL_RECEIPT_PREVIEW,
    lines: buildPreviewLines(count),
  };
}
