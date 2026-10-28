import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set.');
  }

  stripeClient = new Stripe(key, {
    apiVersion: '2026-06-24.dahlia',
  });
  return stripeClient;
}

/** @deprecated Use getStripe() — kept for existing imports. */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripe() as object, prop, receiver);
  },
});
