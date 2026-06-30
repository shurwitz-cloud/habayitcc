'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { donationRow } from '@/lib/google/sheets';

export interface RecordDonationInput {
  paymentIntentId: string;
  amountDollars: number;
  firstName: string;
  lastName: string;
  email: string;
  donationType: 'One-Time' | 'Monthly';
}

export interface RecordDonationResult {
  success: boolean;
  error?: string;
}

/**
 * Called from the client after stripe.confirmPayment() succeeds.
 * Saves the donation to Supabase immediately so the record exists
 * even if the webhook fires late or isn't configured yet in dev.
 * The webhook is a safe backup that skips duplicates via the
 * stripe_payment_intent_id uniqueness check.
 */
export async function recordDonation(
  input: RecordDonationInput
): Promise<RecordDonationResult> {
  try {
    const supabase = createAdminClient();

    // Idempotency: skip if already recorded (e.g. by webhook)
    const { data: existing } = await supabase
      .from('donations')
      .select('id')
      .eq('stripe_payment_intent_id', input.paymentIntentId)
      .maybeSingle();

    if (existing) return { success: true };

    const { data: donation, error: donationError } = await supabase
      .from('donations')
      .insert({
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        amount: input.amountDollars,
        stripe_payment_intent_id: input.paymentIntentId,
        status: 'succeeded',
        family_id: null,
        phone: null,
        dedication_name: null,
        dedication_type: null,
      })
      .select('id')
      .single();

    if (donationError || !donation) {
      console.error('recordDonation insert error:', donationError);
      return { success: false, error: 'Could not record donation.' };
    }

    await supabase.from('payments').insert({
      source_type: 'donation',
      source_id: donation.id,
      amount: input.amountDollars,
      stripe_payment_intent_id: input.paymentIntentId,
      stripe_charge_id: null,
      status: 'succeeded',
      paid_at: new Date().toISOString(),
    });

    // Append to Google Sheets (best-effort)
    void donationRow({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      amount: input.amountDollars,
      type: input.donationType,
      paymentIntentId: input.paymentIntentId,
    });

    // TODO (Phase 3): send Resend confirmation email to donor

    return { success: true };
  } catch (err) {
    console.error('recordDonation error:', err);
    return { success: false, error: 'Something went wrong.' };
  }
}
