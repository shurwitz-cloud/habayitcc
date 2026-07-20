export const ADMIN_COOKIE = 'habayit_admin';
const SESSION_SALT = 'habayit-admin-session-v2';
const LEGACY_SESSION_SALT = 'habayit-admin-session-v1';
const LOCAL_DEV_SECRET = 'habayit-local-dev';

type EdgeRole = 'admin' | 'volunteer';

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToHex(signature);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function resolveSecret(secret: string | undefined): string | undefined {
  const configured = secret?.trim() || undefined;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'development') return LOCAL_DEV_SECRET;
  return undefined;
}

/**
 * Verifies staff session cookie (admin or volunteer).
 * `adminSecret` / `volunteerSecret` come from env in middleware.
 */
export async function verifyAdminCookieValue(
  value: string | undefined,
  adminSecret: string | undefined,
  volunteerSecret?: string | undefined
): Promise<boolean> {
  if (process.env.NODE_ENV === 'development') return true;
  if (!value) return false;

  const dotted = value.indexOf('.');
  if (dotted > 0) {
    const role = value.slice(0, dotted) as EdgeRole;
    const sig = value.slice(dotted + 1);
    if (role !== 'admin' && role !== 'volunteer') return false;
    const secret =
      role === 'admin' ? resolveSecret(adminSecret) : resolveSecret(volunteerSecret ?? adminSecret);
    if (!secret) return false;
    const expected = await hmacHex(secret, `${SESSION_SALT}:${role}`);
    return safeEqual(sig, expected);
  }

  // Legacy flat admin token
  const secret = resolveSecret(adminSecret);
  if (!secret) return false;
  const legacy = await hmacHex(secret, LEGACY_SESSION_SALT);
  return safeEqual(value, legacy);
}
