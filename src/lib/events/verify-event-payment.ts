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
