import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE,
  getAdminSessionToken,
  resolveAdminLogin,
} from '@/lib/admin/auth';

function setSessionCookie(res: NextResponse, role: 'admin' | 'volunteer') {
  const token = getAdminSessionToken(role);
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { email?: string; password?: string };

  const email = body.email?.trim() ?? '';
  const password = body.password ?? '';

  const role = resolveAdminLogin(email, password);
  if (!role) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const token = getAdminSessionToken(role);
  if (!token) {
    return NextResponse.json(
      {
        error:
          role === 'volunteer'
            ? 'Volunteer login is not configured (missing VOLUNTEER_SECRET).'
            : 'Admin login is not configured (missing ADMIN_SECRET).',
      },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true, role });
  setSessionCookie(res, role);
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
