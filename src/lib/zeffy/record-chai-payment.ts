import { logFormSubmission } from '@/lib/admin/form-log';
import { createAdminClient } from '@/lib/supabase/server';
import { chaiPartnerRow } from '@/lib/google/sheets';
import { sendChaiPartnerWelcomeEmail } from '@/lib/email/chai-partner-welcome';
import {
  buildChaiPartnerReceiptUrl,
  sendDonationReceiptEmailFromRecord,
} from '@/lib/email/donation-receipt';
import type { ParsedZeffyPayment } from './types';

function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `HABAYIT-${code}`;
}

function paymentStorageKey(prefix: string, paymentId: string): string {
  return `${prefix}:${paymentId}`;
}

// The org runs on US Eastern time. Payment references and dedupe day
// comparisons use the calendar day in this timezone, not the UTC day, so a
// payment an admin dates "Sep 17" keys as Sep 17 regardless of the time of
// day it is entered (UTC conversion can otherwise shift the day).
export function paymentLocalDay(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export type RecordZeffyOptions = {
  /**
   * Welcome / receipt emails. Default **false** (safe).
   * Live webhook opts in only when shouldSendZeffyWelcomeEmail() is true.
   * Imports must never pass true.
   */
  sendEmails?: boolean;
  /** Override payment timestamp (e.g. manual Zeffy feed). */
  paidAt?: string;
  /**
   * Storage-key prefix for stripe_payment_intent_id. Default 'zeffy' (real
   * Zeffy webhook / feed imports). Manual admin entries for money that arrived
   * by another channel pass that method, e.g. 'zelle', so the ledger does not
   * mislabel the source.
   */
  keyPrefix?: string;
  /** Provider label recorded in the form-log payload. Default 'zeffy'. */
  provider?: string;
  /**
   * Older manual entries were keyed without a payment date, so a dated manual
   * key cannot find them and would double-record the same real payment.
   * Callers that generate dated manual keys pass the old undated key(s) here.
   * ANY legacy match conservatively blocks the entry as already-recorded
   * (duplicate + matchedKey): a legacy row's stored date is not reliable
   * (early manual rows carry entry time, not the real payment date), so a
   * date comparison could both block a real payment and miss a replayed one.
   * A genuinely distinct payment is entered with an explicit unique
   * paymentKey (Reference), which bypasses this guard.
   */
  legacyKeys?: string[];
};

/**
 * Upsert Chai Partner + payment ledger from a verified Zeffy payment.
 * Idempotent on payment id (stored in stripe_payment_intent_id as <prefix>:<id>,
 * 'zeffy' for real Zeffy money, the method name for manual admin entries).
 */
export async function recordZeffyChaiPartnerPayment(
  parsed: ParsedZeffyPayment,
  options: RecordZeffyOptions = {}
): Promise<{
  ok: boolean;
  partnerId?: string;
  accessCode?: string;
  duplicate?: boolean;
  /** The storage key of the payment row that already covered this entry. */
  matchedKey?: string;
}> {
  // Default OFF — never email unless caller explicitly opts in.
  const sendEmails = options.sendEmails === true;
  const paidAt = options.paidAt ?? new Date().toISOString();
  const supabase = createAdminClient();
  const keyPrefix = options.keyPrefix ?? 'zeffy';
  const paymentKey = paymentStorageKey(keyPrefix, parsed.paymentId);

  const lookupKeys = [paymentKey, ...(options.legacyKeys ?? [])];
  const { data: existingPayments } = await supabase
    .from('payments')
    .select('id, source_id, stripe_payment_intent_id, paid_at')
    .in('stripe_payment_intent_id', lookupKeys);

  const exactMatch = (existingPayments ?? []).find(
    (row) => row.stripe_payment_intent_id === paymentKey
  );
  if (exactMatch) {
    return { ok: true, partnerId: exactMatch.source_id, duplicate: true, matchedKey: paymentKey };
  }

  const legacyMatch = (existingPayments ?? [])[0];
  if (legacyMatch) {
    // Conservative needs-review block: no date comparison (unreliable on
    // legacy rows). Surface the matched key so the admin can inspect the
    // historical row and, when this is truly a different payment, re-enter
    // it with an explicit unique Reference.
    return {
      ok: true,
      partnerId: legacyMatch.source_id,
      duplicate: true,
      matchedKey: legacyMatch.stripe_payment_intent_id ?? undefined,
    };
  }

  const { data: existingPartner } = await supabase
    .from('chai_partners')
    .select('id, access_code, first_name, last_name, email, monthly_amount')
    .eq('email', parsed.email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let partnerId = existingPartner?.id;
  let accessCode = existingPartner?.access_code ?? undefined;
  const isNewPartner = !partnerId;

  if (!partnerId) {
    accessCode = generateAccessCode();
    const { data: partner, error: partnerError } = await supabase
      .from('chai_partners')
      .insert({
        first_name: parsed.firstName,
        last_name: parsed.lastName,
        email: parsed.email,
        phone: parsed.phone || null,
        street_address: parsed.street || null,
        city: parsed.city || null,
        state: parsed.state || null,
        zip: parsed.zip || null,
        monthly_amount: parsed.amountDollars,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        access_code: accessCode,
        status: 'active',
      })
      .select('id')
      .single();

    if (partnerError || !partner) {
      console.error('[zeffy] chai_partners insert error:', partnerError);
      return { ok: false };
    }
    partnerId = partner.id;
  } else if (parsed.amountDollars > 0) {
    // Keep monthly_amount in sync with latest successful Zeffy charge.
    await supabase
      .from('chai_partners')
      .update({
        monthly_amount: parsed.amountDollars,
        status: 'active',
        ...(parsed.phone ? { phone: parsed.phone } : {}),
        ...(parsed.street ? { street_address: parsed.street } : {}),
        ...(parsed.city ? { city: parsed.city } : {}),
        ...(parsed.state ? { state: parsed.state } : {}),
        ...(parsed.zip ? { zip: parsed.zip } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', partnerId);
  }

  const { error: paymentError } = await supabase.from('payments').insert({
    source_type: 'chai_partner',
    source_id: partnerId,
    amount: parsed.amountDollars,
    stripe_payment_intent_id: paymentKey,
    stripe_charge_id: null,
    status: 'succeeded',
    // Honor the caller-provided payment date (e.g. admin manual entry backdating);
    // previously this always stamped "now" and silently ignored options.paidAt.
    paid_at: paidAt,
  });

  if (paymentError) {
    console.error('[zeffy] payments insert error:', paymentError);
    return { ok: false };
  }

  void logFormSubmission({
    formType: 'chai_partner',
    email: parsed.email,
    sourceId: partnerId,
    payload: {
      provider: options.provider ?? 'zeffy',
      type: isNewPartner ? 'signup' : 'renewal',
      zeffyPaymentId: parsed.paymentId,
      amountDollars: parsed.amountDollars,
      campaignId: parsed.campaignId,
      campaignTitle: parsed.campaignTitle,
      accessCode,
    },
  });

  if (isNewPartner && accessCode) {
    void chaiPartnerRow({
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone,
      street: parsed.street,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      monthlyAmount: parsed.amountDollars,
      accessCode,
      subscriptionId: `${keyPrefix}:${parsed.paymentId}`,
      customerId: '',
    });

    if (sendEmails) {
      try {
        await sendChaiPartnerWelcomeEmail({
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          email: parsed.email,
          phone: parsed.phone,
          monthlyAmount: parsed.amountDollars,
          accessCode,
          receiptUrl: buildChaiPartnerReceiptUrl({
            firstName: parsed.firstName,
            lastName: parsed.lastName,
            amount: parsed.amountDollars,
          }),
        });
      } catch (err) {
        console.error('[zeffy] welcome email failed:', err);
      }
    }
  } else if (sendEmails) {
    try {
      await sendDonationReceiptEmailFromRecord({
        email: parsed.email,
        firstName: parsed.firstName || existingPartner?.first_name || '',
        lastName: parsed.lastName || existingPartner?.last_name || '',
        amountDollars: parsed.amountDollars,
        campaign: 'chai-partner',
        donationType: 'Monthly',
      });
    } catch (err) {
      console.error('[zeffy] renewal receipt failed:', err);
    }
  }

  return { ok: true, partnerId, accessCode };
}
