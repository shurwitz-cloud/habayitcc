import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import {
  isValidEmail,
  parseRecipientList,
  sendAdminComposeEmail,
} from '@/lib/email/admin-compose';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/email/send
 * Sends only when an authenticated admin explicitly submits compose.
 * Never called during build or page load.
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('emails');
  if (denied) return denied;

  let body: { to?: string; cc?: string; subject?: string; message?: string; replyTo?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const to = parseRecipientList(body.to ?? '');
  const cc = parseRecipientList(body.cc ?? '');
  const subject = (body.subject ?? '').trim();
  const message = (body.message ?? '').trim();
  const replyTo = (body.replyTo ?? '').trim();

  if (to.length === 0) {
    return NextResponse.json({ error: 'At least one recipient is required.' }, { status: 400 });
  }

  const invalidTo = to.find((email) => !isValidEmail(email));
  if (invalidTo) {
    return NextResponse.json({ error: `Invalid To address: ${invalidTo}` }, { status: 400 });
  }

  const invalidCc = cc.find((email) => !isValidEmail(email));
  if (invalidCc) {
    return NextResponse.json({ error: `Invalid Cc address: ${invalidCc}` }, { status: 400 });
  }

  if (!subject) {
    return NextResponse.json({ error: 'Subject is required.' }, { status: 400 });
  }

  if (subject.length > 200) {
    return NextResponse.json({ error: 'Subject is too long (max 200 characters).' }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }

  if (replyTo && !isValidEmail(replyTo)) {
    return NextResponse.json({ error: 'Invalid reply-to address.' }, { status: 400 });
  }

  const result = await sendAdminComposeEmail({
    to,
    cc: cc.length ? cc : undefined,
    subject,
    body: message,
    replyTo: replyTo || undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
