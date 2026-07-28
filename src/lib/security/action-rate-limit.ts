import { headers } from 'next/headers';
import { checkRateLimit } from './rate-limit';

function clientIpFromHeaders(headerStore: Headers): string {
  const forwarded = headerStore.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return headerStore.get('x-real-ip')?.trim() || 'unknown';
}

/** Rate-limit public server actions by client IP (best-effort per instance). */
export async function enforceActionRateLimit(
  scope: string,
  limit = 20,
  windowMs = 15 * 60 * 1000
): Promise<{ ok: true } | { ok: false; error: string }> {
  const headerStore = await headers();
  const ip = clientIpFromHeaders(headerStore);
  const result = checkRateLimit(`action:${scope}:${ip}`, limit, windowMs);
  if (!result.ok) {
    return { ok: false, error: 'Too many requests. Please wait a few minutes and try again.' };
  }
  return { ok: true };
}
