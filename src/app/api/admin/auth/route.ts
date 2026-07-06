import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE,
  getAdminSessionToken,
  isValidAdminLogin,
  isValidAdminSecret,
} from '@/lib/admin/auth';

function setSessionCookie(res: NextResponse) {
  const token = getAdminSessionToken();
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { email?: string; password?: string; secret?: string };

  const email = body.email?.trim() ?? '';
  const password = body.password ?? body.secret ?? '';

  const valid =
    email && body.password !== undefined
      ? isValidAdminLogin(email, password)
      : isValidAdminSecret(password);

  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  setSessionCookie(res);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
