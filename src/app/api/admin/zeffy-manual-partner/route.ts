import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { recordZeffyChaiPartnerPayment } from '@/lib/zeffy/record-chai-payment';
import type { ParsedZeffyPayment } from '@/lib/zeffy/types';

export const dynamic = 'force-dynamic';

/**
 * Manually provision a Zeffy Chai Partner (CRM + sheet + welcome email).
 * Use when Zeffy webhook did not arrive — admin feeds the gift details.
 *
 * POST /api/admin/zeffy-manual-partner
 * Body: {
 *   confirm: true,
 *   firstName, lastName, email,
 *   street?, city?, state?, zip?, phone?,
 *   monthlyAmount: number (>= 150),
 *   paidAt?: ISO string,
 *   paymentKey?: string  // stable id for idempotency
 * }
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: {
    confirm?: boolean;
    firstName?: string;
    lastName?: string;
    email?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    monthlyAmount?: number;
    paidAt?: string;
    paymentKey?: string;
    sendEmail?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const firstName = (body.firstName ?? '').trim();
  const lastName = (body.lastName ?? '').trim();
  const monthlyAmount = Number(body.monthlyAmount);

  if (!firstName || !lastName || !email.includes('@')) {
    return NextResponse.json({ error: 'firstName, lastName, and email are required.' }, { status: 400 });
  }
  if (!Number.isFinite(monthlyAmount) || monthlyAmount < 150) {
    return NextResponse.json({ error: 'monthlyAmount must be at least 150.' }, { status: 400 });
  }

  const paymentId =
    (body.paymentKey ?? '').trim() ||
    `manual-${email.replace(/[^a-z0-9]+/g, '-')}-${Math.round(monthlyAmount)}`;

  const parsed: ParsedZeffyPayment = {
    paymentId,
    amountDollars: monthlyAmount,
    email,
    firstName,
    lastName,
    phone: (body.phone ?? '').trim(),
    street: (body.street ?? '').trim(),
    city: (body.city ?? '').trim(),
    state: (body.state ?? '').trim(),
    zip: (body.zip ?? '').trim(),
    campaignId: 'habayit-chai-partner',
    campaignTitle: 'HaBayit Chai Partner',
    isMonthly: true,
    status: 'succeeded',
    raw: { source: 'admin_manual', body },
  };

  const sendEmails = body.sendEmail !== false;

  try {
    const result = await recordZeffyChaiPartnerPayment(parsed, {
      sendEmails,
      paidAt: body.paidAt,
    });

    if (!result.ok) {
      return NextResponse.json({ error: 'Failed to record partner.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      partnerId: result.partnerId,
      accessCode: result.accessCode,
      duplicate: Boolean(result.duplicate),
      emailed: sendEmails && !result.duplicate,
      paymentId,
    });
  } catch (err) {
    console.error('[zeffy-manual-partner]', err);
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 });
  }
}
