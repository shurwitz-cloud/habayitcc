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

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
  if (!raw) return [getFromEmail()];
  const list = raw
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return list.length ? list : [getFromEmail()];
}

/** First admin notification recipient (legacy callers). */
export function getAdminEmail(): string {
  return getAdminEmails()[0];
}

/** Admin alerts use a distinct from-address so info@ can receive them reliably. */
export function getAdminNotificationFrom(): string {
  const configured = process.env.ADMIN_NOTIFICATION_FROM?.trim();
  if (configured) {
    return configured.includes('<') ? configured : `HaBayit Notifications <${configured}>`;
  }
  return 'HaBayit Notifications <notifications@habayitcc.org>';
}

export function resolveAdminDelivery(): { to: string[] } {
  return { to: getAdminEmails() };
}

export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (url) return url.replace(/\/$/, '');
  return 'https://habayitcc.org';
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  from?: string;
  bcc?: string | string[];
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping send:', input.subject);
    return false;
  }

  const from =
    input.from?.trim() || `HaBayit Jewish Center <${getFromEmail()}>`;

  try {
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      bcc: input.bcc,
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo,
    });

    if (error) {
      console.error('[email] send failed:', input.subject, error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[email] send error:', err);
    return false;
  }
}

/** Admin alert copies (signups, RSVP, contact, donations). */
export async function sendAdminNotification(
  input: Omit<SendEmailInput, 'to' | 'from' | 'bcc'>
): Promise<boolean> {
  const delivery = resolveAdminDelivery();
  const ok = await sendEmail({
    ...input,
    from: getAdminNotificationFrom(),
    to: delivery.to,
  });
  if (!ok) {
    console.error('[email] admin notification failed:', input.subject, delivery);
  }
  return ok;
}

function emailHeaderHtml(): string {
  const logoUrl = `${getSiteUrl()}/logos/habayit-logo-white.png`;

  return `<table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="left" valign="middle" style="padding:0;">
              <img src="${logoUrl}" alt="HaBayit" width="56" height="49" style="display:block;width:56px;height:49px;border:0;" />
            </td>
            <td align="right" valign="middle" style="color:#b8902a;font-size:11px;font-family:Georgia,'Times New Roman',serif;line-height:1;padding:0;">
              ב&quot;ה
            </td>
          </tr>
        </table>`;
}

function emailShell(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f3ea;font-family:Helvetica,Arial,sans-serif;color:#282828;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3ea;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4ded2;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#172643;padding:12px 20px;">
          ${emailHeaderHtml()}
        </td></tr>
        <tr><td style="padding:28px;">${content}</td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #e4ded2;text-align:center;font-size:12px;color:#6f6a60;line-height:1.6;">
          HaBayit Israeli Jewish Center · Cooper City, FL<br>
          <a href="${getSiteUrl()}" style="color:#172643;">${getSiteUrl().replace(/^https?:\/\//, '')}</a> · (646) 462-1138
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
