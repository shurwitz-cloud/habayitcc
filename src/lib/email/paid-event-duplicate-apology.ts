import { buildEmailHtml, sendEmail } from '@/lib/email/client';
import type { PaidEventConfig } from '@/lib/events/paid-events';

/**
 * Warm apology after a checkout glitch caused duplicate Stripe charges.
 * Signed as HaBayit / info@habayitcc.org — not a personal name.
 */
export async function sendPaidEventDuplicateChargeApologyEmail(input: {
  event: PaidEventConfig;
  firstName: string;
  email: string;
  ticketAmount: number;
}): Promise<boolean> {
  const { event, firstName, email, ticketAmount } = input;
  const amountLabel = `$${ticketAmount.toFixed(2)}`;

  const html = buildEmailHtml(`
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Dear ${firstName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Thank you for registering for <strong>${event.title}</strong> — we are so glad you will be with us.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      We want to apologize for a brief technical glitch during checkout. Your registration
      is confirmed, but your card may have been charged more than once for the same RSVP.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Please don’t worry: <strong>you only need one registration</strong>, and we will refund
      the extra charge(s) so you are only charged once (${amountLabel} for your ticket).
      You don’t need to do anything on your end.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      We’re looking forward to seeing you on ${event.dateLabel} at ${event.time}.
      If you have any questions, just reply to this email.
    </p>
    <p style="margin:24px 0 0;font-size:15px;line-height:1.6;">
      With warmth,<br>
      <strong>HaBayit Israeli Jewish Center</strong><br>
      <a href="mailto:info@habayitcc.org" style="color:#b8892a;">info@habayitcc.org</a>
    </p>
  `);

  return sendEmail({
    to: email,
    subject: `You're registered — and a quick note about your payment (${event.title})`,
    html,
    replyTo: 'info@habayitcc.org',
  });
}
