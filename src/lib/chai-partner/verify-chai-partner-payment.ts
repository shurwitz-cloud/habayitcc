import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/server';

const MIN_MONTHLY_CENTS = 15000;

type PaymentIntentWithInvoice = Stripe.PaymentIntent & {
  invoice?: string | Stripe.Invoice | null;
};

export type VerifiedChaiPartnerPayment = {
  monthlyAmountDollars: number;
  paymentStatus: 'succeeded' | 'processing';
};

export async function verifyChaiPartnerPayment(input: {
  paymentIntentId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  email: string;
}): Promise<
  { ok: true; payment: VerifiedChaiPartnerPayment } | { ok: false; error: string }
> {
  const pi = (await stripe.paymentIntents.retrieve(input.paymentIntentId, {
    expand: ['invoice'],
  })) as PaymentIntentWithInvoice;

  if (pi.status !== 'succeeded' && pi.status !== 'processing') {
    return { ok: false, error: 'Payment has not been confirmed. Please try again.' };
  }

  const piCustomerId =
    typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null;
  if (piCustomerId && piCustomerId !== input.stripeCustomerId) {
    return { ok: false, error: 'Invalid payment reference.' };
  }

  const subscription = await stripe.subscriptions.retrieve(input.stripeSubscriptionId);

  if (subscription.metadata?.type !== 'chai_partner') {
    return { ok: false, error: 'Invalid payment reference.' };
  }

  const subscriptionCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

  if (!subscriptionCustomerId || subscriptionCustomerId !== input.stripeCustomerId) {
    return { ok: false, error: 'Invalid payment reference.' };
  }

  const subEmail = subscription.metadata?.donor_email?.trim().toLowerCase();
  const clientEmail = input.email.trim().toLowerCase();
  if (subEmail && subEmail !== clientEmail) {
    return { ok: false, error: 'Email does not match the payment on file.' };
  }

  const unitAmount = subscription.items.data[0]?.price?.unit_amount;
  if (!unitAmount || unitAmount < MIN_MONTHLY_CENTS) {
    return { ok: false, error: 'Chai Partner monthly gifts must be at least $150.' };
  }

  const invoiceRef = pi.invoice;
  if (invoiceRef) {
    const invoice =
      typeof invoiceRef === 'string'
        ? await stripe.invoices.retrieve(invoiceRef)
        : invoiceRef;

    const invoiceSubscription =
      (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null })
        .subscription ?? invoice.parent?.subscription_details?.subscription;

    const invoiceSubscriptionId =
      typeof invoiceSubscription === 'string'
        ? invoiceSubscription
        : invoiceSubscription?.id ?? null;

    if (invoiceSubscriptionId && invoiceSubscriptionId !== input.stripeSubscriptionId) {
      return { ok: false, error: 'Invalid payment reference.' };
    }
  } else if (pi.metadata?.type === 'donation') {
    return { ok: false, error: 'Invalid payment reference.' };
  }

  return {
    ok: true,
    payment: {
      monthlyAmountDollars: unitAmount / 100,
      paymentStatus: pi.status === 'processing' ? 'processing' : 'succeeded',
    },
  };
}
