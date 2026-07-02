import { NextResponse } from 'next/server';
import { getFromEmail, getResend, sendEmail } from '@/lib/email/client';

export const dynamic = 'force-dynamic';

/**
 * Quick email health check. Visit /api/email/health in production.
 * Add ?send=test@example.com to send a test message (optional).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const testTo = url.searchParams.get('send')?.trim();

  const hasApiKey = Boolean(process.env.RESEND_API_KEY?.trim());
  const fromEmail = getFromEmail();
  const resend = getResend();

  const status = {
    configured: hasApiKey && Boolean(fromEmail),
    hasApiKey,
    fromEmail,
    resendClientReady: Boolean(resend),
  };

  if (!testTo) {
    return NextResponse.json({
      ...status,
      hint: 'Add ?send=your@email.com to send a test email.',
    });
  }

  if (!status.configured) {
    return NextResponse.json(
      {
        ...status,
        error: 'RESEND_API_KEY or RESEND_FROM_EMAIL is missing on this deployment.',
      },
      { status: 503 }
    );
  }

  const sent = await sendEmail({
    to: testTo,
    subject: 'HaBayit email test',
    html: '<p>If you received this, Resend is working on HaBayit production.</p>',
  });

  return NextResponse.json({
    ...status,
    testTo,
    sent,
  });
}
