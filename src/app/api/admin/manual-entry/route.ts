import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { ensureCrmContact } from '@/lib/admin/ensure-contact';
import { formatCoupleNames } from '@/lib/donations/couple-names';
import { persistDonation } from '@/lib/donations/persist-donation';
import {
  buildAbsoluteReceiptUrl,
  buildChaiPartnerReceiptUrl,
  sendDonationReceiptEmailFromRecord,
} from '@/lib/email/donation-receipt';
import { formatCheckPaymentMethod } from '@/lib/donations/receipt-method';
import {
  chaiMonthlyFromUpfront,
  isChaiPaidUpfrontNote,
  recordZeffyChaiPartnerPayment,
} from '@/lib/zeffy/record-chai-payment';
import type { ParsedZeffyPayment } from '@/lib/zeffy/types';

export const dynamic = 'force-dynamic';

const METHODS = ['Zelle', 'Zeffy', 'Cash', 'Check', 'Cash App', 'Other'] as const;
type PaymentMethod = (typeof METHODS)[number];
type EntryKind = 'one_time' | 'monthly' | 'chai_partner';

function resolveMethodLabel(
  method: PaymentMethod,
  methodOther?: string | null,
  checkNumber?: string | null,
): string {
  if (method === 'Check') {
    return formatCheckPaymentMethod(checkNumber);
  }
  if (method === 'Other') {
    const other = (methodOther || '').trim();
    return other || 'Other';
  }
  return method;
}

