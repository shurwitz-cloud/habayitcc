'use server';

import { buildReceiptUrl } from '@/lib/donations/receipt-url';
import { persistDonation } from '@/lib/donations/persist-donation';
import { verifyDonationPaymentIntent } from '@/lib/donations/verify-donation-payment';
import { sendDonationReceiptEmailFromRecord } from '@/lib/email/donation-receipt';
import { sendDonationAdminNotification } from '@/lib/email/donation-admin';

export interface RecordDonationInput {
  paymentIntentId: string;
  amountDollars: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  donationType: 'One-Time' | 'Monthly';
  memo?: string;
  campaign?: string | null;
  dedicationName?: string;
  dedicationType?: 'honor' | 'memory';
}

export interface RecordDonationResult {
  success: boolean;
  emailSent?: boolean;
  adminNotified?: boolean;
  savedToCrm?: boolean;
  receiptUrl?: string;
  error?: string;
  warning?: string;
}

/**
 * Called from the client after stripe.confirmPayment() succeeds.
 * Verifies payment with Stripe, emails donor + admin, then saves to Supabase.
 */
export async function recordDonation(
  input: RecordDonationInput
): Promise<RecordDonationResult> {
  const verified = await verifyDonationPaymentIntent(
    input.paymentIntentId,
    input.donationType
  );

  if (!verified.ok) {
    return { success: false, error: verified.error };
  }

  const amountDollars = verified.payment.amountDollars;

  const emailPayload = {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    amountDollars,
    campaign: input.campaign,
    dedicationName: input.dedicationName,
    dedicationType: input.dedicationType,
    donationType: input.donationType,
  };

  const receiptUrl = buildReceiptUrl({
    name: `${input.firstName} ${input.lastName}`.trim(),
    amount: amountDollars,
    campaign: input.campaign,
    dedicationName: input.dedicationName,
    dedicationType: input.dedicationType,
    method: 'Credit Card',
  });

  try {
    const [emailSent, adminNotified] = await Promise.all([
      sendDonationReceiptEmailFromRecord(emailPayload),
      sendDonationAdminNotification({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        amountDollars,
        donationType: input.donationType,
        paymentIntentId: input.paymentIntentId,
        campaign: input.campaign,
        memo: input.memo,
      }),
    ]);

    if (!emailSent) {
      console.error('recordDonation: donor receipt email failed for', input.email);
    }
    if (!adminNotified) {
      console.error('recordDonation: admin notification failed for donation', input.paymentIntentId);
    }

    const persisted = await persistDonation({
      paymentIntentId: input.paymentIntentId,
      amountDollars,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      donationType: input.donationType,
      memo: input.memo,
      campaign: input.campaign,
      dedicationName: input.dedicationName,
      dedicationType: input.dedicationType,
    });

    return {
      success: true,
      emailSent,
      adminNotified,
      savedToCrm: persisted.saved,
      receiptUrl,
      warning: persisted.saved
        ? undefined
        : persisted.error ?? 'Donation email sent but CRM save failed.',
    };
  } catch (err) {
    console.error('recordDonation error:', err);
    return { success: false, error: 'Something went wrong.' };
  }
}
