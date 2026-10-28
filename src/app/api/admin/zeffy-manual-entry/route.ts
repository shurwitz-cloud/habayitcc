import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { persistDonation } from '@/lib/donations/persist-donation';
import {
  buildAbsoluteReceiptUrl,
  buildChaiPartnerReceiptUrl,
  sendDonationReceiptEmailFromRecord,
} from '@/lib/email/donation-receipt';
import { recordZeffyChaiPartnerPayment } from '@/lib/zeffy/record-chai-payment';
import type { ParsedZeffyPayment } from '@/lib/zeffy/types';

export const dynamic = 'force-dynamic';

type EntryType = 'chai_partner' | 'donation';

/**
 * Manual CRM entry for Zeffy gifts (Chai Partner or one-time donor).
 * POST /api/admin/zeffy-manual-entry
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: {
    confirm?: boolean;
    type?: EntryType;
    firstName?: string;
    lastName?: string;
    email?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    amount?: number;
    paidAt?: string;
    paymentKey?: string;
    sendEmail?: boolean;
    campaign?: string;
    memo?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }

  const type: EntryType = body.type === 'donation' ? 'donation' : 'chai_partner';
  const email = (body.email ?? '').trim().toLowerCase();
  const firstName = (body.firstName ?? '').trim();
  const lastName = (body.lastName ?? '').trim();
  const amount = Number(body.amount);

  if (!firstName || !lastName || !email.includes('@')) {
    return NextResponse.json(
      { error: 'firstName, lastName, and email are required.' },
      { status: 400 }
    );
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number.' }, { status: 400 });
  }
  if (type === 'chai_partner' && amount < 150) {
    return NextResponse.json(
      { error: 'Chai Partner monthly amount must be at least $150.' },
      { status: 400 }
    );
  }

  const paymentId =
    (body.paymentKey ?? '').trim() ||
    `manual-${type}-${email.replace(/[^a-z0-9]+/g, '-')}-${Math.round(amount * 100)}`;

  const sendEmail = body.sendEmail === true;
  const paidAtRaw = (body.paidAt ?? '').trim();
  const paidAt =
    paidAtRaw && !Number.isNaN(new Date(paidAtRaw).getTime())
      ? new Date(paidAtRaw).toISOString()
      : undefined;
  const receiptDate = paidAt ? new Date(paidAt) : new Date();

  if (type === 'chai_partner') {
    const parsed: ParsedZeffyPayment = {
      paymentId,
      amountDollars: amount,
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
      raw: { source: 'admin_manual_ui', body },
    };

    const result = await recordZeffyChaiPartnerPayment(parsed, {
      sendEmails: sendEmail,
      paidAt,
    });

    if (!result.ok) {
      return NextResponse.json({ error: 'Failed to record Chai Partner.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      type,
      partnerId: result.partnerId,
      accessCode: result.accessCode,
      duplicate: Boolean(result.duplicate),
      emailed: sendEmail && !result.duplicate,
      paymentId,
      paidAt: paidAt ?? null,
      receiptUrl: result.duplicate
        ? null
        : buildChaiPartnerReceiptUrl({
            firstName,
            lastName,
            amount,
            date: receiptDate,
          }),
    });
  }

  // One-time (or general) Zeffy donor
  const paymentIntentId = `zeffy:${paymentId}`;
  const campaign = (body.campaign ?? '').trim() || 'zeffy';
  const persisted = await persistDonation({
    paymentIntentId,
    amountDollars: amount,
    firstName,
    lastName,
    email,
    phone: body.phone,
    donationType: 'One-Time',
    memo: body.memo?.trim() || 'Zeffy (manual CRM entry)',
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
  if (sendEmail && !persisted.alreadyExisted) {
    emailed = await sendDonationReceiptEmailFromRecord({
      email,
      firstName,
      lastName,
      amountDollars: amount,
      campaign,
      donationType: 'One-Time',
      method: 'Zeffy',
      paidAt,
    });
  }

  return NextResponse.json({
    ok: true,
    type,
    donationId: persisted.donationId,
    duplicate: persisted.alreadyExisted,
    emailed,
    paymentId,
    paidAt: paidAt ?? null,
    receiptUrl: persisted.alreadyExisted
      ? null
      : buildAbsoluteReceiptUrl({
          name: `${firstName} ${lastName}`.trim(),
          amount,
          date: receiptDate,
          campaign,
          method: 'Zeffy',
        }),
  });
}