/**
 * Unified CRM manual entry (donations + Chai Partner).
 * POST /api/admin/manual-entry
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: {
    confirm?: boolean;
    kind?: EntryKind;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    amount?: number;
    paymentMethod?: string;
    paymentMethodOther?: string;
    /** Optional check number when paymentMethod is Check → receipt "Check #123". */
    checkNumber?: string;
    paidAt?: string;
    paymentKey?: string;
    campaign?: string;
    memo?: string;
    sendEmail?: boolean;
    includeReceiptLink?: boolean;
    spouseFirstName?: string;
    spouseLastName?: string;
    spouseEmail?: string;
    spousePhone?: string;
    /** Chai: amount is full prepaid gift; CRM monthly = monthlyAmount or amount÷12. */
    paidUpfront?: boolean;
    /** Chai effective monthly when paidUpfront (optional). */
    monthlyAmount?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }

  const kind: EntryKind =
    body.kind === 'chai_partner'
      ? 'chai_partner'
      : body.kind === 'monthly'
        ? 'monthly'
        : 'one_time';

  const email = (body.email ?? '').trim().toLowerCase();
  const firstName = (body.firstName ?? '').trim();
  const lastName = (body.lastName ?? '').trim();
  const amount = Number(body.amount);

  const spouseFirstName = (body.spouseFirstName ?? '').trim();
  const spouseLastName = (body.spouseLastName ?? '').trim();
  const spouseEmail = (body.spouseEmail ?? '').trim().toLowerCase();
  const spousePhone = (body.spousePhone ?? '').trim();

  const rawMethod = (body.paymentMethod ?? '').trim();
  const paymentMethod: PaymentMethod = (METHODS as readonly string[]).includes(rawMethod)
    ? (rawMethod as PaymentMethod)
    : 'Other';
  const methodLabel = resolveMethodLabel(
    paymentMethod,
    body.paymentMethodOther,
    paymentMethod === 'Check' ? body.checkNumber : undefined,
  );

  if (!firstName || !lastName || !email.includes('@')) {
    return NextResponse.json(
      { error: 'firstName, lastName, and email are required.' },
      { status: 400 },
    );
  }
  if (spouseFirstName && spouseEmail && !spouseEmail.includes('@')) {
    return NextResponse.json({ error: 'Spouse email is invalid.' }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number.' }, { status: 400 });
  }
  const memo = (body.memo ?? '').trim();
  const paidUpfront =
    kind === 'chai_partner' &&
    (body.paidUpfront === true || isChaiPaidUpfrontNote(memo));
  const monthlyAmount = paidUpfront
    ? Number.isFinite(body.monthlyAmount) && Number(body.monthlyAmount) > 0
      ? Number(body.monthlyAmount)
      : chaiMonthlyFromUpfront(amount)
    : amount;

  if (kind === 'chai_partner') {
    if (paidUpfront) {
      if (monthlyAmount < 150) {
        return NextResponse.json(
          {
            error:
              'Prepaid Chai Partner must equal at least $150/month (amount÷12 or monthlyAmount). Put "prepaid" in memo and enter the full amount paid.',
          },
          { status: 400 },
        );
      }
    } else if (amount < 150) {
      return NextResponse.json(
        { error: 'Chai Partner monthly amount must be at least $150.' },
        { status: 400 },
      );
    }
  }

  const sendEmailFlag = body.sendEmail === true;
  const includeReceiptLink = body.includeReceiptLink === true;

  const paidAtRaw = (body.paidAt ?? '').trim();
  const paidAt =
    paidAtRaw && !Number.isNaN(new Date(paidAtRaw).getTime())
      ? new Date(paidAtRaw).toISOString()
      : undefined;
  const receiptDate = paidAt ? new Date(paidAt) : new Date();

  const coupleNames = formatCoupleNames({
    firstName,
    lastName,
    spouseFirstName,
    spouseLastName,
  });

  const keyBase =
    (body.paymentKey ?? '').trim() ||
    `manual-${kind}-${methodLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${email.replace(/[^a-z0-9]+/g, '-')}-${Math.round(amount * 100)}`;

  if (kind === 'chai_partner') {
    const paymentId = keyBase.startsWith('manual-') ? keyBase : `manual-${keyBase}`;
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
      raw: { source: 'admin_manual_entry', body },
    };

    const result = await recordZeffyChaiPartnerPayment(parsed, {
      sendEmails: sendEmailFlag,
      includeReceiptLink,
      paidAt,
      paymentMethod: methodLabel,
      spouseFirstName,
      spouseLastName,
      spouseEmail,
      spousePhone,
      paidUpfront,
      monthlyAmount: paidUpfront ? monthlyAmount : undefined,
      note: memo || undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: 'Failed to record Chai Partner.' }, { status: 500 });
    }

    const receiptUrl = result.duplicate
      ? null
      : buildChaiPartnerReceiptUrl({
          firstName,
          lastName,
          amount,
          date: receiptDate,
          method: methodLabel,
          name: coupleNames.receiptName,
        });

    return NextResponse.json({
      ok: true,
      kind,
      partnerId: result.partnerId,
      accessCode: result.accessCode,
      duplicate: Boolean(result.duplicate),
      emailed: sendEmailFlag && !result.duplicate,
      includeReceiptLink: includeReceiptLink && sendEmailFlag,
      paymentMethod: methodLabel,
      paidAt: paidAt ?? null,
      paidUpfront,
      monthlyAmount: paidUpfront ? monthlyAmount : amount,
      receiptUrl,
      receiptName: coupleNames.receiptName,
      greeting: coupleNames.greeting,
    });
  }

  const donationType = kind === 'monthly' ? 'Monthly' : 'One-Time';
  const paymentIntentId =
    keyBase.startsWith('zeffy:') || keyBase.startsWith('manual:')
      ? keyBase
      : `manual:${keyBase}`;

  // Only use campaign when the admin typed one — never auto-fill from payment method.
  const campaign = (body.campaign ?? '').trim() || null;

  const memoParts = [
    memo || null,
    `via ${methodLabel}`,
    coupleNames.hasSpouse ? `Spouse: ${coupleNames.receiptName}` : null,
  ].filter(Boolean);

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
      { status: 500 },
    );
  }

  if (!persisted.alreadyExisted) {
    await ensureCrmContact({
      firstName,
      lastName,
      email,
      phone: body.phone,
      interest: kind === 'monthly' ? 'Monthly donor' : 'Donor',
      note: coupleNames.hasSpouse
        ? `--- Manual donation ---\nSpouse: ${coupleNames.receiptName}`
        : '--- Manual donation ---',
      createdAt: paidAt,
      isResolved: true,
    });

    if (spouseFirstName && spouseEmail.includes('@')) {
      await ensureCrmContact({
        firstName: spouseFirstName,
        lastName: spouseLastName || lastName,
        email: spouseEmail,
        phone: spousePhone || null,
        interest: kind === 'monthly' ? 'Monthly donor' : 'Donor',
        note: `--- Spouse of donor ---\nPartner: ${firstName} ${lastName} (${email})`,
        createdAt: paidAt,
        isResolved: true,
      });
    }
  }

  const userMemo = memo || null;

  let emailed = false;
  if (sendEmailFlag && !persisted.alreadyExisted) {
    emailed = await sendDonationReceiptEmailFromRecord({
      email,
      firstName,
      lastName,
      amountDollars: amount,
      campaign,
      memo: userMemo,
      donationType,
      method: methodLabel,
      paidAt,
      includeReceiptLink,
      spouseFirstName,
      spouseLastName,
      spouseEmail,
    });
  }

  const receiptUrl = persisted.alreadyExisted
    ? null
    : buildAbsoluteReceiptUrl({
        name: coupleNames.receiptName,
        amount,
        date: receiptDate,
        campaign,
        memo: userMemo,
        method: methodLabel,
      });

  return NextResponse.json({
    ok: true,
    kind,
    donationId: persisted.donationId,
    duplicate: persisted.alreadyExisted,
    emailed,
    includeReceiptLink: includeReceiptLink && sendEmailFlag,
    paymentMethod: methodLabel,
    paidAt: paidAt ?? null,
    receiptUrl,
    receiptName: coupleNames.receiptName,
    greeting: coupleNames.greeting,
  });
}
