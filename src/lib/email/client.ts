import { Resend } from 'resend';

let resendClient: Resend | null = null;

export function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

export function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || 'info@habayitcc.org';
}

export function getAdminEmail(): string {
  return process.env.ADMIN_NOTIFICATION_EMAIL?.trim() || getFromEmail();
}

export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (url) return url.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping send:', input.subject);
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: `HaBayit Jewish Center <${getFromEmail()}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo,
    });

    if (error) {
      console.error('[email] send failed:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[email] send error:', err);
    return false;
  }
}

function emailShell(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f3ea;font-family:Helvetica,Arial,sans-serif;color:#282828;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3ea;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4ded2;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#172643;padding:20px 28px;">
          <div style="color:#b8902a;font-size:11px;font-weight:bold;letter-spacing:0.14em;text-transform:uppercase;">HaBayit Israeli Jewish Center</div>
        </td></tr>
        <tr><td style="padding:28px;">${content}</td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #e4ded2;text-align:center;font-size:12px;color:#6f6a60;line-height:1.6;">
          HaBayit Israeli Jewish Center · Cooper City, FL<br>
          <a href="https://habayitcc.org" style="color:#172643;">habayitcc.org</a> · (646) 462-1138
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildEmailHtml(body: string): string {
  return emailShell(body);
}

export function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;background:#b8902a;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:bold;font-size:14px;letter-spacing:0.04em;">${label}</a>`;
}
