import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/server';
import { normalizeDonorEmail } from '@/lib/donations/normalize-donor';
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
  let donorEmail = meta.donor_email ? normalizeDonorEmail(meta.donor_email) : undefined;
  let donorName = meta.donor_name?.trim();
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

    donorEmail = subscription.metadata?.donor_email
      ? normalizeDonorEmail(subscription.metadata.donor_email)
      : donorEmail;
    donorName = subscription.metadata?.donor_name ?? donorName;
  }

  return {
    ok: true,
    payment: {
      amountDollars: pi.amount / 100,
      donorEmail,
      donorName,
    },
  };
}

/** Prefer Stripe metadata for CRM; reject email mismatch with payment. */
export function resolveVerifiedDonorIdentity(
  verified: VerifiedDonationPayment,
  input: { firstName: string; lastName: string; email: string }
): { ok: true; firstName: string; lastName: string; email: string } | { ok: false; error: string } {
  const clientEmail = normalizeDonorEmail(input.email);
  const stripeEmail = verified.donorEmail ? normalizeDonorEmail(verified.donorEmail) : undefined;

  if (stripeEmail && stripeEmail !== clientEmail) {
    return { ok: false, error: 'Email does not match the payment on file.' };
  }

  if (verified.donorName?.trim()) {
    const [firstName, ...rest] = verified.donorName.trim().split(/\s+/);
    return {
      ok: true,
      firstName: firstName || input.firstName.trim(),
      lastName: rest.join(' ') || input.lastName.trim(),
      email: stripeEmail || clientEmail,
    };
  }

  return {
    ok: true,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: clientEmail,
  };
}
