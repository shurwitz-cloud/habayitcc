'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import {
  CardElement,
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import type { Appearance, StripeCardElementOptions } from '@stripe/stripe-js';
import { stripePromise } from '@/lib/stripe/client';
import type { HebrewAdventurePaymentMethod } from '@/lib/programs/hebrew-adventure-tuition';

const CARD_STYLE: StripeCardElementOptions = {
  style: {
    base: {
      fontSize: '15px',
      color: '#282828',
      fontFamily: 'Inter, Arial, sans-serif',
      fontSmoothing: 'antialiased',
      '::placeholder': { color: '#6f6a60' },
    },
    invalid: { color: '#9b2d2d', iconColor: '#9b2d2d' },
  },
  hidePostalCode: true,
};

const bankAppearance: Appearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#172643',
    colorBackground: '#ffffff',
    colorText: '#282828',
    colorDanger: '#9b2d2d',
    colorTextPlaceholder: '#6f6a60',
    fontFamily: 'Inter, Arial, sans-serif',
    fontSizeBase: '15px',
    borderRadius: '6px',
  },
  rules: {
    '.Input': {
      border: '1px solid #e4ded2',
      boxShadow: 'none',
    },
    '.Input:focus': {
      border: '1px solid #172643',
      boxShadow: '0 0 0 3px rgba(23, 38, 67, 0.08)',
      outline: 'none',
    },
  },
};

export type HebrewAdventurePaymentSetupHandle = {
  confirmSetup: () => Promise<string | null>;
};

type InnerProps = {
  clientSecret: string;
  onError: (message: string) => void;
  billingEmail: string;
  billingName: string;
  paymentMethod: HebrewAdventurePaymentMethod;
  isTestMode: boolean;
  returnUrl: string;
};

async function resolveSucceededSetupIntentId(
  stripe: NonNullable<ReturnType<typeof useStripe>>,
  clientSecret: string
): Promise<string | null> {
  const existing = await stripe.retrieveSetupIntent(clientSecret);
  const intent = existing.setupIntent;
  if (intent?.status === 'succeeded' && intent.id) {
    return intent.id;
  }
  return null;
}

const PaymentSetupInner = forwardRef<HebrewAdventurePaymentSetupHandle, InnerProps>(
  function PaymentSetupInner(
    { clientSecret, onError, billingEmail, billingName, paymentMethod, isTestMode, returnUrl },
    ref
  ) {
    const stripe = useStripe();
    const elements = useElements();
    const [ready, setReady] = useState(paymentMethod === 'card');

    useImperativeHandle(ref, () => ({
      async confirmSetup() {
        if (!stripe || !elements) {
          onError('Payment form is still loading. Please wait a moment and try again.');
          return null;
        }

        const billingDetails = {
          ...(billingEmail ? { email: billingEmail } : {}),
          name: billingName || undefined,
        };

        if (paymentMethod === 'card') {
          const cardElement = elements.getElement(CardElement);
          if (!cardElement) {
            onError('Card form is still loading. Please wait a moment and try again.');
            return null;
          }

          const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
            payment_method: {
              card: cardElement,
              billing_details: billingDetails,
            },
          });

          if (error) {
            const alreadySaved = await resolveSucceededSetupIntentId(stripe, clientSecret);
            if (alreadySaved) return alreadySaved;
            onError(error.message ?? 'Could not save your card. Please try again.');
            return null;
          }

          if (setupIntent?.status === 'succeeded' && setupIntent.id) {
            return setupIntent.id;
          }

          onError('Card setup was not completed. Please try again.');
          return null;
        }

        const { error: submitError } = await elements.submit();
        if (submitError) {
          onError(submitError.message ?? 'Please complete your bank details and try again.');
          return null;
        }

        const { error, setupIntent } = await stripe.confirmSetup({
          elements,
          clientSecret,
          confirmParams: {
            return_url: returnUrl,
            payment_method_data: {
              billing_details: billingDetails,
            },
          },
          redirect: 'if_required',
        });

        if (error) {
          const alreadySaved = await resolveSucceededSetupIntentId(stripe, clientSecret);
          if (alreadySaved) return alreadySaved;
          onError(error.message ?? 'Could not save your payment method. Please try again.');
          return null;
        }

        if (setupIntent?.status === 'succeeded' && setupIntent.id) {
          return setupIntent.id;
        }

        if (setupIntent?.status === 'requires_action') {
          onError(
            'Your bank needs extra verification. Please use instant bank login if available, or try another account.'
          );
          return null;
        }

        const recovered = await resolveSucceededSetupIntentId(stripe, clientSecret);
        if (recovered) return recovered;

        onError('Payment setup was not completed. Please try again.');
        return null;
      },
    }));

    if (paymentMethod === 'card') {
      return (
        <div>
          <label className="block text-[0.78rem] font-bold uppercase tracking-wide text-navy mb-1.5">
            Card Information
          </label>
          <div className="border border-line rounded-lg p-3.5 bg-white focus-within:border-navy focus-within:shadow-[0_0_0_3px_rgba(23,38,67,0.08)] transition-all">
            <CardElement options={CARD_STYLE} />
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <label className="block text-[0.78rem] font-bold uppercase tracking-wide text-navy mb-1.5">
          Bank Account Details
        </label>
        {isTestMode && (
          <p className="text-[0.85rem] text-muted bg-soft border border-line rounded-xl px-4 py-3">
            <strong>Test mode:</strong> You will see Stripe test banks (Test OAuth, etc.), not
            real banks like Chase. Real banks appear when live Stripe keys are enabled.
          </p>
        )}
        <PaymentElement
          onReady={() => setReady(true)}
          options={{
            fields: {
              billingDetails: {
                email: 'never',
                name: billingName ? 'never' : 'auto',
              },
            },
            wallets: {
              applePay: 'never',
              googlePay: 'never',
            },
          }}
        />
        {!ready && (
          <p className="text-muted text-[0.85rem]">Loading secure payment form…</p>
        )}
      </div>
    );
  }
);

