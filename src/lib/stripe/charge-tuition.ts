import { stripe } from '@/lib/stripe/server';
import type { HebrewAdventurePaymentMethod } from '@/lib/programs/hebrew-adventure-tuition';
import type Stripe from 'stripe';

export type ChargeTuitionResult =
  | { ok: true; paymentIntent: Stripe.PaymentIntent }
  | { ok: false; error: string };

export async function chargeSavedTuitionPayment(input: {
  customerId: string;
  paymentMethodId: string;
  amountDollars: number;
  paymentMethod: HebrewAdventurePaymentMethod;
  familyId: string;
  installmentNumber: number;
  installmentTotal: number;
  parentEmail: string;
}): Promise<ChargeTuitionResult> {
  const amountCents = Math.round(input.amountDollars * 100);
  if (amountCents < 50) {
    return { ok: false, error: 'Invalid charge amount.' };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: input.customerId,
      payment_method: input.paymentMethodId,
      off_session: true,
      confirm: true,
      receipt_email: input.parentEmail || undefined,
      description: `HaBayit Hebrew Adventure — payment ${input.installmentNumber} of ${input.installmentTotal}`,
      metadata: {
        type: 'hebrew_adventure_tuition',
        family_id: input.familyId,
        installment: String(input.installmentNumber),
        installment_total: String(input.installmentTotal),
      },
      ...(input.paymentMethod === 'bank'
        ? { payment_method_types: ['us_bank_account'] }
        : {}),
    });

    if (
      paymentIntent.status === 'succeeded' ||
      paymentIntent.status === 'processing' ||
      paymentIntent.status === 'requires_action'
    ) {
      return { ok: true, paymentIntent };
    }

    return {
      ok: false,
      error: `Payment status: ${paymentIntent.status}. Check Stripe Dashboard.`,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Payment could not be processed.';
    return { ok: false, error: message };
  }
}

export function paymentIntentIsPaidOrPending(pi: Stripe.PaymentIntent): boolean {
  return pi.status === 'succeeded' || pi.status === 'processing';
}
