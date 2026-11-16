'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ExpressCheckoutElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import {
  isApplePaySessionAbort,
  isWithinAbortWatchWindow,
  WALLET_ABORT_FALLBACK_MESSAGE,
} from '@/lib/events/wallet-availability';
import {
  createWalletDebugRecorder,
  diagnosticStopConfirm,
  isWalletDebugEnabled,
  shouldStopConfirmForDebug,
  type WalletDebugFlags,
  type WalletDebugRecorder,
  type WalletDebugEvent,
} from '@/lib/events/wallet-debug';
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

  // --- wallet_debug diagnostic mode (client-only, ?wallet_debug=1) ---
  const [debugEnabled] = useState(
    () => typeof window !== 'undefined' && isWalletDebugEnabled(window.location.search)
  );
  const debugRef = useRef<WalletDebugRecorder | null>(null);
  if (debugEnabled && !debugRef.current) debugRef.current = createWalletDebugRecorder();
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const [debugCopied, setDebugCopied] = useState(false);
  const recordDebug = (event: WalletDebugEvent, flags?: WalletDebugFlags) => {
    const r = debugRef.current;
    if (!r) return;
    r.record(event, flags);
    setDebugLines(r.lines());
  };
  // --- end wallet_debug diagnostic mode ---

  // Watchdog: surface the silent Apple Pay session-start abort (stripe-js #909).
  const lastWalletClickRef = useRef<number | null>(null);
  useEffect(() => {
    const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
      if (!isApplePaySessionAbort(ev.reason)) return;
      if (!isWithinAbortWatchWindow(lastWalletClickRef.current, Date.now())) return;
      onErrorRef.current?.(WALLET_ABORT_FALLBACK_MESSAGE);
    };
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    onErrorRef.current = onError
      ? (message: string) => {
          recordDebug('error');
          onError(message);
        }
      : onError;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (debugRef.current) {
      let applePaySessionApi = false;
      let applePayCanMakePayments: boolean | undefined;
      try {
        const w = window as unknown as { ApplePaySession?: { canMakePayments(): boolean } };
        applePaySessionApi = typeof w.ApplePaySession?.canMakePayments === 'function';
        applePayCanMakePayments = applePaySessionApi
          ? w.ApplePaySession!.canMakePayments()
          : undefined;
      } catch {
        applePayCanMakePayments = undefined;
      }
      recordDebug('ready', {
        applePayAvailable: Boolean(methods?.applePay),
        googlePayAvailable: Boolean(methods?.googlePay),
        linkAvailable: Boolean(methods?.link),
        applePaySessionApi,
        applePayCanMakePayments,
      });
    }
  };

  // Recorded only in diagnostic mode; normal mode attaches no cancel handler.
  const handleCancel = () => recordDebug('cancel');

  const handleClick = (event: StripeExpressCheckoutElementClickEvent) => {
    lastWalletClickRef.current = Date.now();
    recordDebug('click');
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
      recordDebug('resolve');
    } catch (err) {
      recordDebug('reject');
      event.reject();
      onErrorRef.current?.(
        err instanceof Error ? err.message : 'Please complete the form before paying.'
      );
    }
  };

  const handleConfirm = async (event: StripeExpressCheckoutElementConfirmEvent) => {
    // Diagnostic mode: never submit, never create a PaymentIntent, never confirm.
    if (shouldStopConfirmForDebug(Boolean(debugRef.current))) {
      diagnosticStopConfirm(
        (message) => event.paymentFailed({ reason: 'fail', message }),
        recordDebug,
      );
      return;
    }
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
          onCancel={debugEnabled ? handleCancel : undefined}
        />
      </div>
      {visible ? (
        <div className="relative flex items-center gap-3">
          <div className="flex-1 border-t border-line" />
          <span className="text-[0.78rem] text-muted">or pay with card</span>
          <div className="flex-1 border-t border-line" />
        </div>
      ) : null}
      {debugEnabled ? (
        <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[45vh] overflow-y-auto bg-black/90 p-3 font-mono text-[11px] leading-relaxed text-green-200">
          <p className="font-bold text-white">
            DIAGNOSTIC MODE - no payment will be created or charged. If the Apple Pay sheet
            opens, it stops itself before payment.
          </p>
          {debugLines.length ? (
            debugLines.map((line, i) => <p key={i}>{line}</p>)
          ) : (
            <p>Waiting for wallet events... tap Apple Pay above.</p>
          )}
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(debugLines.join('\n')).then(() => {
                setDebugCopied(true);
              });
            }}
            className="mt-2 rounded-full bg-white px-4 py-1.5 font-sans text-[12px] font-bold text-black"
          >
            {debugCopied ? 'Copied - paste it in WhatsApp' : 'Copy diagnostics'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
