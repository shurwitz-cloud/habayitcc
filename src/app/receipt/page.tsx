import type { Metadata } from 'next';
import Image from 'next/image';
import { ReceiptPrintButton } from './ReceiptPrintButton';
import { readReceiptParam, resolveReceiptMemoFromParams } from '@/lib/donations/receipt-url';
import './receipt.css';

export const metadata: Metadata = {
  title: 'Tax Receipt — HaBayit Israeli Jewish Center',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function parseAmount(raw: string | undefined): string {
  const value = parseFloat(raw ?? '0');
  if (Number.isNaN(value) || value < 0) return '$0.00';
  return `$${value.toFixed(2)}`;
}

function parseDates(raw: string | undefined): { long: string; short: string } {
  const fallback = new Date();
  if (!raw?.trim()) {
    return {
      long: fallback.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      short: `${String(fallback.getMonth() + 1).padStart(2, '0')}/${String(fallback.getDate()).padStart(2, '0')}/${fallback.getFullYear()}`,
    };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { long: raw, short: raw };
  }

  return {
    long: parsed.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    short: `${String(parsed.getMonth() + 1).padStart(2, '0')}/${String(parsed.getDate()).padStart(2, '0')}/${parsed.getFullYear()}`,
  };
}

export default async function ReceiptPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const name = readReceiptParam(params.name) ?? 'Valued Donor';
  const amount = typeof params.amount === 'string' ? params.amount : '0';
  const dateRaw = readReceiptParam(params.date);
  const memo = resolveReceiptMemoFromParams({
    campaign: readReceiptParam(params.campaign),
    dedication: readReceiptParam(params.dedication),
    dedicationType: readReceiptParam(params.dedicationType),
    memo: readReceiptParam(params.memo),
  });
  const method = readReceiptParam(params.method) ?? 'Credit Card';

  const dates = parseDates(dateRaw);

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
          <div className="receipt-date">{dates.long}</div>
          <div className="receipt-salutation">Dear {name},</div>
          <div className="receipt-body-text">
            Thank you for your ongoing generous support!
            <br />
            It is thanks to people like you that our programs thrive and our community
            grows stronger. In the merit of your kindness, may G-d bless you and your
            family with good health, happiness, and prosperity.
          </div>
          <div className="receipt-signoff">
            Sincerely,
            <br />
            Rabbi Shmuly &amp; Devora Hurwitz
          </div>

          <table className="receipt-table">
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
              <tr>
                <td>{dates.short}</td>
                <td>{memo}</td>
                <td>{method}</td>
                <td className="amount">{parseAmount(amount)}</td>
              </tr>
            </tbody>
          </table>

          <div className="receipt-disclaimer">
            HaBayit is a DBA of Jewish Educational Services Inc.
            <br />
            a nonprofit organization. Tax ID# 301287488.
            <br />
            No goods or services were provided in exchange for this donation.
            <br />
            Thank you for your support!
          </div>
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
  );
}
