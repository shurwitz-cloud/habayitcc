import Image from 'next/image';
import { ReceiptPrintButton } from '@/app/receipt/ReceiptPrintButton';
import '@/app/receipt/receipt.css';

export interface PaymentReceiptDocumentItem {
  label: string;
  qty: number;
  unit: number;
  amount: number;
}

export interface PaymentReceiptDocumentProps {
  name: string;
  dateLong: string;
  items: PaymentReceiptDocumentItem[];
  total: number;
  method: string;
  /** Optional reference line; only used when a method carries one (e.g. "Check #1234"). Zelle/Cash receipts omit it. */
  refText?: string;
  /** Allocation note, e.g. "$X of this payment applied to this receipt." */
  note?: string;
}

function formatAmount(amount: number): string {
  if (Number.isNaN(amount) || amount < 0) return '$0.00';
  return `$${amount.toFixed(2)}`;
}

export function PaymentReceiptDocument({
  name,
  dateLong,
  items,
  total,
  method,
  refText,
  note,
}: PaymentReceiptDocumentProps) {
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

        <div className="receipt-body">
          <div className="pay-head">
            <span className="pay-title">Payment Receipt</span>
            <span className="pay-paid">PAID</span>
          </div>
          <div className="pay-name">{name}</div>
          <div className="pay-date">{dateLong}</div>

          <table className="pay-table">
            <thead>
              <tr>
                <th style={{ width: '55%' }}>Item</th>
                <th style={{ width: '20%' }}>Qty</th>
                <th className="amount" style={{ width: '25%' }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.label}-${index}`}>
                  <td>
                    {item.label} @ {formatAmount(item.unit)} each
                  </td>
                  <td>{item.qty}</td>
                  <td className="amount">{formatAmount(item.amount)}</td>
                </tr>
              ))}
              <tr className="total">
                <td colSpan={2}>Total</td>
                <td className="amount">{formatAmount(total)}</td>
              </tr>
            </tbody>
          </table>

          <div className="pay-method">
            Paid in full via {method} &middot; {dateLong}
          </div>
          {(refText || note) && (
            <div className="pay-ref">
              {refText}
              {refText && note && <br />}
              {note}
            </div>
          )}
          <div className="pay-thanks">Thank you!</div>
        </div>

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
