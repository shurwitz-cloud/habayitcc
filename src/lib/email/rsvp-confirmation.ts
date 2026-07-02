import type { EventConfig } from '@/lib/events/config';
import { buildEmailHtml, getAdminEmail, sendEmail } from './client';

export interface RsvpConfirmationEmailInput {
  event: EventConfig;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  attending: number;
  notes: string;
}

export async function sendRsvpConfirmationEmail(
  input: RsvpConfirmationEmailInput
): Promise<boolean> {
  const { event, firstName, email, attending } = input;
  const locationNote = event.locationPrivate
    ? 'The venue address will be sent to you closer to the event.'
    : 'See habayitcc.org/events for location details.';

  const html = buildEmailHtml(`
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Dear ${firstName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      You're registered for <strong>${event.title}</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;margin:0 0 16px;">
      <tr><td style="padding:6px 0;color:#6f6a60;width:120px;">Event</td><td style="padding:6px 0;"><strong>${event.rsvpLabel}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6f6a60;">Date</td><td style="padding:6px 0;">${event.dateLabel} · ${event.time}</td></tr>
      <tr><td style="padding:6px 0;color:#6f6a60;">Attending</td><td style="padding:6px 0;">${attending}</td></tr>
    </table>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#6f6a60;">${locationNote}</p>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.6;">We look forward to seeing you!</p>
  `);

  const attendeeSent = await sendEmail({
    to: email,
    subject: `RSVP confirmed — ${event.title}`,
    html,
  });

  void sendEmail({
    to: getAdminEmail(),
    subject: `New RSVP — ${event.title} (${firstName} ${input.lastName})`,
    replyTo: email,
    html: buildEmailHtml(`
      <p style="margin:0 0 12px;font-size:15px;"><strong>${firstName} ${input.lastName}</strong> RSVP'd for ${event.title}</p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#282828;">
        Email: ${email}<br>
        Phone: ${input.phone || '—'}<br>
        Attending: ${attending}<br>
        Notes: ${input.notes || '—'}
      </p>
    `),
  });

  return attendeeSent;
}