type HebrewAdventurePaymentSetupProps = {
  email: string;
  name: string;
  paymentMethod: HebrewAdventurePaymentMethod;
  onError: (message: string) => void;
  /** Where Stripe should return after bank auth redirects. */
  returnUrl?: string;
};

export const HebrewAdventurePaymentSetup = forwardRef<
  HebrewAdventurePaymentSetupHandle,
  HebrewAdventurePaymentSetupProps
>(function HebrewAdventurePaymentSetup(
  { email, name, paymentMethod, onError, returnUrl },
  ref
) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const resolvedReturnUrl =
    returnUrl ??
    (typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?setup=complete`
      : '/');

  useEffect(() => {
    if (!paymentMethod) {
      setClientSecret(null);
      setLoadError('');
      return;
    }

    const trimmedEmail = email.trim();

    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      const message = 'Payment system is not configured. Please contact HaBayit.';
      setLoadError(message);
      onError(message);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setClientSecret(null);
    setLoadError('');

    fetch('/api/stripe/setup-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(trimmedEmail ? { email: trimmedEmail } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
        paymentMethod,
      }),
    })
      .then(async (res) => {
        const data = await res.json() as { clientSecret?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || !data.clientSecret) {
          const message = data.error ?? 'Could not load payment form. Please try again.';
          setLoadError(message);
          onError(message);
          return;
        }
        setClientSecret(data.clientSecret);
      })
      .catch(() => {
        if (!cancelled) {
          const message = 'Could not load payment form. Please refresh and try again.';
          setLoadError(message);
          onError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [paymentMethod, onError]);

  if (loading) {
    return <p className="text-muted text-[0.85rem]">Preparing secure payment form…</p>;
  }

  if (loadError) {
    return (
      <p className="text-danger text-[0.9rem] bg-[#fdecea] border border-[#f3c4c0] rounded-xl px-4 py-3">
        {loadError}
      </p>
    );
  }

  if (!clientSecret) {
    return null;
  }

  const isTestMode =
    (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').startsWith('pk_test_');

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        ...(paymentMethod === 'bank' ? { appearance: bankAppearance } : {}),
      }}
    >
      <PaymentSetupInner
        ref={ref}
        clientSecret={clientSecret}
        onError={onError}
        billingEmail={email.trim()}
        billingName={name.trim()}
        paymentMethod={paymentMethod}
        isTestMode={isTestMode}
        returnUrl={resolvedReturnUrl}
      />
    </Elements>
  );
});
