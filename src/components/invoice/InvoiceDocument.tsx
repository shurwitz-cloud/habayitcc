'use client';

import Image from 'next/image';
import { ReceiptPrintButton } from '@/app/receipt/ReceiptPrintButton';
import '@/app/invoice/invoice.css';

export type InvoiceLine = {
  description: string;
  detail?: string;
  amount: number;
};

export type InvoiceDocumentProps = {
  invoiceNumber: string;
  invoiceDate: string;
  billToName: string;
  billToLines: string[];
  programTitle: string;
  term: string;
  lines: InvoiceLine[];
  /** Amount due (tuition after discounts). */
  amountDue: number;
  /** e.g. November 1, 2026 */
  dueDate?: string;
  /**
   * Note only — no second total. e.g. "A 3% credit card processing fee applies if paid by credit card."
   */
  cardFeeNote?: string;
};

function usd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function InvoiceDocument({
  invoiceNumber,
  invoiceDate,
  billToName,
  billToLines,
  programTitle,
  term,
  lines,
  amountDue,
  dueDate,
  cardFeeNote,
}: InvoiceDocumentProps) {
  return (
    <div className="invoice-root">
      <div className="invoice-print-bar">
        <ReceiptPrintButton />
      </div>

      <div className="invoice-page">
        <header className="invoice-letterhead">
          <span className="invoice-bh">ב&quot;ה</span>
          <div className="invoice-letterhead-inner">
            <Image
              src="/logos/habayit-logo-blue.png"
              alt="HaBayit Israeli Jewish Center"
              width={72}
              height={72}
              priority
            />
            <div>
              <strong className="invoice-letterhead-name">HaBayit Israeli Jewish Center</strong>
              <p className="invoice-letterhead-sub">Cooper City, FL · habayitcc.org</p>
            </div>
          </div>
          <hr className="invoice-letterhead-rule" />
        </header>

        <div className="invoice-title-row">
          <h1 className="invoice-title">Invoice</h1>
          <div className="invoice-meta">
            <div>
              <span className="invoice-meta-label">Invoice #</span>
              <span>{invoiceNumber}</span>
            </div>
            <div>
              <span className="invoice-meta-label">Date</span>
              <span>{invoiceDate}</span>
            </div>
            {dueDate ? (
              <div>
                <span className="invoice-meta-label">Due</span>
                <span>{dueDate}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="invoice-billto">
          <p className="invoice-section-label">Bill to</p>
          <p className="invoice-billto-name">{billToName}</p>
          {billToLines.map((line) => (
            <p key={line} className="invoice-billto-line">
              {line}
            </p>
          ))}
        </div>

        <div className="invoice-program">
          <p>
            <strong>{programTitle}</strong>
          </p>
          <p className="invoice-billto-line">Term: {term}</p>
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="invoice-amount-col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={`${line.description}-${line.amount}`}>
                <td>
                  <div className="invoice-line-desc">{line.description}</div>
                  {line.detail ? <div className="invoice-line-detail">{line.detail}</div> : null}
                </td>
                <td className="invoice-amount-col">{usd(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-totals">
          <div className="invoice-total-row invoice-total-row--grand">
            <span>Amount due{dueDate ? ` by ${dueDate}` : ''}</span>
            <strong>{usd(amountDue)}</strong>
          </div>
          {cardFeeNote ? (
            <p className="invoice-card-fee-note">{cardFeeNote}</p>
          ) : null}
        </div>

        <div className="invoice-notes">
          <p className="invoice-section-label">Payment notes</p>
          <p>
            Please include the family name and “Hebrew Adventure” in the payment memo.
          </p>
        </div>

        <footer className="invoice-footer">
          HaBayit Israeli Jewish Center · Cooper City, FL · info@habayitcc.org
        </footer>
      </div>
    </div>
  );
}
