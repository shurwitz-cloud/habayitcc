import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { ensureCrmContact, linkSpouseContacts } from '@/lib/admin/ensure-contact';
import { formatCoupleNames } from '@/lib/donations/couple-names';
import { persistDonation } from '@/lib/donations/persist-donation';
import {
  buildAbsoluteReceiptUrl,
  buildChaiPartnerReceiptUrl,
  sendDonationReceiptEmailFromRecord,
} from '@/lib/email/donation-receipt';
import { getSiteUrl } from '@/lib/email/client';
import { sendGoodsPaymentEmail } from '@/lib/email/goods-payment';
import { resolveGoodsItemLabel } from '@/lib/goods/items';
import { recordGoodsPayment } from '@/lib/goods/record-goods-payment';
import { buildPaymentReceiptUrl } from '@/lib/payments/payment-receipt-url';
import { createAdminClient } from '@/lib/supabase/server';
import { formatCheckPaymentMethod } from '@/lib/donations/receipt-method';
import {
  chaiMonthlyFromUpfront,
  isChaiPaidUpfrontNote,
  recordZeffyChaiPartnerPayment,
} from '@/lib/zeffy/record-chai-payment';
import type { ParsedZeffyPayment } from '@/lib/zeffy/types';

export const dynamic = 'force-dynamic';

