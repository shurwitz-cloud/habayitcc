import Image from 'next/image';
import { ReceiptPrintButton } from '@/app/receipt/ReceiptPrintButton';
import { getAnnualReceiptDensity } from '@/lib/donations/receipt-layout';
import { formatReceiptMethod } from '@/lib/donations/receipt-method';
import {
  formatReceiptAmount,
  sumReceiptLines,
  type ReceiptDocumentProps,
} from '@/lib/donations/receipt-types';
import '@/app/receipt/receipt.css';

function defaultLetterDate(variant: 'single' | 'annual', taxYear?: number): string {
  if (variant === 'annual' && taxYear) {
    return `December 31, ${taxYear}`;
  }
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function bodyCopy(variant: 'single' | 'annual', taxYear?: number): string {
  if (variant === 'annual' && taxYear) {
    return `Thank you for your generous support throughout ${taxYear}. Below is a summary of your tax-deductible gifts to HaBayit Israeli Jewish Center during the calendar year. No goods or services were provided in exchange for these donations.`;
  }

  return `Thank you for your ongoing generous support!
It is thanks to people like you that our programs thrive and our community grows stronger. In the merit of your kindness, may G-d bless you and your family with good health, happiness, and prosperity.`;
}

export function ReceiptDocument({
  name,
  lines,
  letterDate,
  variant = 'single',
  taxYear,
}: ReceiptDocumentProps) {
  const resolvedDate = letterDate ?? defaultLetterDate(variant, taxYear);
  const total = sumReceiptLines(lines);
  const copy = bodyCopy(variant, taxYear);
  const isAnnual = variant === 'annual';
  const density = isAnnual ? getAnnualReceiptDensity(lines.length) : null;
  const pageClass = [
    'receipt-page',
    isAnnual ? 'receipt-page--annual' : '',
    density ? `receipt-page--density-${density}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="receipt-root">
      <div className="receipt-print-bar">
        <ReceiptPrintButton />
      </div>

      <div className={pageClass}>
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

        <div className="receipt-body">
          <div className="receipt-date">{resolvedDate}</div>
          {isAnnual && taxYear && (
            <div className="receipt-annual-title">{taxYear} Annual Giving Summary</div>
          )}
          <div className="receipt-salutation">Dear {name},</div>
          <div className="receipt-body-text">
            {copy.split('\n').map((paragraph, index) => (
              <span key={index}>
                {paragraph}
                {index < copy.split('\n').length - 1 && <br />}
              </span>
            ))}
          </div>
          {!isAnnual && (
            <div className="receipt-signoff">
              Sincerely,
              <br />
              Rabbi Shmuly &amp; Devora Hurwitz
            </div>
          )}

          <table className={`receipt-table${isAnnual ? ' receipt-table--annual' : ''}`}>
            <thead>
              <tr>
                <th style={{ width: '18%' }}>Date</th>
                <th style={{ width: '40%' }}>Donation Memo</th>
                <th style={{ width: '24%' }}>Method</th>
                <th className="amount" style={{ width: '18%' }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.date}-${line.amount}-${index}`}>
                  <td>{line.date}</td>
                  <td className="memo">{line.memo}</td>
                  <td>{formatReceiptMethod(line.method)}</td>
                  <td className="amount">{formatReceiptAmount(line.amount)}</td>
                </tr>
              ))}
              {isAnnual && (
                <tr className="receipt-total-row">
                  <td colSpan={3}>
                    <strong>{taxYear ?? 'Annual'} Total</strong>
                  </td>
                  <td className="amount">
                    <strong>{formatReceiptAmount(total)}</strong>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {isAnnual && (
            <div className="receipt-signoff receipt-signoff--annual">
              With gratitude,
              <br />
              Rabbi Shmuly &amp; Devora Hurwitz
            </div>
          )}
        </div>

        <div className="receipt-bottom">
          <div className="receipt-disclaimer">
            HaBayit is a DBA of Jewish Educational Services Inc.
            <br />
            a nonprofit organization. Tax ID# 301287488.
            <br />
            No goods or services were provided in exchange for this donation.
            <br />
            Thank you for your support!
          </div>

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
