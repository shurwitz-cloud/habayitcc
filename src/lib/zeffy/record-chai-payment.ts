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

function zeffyPaymentKey(paymentId: string): string {
  return `zeffy:${paymentId}`;
}

export type RecordZeffyOptions = {
  /** When false, skip welcome / receipt emails (use for historical imports). Default true. */
  sendEmails?: boolean;
};

/**
 * Upsert Chai Partner + payment ledger from a verified Zeffy payment.
 * Idempotent on Zeffy payment id (stored in stripe_payment_intent_id as zeffy:<id>).
 */
export async function recordZeffyChaiPartnerPayment(
  parsed: ParsedZeffyPayment,
  options: RecordZeffyOptions = {}
): Promise<{ ok: boolean; partnerId?: string; accessCode?: string; duplicate?: boolean }> {
  const sendEmails = options.sendEmails !== false;
  const supabase = createAdminClient();
  const paymentKey = zeffyPaymentKey(parsed.paymentId);

  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id, source_id')
    .eq('stripe_payment_intent_id', paymentKey)
    .maybeSingle();

  if (existingPayment) {
    return { ok: true, partnerId: existingPayment.source_id, duplicate: true };
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
    paid_at: new Date().toISOString(),
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
      provider: 'zeffy',
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
      subscriptionId: `zeffy:${parsed.paymentId}`,
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
