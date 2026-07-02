import { buildEmailHtml, getAdminEmail, sendEmail } from './client';

export interface ContactEmailInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  interest: string;
  message: string;
}

export async function sendContactEmails(input: ContactEmailInput): Promise<boolean> {
  const name = `${input.firstName} ${input.lastName}`.trim();

  const userHtml = buildEmailHtml(`
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Dear ${input.firstName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Thank you for reaching out to HaBayit. We've received your message and will get back to you soon.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#6f6a60;">
      If your matter is urgent, call us at (646) 462-1138.
    </p>
  `);

  const adminHtml = buildEmailHtml(`
    <p style="margin:0 0 12px;font-size:15px;"><strong>New contact form submission</strong></p>
    <p style="margin:0;font-size:14px;line-height:1.7;">
      Name: ${name}<br>
      Email: ${input.email}<br>
      Phone: ${input.phone || '—'}<br>
      Interest: ${input.interest || '—'}<br><br>
      Message:<br>
      ${input.message.replace(/\n/g, '<br>') || '—'}
    </p>
  `);

  const userSent = await sendEmail({
    to: input.email,
    subject: 'We received your message — HaBayit',
    html: userHtml,
  });

  void sendEmail({
    to: getAdminEmail(),
    subject: `Contact form — ${name}`,
    replyTo: input.email,
    html: adminHtml,
  });

  return userSent;
}
