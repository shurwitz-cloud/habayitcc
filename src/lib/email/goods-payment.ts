import { buildEmailHtml, emailButton, sendEmail } from '@/lib/email/client';

export interface GoodsPaymentEmailItem {
  label: string;
  qty: number;
  unit: number;
}

export interface GoodsPaymentEmailInput {
  firstName: string;
  email: string;
  /** Optional spouse: the confirmation goes to both, like donation receipts. */
  spouseEmail?: string | null;
  items: GoodsPaymentEmailItem[];
  total: number;
  method: string;
  dateLong: string;
  receiptUrl?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Payment confirmation for goods/services/classes. Deliberately
 * NOT a tax receipt: no deductible language anywhere.
 */
export async function sendGoodsPaymentEmail(input: GoodsPaymentEmailInput): Promise<boolean> {
  const firstName = input.firstName.trim().split(/\s+/)[0] || 'friend';

  const itemRows = input.items
    .map(
      (item) => `
    <tr>
      <td style="padding:4px 0;color:#6f6a60;">${escapeHtml(item.label)} @ ${formatAmount(item.unit)} each</td>
      <td style="padding:4px 0;text-align:center;">${item.qty}</td>
      <td style="padding:4px 0;text-align:right;">${formatAmount(item.qty * item.unit)}</td>
    </tr>`,
    )
    .join('');

  const receiptBlock = input.receiptUrl
    ? `<p style="margin:16px 0;">${emailButton(input.receiptUrl, 'View &amp; Print Payment Receipt')}</p>`
    : '';

  const html = buildEmailHtml(`
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Dear ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Thank you - we received your payment of
      <strong>${formatAmount(input.total)}</strong> via ${escapeHtml(input.method)}
      on ${escapeHtml(input.dateLong)}.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;margin:0 0 8px;">
      ${itemRows}
      <tr>
        <td colspan="2" style="padding:8px 0;font-weight:bold;">Total</td>
        <td style="padding:8px 0;text-align:right;font-weight:bold;">${formatAmount(input.total)}</td>
      </tr>
    </table>
    ${receiptBlock}
    <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#6f6a60;">
      This payment is for goods or services and is not a tax-deductible donation.
    </p>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#6f6a60;">
      Questions? Reply to this email or call (646) 462-1138.
    </p>
  `);

  const itemSummary = input.items.map((item) => item.label).join(', ');
  const spouseEmail = input.spouseEmail?.trim();
  return sendEmail({
    to: spouseEmail ? [input.email, spouseEmail] : input.email,
    subject: `Payment received - ${itemSummary} | HaBayit`,
    html,
  });
}
