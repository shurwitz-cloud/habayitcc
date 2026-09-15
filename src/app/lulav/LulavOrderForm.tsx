'use client';

import { useMemo, useState } from 'react';
import { Elements, useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import type { StripeCardElementOptions } from '@stripe/stripe-js';
import { stripePromise } from '@/lib/stripe/client';
import { submitLulavOrder } from './actions';
import {
  computeLulavPricing,
  LULAV_SET_PRICE,
  LULAV_ZELLE_MEMO,
  LULAV_ZELLE_NAME,
  LULAV_ZELLE_PHONE,
  type LulavPayMethod,
} from '@/lib/lulav/pricing';

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

export function LulavOrderForm() {
  return (
    <Elements stripe={stripePromise}>
      <LulavOrderFormInner />
    </Elements>
  );
}

function LulavOrderFormInner() {
  const stripe = useStripe();
  const elements = useElements();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [payMethod, setPayMethod] = useState<LulavPayMethod>('card');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<'paid' | 'pending_zelle' | null>(null);

  const pricing = useMemo(
    () => computeLulavPricing(quantity, payMethod, payMethod === 'card'),
    [quantity, payMethod]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setProcessing(true);

    try {
      if (payMethod === 'zelle') {
        const result = await submitLulavOrder({
          fullName,
          email,
          phone,
          quantity,
          payMethod: 'zelle',
          coverFee: false,
        });
        if (!result.success) {
          setError(result.error ?? 'Something went wrong.');
          return;
        }
        setDone('pending_zelle');
        return;
      }

      if (!stripe || !elements) {
        setError('Payment is still loading. Please wait a moment.');
        return;
      }

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        setError('Please enter your card details.');
        return;
      }

      const res = await fetch('/api/stripe/lulav-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity,
          coverFee: true,
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          amountCents: pricing.totalCents,
        }),
      });
      const data = (await res.json()) as {
        clientSecret?: string;
        paymentIntentId?: string;
        error?: string;
      };
      if (!res.ok || !data.clientSecret || !data.paymentIntentId) {
        setError(data.error ?? 'Could not initialize payment.');
        return;
      }

      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        data.clientSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: {
              name: fullName.trim(),
              email: email.trim(),
              phone: phone.trim(),
            },
          },
        }
      );

      if (stripeError) {
        setError(stripeError.message ?? 'Payment failed. Please try again.');
        return;
      }
      if (paymentIntent?.status !== 'succeeded') {
        setError('Payment was not completed. Please try again.');
        return;
      }

      const result = await submitLulavOrder({
        fullName,
        email,
        phone,
        quantity,
        payMethod: 'card',
        coverFee: true,
        paymentIntentId: paymentIntent.id,
      });
      if (!result.success) {
        setError(result.error ?? 'Payment succeeded but we could not finish saving your order.');
        return;
      }
      setDone('paid');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setProcessing(false);
    }
  }

  if (done === 'paid') {
    return (
      <div className="text-center py-2">
        <h3 className="font-display text-[1.8rem] text-navy">Order confirmed</h3>
        <p className="mt-3 text-[1rem] leading-relaxed text-muted">
          Thank you, {fullName.trim().split(/\s+/)[0]}! Your payment for{' '}
          <strong className="text-navy">
            {quantity} Lulav &amp; Etrog set{quantity === 1 ? '' : 's'}
          </strong>{' '}
          (${pricing.total.toFixed(2)}) was received.
        </p>
        <p className="mt-4 text-[0.95rem] text-navy/80">
          A confirmation was sent to <strong>{email.trim()}</strong>.
        </p>
      </div>
    );
  }

  if (done === 'pending_zelle') {
    return (
      <div className="text-center py-2">
        <h3 className="font-display text-[1.8rem] text-navy">Almost there</h3>
        <p className="mt-3 text-[1rem] leading-relaxed text-muted">
          We received your order for{' '}
          <strong className="text-navy">
            {quantity} set{quantity === 1 ? '' : 's'}
          </strong>
          . Please complete payment by Zelle:
        </p>
        <div className="mt-5 rounded-2xl border border-line bg-soft px-5 py-4 text-left text-[0.95rem] text-navy space-y-2">
          <p>
            <span className="text-muted">Send</span>{' '}
            <strong>${pricing.total.toFixed(2)}</strong>
          </p>
          <p>
            <span className="text-muted">To</span>{' '}
            <strong>{LULAV_ZELLE_PHONE}</strong> ({LULAV_ZELLE_NAME})
          </p>
          <p>
            <span className="text-muted">Memo</span> <strong>{LULAV_ZELLE_MEMO}</strong>
          </p>
        </div>
        <p className="mt-4 text-[0.92rem] text-muted">
          Your order is confirmed after we receive the Zelle. We’ll email{' '}
          <strong className="text-navy">{email.trim()}</strong> when it’s complete.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="Full Name" required>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your full name"
          required
          autoComplete="name"
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            autoComplete="email"
          />
        </Field>
        <Field label="Phone" required>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 555-5555"
            required
            autoComplete="tel"
          />
        </Field>
      </div>

      <Field label="Number of Lulav & Etrog sets" required>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="h-10 w-10 rounded-full border border-line text-navy font-bold"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            max={50}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="w-20 text-center"
          />
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(50, q + 1))}
            className="h-10 w-10 rounded-full border border-line text-navy font-bold"
            aria-label="Increase quantity"
          >
            +
          </button>
          <span className="text-muted text-[0.9rem]">${LULAV_SET_PRICE} each</span>
        </div>
      </Field>

      <div>
        <p className="mb-2 text-[0.78rem] font-bold uppercase tracking-wide text-navy">
          Payment method
        </p>
        <div className="grid grid-cols-2 gap-2">
          <PayTab active={payMethod === 'card'} onClick={() => setPayMethod('card')}>
            Credit card
          </PayTab>
          <PayTab active={payMethod === 'zelle'} onClick={() => setPayMethod('zelle')}>
            Zelle (no fee)
          </PayTab>
        </div>
      </div>

      {payMethod === 'card' ? (
        <>
          <p className="text-[0.88rem] text-muted">
            Card orders include a 3% processing fee (${pricing.cardFee.toFixed(2)} on this order).
            Choose Zelle for no fee.
          </p>
          <Field label="Card details" required>
            <div className="border border-line rounded-xl px-4 py-3.5 bg-white">
              <CardElement options={CARD_STYLE} />
            </div>
          </Field>
        </>
      ) : (
        <div className="rounded-2xl border border-line bg-soft/80 px-5 py-4 text-[0.92rem] text-navy space-y-2">
          <p className="font-semibold">Pay by Zelle — no processing fee</p>
          <p>
            After you submit, send <strong>${pricing.total.toFixed(2)}</strong> to{' '}
            <strong>{LULAV_ZELLE_PHONE}</strong> ({LULAV_ZELLE_NAME}).
          </p>
          <p>
            Put <strong>{LULAV_ZELLE_MEMO}</strong> in the memo. Your order is confirmed after we
            receive the Zelle.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-cream px-5 py-4">
        <div className="flex justify-between text-[0.9rem] text-muted">
          <span>
            {quantity} × ${LULAV_SET_PRICE}
          </span>
          <span>${pricing.subtotal.toFixed(2)}</span>
        </div>
        {pricing.cardFee > 0 ? (
          <div className="mt-1.5 flex justify-between text-[0.9rem] text-muted">
            <span>Card fee (3%)</span>
            <span>${pricing.cardFee.toFixed(2)}</span>
          </div>
        ) : null}
        <div className="mt-3 pt-3 border-t border-line flex justify-between items-baseline">
          <span className="text-[0.78rem] font-bold uppercase tracking-wide text-muted">Total</span>
          <span className="text-[1.25rem] font-extrabold text-navy">
            ${pricing.total.toFixed(2)}
          </span>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#f3c4c0] bg-[#fdecea] px-5 py-3.5 text-[0.9rem] text-red-700">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={processing || (payMethod === 'card' && !stripe)}
        className="w-full rounded-full bg-gold px-6 py-4 text-[0.9rem] font-black uppercase tracking-wider text-white transition-opacity disabled:opacity-60"
      >
        {processing
          ? 'Processing…'
          : payMethod === 'zelle'
            ? 'Submit Zelle Order'
            : `Pay $${pricing.total.toFixed(2)}`}
      </button>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
        {label} {required ? <span className="text-gold">*</span> : null}
      </label>
      {children}
    </div>
  );
}

function PayTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-3 text-[0.88rem] font-semibold transition-colors ${
        active
          ? 'border-navy bg-navy text-white'
          : 'border-line bg-white text-navy hover:border-navy/40'
      }`}
    >
      {children}
    </button>
  );
}
