import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'habayit_admin';

const SESSION_SALT = 'habayit-admin-session-v1';

export function getAdminLoginEmail(): string {
  return (process.env.ADMIN_EMAIL?.trim() || 'info@habayitcc.org').toLowerCase();
}

export function getAdminSecret(): string | undefined {
  return process.env.ADMIN_SECRET?.trim() || undefined;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Opaque cookie value — never store the raw password in the browser. */
export function getAdminSessionToken(): string {
  const secret = getAdminSecret();
  if (!secret) return '';
  return createHmac('sha256', secret).update(SESSION_SALT).digest('hex');
}

export function isValidAdminLogin(email: string, password: string): boolean {
  const secret = getAdminSecret();
  if (!secret) return false;

  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail !== getAdminLoginEmail()) return false;

  return safeEqual(password, secret);
}

/** @deprecated Use isValidAdminLogin — kept for one release if old clients POST { secret } only */
export function isValidAdminSecret(value: string): boolean {
  const secret = getAdminSecret();
  if (!secret) return false;
  return safeEqual(value, secret);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const expected = getAdminSessionToken();
  if (!expected) return false;

  const cookieStore = await cookies();
  const value = cookieStore.get(ADMIN_COOKIE)?.value;
  if (!value) return false;

  return safeEqual(value, expected);
}
