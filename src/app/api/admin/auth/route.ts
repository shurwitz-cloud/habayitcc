import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isValidAdminSecret } from '@/lib/admin/auth';

export async function POST(req: NextRequest) {
  const { secret } = (await req.json()) as { secret?: string };

  if (!secret || !isValidAdminSecret(secret)) {
    return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
