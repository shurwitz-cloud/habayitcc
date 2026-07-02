import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'habayit_admin';

export function getAdminSecret(): string | undefined {
  return process.env.ADMIN_SECRET?.trim();
}

export function isValidAdminSecret(value: string): boolean {
  const secret = getAdminSecret();
  if (!secret) return false;
  return value === secret;
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const secret = getAdminSecret();
  if (!secret) return false;
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_COOKIE)?.value === secret;
}
