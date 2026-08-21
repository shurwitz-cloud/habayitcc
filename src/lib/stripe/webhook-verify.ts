import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/server';

function webhookSecrets(): string[] {
  return [
    process.env.STRIPE_WEBHOOK_SECRET?.trim(),
    process.env.STRIPE_WEBHOOK_SECRET_TEST?.trim(),
  ].filter((value): value is string => Boolean(value));
}

export function hasStripeWebhookSecret(): boolean {
  return webhookSecrets().length > 0;
}

/**
 * Verify Stripe webhook signature. Tries live secret first, then test secret.
 * Needed when both test and live webhook endpoints point at the same URL.
 */
export function constructStripeWebhookEvent(
  body: string,
  signature: string
): Stripe.Event {
  const secrets = webhookSecrets();
  if (!secrets.length) {
    throw new Error('No STRIPE_WEBHOOK_SECRET configured.');
  }

  let lastError: unknown;
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(body, signature, secret);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error('Webhook signature verification failed.');
}
