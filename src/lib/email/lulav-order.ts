import { buildEmailHtml, sendAdminNotification, sendEmail } from '@/lib/email/client';
import {
  LULAV_SET_PRICE,
  LULAV_ZELLE_MEMO,
  LULAV_ZELLE_NAME,
  LULAV_ZELLE_PHONE,
  type LulavPayMethod,
  type LulavPricing,
} from '@/lib/lulav/pricing';

export interface LulavOrderEmailInput {
  fullName: string;
  email: string;
  phone: string;
  payMethod: LulavPayMethod;
  pricing: LulavPricing;
  status: 'paid' | 'pending_zelle';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendLulavOrderEmails(input: LulavOrderEmailInput): Promise<boolean> {
  const firstName = input.fullName.trim().split(/\s+/)[0] || 'friend';
  const pricingRows = `
    <tr><td style="padding:4px 0;color:#6f6a60;">Lulav &amp; Etrog sets</td><td style="padding:4px 0;text-align:right;">${input.pricing.quantity} × $${LULAV_SET_PRICE}</td></tr>
    <tr><td style="padding:4px 0;color:#6f6a60;">Subtotal</td><td style="padding:4px 0;text-align:right;">$${input.pricing.subtotal.toFixed(2)}</td></tr>
    ${
      input.pricing.cardFee > 0
        ? `<tr><td style="padding:4px 0;color:#6f6a60;">Card processing (3%)</td><td style="padding:4px 0;text-align:right;">$${input.pricing.cardFee.toFixed(2)}</td></tr>`
        : ''
    }
    <tr><td style="padding:8px 0;font-weight:bold;">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold;">$${input.pricing.total.toFixed(2)}</td></tr>
  `;

  const zelleBlock =
    input.status === 'pending_zelle'
      ? `
    <p style="margin:16px 0;font-size:15px;line-height:1.6;">
      Your order is <strong>reserved pending Zelle payment</strong>. Please send
      <strong>$${input.pricing.total.toFixed(2)}</strong> via Zelle to
      <strong>${LULAV_ZELLE_PHONE}</strong> (${LULAV_ZELLE_NAME}) and put
      <strong>${LULAV_ZELLE_MEMO}</strong> in the memo.
    </p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#6f6a60;">
      We’ll confirm your order by email once the Zelle payment is received.
    </p>`
      : `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Thank you — your card payment was received and your Lulav &amp; Etrog order is confirmed.
    </p>`;

  const userHtml = buildEmailHtml(`
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Dear ${escapeHtml(firstName)},</p>
    ${zelleBlock}
    <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;margin:0 0 8px;">
      ${pricingRows}
    </table>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#6f6a60;">
      Questions? Reply to this email or call (646) 462-1138.
    </p>
  `);

  const adminHtml = buildEmailHtml(`
    <p style="margin:0 0 12px;font-size:15px;"><strong>New Lulav &amp; Etrog order</strong></p>
    <p style="margin:0;font-size:14px;line-height:1.7;">
      Name: ${escapeHtml(input.fullName)}<br>
      Email: ${escapeHtml(input.email)}<br>
      Phone: ${escapeHtml(input.phone)}<br>
      Quantity: ${input.pricing.quantity}<br>
      Payment: ${input.payMethod === 'card' ? 'Credit card' : 'Zelle'}<br>
      Status: ${input.status === 'paid' ? 'Paid' : 'Pending Zelle'}<br>
      Total: $${input.pricing.total.toFixed(2)}
    </p>
  `);

  const subject =
    input.status === 'pending_zelle'
      ? 'Lulav order received — complete Zelle payment | HaBayit'
      : 'Lulav & Etrog order confirmed | HaBayit';

  const [userSent, adminSent] = await Promise.all([
    sendEmail({ to: input.email, subject, html: userHtml }),
    sendAdminNotification({
      subject: `Lulav order — ${input.fullName} (${input.pricing.quantity})`,
      replyTo: input.email,
      html: adminHtml,
      extraTo: 'office@habayitcc.org',
    }),
  ]);

  if (!adminSent) {
    console.error('[lulav] admin notification failed for', input.email);
  }

  return userSent;
}
