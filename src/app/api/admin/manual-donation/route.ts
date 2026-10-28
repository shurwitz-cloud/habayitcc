import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { persistDonation } from '@/lib/donations/persist-donation';
import {
  buildAbsoluteReceiptUrl,
  sendDonationReceiptEmailFromRecord,
} from '@/lib/email/donation-receipt';

export const dynamic = 'force-dynamic';

const METHODS = ['Zelle', 'Zeffy', 'Check', 'Cash', 'Credit Card', 'ACH', 'Other'] as const;
type PaymentMethod = (typeof METHODS)[number];

/**
 * Manual CRM donation entry (Zelle, Zeffy, check, etc.) with optional receipt email.
 * POST /api/admin/manual-donation
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: {
    confirm?: boolean;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    amount?: number;
    paymentMethod?: string;
    donationType?: 'One-Time' | 'Monthly';
    campaign?: string;
    memo?: string;
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
  const amount = Number(body.amount);
  const donationType: 'One-Time' | 'Monthly' =
    body.donationType === 'Monthly' ? 'Monthly' : 'One-Time';

  const rawMethod = (body.paymentMethod ?? '').trim();
  const paymentMethod: PaymentMethod = (METHODS as readonly string[]).includes(rawMethod)
    ? (rawMethod as PaymentMethod)
    : 'Other';

  if (!firstName || !lastName || !email.includes('@')) {
    return NextResponse.json(
      { error: 'firstName, lastName, and email are required.' },
      { status: 400 }
    );
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number.' }, { status: 400 });
  }

  const keyBase =
    (body.paymentKey ?? '').trim() ||
    `manual-${paymentMethod.toLowerCase().replace(/\s+/g, '-')}-${email.replace(/[^a-z0-9]+/g, '-')}-${Math.round(amount * 100)}`;
  const paymentIntentId = keyBase.startsWith('zeffy:') || keyBase.startsWith('manual:')
    ? keyBase
    : `manual:${keyBase}`;

  const campaign =
    (body.campaign ?? '').trim() ||
    (paymentMethod === 'Zeffy' ? 'zeffy' : paymentMethod === 'Zelle' ? 'zelle' : null);

  const memoParts = [
    body.memo?.trim(),
    `via ${paymentMethod}`,
  ].filter(Boolean);

  const paidAtRaw = (body.paidAt ?? '').trim();
  const paidAt =
    paidAtRaw && !Number.isNaN(new Date(paidAtRaw).getTime())
      ? new Date(paidAtRaw).toISOString()
      : undefined;

  const persisted = await persistDonation({
    paymentIntentId,
    amountDollars: amount,
    firstName,
    lastName,
    email,
    phone: body.phone,
    donationType,
    memo: memoParts.join(' · '),
    campaign,
    paidAt,
  });

  if (!persisted.saved) {
    return NextResponse.json(
      { error: persisted.error ?? 'Failed to save donation.' },
      { status: 500 }
    );
  }

  let emailed = false;
  if (body.sendEmail === true && !persisted.alreadyExisted) {
    emailed = await sendDonationReceiptEmailFromRecord({
      email,
      firstName,
      lastName,
      amountDollars: amount,
      campaign,
      donationType,
      method: paymentMethod,
      paidAt,
    });
  }

  return NextResponse.json({
    ok: true,
    donationId: persisted.donationId,
    duplicate: persisted.alreadyExisted,
    emailed,
    paymentMethod,
    paymentIntentId,
    paidAt: paidAt ?? null,
    receiptUrl:
      !persisted.alreadyExisted
        ? buildAbsoluteReceiptUrl({
            name: `${firstName} ${lastName}`.trim(),
            amount,
            date: paidAt ? new Date(paidAt) : new Date(),
            campaign,
            method: paymentMethod,
          })
        : null,
  });
}
