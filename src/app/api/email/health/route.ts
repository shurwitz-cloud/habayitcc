import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/guard';
import { getFromEmail, getResend, resolveAdminDelivery, sendAdminNotification, sendEmail } from '@/lib/email/client';

export const dynamic = 'force-dynamic';

/**
 * Quick email health check. Visit /api/email/health in production.
 * Add ?send=test@example.com to send a test message (optional).
 */
export async function GET(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const url = new URL(req.url);
  const testTo = url.searchParams.get('send')?.trim();
  const testAdmin = url.searchParams.get('testAdmin') === '1';

  const hasApiKey = Boolean(process.env.RESEND_API_KEY?.trim());
  const fromEmail = getFromEmail();
  const resend = getResend();
  const adminDelivery = resolveAdminDelivery();

  const status = {
    configured: hasApiKey && Boolean(fromEmail),
    hasApiKey,
    fromEmail,
    resendClientReady: Boolean(resend),
    adminDelivery,
  };

  if (!testTo && !testAdmin) {
    return NextResponse.json({
      ...status,
      hint: 'Add ?send=your@email.com for a basic test, or ?testAdmin=1 to send an admin notification test.',
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

  if (testAdmin) {
    const sent = await sendAdminNotification({
      subject: 'HaBayit admin notification test',
      html: '<p>If you received this, admin submission alerts are working.</p>',
    });
    return NextResponse.json({ ...status, testAdmin: true, sent });
  }

  if (!testTo) {
    return NextResponse.json({ ...status, error: 'Missing send address.' }, { status: 400 });
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
