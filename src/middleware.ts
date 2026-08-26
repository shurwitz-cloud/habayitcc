import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ADMIN_COOKIE, verifyAdminCookieValue } from '@/lib/admin/session-edge';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com https://*.supabase.co",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

function withSecurityHeaders(res: NextResponse, isProduction: boolean): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(key, value);
  }
  if (isProduction) {
    res.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProduction = process.env.NODE_ENV === 'production';
  const adminSecret = process.env.ADMIN_SECRET?.trim();
  const volunteerSecret = process.env.VOLUNTEER_SECRET?.trim();

  if (req.method === 'POST' && pathname === '/api/admin/auth') {
    const ip = getClientIp(req);
    const limit = checkRateLimit(`admin-auth:${ip}`, 10, 15 * 60 * 1000);
    if (!limit.ok) {
      return withSecurityHeaders(
        NextResponse.json(
          { error: 'Too many login attempts. Please try again later.' },
          {
            status: 429,
            headers: { 'Retry-After': String(limit.retryAfterSec) },
          }
        ),
        isProduction
      );
    }
  }

  if (req.method === 'POST' && pathname.startsWith('/api/stripe/')) {
    const ip = getClientIp(req);
    const limit = checkRateLimit(`stripe-api:${ip}`, 30, 60 * 1000);
    if (!limit.ok) {
      return withSecurityHeaders(
        NextResponse.json(
          { error: 'Too many payment requests. Please wait a moment and try again.' },
          {
            status: 429,
            headers: { 'Retry-After': String(limit.retryAfterSec) },
          }
        ),
        isProduction
      );
    }
  }

  if (req.method === 'POST' && pathname === '/api/webhooks/zeffy') {
    const ip = getClientIp(req);
    const limit = checkRateLimit(`zeffy-webhook:${ip}`, 60, 60 * 1000);
    if (!limit.ok) {
      return withSecurityHeaders(
        NextResponse.json({ error: 'Too many requests.' }, { status: 429 }),
        isProduction
      );
    }
  }

  const adminSession = req.cookies.get(ADMIN_COOKIE)?.value;
  const isStaffAuthed = await verifyAdminCookieValue(
    adminSession,
    adminSecret,
    volunteerSecret
  );

  const isAdminAuthRoute = pathname === '/api/admin/auth';
  if (pathname.startsWith('/api/admin/') && !isAdminAuthRoute) {
    if (!isStaffAuthed) {
      return withSecurityHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        isProduction
      );
    }
  }

  if (isProduction && pathname.startsWith('/receipt/annual/preview')) {
    if (!isStaffAuthed) {
      return withSecurityHeaders(new NextResponse('Not found.', { status: 404 }), isProduction);
    }
  }

  const isProtectedApi =
    pathname.startsWith('/api/email/') || pathname === '/api/sheets/setup';

  if (isProtectedApi) {
    if (!isStaffAuthed) {
      return withSecurityHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        isProduction
      );
    }
  }

  if (pathname === '/email-preview' && isProduction) {
    if (!isStaffAuthed) {
      return withSecurityHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        isProduction
      );
    }
  }

  return withSecurityHeaders(NextResponse.next(), isProduction);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|photos/|logos/|flyers/).*)',
  ],
};
