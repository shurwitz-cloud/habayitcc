'use client';

import { useEffect, useRef, useState } from 'react';
import { PaymentRequestButtonElement, useStripe } from '@stripe/react-stripe-js';
import type { PaymentRequest } from '@stripe/stripe-js';

export interface WalletPayButtonsProps {
  /** Amount in cents — button hidden if under $1. */
  amountCents: number;
  /** Shown in Apple Pay / Google Pay sheet. */
  label: string;
  disabled?: boolean;
  /**
   * Called after the shopper authorizes the wallet.
   * Should create/confirm the PaymentIntent and throw on failure.
   */
  onWalletPay: (paymentMethodId: string) => Promise<void>;
  onError?: (message: string) => void;
}

/**
 * Apple Pay / Google Pay via Stripe Payment Request.
 * Only renders when the browser + device support a wallet.
 */
export function WalletPayButtons({
  amountCents,
  label,
  disabled = false,
  onWalletPay,
  onError,
}: WalletPayButtonsProps) {
  const stripe = useStripe();
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [available, setAvailable] = useState(false);
  const onWalletPayRef = useRef(onWalletPay);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onWalletPayRef.current = onWalletPay;
  }, [onWalletPay]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!stripe || amountCents < 100) {
      setPaymentRequest(null);
      setAvailable(false);
      return;
    }

    const pr = stripe.paymentRequest({
      country: 'US',
      currency: 'usd',
      total: {
        label: label || 'HaBayit',
        amount: amountCents,
      },
      requestPayerName: true,
      requestPayerEmail: true,
    });

    let cancelled = false;

    void pr.canMakePayment().then((result) => {
      if (cancelled) return;
      if (result) {
        setPaymentRequest(pr);
        setAvailable(true);
      } else {
        setPaymentRequest(null);
        setAvailable(false);
      }
    });

    pr.on('paymentmethod', async (event) => {
      try {
        await onWalletPayRef.current(event.paymentMethod.id);
        event.complete('success');
      } catch (err) {
        event.complete('fail');
        onErrorRef.current?.(
          err instanceof Error ? err.message : 'Wallet payment failed. Please try again.'
        );
      }
    });

    return () => {
      cancelled = true;
    };
    // Recreate when stripe or label changes; amount is updated separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- amount handled via update()
  }, [stripe, label]);

  useEffect(() => {
    if (!paymentRequest || amountCents < 100) return;
    try {
      paymentRequest.update({
        total: {
          label: label || 'HaBayit',
          amount: amountCents,
        },
      });
    } catch {
      /* ignore update race while sheet open */
    }
  }, [paymentRequest, amountCents, label]);

  if (!available || !paymentRequest || amountCents < 100) {
    return null;
  }

  return (
    <div className={`space-y-3 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <PaymentRequestButtonElement
        options={{
          paymentRequest,
          style: {
            paymentRequestButton: {
              type: 'default',
              theme: 'dark',
              height: '48px',
            },
          },
        }}
      />
      <div className="relative flex items-center gap-3">
        <div className="flex-1 border-t border-line" />
        <span className="text-[0.78rem] text-muted">or pay with card</span>
        <div className="flex-1 border-t border-line" />
      </div>
    </div>
  );
}
