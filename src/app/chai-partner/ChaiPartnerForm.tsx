'use client';

import { useState } from 'react';
import { Elements, useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import type { StripeCardElementOptions } from '@stripe/stripe-js';
import { stripePromise } from '@/lib/stripe/client';
import { confirmChaiPartnerPayment } from './actions';
import { HEBREW_ADVENTURE_NAME } from '@/lib/programs/names';

const AMOUNTS = [150, 180, 360, 500, 1800];

const ZEFFY_CHAI_URL = process.env.NEXT_PUBLIC_ZEFFY_CHAI_PARTNER_URL?.trim() || '';
const ZEFFY_LIVE = Boolean(ZEFFY_CHAI_URL);

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

export function ChaiPartnerCheckout() {
  return (
    <Elements stripe={stripePromise}>
      <ChaiPartnerForm />
    </Elements>
  );
}

function ChaiPartnerForm() {
  const stripe = useStripe();
  const elements = useElements();

  const [selectedAmt, setSelectedAmt] = useState<number | 'other' | null>(null);
  const [otherAmt, setOtherAmt] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');

  const [coverFee, setCoverFee] = useState(false);
  const [payMethod, setPayMethod] = useState<'card' | 'ach' | 'zeffy'>('card');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [accessCode, setAccessCode] = useState<string | null>(null);

  const resolvedAmount = selectedAmt === 'other' ? parseFloat(otherAmt) : selectedAmt;
  /** Card ~3%; ACH ~1%. Zeffy has no HaBayit fee. */
  const feeRate = payMethod === 'ach' ? 0.01 : 0.03;
  const fee = resolvedAmount ? Math.round(resolvedAmount * feeRate * 100) / 100 : 0;
  const finalAmount = resolvedAmount
    ? coverFee && (payMethod === 'card' || payMethod === 'ach')
      ? Math.round(resolvedAmount * (1 + feeRate) * 100) / 100
      : resolvedAmount
    : null;

  function continueOnZeffy() {
    setError('');
    if (!ZEFFY_LIVE) {
      setError(
        'Zeffy checkout is not connected yet — set NEXT_PUBLIC_ZEFFY_CHAI_PARTNER_URL, or use card to join today.'
      );
      return;
    }
    // Outbound only — no prefill, no webhook back to HaBayit. Staff add partners manually in CRM.
    window.location.assign(ZEFFY_CHAI_URL);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (payMethod === 'zeffy') {
      continueOnZeffy();
      return;
    }
    if (!stripe) return;

    setError('');

    if (!resolvedAmount || resolvedAmount < 150) {
      setError('Please select a monthly amount of $150 or more.');
      return;
    }
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    if (!street.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      setError('Please fill in your full mailing address.');
      return;
    }

    if (payMethod === 'card') {
      const cardElement = elements?.getElement(CardElement);
      if (!cardElement) return;
    }

    setProcessing(true);

    try {
      const res = await fetch('/api/stripe/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: Math.round(finalAmount! * 100),
          donorFirstName: firstName,
          donorLastName: lastName,
          donorEmail: email,
          donorPhone: phone,
          type: 'chai_partner',
          paymentMethod: payMethod === 'ach' ? 'ach' : 'card',
          street,
          city,
          state,
          zip,
        }),
      });

      const data = (await res.json()) as {
        clientSecret?: string;
        subscriptionId?: string;
        customerId?: string;
        error?: string;
      };

      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error ?? 'Failed to initialize payment.');
      }

      const billingName = `${firstName} ${lastName}`.trim();
      let paymentIntentId: string | null = null;
      let paymentOk = false;

      if (payMethod === 'ach') {
        const collect = await stripe.collectBankAccountForPayment({
          clientSecret: data.clientSecret,
          params: {
            payment_method_type: 'us_bank_account',
            payment_method_data: {
              billing_details: {
                name: billingName,
                email,
                phone,
                address: {
                  line1: street.trim(),
                  city: city.trim(),
                  state: state.trim(),
                  postal_code: zip.trim(),
                  country: 'US',
                },
              },
            },
          },
        });

        if (collect.error) {
          setError(collect.error.message ?? 'Could not connect your bank account. Please try again.');
          setProcessing(false);
          return;
        }

        const collectedStatus = collect.paymentIntent?.status;
        if (collectedStatus === 'requires_payment_method') {
          setError('Bank account setup was cancelled. Please try again.');
          setProcessing(false);
          return;
        }

        if (collectedStatus === 'requires_confirmation') {
          const { error: confirmError, paymentIntent } = await stripe.confirmUsBankAccountPayment(
            data.clientSecret
          );
          if (confirmError) {
            setError(confirmError.message ?? 'Bank payment could not be confirmed. Please try again.');
            setProcessing(false);
            return;
          }
          paymentIntentId = paymentIntent?.id ?? null;
          paymentOk =
            paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing';
        } else if (
          collectedStatus === 'processing' ||
          collectedStatus === 'succeeded'
        ) {
          paymentIntentId = collect.paymentIntent?.id ?? null;
          paymentOk = true;
        } else {
          setError('Bank payment was not completed. Please try again.');
          setProcessing(false);
          return;
        }
      } else {
        const cardElement = elements!.getElement(CardElement)!;
        const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
          data.clientSecret,
          {
            payment_method: {
              card: cardElement,
              billing_details: { name: billingName, email, phone },
            },
          }
        );

        if (stripeError) {
          setError(stripeError.message ?? 'Payment failed. Please try again.');
          setProcessing(false);
          return;
        }

        paymentIntentId = paymentIntent?.id ?? null;
        paymentOk = paymentIntent?.status === 'succeeded';
      }

      if (paymentOk && paymentIntentId) {
        const result = await confirmChaiPartnerPayment({
          paymentIntentId,
          stripeSubscriptionId: data.subscriptionId ?? '',
          stripeCustomerId: data.customerId ?? '',
          firstName,
          lastName,
          email,
          phone,
          street,
          city,
          state,
          zip,
          monthlyAmount: finalAmount!,
        });

        if (result.success && result.accessCode) {
          setAccessCode(result.accessCode);
        } else {
          setError(
            result.error ??
              'Payment succeeded but we could not save your membership. Please contact us.'
          );
        }
      } else {
        setError('Payment was not completed. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  if (accessCode) {
    return (
      <div className="max-w-[600px] mx-auto text-center py-12">
        <span className="font-display text-[2.6rem] text-gold block mb-4">חי</span>
        <h2 className="text-[2.2rem] text-navy font-bold">Thank you for joining!</h2>
        <p className="text-muted mt-2.5 max-w-[480px] mx-auto">
          Your monthly partnership of ${finalAmount?.toFixed(2)} has been set up. You will receive a
          confirmation by email.
        </p>
        <div className="inline-block bg-soft border border-line rounded-[18px] px-7.5 py-6 mt-7">
          <p className="text-[0.72rem] font-bold uppercase tracking-wider text-muted mb-2">
            Your HaBayit Member Access Code
          </p>
          <p className="font-display text-[1.8rem] text-gold font-bold tracking-wide mb-2">{accessCode}</p>
          <p className="text-[0.8rem] text-muted">
            Save this code — you&apos;ll need it for member pricing on programs like {HEBREW_ADVENTURE_NAME}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-[760px] mx-auto">
      <p className="text-center text-[0.78rem] font-bold uppercase tracking-wide text-navy mb-3.5">
        Monthly Partnership Amount
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
        {AMOUNTS.map((amt) => (
          <AmountButton
            key={amt}
            active={selectedAmt === amt}
            onClick={() => {
              setSelectedAmt(amt);
              setOtherAmt('');
              setError('');
            }}
            label={`$${amt.toLocaleString()}`}
          />
        ))}
        <AmountButton
          active={selectedAmt === 'other'}
          onClick={() => {
            setSelectedAmt('other');
            setError('');
          }}
          label="Other"
        />
      </div>

      {selectedAmt === 'other' && (
        <div className="max-w-[300px] mx-auto mt-4 text-center">
          <input
            type="number"
            min={150}
            placeholder="Enter your monthly amount"
            value={otherAmt}
            onChange={(e) => {
              setOtherAmt(e.target.value);
              setError('');
            }}
            className="text-center"
            autoFocus
          />
          <p className="text-[0.78rem] text-muted mt-2">Minimum $150/month</p>
        </div>
      )}

      <p className="text-center text-[0.9rem] text-muted max-w-[560px] mx-auto mt-7 mb-8">
        Monthly gifts of any amount are always appreciated. For monthly gifts below $150, please visit
        our <a href="/donate" className="text-gold font-semibold underline">Donate page</a>.
      </p>

      <div className="bg-white border border-line rounded-[18px] p-6 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="First Name" required>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
          </Field>
          <Field label="Last Name" required>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
          </Field>
          <Field label="Email" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Phone" required>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </Field>
        </div>

        <Field label="Street Address" required className="pt-3 border-t border-line">
          <input value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="street-address" />
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <Field label="City" required>
            <input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          </Field>
          <Field label="State" required>
            <input
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              maxLength={2}
              autoComplete="address-level1"
            />
          </Field>
          <Field label="ZIP" required>
            <input value={zip} onChange={(e) => setZip(e.target.value)} autoComplete="postal-code" />
          </Field>
        </div>

        <div className="pt-3 border-t border-line">
          <p className="text-[0.78rem] font-bold uppercase tracking-wide text-navy mb-3">
            How would you like to pay?
          </p>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <PayMethodCard
              active={payMethod === 'card'}
              title="Credit / debit card"
              onClick={() => {
                setPayMethod('card');
                setError('');
              }}
            />
            <PayMethodCard
              active={payMethod === 'zeffy'}
              title="Credit card via Zeffy"
              detail={ZEFFY_LIVE ? 'HaBayit keeps 100%' : 'HaBayit keeps 100% · preview'}
              badge={ZEFFY_LIVE ? undefined : 'Preview'}
              onClick={() => {
                setPayMethod('zeffy');
                setCoverFee(false);
                setError('');
              }}
            />
            <PayMethodCard
              active={payMethod === 'ach'}
              title="Bank account (ACH)"
              onClick={() => {
                setPayMethod('ach');
                setError('');
              }}
            />
          </div>

          {payMethod === 'card' && (
            <>
              <label className="block text-[0.78rem] font-bold uppercase tracking-wide text-navy mb-1.5">
                Card Information
              </label>
              <div className="border border-line rounded-lg p-3.5 bg-white focus-within:border-navy focus-within:shadow-[0_0_0_3px_rgba(23,38,67,0.08)] transition-all">
                <CardElement options={CARD_STYLE} />
              </div>
            </>
          )}

          {payMethod === 'ach' && (
            <div className="rounded-xl border border-line bg-soft px-4 py-5 text-[0.9rem] text-muted">
              <p className="text-navy font-semibold mb-1">Bank account</p>
              <p>
                After you submit, Stripe will securely connect your bank (or let you enter routing and
                account numbers). The first debit may take a few business days to clear.
              </p>
            </div>
          )}

          {payMethod === 'zeffy' && (
            <div className="rounded-xl border border-line bg-soft px-4 py-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-navy font-semibold text-[0.95rem]">Fee-free checkout</p>
                  <p className="text-[0.85rem] text-muted mt-1 leading-relaxed">
                    Your gift comes to HaBayit in full. On the next screen, Zeffy may invite an
                    optional tip for their platform — that tip goes to Zeffy, not to us.
                  </p>
                </div>
                {!ZEFFY_LIVE && (
                  <span className="text-[0.62rem] font-bold uppercase tracking-wider text-gold shrink-0 mt-0.5">
                    Mock
                  </span>
                )}
              </div>
              {resolvedAmount && resolvedAmount >= 150 && (
                <p className="text-[0.9rem] text-navy mb-4">
                  Monthly gift:{' '}
                  <span className="font-extrabold">${resolvedAmount.toFixed(2)}/mo</span>
                </p>
              )}
              <button
                type="button"
                onClick={continueOnZeffy}
                className="w-full bg-navy text-white rounded-full px-6 py-3.5 font-extrabold uppercase tracking-wider text-[0.78rem] hover:bg-[#243552] transition-colors"
              >
                Continue on Zeffy
                {resolvedAmount && resolvedAmount >= 150
                  ? ` — $${resolvedAmount.toFixed(2)}/mo`
                  : ''}
              </button>
              <p className="text-center text-[0.72rem] text-muted mt-3">
                {ZEFFY_LIVE
                  ? "You'll complete payment on Zeffy. Our team will add you to the partnership list and email your member access code."
                  : 'Zeffy form URL not set yet — use card to join today.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {resolvedAmount && resolvedAmount >= 150 && (payMethod === 'card' || payMethod === 'ach') && (
        <div className="mt-4 bg-soft border border-line rounded-xl px-5 py-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={coverFee}
              onChange={(e) => setCoverFee(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0"
            />
            <span className="text-[0.9rem] text-navy">
              {payMethod === 'ach' ? (
                <>I&apos;d like to cover the 1% bank processing fee</>
              ) : (
                <>I&apos;d like to cover the 3% credit card processing fee</>
              )}
              <span className="text-gold font-semibold"> (+${fee.toFixed(2)}/mo)</span>
            </span>
          </label>
          <div className="mt-3 pt-3 border-t border-line flex justify-between items-baseline">
            <span className="text-[0.78rem] font-bold uppercase tracking-wide text-muted">Monthly total</span>
            <span className="text-[1.2rem] font-extrabold text-navy">
              ${finalAmount!.toFixed(2)}
              <span className="text-[0.78rem] font-normal text-muted">/mo</span>
            </span>
          </div>
        </div>
      )}

      <p className="text-muted text-[0.9rem] text-center mt-6">
        <strong className="text-navy">Chai Partners</strong> play a vital role in sustaining HaBayit&apos;s
        ongoing programs and helping our community grow.
      </p>

      {error && (
        <div className="mt-4 bg-[#fdecea] border border-[#f3c4c0] text-danger rounded-xl px-4 py-3 text-[0.88rem]">
          {error}
        </div>
      )}

      {(payMethod === 'card' || payMethod === 'ach') && (
        <button
          type="submit"
          disabled={processing || !stripe}
          className="w-full mt-6 bg-gold text-white rounded-full px-6 py-4.5 font-extrabold uppercase tracking-wider disabled:opacity-60 transition-opacity"
        >
          {processing
            ? payMethod === 'ach'
              ? 'Connecting bank…'
              : 'Processing…'
            : `Become a Chai Partner${finalAmount ? ` — $${finalAmount.toFixed(2)}/mo` : ''}`}
        </button>
      )}

      <p className="text-center text-[0.75rem] text-muted mt-3">
        {payMethod === 'card'
          ? 'Secured by Stripe. Your card details are never stored by HaBayit.'
          : payMethod === 'zeffy'
            ? ZEFFY_LIVE
              ? 'Secured by Zeffy. After payment, our team will follow up with your member access code.'
              : 'Zeffy form URL not configured yet.'
            : 'Secured by Stripe. Bank debit (ACH) usually clears in a few business days.'}
      </p>
    </form>
  );
}

function PayMethodCard({
  active,
  title,
  detail,
  badge,
  onClick,
}: {
  active: boolean;
  title: string;
  detail?: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border px-4 py-3 transition-colors ${
        active ? 'border-navy bg-soft' : 'border-line bg-white hover:border-navy/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[0.92rem] font-bold text-navy leading-snug">{title}</span>
        {badge && (
          <span className="text-[0.62rem] font-bold uppercase tracking-wider text-gold shrink-0">
            {badge}
          </span>
        )}
      </div>
      {detail ? <span className="block text-[0.78rem] text-muted mt-1">{detail}</span> : null}
    </button>
  );
}

function Field({
  label,
  required,
  children,
  className = '',
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
        {label} {required && <span className="text-gold">*</span>}
      </label>
      {children}
    </div>
  );
}

function AmountButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-white border-[1.5px] rounded-xl py-4.5 text-center transition-all ${
        active ? 'border-gold bg-soft shadow-[0_0_0_2px_var(--color-gold)]' : 'border-line'
      }`}
    >
      <span className="block text-[1.3rem] font-extrabold text-navy">{label}</span>
      <span className="block text-[0.68rem] text-muted uppercase tracking-wide mt-0.5">/ month</span>
    </button>
  );
}
