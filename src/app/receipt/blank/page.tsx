import type { Metadata } from 'next';
import { ReceiptDocument } from '@/components/receipt/ReceiptDocument';

export const metadata: Metadata = {
  title: 'Blank Tax Receipt — HaBayit Israeli Jewish Center',
  robots: { index: false, follow: false },
};

/** Printable blank tax receipt (fill by hand). */
export default function BlankTaxReceiptPage() {
  return (
    <ReceiptDocument
      name="________________________"
      letterDate="________________"
      lines={[
        {
          date: '________',
          memo: '________________________',
          method: '________',
          amount: Number.NaN,
        },
      ]}
      variant="single"
    />
  );
}
