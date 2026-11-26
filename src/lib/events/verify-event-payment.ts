import { stripe } from '@/lib/stripe/server';
import { normalizeDonorEmail } from '@/lib/donations/normalize-donor';

export async function verifyPaidEventPaymentIntent(
  paymentIntentId: string,
  expectedSlug: string,
  expectedTotalCents: number
): Promise<{ ok: true; amountDollars: number } | { ok: false; error: string }> {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (pi.status !== 'succeeded') {
    return { ok: false, error: 'Payment has not been confirmed. Please try again.' };
  }

  const meta = pi.metadata ?? {};
  if (meta.type !== 'paid_event_registration' || meta.event_slug !== expectedSlug) {
    return { ok: false, error: 'Invalid payment reference.' };
  }

  if (pi.amount !== expectedTotalCents) {
    return { ok: false, error: 'Payment amount does not match registration total.' };
  }

  const email = meta.donor_email ? normalizeDonorEmail(meta.donor_email) : undefined;
  if (!email) {
    return { ok: false, error: 'Invalid payment reference.' };
  }

  return { ok: true, amountDollars: pi.amount / 100 };
}

/**
 * The moment a payment was priced: when its PaymentIntent was created.
 * Registrations re-price at this moment so a payment started just before a
 * price change is never rejected or re-priced after the fact.
 */
export async function getPaymentIntentPricedAt(
  paymentIntentId: string | null | undefined,
): Promise<Date | undefined> {
  if (!paymentIntentId) return undefined;
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    return new Date(pi.created * 1000);
  } catch {
    return undefined;
  }
}
