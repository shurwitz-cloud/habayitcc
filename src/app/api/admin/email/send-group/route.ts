import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { resolveEmailAudience } from '@/lib/admin/email-audiences';
import { plainTextToEmailHtml } from '@/lib/email/admin-compose';
import {
  buildEmailHtml,
  getFromEmail,
  getPublicFrom,
  getResend,
} from '@/lib/email/client';

export const dynamic = 'force-dynamic';

const MAX_RECIPIENTS = 500;
const BATCH_SIZE = 100;

type SendGroupBody = {
  audienceId?: string;
  expectedRecipientCount?: number;
  confirm?: string;
  subject?: string;
  message?: string;
};

/**
 * POST /api/admin/email/send-group
 * Resolves the CRM group server-side and sends one private message per recipient.
 * No recipient list is accepted from the browser.
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('emails');
  if (denied) return denied;

  let body: SendGroupBody;
  try {
    body = (await req.json()) as SendGroupBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const audienceId = body.audienceId?.trim() ?? '';
  const subject = body.subject?.trim() ?? '';
  const message = body.message?.trim() ?? '';

  if (!audienceId || !subject || !message) {
    return NextResponse.json(
      { error: 'Group, subject, and message are required.' },
      { status: 400 },
    );
  }
  if (subject.length > 200) {
    return NextResponse.json(
      { error: 'Subject is too long (max 200 characters).' },
      { status: 400 },
    );
  }

  let audience;
  try {
    audience = await resolveEmailAudience(audienceId);
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Could not resolve email group.';
    return NextResponse.json({ error }, { status: 500 });
  }

  if (!audience) {
    return NextResponse.json({ error: 'Email group not found.' }, { status: 404 });
  }

  const count = audience.recipients.length;
  if (count === 0) {
    return NextResponse.json({ error: 'This group has no valid email recipients.' }, { status: 400 });
  }
  if (count > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `This group has ${count} recipients; the safety limit is ${MAX_RECIPIENTS}.` },
      { status: 400 },
    );
  }

  if (
    body.expectedRecipientCount !== count ||
    body.confirm !== `SEND ${count}`
  ) {
    return NextResponse.json(
      {
        error: 'The group count changed or confirmation was invalid. Review the group and try again.',
        recipientCount: count,
      },
      { status: 409 },
    );
  }

  const resend = getResend();
  if (!resend) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
  }

  const html = buildEmailHtml(`
    ${plainTextToEmailHtml(message)}
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e4ded2;font-size:12px;line-height:1.6;color:#6f6a60;">
      You are receiving this message because your family is connected with ${audience.summary.label}
      at HaBayit. Reply to this email if you prefer not to receive group updates.
    </p>
  `);
  const emails = audience.recipients.map((recipient) => ({
    from: getPublicFrom(),
    to: recipient.email,
    subject,
    html,
    replyTo: getFromEmail(),
  }));

  let sent = 0;
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const { error } = await resend.batch.send(batch);
    if (error) {
      return NextResponse.json(
        {
          error: error.message || 'Resend batch failed.',
          sent,
          total: count,
        },
        { status: 502 },
      );
    }
    sent += batch.length;
  }

  return NextResponse.json({
    ok: true,
    sent,
    audience: audience.summary.label,
  });
}
