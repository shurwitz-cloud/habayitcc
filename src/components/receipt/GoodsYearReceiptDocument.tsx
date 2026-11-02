import Link from 'next/link';
import Image from 'next/image';
import { ReceiptPrintButton } from '@/app/receipt/ReceiptPrintButton';
import '@/app/receipt/receipt.css';

export type GoodsYearReceiptRow = {
  id: string;
  first_name: string;
  last_name: string;
  item_label: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
};

function formatAmount(amount: number): string {
  if (Number.isNaN(amount) || amount < 0) return '$0.00';
  return `$${amount.toFixed(2)}`;
}

function formatDate(raw: string | null): string {
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Visual document for the year-end goods/services receipt. Rendered by the
 * signed public page (rows from the database) and by dev-only previews
 * (fixture rows). Presentational only.
 */
export function GoodsYearReceiptDocument({
  payerName,
  year,
  rows,
}: {
  payerName: string;
  year: number;
  rows: GoodsYearReceiptRow[];
}) {
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <div className="receipt-root pay-scope">
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
            <span className="pay-title">Year-End Goods &amp; Services Receipt</span>
          </div>
          <div className="pay-name">{payerName}</div>
          <div className="pay-date">January 1 - December 31, {year}</div>

          {rows.length === 0 ? (
            <p style={{ margin: '24px 0', fontSize: 15 }}>
              No goods or services payments are on record for {year}.
            </p>
          ) : (
            <table className="pay-table">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Date</th>
                  <th style={{ width: '38%' }}>Item</th>
                  <th style={{ width: '15%' }}>Qty</th>
                  <th className="amount" style={{ width: '25%' }}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.paid_at ?? row.created_at)}</td>
                    <td>
                      {row.item_label} @ {formatAmount(Number(row.unit_amount))} each
                    </td>
                    <td>{row.quantity}</td>
                    <td className="amount">{formatAmount(Number(row.amount))}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td colSpan={3}>Total paid in {year}</td>
                  <td className="amount">{formatAmount(total)}</td>
                </tr>
              </tbody>
            </table>
          )}

          <div className="pay-method" style={{ marginTop: 18 }}>
            These payments were for goods or services - they are not donations and are
            not tax-deductible. This is not a tax receipt.
          </div>
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
