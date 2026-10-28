import type { Metadata } from 'next';
import Image from 'next/image';
import { ReceiptPrintButton } from '@/app/receipt/ReceiptPrintButton';
import '@/app/receipt/receipt.css';

export const metadata: Metadata = {
  title: 'Letterhead — HaBayit Israeli Jewish Center',
  robots: { index: false, follow: false },
};

/** Printable page: receipt header + address footer only (no tax disclaimer). */
export default function ReceiptLetterheadPage() {
  return (
    <div className="receipt-root">
      <div className="receipt-print-bar">
        <ReceiptPrintButton />
      </div>

      <div className="receipt-page">
        <header className="receipt-letterhead">
          <span className="receipt-bh">ב&quot;ה</span>
          <div className="receipt-letterhead-inner">
            <Image
              src="/logos/habayit-logo-blue.png"
              alt="HaBayit Israeli Jewish Center"
              width={72}
              height={72}
              priority
            />
            <strong className="receipt-letterhead-name">HaBayit Israeli Jewish Center</strong>
          </div>
          <hr className="receipt-letterhead-rule" />
        </header>

        <div className="receipt-body" aria-hidden="true" />

        <div className="receipt-bottom">
          <footer className="receipt-footer">
            <strong>HABAYIT ISRAELI JEWISH CENTER</strong>
            <br />
            3007 BOGOTA AVE COOPER CITY, FL 33026 &nbsp;I&nbsp; (646) 462-1138
            <br />
            habayitcc.org
          </footer>
        </div>
      </div>
    </div>
  );
}
