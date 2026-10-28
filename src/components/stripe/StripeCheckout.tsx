'use client';

import { useState } from 'react';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import type { StripeCardElementOptions } from '@stripe/stripe-js';
import { stripePromise } from '@/lib/stripe/client';

// Matches the site's navy/gold/cream design system
const CARD_STYLE: StripeCardElementOptions = {
  style: {
    base: {
      fontSize: '15px',
      color: '#282828',
      fontFamily: 'Inter, Arial, sans-serif',
      fontSmoothing: 'antialiased',
      '::placeholder': { color: '#6f6a60' },
    },
    invalid: {
      color: '#9b2d2d',
      iconColor: '#9b2d2d',
    },
  },
  hidePostalCode: true,
};

// ——— Inner form — must live inside <Elements> ———

export function CardForm({
  onGetClientSecret,
  onSuccess,
  onError,
  submitLabel = 'Complete Payment',
  processing: externalProcessing = false,
}: {
  /** Called on submit — creates PI/subscription server-side, returns clientSecret */
  onGetClientSecret: () => Promise<string>;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
  submitLabel?: string;
  /** If the parent is already in a loading state, disable the button */
  processing?: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const busy = processing || externalProcessing;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setProcessing(true);
    try {
      const clientSecret = await onGetClientSecret();

      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement },
      });

      if (error) {
        onError(error.message ?? 'Payment failed. Please try again.');
      } else if (paymentIntent?.status === 'succeeded') {
        onSuccess(paymentIntent.id);
      } else {
        onError('Payment was not completed. Please try again.');
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[0.78rem] font-bold uppercase tracking-wide text-navy mb-1.5">
          Card Information
        </label>
        <div className="border border-line rounded-lg p-3.5 bg-white focus-within:border-navy focus-within:shadow-[0_0_0_3px_rgba(23,38,67,0.08)] transition-all">
          <CardElement options={CARD_STYLE} />
        </div>
      </div>

      <button
        type="submit"
        disabled={!stripe || busy}
        className="w-full bg-gold text-white rounded-full px-6 py-4 font-bold uppercase tracking-wider text-[0.85rem] disabled:opacity-60 transition-opacity"
      >
        {busy ? 'Processing…' : submitLabel}
      </button>

      <p className="text-center text-[0.75rem] text-muted">
        Secured by Stripe. Your card details are never stored by HaBayit.
      </p>
    </form>
  );
}

// ——— Standalone wrapper — mounts Elements then renders CardForm ———
// Use this when the card form is a self-contained section (e.g. Chai Partner payment step).

export function StripeCheckout({
  onGetClientSecret,
  onSuccess,
  onError,
  submitLabel = 'Complete Payment',
}: {
  onGetClientSecret: () => Promise<string>;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
  submitLabel?: string;
}) {
  return (
    <Elements stripe={stripePromise}>
      <CardForm
        onGetClientSecret={onGetClientSecret}
        onSuccess={onSuccess}
        onError={onError}
        submitLabel={submitLabel}
      />
    </Elements>
  );
}
