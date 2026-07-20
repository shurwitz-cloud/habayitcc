import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/server';

export type VerifiedDonationPayment = {
  amountDollars: number;
  donorEmail?: string;
  donorName?: string;
};

type PaymentIntentWithInvoice = Stripe.PaymentIntent & {
  invoice?: string | Stripe.Invoice | null;
};

export async function verifyDonationPaymentIntent(
  paymentIntentId: string,
  donationType: 'One-Time' | 'Monthly'
): Promise<{ ok: true; payment: VerifiedDonationPayment } | { ok: false; error: string }> {
  const pi = (await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['invoice'],
  })) as PaymentIntentWithInvoice;

  if (pi.status !== 'succeeded') {
    return { ok: false, error: 'Payment has not been confirmed. Please try again.' };
  }

  const meta = pi.metadata ?? {};

  if (donationType === 'One-Time') {
    if (meta.type !== 'donation' || meta.donation_type !== 'one_time') {
      return { ok: false, error: 'Invalid payment reference.' };
    }
  } else {
    const invoiceRef = pi.invoice;
    if (!invoiceRef) {
      return { ok: false, error: 'Invalid payment reference.' };
    }

    const invoice =
      typeof invoiceRef === 'string'
        ? await stripe.invoices.retrieve(invoiceRef, { expand: ['subscription'] })
        : invoiceRef;

    const subscriptionRef = (invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    }).subscription;

    const subscriptionId =
      typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef?.id;

    if (!subscriptionId) {
      return { ok: false, error: 'Invalid payment reference.' };
    }

    const subscription =
      subscriptionRef && typeof subscriptionRef !== 'string'
        ? subscriptionRef
        : await stripe.subscriptions.retrieve(subscriptionId);

    if (subscription.metadata?.type !== 'monthly_donation') {
      return { ok: false, error: 'Invalid payment reference.' };
    }
  }

  return {
    ok: true,
    payment: {
      amountDollars: pi.amount / 100,
      donorEmail: meta.donor_email,
      donorName: meta.donor_name,
    },
  };
}
