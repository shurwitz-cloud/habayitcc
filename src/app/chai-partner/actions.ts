'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/server';
import { chaiPartnerRow } from '@/lib/google/sheets';

// ——— Legacy no-payment signup (kept for reference, no longer called) ———

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

// ——— Called from the client AFTER stripe.confirmPayment() succeeds ———

export interface ConfirmChaiPartnerInput extends ChaiPartnerInput {
  paymentIntentId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
}

/**
 * Verifies the Stripe payment actually succeeded, then saves the Chai Partner
 * record to Supabase and generates the unique member access code shown to the user.
 * Doing this server-side (with a live Stripe API verify) prevents someone from
 * calling this action with a fake paymentIntentId to obtain a free access code.
 */
export async function confirmChaiPartnerPayment(
  input: ConfirmChaiPartnerInput
): Promise<ChaiPartnerResult> {
  try {
    // Verify with Stripe that payment actually succeeded
    const pi = await stripe.paymentIntents.retrieve(input.paymentIntentId);
    if (pi.status !== 'succeeded') {
      return { success: false, error: 'Payment has not been confirmed. Please try again.' };
    }

    const supabase = createAdminClient();

    // Idempotency: if already confirmed (e.g. double-submit), return existing code
    const { data: existing } = await supabase
      .from('chai_partners')
      .select('access_code')
      .eq('stripe_subscription_id', input.stripeSubscriptionId)
      .maybeSingle();

    if (existing?.access_code) {
      return { success: true, accessCode: existing.access_code };
    }

    const accessCode = generateAccessCode();

    const { data: partner, error: partnerError } = await supabase
      .from('chai_partners')
      .insert({
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
        street_address: input.street,
        city: input.city,
        state: input.state,
        zip: input.zip,
        monthly_amount: input.monthlyAmount,
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

    await supabase.from('payments').insert({
      source_type: 'chai_partner',
      source_id: partner.id,
      amount: input.monthlyAmount,
      stripe_payment_intent_id: input.paymentIntentId,
      stripe_charge_id: null,
      status: 'succeeded',
      paid_at: new Date().toISOString(),
    });

    // Append to Google Sheets (best-effort)
    void chaiPartnerRow({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      street: input.street,
      city: input.city,
      state: input.state,
      zip: input.zip,
      monthlyAmount: input.monthlyAmount,
      accessCode,
      subscriptionId: input.stripeSubscriptionId,
      customerId: input.stripeCustomerId,
    });

    // TODO (Phase 3): send Resend confirmation email with access code

    return { success: true, accessCode };
  } catch (err) {
    console.error('confirmChaiPartnerPayment error:', err);
    return { success: false, error: 'Something went wrong. Please contact us.' };
  }
}
