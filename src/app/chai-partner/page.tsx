'use client';

import { useState } from 'react';
import { Elements, useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import type { StripeCardElementOptions } from '@stripe/stripe-js';
import { stripePromise } from '@/lib/stripe/client';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section } from '@/components/sections/Section';
import { confirmChaiPartnerPayment } from './actions';
import { HEBREW_ADVENTURE_NAME } from '@/lib/programs/names';

const AMOUNTS = [150, 180, 300, 500, 770, 1000, 1800];

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

export default function ChaiPartnerPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero
          kicker="Monthly Partnership"
          minHeight="min-h-[42vh]"
          subtitle="Help build a warm Jewish home for our community through ongoing monthly partnership."
        >
          Become a HaBayit Chai Partner
        </Hero>
        <Section background="white">
          <Elements stripe={stripePromise}>
            <ChaiPartnerForm />
          </Elements>
        </Section>
      </main>
      <Footer />
    </>
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
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [accessCode, setAccessCode] = useState<string | null>(null);

  const resolvedAmount = selectedAmt === 'other' ? parseFloat(otherAmt) : selectedAmt;
  const fee = resolvedAmount ? Math.round(resolvedAmount * 0.03 * 100) / 100 : 0;
  const finalAmount = resolvedAmount
    ? (coverFee ? Math.round(resolvedAmount * 1.03 * 100) / 100 : resolvedAmount)
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

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

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setProcessing(true);

    try {
      // Create Stripe Customer + Subscription
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
          street,
          city,
          state,
          zip,
        }),
      });

      const data = await res.json() as {
        clientSecret?: string;
        subscriptionId?: string;
        customerId?: string;
        error?: string;
      };

      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error ?? 'Failed to initialize payment.');
      }

      // Confirm card payment
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        data.clientSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: {
              name: `${firstName} ${lastName}`,
              email,
              phone,
            },
          },
        }
      );

      if (stripeError) {
        setError(stripeError.message ?? 'Payment failed. Please try again.');
        setProcessing(false);
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        const result = await confirmChaiPartnerPayment({
          paymentIntentId: paymentIntent.id,
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
          setError(result.error ?? 'Payment succeeded but we could not save your membership. Please contact us.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  // ── Success ──
  if (accessCode) {
    return (
      <div className="max-w-[600px] mx-auto text-center py-12">
        <span className="font-display text-[2.6rem] text-gold block mb-4">חי</span>
        <h2 className="text-[2.2rem] text-navy font-bold">Thank you for joining!</h2>
        <p className="text-muted mt-2.5 max-w-[480px] mx-auto">
          Your monthly partnership of ${finalAmount?.toFixed(2)} has been set up.
          You will receive a confirmation by email.
        </p>
        <div className="inline-block bg-soft border border-line rounded-[18px] px-7.5 py-6 mt-7">
          <p className="text-[0.72rem] font-bold uppercase tracking-wider text-muted mb-2">
            Your HaBayit Member Access Code
          </p>
          <p className="font-display text-[1.8rem] text-gold font-bold tracking-wide mb-2">
            {accessCode}
          </p>
          <p className="text-[0.8rem] text-muted">
            Save this code — you&apos;ll need it for member pricing on programs like {HEBREW_ADVENTURE_NAME}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-[760px] mx-auto">
      {/* ── Amount picker ── */}
      <p className="text-center text-[0.78rem] font-bold uppercase tracking-wide text-navy mb-3.5">
        Monthly Partnership Amount
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {AMOUNTS.map((amt) => (
          <AmountButton
            key={amt}
            active={selectedAmt === amt}
            onClick={() => { setSelectedAmt(amt); setOtherAmt(''); setError(''); }}
            label={`$${amt.toLocaleString()}`}
          />
        ))}
        <AmountButton
          active={selectedAmt === 'other'}
          onClick={() => { setSelectedAmt('other'); setError(''); }}
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
            onChange={(e) => { setOtherAmt(e.target.value); setError(''); }}
            className="text-center"
            autoFocus
          />
          <p className="text-[0.78rem] text-muted mt-2">Minimum $150/month</p>
        </div>
      )}

      <p className="text-center text-[0.9rem] text-muted max-w-[560px] mx-auto mt-7 mb-8">
        Monthly gifts of any amount are always appreciated. For monthly gifts below $150, please
        visit our{' '}
        <a href="/donate" className="text-gold font-semibold underline">Donate page</a>.
      </p>

      {/* ── Personal info + address + card in one panel ── */}
      <div className="bg-white border border-line rounded-[18px] p-6 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
              First Name <span className="text-gold">*</span>
            </label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
              Last Name <span className="text-gold">*</span>
            </label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
              Email <span className="text-gold">*</span>
            </label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
              Phone <span className="text-gold">*</span>
            </label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </div>
        </div>

        <div className="pt-3 border-t border-line flex flex-col gap-1.5">
          <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
            Street Address <span className="text-gold">*</span>
          </label>
          <input value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="street-address" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
              City <span className="text-gold">*</span>
            </label>
            <input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
              State <span className="text-gold">*</span>
            </label>
            <input
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              maxLength={2}
              autoComplete="address-level1"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
              ZIP <span className="text-gold">*</span>
            </label>
            <input value={zip} onChange={(e) => setZip(e.target.value)} autoComplete="postal-code" />
          </div>
        </div>

        {/* ── Card ── */}
        <div className="pt-3 border-t border-line">
          <label className="block text-[0.78rem] font-bold uppercase tracking-wide text-navy mb-1.5">
            Card Information
          </label>
          <div className="border border-line rounded-lg p-3.5 bg-white focus-within:border-navy focus-within:shadow-[0_0_0_3px_rgba(23,38,67,0.08)] transition-all">
            <CardElement options={CARD_STYLE} />
          </div>
        </div>
      </div>

      {/* ── Cover fee + total ── */}
      {resolvedAmount && resolvedAmount >= 150 && (
        <div className="mt-4 bg-soft border border-line rounded-xl px-5 py-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={coverFee}
              onChange={(e) => setCoverFee(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0"
            />
            <span className="text-[0.9rem] text-navy">
              I&apos;d like to cover the 3% credit card processing fee
              <span className="text-gold font-semibold"> (+${fee.toFixed(2)}/mo)</span>
            </span>
          </label>
          <div className="mt-3 pt-3 border-t border-line flex justify-between items-baseline">
            <span className="text-[0.78rem] font-bold uppercase tracking-wide text-muted">
              Monthly total
            </span>
            <span className="text-[1.2rem] font-extrabold text-navy">
              ${finalAmount!.toFixed(2)}<span className="text-[0.78rem] font-normal text-muted">/mo</span>
            </span>
          </div>
        </div>
      )}

      <p className="text-muted text-[0.9rem] text-center mt-6">
        <strong className="text-navy">Chai Partners</strong> play a vital role in sustaining
        HaBayit&apos;s ongoing programs and helping our community grow. As a thank you, Chai
        Partners receive exclusive benefits, including member pricing on select HaBayit programs.
      </p>

      {error && (
        <div className="mt-4 bg-[#fdecea] border border-[#f3c4c0] text-danger rounded-xl px-4 py-3 text-[0.88rem]">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={processing || !stripe}
        className="w-full mt-6 bg-gold text-white rounded-full px-6 py-4.5 font-extrabold uppercase tracking-wider disabled:opacity-60 transition-opacity"
      >
        {processing
          ? 'Processing…'
          : `Become a Chai Partner${finalAmount ? ` — $${finalAmount.toFixed(2)}/mo` : ''}`}
      </button>

      <p className="text-center text-[0.75rem] text-muted mt-3">
        Secured by Stripe. Your card details are never stored by HaBayit.
      </p>
    </form>
  );
}

function AmountButton({ active, onClick, label }: {
  active: boolean; onClick: () => void; label: string;
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
