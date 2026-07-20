import { logFormSubmission } from '@/lib/admin/form-log';
import { donationRow } from '@/lib/google/sheets';
import { isServiceRoleConfigured, createAdminClient } from '@/lib/supabase/server';
import { insertWithSchemaFallback } from '@/lib/supabase/insert-helpers';
import type { DedicationType } from '@/types/database';

export interface PersistDonationInput {
  paymentIntentId: string | null;
  amountDollars: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  donationType: 'One-Time' | 'Monthly';
  memo?: string | null;
  campaign?: string | null;
  dedicationName?: string | null;
  dedicationType?: DedicationType | null;
  stripeChargeId?: string | null;
}

export interface PersistDonationResult {
  saved: boolean;
  donationId?: string;
  alreadyExisted: boolean;
  error?: string;
}

export async function persistDonation(
  input: PersistDonationInput
): Promise<PersistDonationResult> {
  if (!isServiceRoleConfigured()) {
    const message =
      'SUPABASE_SERVICE_ROLE_KEY is not configured on the server — donation was not saved to CRM.';
    console.error('[persistDonation]', message, input.paymentIntentId);
    return { saved: false, alreadyExisted: false, error: message };
  }

  const supabase = createAdminClient();

  if (input.paymentIntentId) {
    const { data: existing } = await supabase
      .from('donations')
      .select('id')
      .eq('stripe_payment_intent_id', input.paymentIntentId)
      .maybeSingle();

    if (existing?.id) {
      return { saved: true, donationId: existing.id, alreadyExisted: true };
    }
  }

  await logFormSubmission({
    formType: 'donation',
    email: input.email,
    payload: input,
  });

  const fullRow = {
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    amount: input.amountDollars,
    stripe_payment_intent_id: input.paymentIntentId,
    status: 'succeeded',
    family_id: null,
    phone: input.phone?.trim() || null,
    dedication_name: input.dedicationName?.trim() || null,
    dedication_type: input.dedicationType ?? null,
    memo: input.memo?.trim() || null,
    campaign: input.campaign?.trim() || null,
    donation_type: input.donationType,
  };

  const donationResult = await insertWithSchemaFallback(fullRow, async (row) =>
    supabase.from('donations').insert(row).select('id').single()
  );

  const donation = donationResult.data as { id: string } | null;
  const donationError = donationResult.error;

  if (donationError || !donation) {
    console.error('[persistDonation] insert error:', donationError);
    return {
      saved: false,
      alreadyExisted: false,
      error: donationError?.message ?? 'Could not save donation to database.',
    };
  }

  if (input.paymentIntentId) {
    const { error: paymentError } = await supabase.from('payments').insert({
      source_type: 'donation',
      source_id: donation.id,
      amount: input.amountDollars,
      stripe_payment_intent_id: input.paymentIntentId,
      stripe_charge_id: input.stripeChargeId ?? null,
      status: 'succeeded',
      paid_at: new Date().toISOString(),
    });
    if (paymentError) {
      console.error('[persistDonation] payments insert error:', paymentError);
    }
  }

  void donationRow({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone ?? undefined,
    amount: input.amountDollars,
    paymentIntentId: input.paymentIntentId ?? '',
    memo: input.memo ?? undefined,
    dedicationName: input.dedicationName ?? undefined,
    dedicationType: input.dedicationType ?? undefined,
    donationType: input.donationType,
  });

  void logFormSubmission({
    formType: 'donation',
    email: input.email,
    sourceId: donation.id,
    payload: input,
  });

  return { saved: true, donationId: donation.id, alreadyExisted: false };
}
