import { buildEmailHtml, sendAdminNotification, sendEmail } from './client';
import type { PaidEventConfig } from '@/lib/events/paid-events';
import type { PricingBreakdown } from '@/lib/events/paid-event-pricing';

export interface PaidEventConfirmationInput {
  event: PaidEventConfig;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  pricing: PricingBreakdown;
  detailsSummary: string;
  receiptUrl?: string;
}

export async function sendPaidEventConfirmationEmail(
  input: PaidEventConfirmationInput
): Promise<boolean> {
  const { event, firstName, email, pricing, detailsSummary } = input;

  const paymentBlock =
    pricing.total > 0
      ? `<table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;margin:16px 0;">
          <tr><td style="padding:4px 0;color:#6f6a60;">Tickets</td><td style="padding:4px 0;text-align:right;">$${pricing.ticketSubtotal.toFixed(2)}</td></tr>
          ${pricing.sponsorAmount > 0 ? `<tr><td style="padding:4px 0;color:#6f6a60;">Sponsorship</td><td style="padding:4px 0;text-align:right;">$${pricing.sponsorAmount.toFixed(2)}</td></tr>` : ''}
          ${pricing.cardFee > 0 ? `<tr><td style="padding:4px 0;color:#6f6a60;">Card processing</td><td style="padding:4px 0;text-align:right;">$${pricing.cardFee.toFixed(2)}</td></tr>` : ''}
          <tr><td style="padding:8px 0;font-weight:bold;">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold;">$${pricing.total.toFixed(2)}</td></tr>
        </table>`
      : '<p style="margin:0;font-size:14px;color:#6f6a60;">No payment was required for this registration.</p>';

  const receiptLink = input.receiptUrl
    ? `<p style="margin:16px 0 0;"><a href="${input.receiptUrl}" style="color:#b8892a;font-weight:bold;">View your receipt</a></p>`
    : '';

  const html = buildEmailHtml(`
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Dear ${firstName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      You're registered for <strong>${event.title}</strong>. We look forward to seeing you!
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;margin:0 0 16px;">
      <tr><td style="padding:6px 0;color:#6f6a60;width:120px;">Date</td><td style="padding:6px 0;">${event.dateLabel} · ${event.time}</td></tr>
      <tr><td style="padding:6px 0;color:#6f6a60;vertical-align:top;">Details</td><td style="padding:6px 0;">${detailsSummary.replace(/\n/g, '<br>')}</td></tr>
    </table>
    ${paymentBlock}
    ${receiptLink}
  `);

  const [attendeeSent] = await Promise.all([
    sendEmail({
      to: email,
      subject: `Registration confirmed — ${event.title}`,
      html,
    }),
    sendAdminNotification({
      subject: `New registration — ${event.title} (${firstName} ${input.lastName})`,
      replyTo: email,
      html: buildEmailHtml(`
        <p style="margin:0 0 12px;font-size:15px;"><strong>${firstName} ${input.lastName}</strong> registered for ${event.title}</p>
        <p style="margin:0;font-size:14px;line-height:1.7;color:#282828;">
          Email: ${email}<br>
          Phone: ${input.phone || '—'}<br>
          ${detailsSummary.replace(/\n/g, '<br>')}<br>
          Total: $${pricing.total.toFixed(2)}
        </p>
      `),
    }),
  ]);

  return attendeeSent;
}
