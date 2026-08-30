import { buildEmailHtml, getFromEmail } from './client';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function parseRecipientList(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

export function plainTextToEmailHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return '<p style="margin:0 0 16px;line-height:1.6;"></p>';
  }

  return paragraphs
    .map((block) => {
      const lines = block.split('\n').map((line) => escapeHtml(line));
      return `<p style="margin:0 0 16px;line-height:1.6;">${lines.join('<br>')}</p>`;
    })
    .join('');
}

export interface AdminComposeInput {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  replyTo?: string;
}

export async function sendAdminComposeEmail(
  input: AdminComposeInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = await import('./client').then((m) => m.getResend());
  if (!resend) {
    return { ok: false, error: 'RESEND_API_KEY is not configured.' };
  }

  const html = buildEmailHtml(plainTextToEmailHtml(input.body));

  try {
    const { error } = await resend.emails.send({
      from: `HaBayit Jewish Center <${getFromEmail()}>`,
      to: input.to,
      cc: input.cc?.length ? input.cc : undefined,
      subject: input.subject.trim(),
      html,
      replyTo: input.replyTo?.trim() || getFromEmail(),
    });

    if (error) {
      return { ok: false, error: error.message || 'Send failed.' };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed.';
    return { ok: false, error: message };
  }
}
