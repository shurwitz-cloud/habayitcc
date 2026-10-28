import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import {
  isStaffRole,
  roleHasCapability,
  type AdminCapability,
  type AdminRole,
} from './roles';

export type { AdminCapability, AdminRole } from './roles';
export {
  roleHasCapability,
  VOLUNTEER_HIDDEN_CRM_VIEWS,
  OFFICE_HIDDEN_CRM_VIEWS,
  OFFICE_HIDDEN_PAYMENT_SOURCES,
  crmViewsHiddenForRole,
  roleDisplayLabel,
  isStaffRole,
} from './roles';

export const ADMIN_COOKIE = 'habayit_admin';

const SESSION_SALT = 'habayit-admin-session-v2';
/** Dev-only fallback so local admin works without matching production secrets. */
const LOCAL_DEV_SECRET = 'habayit-local-dev';

const DEFAULT_TEACHER_LOGINS = ['teacher', 'teachers', 'teacher@habayitcc.org'];

/** True only under `next dev` — never on Vercel production builds. */
export function isLocalDevAdminBypass(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function getAdminLoginEmail(): string {
  return (process.env.ADMIN_EMAIL?.trim() || 'info@habayitcc.org').toLowerCase();
}

function parseEmailList(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getVolunteerEmails(): string[] {
  return parseEmailList(process.env.VOLUNTEER_EMAILS || '');
}

export function getOfficeEmails(): string[] {
  return parseEmailList(process.env.OFFICE_EMAILS || '');
}

export function getTeacherLogins(): string[] {
  const fromEnv = parseEmailList(process.env.TEACHER_EMAILS || '');
  return [...new Set([...DEFAULT_TEACHER_LOGINS, ...fromEnv])];
}

export function getAdminSecret(): string | undefined {
  const configured = process.env.ADMIN_SECRET?.trim() || undefined;
  if (configured) return configured;
  if (isLocalDevAdminBypass()) return LOCAL_DEV_SECRET;
  return undefined;
}

export function getVolunteerSecret(): string | undefined {
  const configured = process.env.VOLUNTEER_SECRET?.trim() || undefined;
  if (configured) return configured;
  if (isLocalDevAdminBypass()) return LOCAL_DEV_SECRET;
  return undefined;
}

export function getOfficeSecret(): string | undefined {
  const configured = process.env.OFFICE_SECRET?.trim() || undefined;
  if (configured) return configured;
  const volunteer = getVolunteerSecret();
  if (volunteer) return volunteer;
  if (isLocalDevAdminBypass()) return LOCAL_DEV_SECRET;
  return undefined;
}

export function getTeacherSecret(): string | undefined {
  const configured = process.env.TEACHER_SECRET?.trim() || undefined;
  if (configured) return configured;
  if (isLocalDevAdminBypass()) return LOCAL_DEV_SECRET;
  return undefined;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function secretForRole(role: AdminRole): string | undefined {
  if (role === 'admin') return getAdminSecret();
  if (role === 'office') return getOfficeSecret();
  if (role === 'teacher') return getTeacherSecret();
  return getVolunteerSecret();
}

/** Opaque cookie value — `role.<hmac>` — never store the raw password. */
export function getAdminSessionToken(role: AdminRole = 'admin'): string {
  const secret = secretForRole(role);
  if (!secret) return '';
  const sig = createHmac('sha256', secret).update(`${SESSION_SALT}:${role}`).digest('hex');
  return `${role}.${sig}`;
}

/** Legacy v1 admin-only tokens (pre-role). Still accepted as admin. */
function getLegacyAdminSessionToken(): string {
  const secret = getAdminSecret();
  if (!secret) return '';
  return createHmac('sha256', secret).update('habayit-admin-session-v1').digest('hex');
}

export function resolveAdminLogin(email: string, password: string): AdminRole | null {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  if (normalizedEmail === getAdminLoginEmail()) {
    if (isLocalDevAdminBypass()) return 'admin';
    const secret = getAdminSecret();
    if (!secret) return null;
    return safeEqual(password, secret) ? 'admin' : null;
  }

  if (getTeacherLogins().includes(normalizedEmail)) {
    if (isLocalDevAdminBypass()) return 'teacher';
    const secret = getTeacherSecret();
    if (!secret) return null;
    return safeEqual(password, secret) ? 'teacher' : null;
  }

  if (getOfficeEmails().includes(normalizedEmail)) {
    if (isLocalDevAdminBypass()) return 'office';
    const secret = getOfficeSecret();
    if (!secret) return null;
    return safeEqual(password, secret) ? 'office' : null;
  }

  if (getVolunteerEmails().includes(normalizedEmail)) {
    if (isLocalDevAdminBypass()) return 'volunteer';
    const secret = getVolunteerSecret();
    if (!secret) return null;
    return safeEqual(password, secret) ? 'volunteer' : null;
  }

  return null;
}

/** @deprecated Prefer resolveAdminLogin — kept for simple boolean checks. */
export function isValidAdminLogin(email: string, password: string): boolean {
  return resolveAdminLogin(email, password) !== null;
}

export function parseAdminSessionCookie(value: string | undefined): AdminRole | null {
  if (!value) return null;

  const dotted = value.indexOf('.');
  if (dotted > 0) {
    const role = value.slice(0, dotted);
    const sig = value.slice(dotted + 1);
    if (!isStaffRole(role)) return null;
    const expected = getAdminSessionToken(role);
    if (!expected) return null;
    const expectedSig = expected.slice(expected.indexOf('.') + 1);
    return safeEqual(sig, expectedSig) ? role : null;
  }

  // Legacy flat HMAC → full admin
  const legacy = getLegacyAdminSessionToken();
  if (legacy && safeEqual(value, legacy)) return 'admin';
  return null;
}

export function verifyAdminCookieValue(value: string | undefined): boolean {
  if (isLocalDevAdminBypass()) return true;
  return parseAdminSessionCookie(value) !== null;
}

export async function getAdminRole(): Promise<AdminRole | null> {
  const cookieStore = await cookies();
  const fromCookie = parseAdminSessionCookie(cookieStore.get(ADMIN_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  // Local `next dev` without a login cookie → treat as full admin for convenience.
  if (isLocalDevAdminBypass()) return 'admin';
  return null;
}

export async function isAdminAuthenticated(): Promise<boolean> {
  if (isLocalDevAdminBypass()) return true;
  return (await getAdminRole()) !== null;
}

export async function requireCapability(capability: AdminCapability): Promise<boolean> {
  const role = await getAdminRole();
  if (!role) return false;
  return roleHasCapability(role, capability);
}
