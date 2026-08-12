'use server';

import { logFormSubmission } from '@/lib/admin/form-log';
import { createAdminClient } from '@/lib/supabase/server';
import { assertSupabaseWriteReady } from '@/lib/supabase/require-write';
import { chaiPartnerRow } from '@/lib/google/sheets';
import { sendChaiPartnerWelcomeEmail } from '@/lib/email/chai-partner-welcome';
import { buildChaiPartnerReceiptUrl } from '@/lib/email/donation-receipt';
import { ensureCrmContact } from '@/lib/admin/ensure-contact';
import { verifyChaiPartnerPayment } from '@/lib/chai-partner/verify-chai-partner-payment';
import { enforceActionRateLimit } from '@/lib/security/action-rate-limit';

export interface ChaiPartnerInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  monthlyAmount: number;
}

export interface ChaiPartnerResult {
  success: boolean;
  accessCode?: string;
  error?: string;
}

function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `HABAYIT-${code}`;
}

export interface ConfirmChaiPartnerInput extends ChaiPartnerInput {
  paymentIntentId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
}

export async function confirmChaiPartnerPayment(
  input: ConfirmChaiPartnerInput
): Promise<ChaiPartnerResult> {
  const limited = await enforceActionRateLimit('chai-partner', 10, 15 * 60 * 1000);
  if (!limited.ok) return { success: false, error: limited.error };

  const ready = assertSupabaseWriteReady();
  if (!ready.ok) return { success: false, error: ready.error };

  const email = input.email.trim().toLowerCase();
  if (!input.firstName.trim() || !input.lastName.trim() || !email) {
    return { success: false, error: 'Please fill in your name and email.' };
  }

  try {
    const verified = await verifyChaiPartnerPayment({
      paymentIntentId: input.paymentIntentId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeCustomerId: input.stripeCustomerId,
      email,
    });

    if (!verified.ok) {
      return { success: false, error: verified.error };
    }

    const monthlyAmount = verified.payment.monthlyAmountDollars;

    await logFormSubmission({
      formType: 'chai_partner',
      email,
      payload: {
        ...input,
        monthlyAmount,
        paymentIntentId: input.paymentIntentId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        stripeCustomerId: input.stripeCustomerId,
      },
    });

    const supabase = createAdminClient();

    const { data: existing } = await supabase
      .from('chai_partners')
      .select('access_code')
      .eq('stripe_subscription_id', input.stripeSubscriptionId)
      .maybeSingle();

    if (existing?.access_code) {
      await sendChaiPartnerWelcomeEmail({
        firstName: input.firstName,
        lastName: input.lastName,
        email,
        phone: input.phone,
        monthlyAmount,
        accessCode: existing.access_code,
        receiptUrl: buildChaiPartnerReceiptUrl({
          firstName: input.firstName,
          lastName: input.lastName,
          amount: monthlyAmount,
        }),
      });
      return { success: true, accessCode: existing.access_code };
    }

    const accessCode = generateAccessCode();

    const { data: partner, error: partnerError } = await supabase
      .from('chai_partners')
      .insert({
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        email,
        phone: input.phone?.trim() || null,
        street_address: input.street.trim(),
        city: input.city.trim(),
        state: input.state.trim(),
        zip: input.zip.trim(),
        monthly_amount: monthlyAmount,
        stripe_customer_id: input.stripeCustomerId,
        stripe_subscription_id: input.stripeSubscriptionId,
        access_code: accessCode,
        status: 'active',
      })
      .select('id')
      .single();

    if (partnerError || !partner) {
      console.error('confirmChaiPartner insert error:', partnerError);
      return { success: false, error: 'Could not save your membership. Please contact us.' };
    }

    await ensureCrmContact({
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      phone: input.phone,
      interest: 'Chai Partner',
      note: `--- Chai Partner signup ---\nMonthly: $${monthlyAmount.toFixed(2)}`,
      isResolved: true,
    });

    const { error: paymentError } = await supabase.from('payments').insert({
      source_type: 'chai_partner',
      source_id: partner.id,
      amount: monthlyAmount,
      stripe_payment_intent_id: input.paymentIntentId,
      stripe_charge_id: null,
      status: verified.payment.paymentStatus === 'processing' ? 'pending' : 'succeeded',
      paid_at: verified.payment.paymentStatus === 'processing' ? null : new Date().toISOString(),
    });
    if (paymentError) {
      console.error('confirmChaiPartner payments insert error:', paymentError);
    }

    void chaiPartnerRow({
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      phone: input.phone,
      street: input.street,
      city: input.city,
      state: input.state,
      zip: input.zip,
      monthlyAmount,
      accessCode,
      subscriptionId: input.stripeSubscriptionId,
      customerId: input.stripeCustomerId,
    });

    void logFormSubmission({
      formType: 'chai_partner',
      email,
      sourceId: partner.id,
      payload: {
        ...input,
        monthlyAmount,
        paymentIntentId: input.paymentIntentId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        stripeCustomerId: input.stripeCustomerId,
        accessCode,
      },
    });

    try {
      await sendChaiPartnerWelcomeEmail({
        firstName: input.firstName,
        lastName: input.lastName,
        email,
        phone: input.phone,
        monthlyAmount,
        accessCode,
        receiptUrl: buildChaiPartnerReceiptUrl({
          firstName: input.firstName,
          lastName: input.lastName,
          amount: monthlyAmount,
        }),
      });
    } catch (err) {
      console.error('Chai Partner welcome email failed:', err);
    }

    return { success: true, accessCode };
  } catch (err) {
    console.error('confirmChaiPartnerPayment error:', err);
    return { success: false, error: 'Something went wrong. Please contact us.' };
  }
}
