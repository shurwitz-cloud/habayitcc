import { NextResponse } from 'next/server';
import { sendDonationTaxReceiptEmail } from '@/lib/email/donation-receipt';
import { getFromEmail, getResend } from '@/lib/email/client';

export const dynamic = 'force-dynamic';

/**
 * Send a sample donation receipt email for preview/testing.
 * GET /api/email/preview?send=you@email.com
 */
export async function GET(req: Request) {
  const to = new URL(req.url).searchParams.get('send')?.trim();

  if (!to) {
    return NextResponse.json({
      hint: 'Add ?send=your@email.com to send a sample donation receipt email.',
    });
  }

  const hasApiKey = Boolean(process.env.RESEND_API_KEY?.trim());
  if (!hasApiKey || !getResend()) {
    return NextResponse.json(
      { error: 'RESEND_API_KEY is missing on this deployment.' },
      { status: 503 }
    );
  }

  const sent = await sendDonationTaxReceiptEmail({
    email: to,
    firstName: 'Shmuel',
    name: 'Shmuel Hurwitz',
    amount: 72,
    method: 'Credit Card',
    isRecurring: true,
  });

  return NextResponse.json({
    to,
    fromEmail: getFromEmail(),
    sent,
    template: 'donation_monthly',
    message: sent
      ? `Sample donation receipt sent to ${to}. Check your inbox (and spam).`
      : 'Send failed — check server logs.',
  });
}
