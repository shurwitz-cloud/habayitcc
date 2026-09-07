'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ExpressCheckoutElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import type {
  StripeExpressCheckoutElementConfirmEvent,
  StripeExpressCheckoutElementClickEvent,
  StripeExpressCheckoutElementReadyEvent,
} from '@stripe/stripe-js';

export interface WalletPayButtonsProps {
  /** Amount in cents — button hidden if under $1. */
  amountCents: number;
  /** Shown as the line item in the wallet sheet. */
  label: string;
  disabled?: boolean;
  /** Donate vs checkout button label style. */
  buttonVariant?: 'donate' | 'checkout';
  /** Monthly gifts need Apple Pay recurring payment metadata. */
  recurringMonthly?: boolean;
  /**
   * Validate the form before the wallet sheet opens.
   * Throw an Error with a user-facing message to cancel.
   */
  onBeforeOpen?: () => void;
  /** Create the PaymentIntent / subscription invoice PI; return clientSecret. */
  createClientSecret: () => Promise<string>;
  /** Called after Stripe confirms the payment succeeded. */
  onPaymentSucceeded: (paymentIntentId: string) => Promise<void>;
  onError?: (message: string) => void;
}

/**
 * Apple Pay / Google Pay via Stripe Express Checkout Element.
 * Parent <Elements> must use deferred intent options: { mode, amount, currency }.
 */
export function WalletPayButtons({
  amountCents,
  label,
  disabled = false,
  buttonVariant = 'checkout',
  recurringMonthly = false,
  onBeforeOpen,
  createClientSecret,
  onPaymentSucceeded,
  onError,
}: WalletPayButtonsProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [visible, setVisible] = useState(false);

  const onBeforeOpenRef = useRef(onBeforeOpen);
  const createClientSecretRef = useRef(createClientSecret);
  const onPaymentSucceededRef = useRef(onPaymentSucceeded);
  const onErrorRef = useRef(onError);
  const amountRef = useRef(amountCents);
  const labelRef = useRef(label);

  useEffect(() => {
    onBeforeOpenRef.current = onBeforeOpen;
  }, [onBeforeOpen]);
  useEffect(() => {
    createClientSecretRef.current = createClientSecret;
  }, [createClientSecret]);
  useEffect(() => {
    onPaymentSucceededRef.current = onPaymentSucceeded;
  }, [onPaymentSucceeded]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    amountRef.current = amountCents;
  }, [amountCents]);
  useEffect(() => {
    labelRef.current = label;
  }, [label]);

  // Keep Elements amount in sync when the shopper changes totals.
  useEffect(() => {
    if (!elements || amountCents < 100) return;
    try {
      elements.update({ amount: amountCents });
    } catch {
      /* ignore race while sheet is open */
    }
  }, [elements, amountCents]);

  const handleReady = (event: StripeExpressCheckoutElementReadyEvent) => {
    const methods = event.availablePaymentMethods;
    setVisible(Boolean(methods?.applePay || methods?.googlePay || methods?.link));
  };

  const handleClick = (event: StripeExpressCheckoutElementClickEvent) => {
    try {
      onBeforeOpenRef.current?.();
      event.resolve({
        emailRequired: true,
        lineItems: [
          {
            name: labelRef.current || 'HaBayit',
            amount: Math.max(amountRef.current, 100),
          },
        ],
      });
    } catch (err) {
      event.reject();
      onErrorRef.current?.(
        err instanceof Error ? err.message : 'Please complete the form before paying.'
      );
    }
  };

  const handleConfirm = async (event: StripeExpressCheckoutElementConfirmEvent) => {
    if (!stripe || !elements) {
      event.paymentFailed({ reason: 'fail', message: 'Payment is still loading.' });
      return;
    }

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        event.paymentFailed({
          reason: 'fail',
          message: submitError.message ?? 'Could not submit payment details.',
        });
        onErrorRef.current?.(submitError.message ?? 'Could not submit payment details.');
        return;
      }

      const clientSecret = await createClientSecretRef.current();
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url:
            typeof window !== 'undefined' ? window.location.href : 'https://www.habayitcc.org',
        },
        redirect: 'if_required',
      });

      if (error) {
        event.paymentFailed({
          reason: 'fail',
          message: error.message ?? 'Payment failed.',
        });
        onErrorRef.current?.(error.message ?? 'Payment failed. Please try again.');
        return;
      }

      if (paymentIntent?.status !== 'succeeded') {
        event.paymentFailed({
          reason: 'fail',
          message: 'Payment was not completed.',
        });
        onErrorRef.current?.(
          'Payment was not completed. Please try again or contact info@habayitcc.org.'
        );
        return;
      }

      await onPaymentSucceededRef.current(paymentIntent.id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Wallet payment failed. Please try again.';
      event.paymentFailed({ reason: 'fail', message });
      onErrorRef.current?.(message);
    }
  };

  if (amountCents < 100) {
    return null;
  }

  return (
    <div className={`space-y-3 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <div className={visible ? undefined : 'min-h-0 overflow-hidden opacity-0 h-0'}>
        <ExpressCheckoutElement
          options={{
            buttonHeight: 48,
            emailRequired: true,
            paymentMethods: {
              // Always show wallets on supported devices so the button is visible
              // even before a card is saved in Wallet (user can still add one).
              applePay: 'always',
              googlePay: 'always',
              link: 'auto',
              paypal: 'never',
              amazonPay: 'never',
              klarna: 'never',
            },
            buttonTheme: {
              applePay: 'black',
              googlePay: 'black',
            },
            buttonType: {
              applePay: buttonVariant === 'donate' ? 'donate' : 'check-out',
              googlePay: buttonVariant === 'donate' ? 'donate' : 'checkout',
            },
            layout: { maxColumns: 1, maxRows: 2, overflow: 'auto' },
            business: { name: 'HaBayit' },
            ...(recurringMonthly
              ? {
                  applePay: {
                    recurringPaymentRequest: {
                      paymentDescription: label || 'HaBayit monthly gift',
                      managementURL: 'https://www.habayitcc.org/donate',
                      regularBilling: {
                        amount: Math.max(amountCents, 100),
                        label: label || 'HaBayit monthly gift',
                        recurringPaymentIntervalUnit: 'month' as const,
                        recurringPaymentIntervalCount: 1,
                      },
                    },
                  },
                }
              : {}),
          }}
          onReady={handleReady}
          onClick={handleClick}
          onConfirm={handleConfirm}
        />
      </div>
      {visible ? (
        <div className="relative flex items-center gap-3">
          <div className="flex-1 border-t border-line" />
          <span className="text-[0.78rem] text-muted">or pay with card</span>
          <div className="flex-1 border-t border-line" />
        </div>
      ) : null}
    </div>
  );
}