const METHODS = [
  'Zelle',
  'Zeffy',
  'Cash',
  'Check',
  'Cash App',
  'HaBayit donation link',
  'Other',
] as const;
type PaymentMethod = (typeof METHODS)[number];
type EntryKind = 'one_time' | 'monthly' | 'chai_partner' | 'goods_services';

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
    /** Payer's verbatim original note (check/Zelle/Zeffy/website). Internal only - never on receipts, never emailed. */
    payerNote?: string;
    sendEmail?: boolean;
    includeReceiptLink?: boolean;
    /**
     * Explicit opt-in to GENERATE a signed receipt link (shown in the admin
     * panel after save). Off by default: saving never creates a receipt
     * artifact unless the admin asks, or a receipt link is emailed.
     */
    generateReceipt?: boolean;
    spouseFirstName?: string;
    spouseLastName?: string;
    spouseEmail?: string;
    alsoEmailSpouse?: boolean;
    contactId?: string | null;
    spouseContactId?: string | null;
    company?: string | null;
    spousePhone?: string;
    /** Chai: amount is full prepaid gift; CRM monthly = monthlyAmount or amount÷12. */
    paidUpfront?: boolean;
    /** Chai effective monthly when paidUpfront (optional). */
    monthlyAmount?: number;
    /** Chai months this payment covers (1–12). Ignored when paidUpfront (always 12). */
    coverageMonths?: number;
    /** Tax receipt “Name” line override (e.g. business / donor of record). */
    receiptName?: string;
    /** Goods/services: preset item label or GOODS_OTHER_ITEM. */
    item?: string;
    /** Goods/services: custom label when item is "Other". */
    customItem?: string;
    /** Goods/services: quantity (default 1). */
    quantity?: number;
    /** Goods/services: unit price; total = quantity x unitAmount. */
    unitAmount?: number;
    /** Goods/services: opt-in to year-end statement (non-deductible section). Default off. */
    includeInYearEnd?: boolean;
    includeAsDonation?: boolean;
    goodsFmv?: number;
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
        : body.kind === 'goods_services'
          ? 'goods_services'
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

  // Email is optional for one-time donation and goods/services entries
  // (offline Zelle/cash/check gifts with no payer email). Monthly and Chai
  // Partner entries still require it: receipts and login codes can only be
  // delivered by email.
  const emailRequired = kind === 'monthly' || kind === 'chai_partner';
  const hasEmail = email.includes('@');
  if (!firstName || !lastName || (emailRequired && !hasEmail)) {
    return NextResponse.json(
      {
        error: emailRequired
          ? 'firstName, lastName, and email are required.'
          : 'firstName and lastName are required.',
      },
      { status: 400 },
    );
  }
  if (!hasEmail && email) {
    return NextResponse.json({ error: 'Email is invalid.' }, { status: 400 });
  }
  if (spouseFirstName && spouseEmail && !spouseEmail.includes('@')) {
    return NextResponse.json({ error: 'Spouse email is invalid.' }, { status: 400 });
  }
  const qtyRaw = Number(body.quantity);
  const goodsQuantity =
    Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.floor(qtyRaw) : 1;
  const unitRaw = Number(body.unitAmount);
  const goodsUnitAmount =
    Number.isFinite(unitRaw) && unitRaw > 0
      ? Math.round(unitRaw * 100) / 100
      : Number.isFinite(amount) && amount > 0
        ? Math.round((amount / goodsQuantity) * 100) / 100
        : NaN;

  // Receipts and emails are blocked while the payer email is missing, no
  // matter what the client asked for.
  const sendEmailFlag = hasEmail && body.sendEmail === true;
  const includeReceiptLink = hasEmail && body.includeReceiptLink === true;
  // Receipt links are generated only on explicit opt-in, or when one is
  // actually emailed (includeReceiptLink inside a sent email). Saving alone
  // never produces a receipt artifact.
  const wantReceiptLink =
    hasEmail && (body.generateReceipt === true || (sendEmailFlag && includeReceiptLink));
  // Spouse is copied on the confirmation email ONLY on explicit opt-in.
  // Linking a spouse is never permission to email them.
  const spouseEmailCopy =
    hasEmail && body.alsoEmailSpouse === true && spouseEmail.includes('@') ? spouseEmail : null;
  // Present only when the admin explicitly picked the spouse from Contacts.
  const spouseContactIdSelected = (body.spouseContactId ?? '').trim() || null;
  const payerContactIdSelected = (body.contactId ?? '').trim() || null;
  let spouseLinkWarning: string | null = null;

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
  const company = (body.company ?? '').trim() || null;
  // Receipt/donor-of-record name: a company takes precedence, then an
  // explicit receipt-name override, then joint couple names.
  const receiptDisplayName =
    company ?? ((body.receiptName ?? '').trim() || coupleNames.receiptName);

  // Always uniquify generated keys so repeat Zelle/cash amounts aren't treated as duplicates.
  const keyBase =
    (body.paymentKey ?? '').trim() ||
    `manual-${kind}-${methodLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${(hasEmail ? email : 'no-email').replace(/[^a-z0-9]+/g, '-')}-${Math.round(amount * 100)}-${Date.now()}`;

  if (kind === 'goods_services') {
    if (!Number.isFinite(goodsUnitAmount) || goodsUnitAmount <= 0) {
      return NextResponse.json(
        { error: 'unitAmount (or amount) must be a positive number.' },
        { status: 400 },
      );
    }
  } else if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number.' }, { status: 400 });
  }
  const memo = (body.memo ?? '').trim();
  const payerNote = (body.payerNote ?? '').trim() || null;
  const paidUpfront =
    kind === 'chai_partner' &&
    (body.paidUpfront === true || isChaiPaidUpfrontNote(memo));
  const coverageMonthsRaw = Number(body.coverageMonths);
  const coverageMonths = paidUpfront
    ? 12
    : Number.isFinite(coverageMonthsRaw) && coverageMonthsRaw >= 1
      ? Math.min(36, Math.floor(coverageMonthsRaw))
      : 1;
  // Prefer explicit monthlyAmount (e.g. renewals keep the partner's current rate).
  const monthlyAmount = paidUpfront
    ? Number.isFinite(body.monthlyAmount) && Number(body.monthlyAmount) > 0
      ? Number(body.monthlyAmount)
      : chaiMonthlyFromUpfront(amount)
    : Number.isFinite(body.monthlyAmount) && Number(body.monthlyAmount) > 0
      ? Number(body.monthlyAmount)
      : coverageMonths > 1
        ? Math.round((amount / coverageMonths) * 100) / 100
        : amount;

  if (kind === 'chai_partner') {
    if (monthlyAmount < 150) {
      return NextResponse.json(
        {
          error: paidUpfront
            ? 'Prepaid Chai Partner must equal at least $150/month (full amount ÷ 12). Check “Paid full year upfront” and enter the full amount paid.'
            : coverageMonths > 1
              ? 'Amount ÷ months covered must be at least $150/month.'
              : 'Chai Partner monthly amount must be at least $150.',
        },
        { status: 400 },
      );
    }
  }

  if (kind === 'goods_services') {
    const itemLabel = resolveGoodsItemLabel(body.item, body.customItem);
    if (!itemLabel) {
      return NextResponse.json(
        { error: 'item is required (pick a preset or enter a custom one).' },
        { status: 400 },
      );
    }
    const includeAsDonation = body.includeAsDonation === true;
    const goodsFmvRaw = Number(body.goodsFmv);
    const goodsFmv =
      Number.isFinite(goodsFmvRaw) && goodsFmvRaw >= 0
        ? Math.round(goodsFmvRaw * 100) / 100
        : NaN;
    if (includeAsDonation) {
      // "Add as a donation": the record form always sends 0 (full amount as
      // a donation, no goods disclosure). A real partial-benefit value only
      // ever arrives through the separate edit/reclassify path. We never
      // decide eligibility or value ourselves.
      if (!Number.isFinite(goodsFmv)) {
        return NextResponse.json(
          {
            error:
              'goodsFmv is required when including as a donation (value of anything the payer received; 0 when nothing was received).',
          },
          { status: 400 },
        );
      }
      if (goodsFmv > Math.round(goodsQuantity * goodsUnitAmount * 100) / 100) {
        return NextResponse.json(
          { error: 'goodsFmv cannot exceed the payment total.' },
          { status: 400 },
        );
      }
    }
    const total = Math.round(goodsQuantity * goodsUnitAmount * 100) / 100;
    const goodsKeyBase = keyBase.startsWith('manual:') ? keyBase : `manual:${keyBase}`;
    const goodsPaidAt = paidAt ?? new Date().toISOString();
    const goodsDate = new Date(goodsPaidAt);
    const dateLong = goodsDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const includeInYearEnd = body.includeInYearEnd === true;

    const goodsMemo =
      [memo || null, coupleNames.hasSpouse ? `Spouse: ${coupleNames.receiptName}` : null]
        .filter(Boolean)
        .join(' · ') || null;
    const result = await recordGoodsPayment({
      firstName,
      lastName,
      email,
      phone: body.phone,
      itemLabel,
      quantity: goodsQuantity,
      unitAmount: goodsUnitAmount,
      amount: total,
      paymentMethod: methodLabel,
      memo: goodsMemo,
      payerNote,
      paymentKey: goodsKeyBase,
      paidAt,
      includeInYearEnd,
      includeAsDonation,
      goodsFmv: includeAsDonation ? goodsFmv : null,
      company,
      contactId: payerContactIdSelected,
    });

    // Spouse contact, same pattern as donations: own contact with a
    // cross-reference note. Never a substitute identity for the payer.
    if (result.ok && !result.duplicate && spouseFirstName && spouseEmail.includes('@')) {
      await ensureCrmContact({
        firstName: spouseFirstName,
        lastName: spouseLastName || lastName,
        email: spouseEmail,
        phone: spousePhone || null,
        interest: 'Goods/Services',
        note: `--- Spouse of customer ---\nPartner: ${firstName} ${lastName} (${email})`,
        createdAt: paidAt,
        isResolved: true,
      });
      if (spouseContactIdSelected && hasEmail) {
        const link = await linkSpouseContacts(email, spouseContactIdSelected, payerContactIdSelected);
        if (!link.ok) spouseLinkWarning = `Spouse link failed: ${link.error ?? 'unknown error'}`;
      }
    }

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? 'Failed to save goods/services payment.' },
        { status: 500 },
      );
    }

    const receiptPath = result.duplicate
      ? null
      : buildPaymentReceiptUrl({
          name: receiptDisplayName,
          date: goodsDate,
          method: methodLabel,
          items: [{ label: itemLabel, qty: goodsQuantity, unit: goodsUnitAmount }],
          note: memo || undefined,
        });
    const receiptUrl =
      receiptPath && wantReceiptLink ? `${getSiteUrl()}${receiptPath}` : null;

    let emailed = false;
    if (sendEmailFlag && !result.duplicate) {
      emailed = await sendGoodsPaymentEmail({
        firstName,
        email,
        spouseEmail: spouseEmailCopy,
        items: [{ label: itemLabel, qty: goodsQuantity, unit: goodsUnitAmount }],
        total,
        method: methodLabel,
        dateLong,
        receiptUrl: includeReceiptLink ? receiptUrl : null,
      });
      if (emailed && result.goodsPaymentId) {
        try {
          const supabase = createAdminClient();
          await supabase
            .from('goods_payments')
            .update({ receipt_emailed_at: new Date().toISOString() })
            .eq('id', result.goodsPaymentId);
        } catch (err) {
          console.error('[manual-entry] goods receipt_emailed_at update failed:', err);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      kind,
      spouseLinkWarning,
      goodsPaymentId: result.goodsPaymentId,
      duplicate: Boolean(result.duplicate),
      emailed,
      includeReceiptLink: includeReceiptLink && sendEmailFlag,
      paymentMethod: methodLabel,
      paidAt,
      itemLabel,
      quantity: goodsQuantity,
      unitAmount: goodsUnitAmount,
      amount: total,
      includeInYearEnd,
      includeAsDonation,
      goodsFmv: includeAsDonation ? goodsFmv : null,
      deductibleAmount: includeAsDonation
        ? Math.max(0, Math.round((Math.round(goodsQuantity * goodsUnitAmount * 100) / 100 - goodsFmv) * 100) / 100)
        : null,
      receiptUrl,
    });
  }
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
      emailSpouse: spouseEmailCopy != null,
      paidUpfront,
      monthlyAmount,
      coverageMonths,
      payerNote,
      receiptName: receiptDisplayName !== coupleNames.receiptName ? receiptDisplayName : undefined,
      company,
      contactId: payerContactIdSelected,
      note: memo || undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: 'Failed to record Chai Partner.' }, { status: 500 });
    }

    if (!result.duplicate && spouseFirstName && spouseEmail.includes('@') && spouseContactIdSelected) {
      const link = await linkSpouseContacts(email, spouseContactIdSelected, payerContactIdSelected);
      if (!link.ok) spouseLinkWarning = `Spouse link failed: ${link.error ?? 'unknown error'}`;
    }

    // Prefer the lib's receipt name: it carries the stored partner company
    // fallback for renewals (company stays unless explicitly changed).
    const chaiReceiptName = result.receiptName ?? receiptDisplayName;
    const receiptUrl = result.duplicate || !wantReceiptLink
      ? null
      : buildChaiPartnerReceiptUrl({
          firstName,
          lastName,
          amount,
          date: receiptDate,
          method: methodLabel,
          name: chaiReceiptName,
        });

    return NextResponse.json({
      ok: true,
      kind,
      spouseLinkWarning,
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
      receiptName: chaiReceiptName,
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
    email: hasEmail ? email : null,
    phone: body.phone,
    donationType,
    memo: memoParts.join(' · '),
    payerNote,
    campaign,
    company,
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
      email: hasEmail ? email : '',
      phone: body.phone,
      interest: kind === 'monthly' ? 'Monthly donor' : 'Donor',
      company,
      contactId: payerContactIdSelected,
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
      if (spouseContactIdSelected) {
        const link = await linkSpouseContacts(email, spouseContactIdSelected, payerContactIdSelected);
        if (!link.ok) spouseLinkWarning = `Spouse link failed: ${link.error ?? 'unknown error'}`;
      }
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
      spouseEmail: spouseEmailCopy,
    });
  }

  // Receipt links are opt-in: no payer email (existing guard), duplicate,
  // or no explicit generate request means no receipt URL is produced at all.
  const receiptUrl = persisted.alreadyExisted || !wantReceiptLink
    ? null
    : buildAbsoluteReceiptUrl({
        name: receiptDisplayName,
        amount,
        date: receiptDate,
        campaign,
        memo: userMemo,
        method: methodLabel,
      });

  return NextResponse.json({
    ok: true,
    kind,
    spouseLinkWarning,
    donationId: persisted.donationId,
    duplicate: persisted.alreadyExisted,
    emailed,
    includeReceiptLink: includeReceiptLink && sendEmailFlag,
    paymentMethod: methodLabel,
    paidAt: paidAt ?? null,
    receiptUrl,
    receiptName: receiptDisplayName,
    greeting: coupleNames.greeting,
  });
}
