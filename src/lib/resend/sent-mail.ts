/**
 * Read-only Resend sent-mail API helpers (list + retrieve).
 * Does not send email — use src/lib/email/client.ts for outbound sends.
 */

export interface ResendSentEmailSummary {
  id: string;
  message_id: string | null;
  to: string[];
  from: string;
  created_at: string;
  subject: string;
  bcc: string[] | null;
  cc: string[] | null;
  reply_to: string[] | null;
  last_event: string | null;
  scheduled_at: string | null;
}

export interface ResendSentEmailListResponse {
  object: 'list';
  has_more: boolean;
  data: ResendSentEmailSummary[];
}

export interface ResendSentEmailDetail extends ResendSentEmailSummary {
  html: string | null;
  text: string | null;
}

function getResendApiKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() || null;
}

async function resendFetch<T>(path: string): Promise<{ data: T | null; error: string | null }> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { data: null, error: 'RESEND_API_KEY is not configured.' };
  }

  try {
    const res = await fetch(`https://api.resend.com${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const body = (await res.json().catch(() => null)) as
      | T
      | { message?: string; name?: string }
      | null;

    if (!res.ok) {
      const message =
        body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
          ? body.message
          : `Resend API error (${res.status})`;
      return { data: null, error: message };
    }

    return { data: body as T, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Resend request failed';
    return { data: null, error: message };
  }
}

export async function listSentEmails(options?: {
  limit?: number;
  after?: string;
  before?: string;
}): Promise<{ data: ResendSentEmailListResponse | null; error: string | null }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(Math.min(100, Math.max(1, options.limit))));
  if (options?.after) params.set('after', options.after);
  if (options?.before) params.set('before', options.before);

  const query = params.toString();
  return resendFetch<ResendSentEmailListResponse>(`/emails${query ? `?${query}` : ''}`);
}

export async function getSentEmail(
  id: string
): Promise<{ data: ResendSentEmailDetail | null; error: string | null }> {
  const trimmed = id.trim();
  if (!trimmed) {
    return { data: null, error: 'Email id is required.' };
  }
  return resendFetch<ResendSentEmailDetail>(`/emails/${encodeURIComponent(trimmed)}`);
}
