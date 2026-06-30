'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Elements, useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import type { StripeCardElementOptions } from '@stripe/stripe-js';
import { stripePromise } from '@/lib/stripe/client';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section } from '@/components/sections/Section';
import { recordDonation } from './actions';

const AMOUNTS = [72, 180, 360, 770, 1800];

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

export default function DonatePage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero
          kicker="Support HaBayit"
          minHeight="min-h-[40vh]"
          subtitle="Every gift helps strengthen Jewish life in our community."
        >
          Support HaBayit
        </Hero>
        <Section background="white">
          {/* Elements mounts once — CardElement works without a clientSecret upfront */}
          <Elements stripe={stripePromise}>
            <DonateForm />
          </Elements>
        </Section>
      </main>
      <Footer />
    </>
  );
}

// DonateForm lives inside <Elements> so it can call useStripe + useElements
function DonateForm() {
  const stripe = useStripe();
  const elements = useElements();

  const [mode, setMode] = useState<'onetime' | 'monthly'>('onetime');
  const [selectedAmt, setSelectedAmt] = useState<number | 'other' | null>(null);
  const [otherAmt, setOtherAmt] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [coverFee, setCoverFee] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const resolvedAmount = selectedAmt === 'other' ? parseFloat(otherAmt) : selectedAmt;
  const fee = resolvedAmount ? Math.round(resolvedAmount * 0.03 * 100) / 100 : 0;
  const finalAmount = resolvedAmount ? (coverFee ? Math.round(resolvedAmount * 1.03 * 100) / 100 : resolvedAmount) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setError('');

    if (!resolvedAmount || resolvedAmount < 1) {
      setError('Please select or enter a donation amount.');
      return;
    }
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Please fill in your name and email.');
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setProcessing(true);

    try {
      const amountCents = Math.round(finalAmount! * 100);
      let clientSecret: string;

      if (mode === 'onetime') {
        const res = await fetch('/api/stripe/payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountCents,
            donorName: `${firstName} ${lastName}`,
            donorEmail: email,
          }),
        });
        const data = await res.json() as { clientSecret?: string; error?: string };
        if (!res.ok || !data.clientSecret) throw new Error(data.error ?? 'Could not initialize payment.');
        clientSecret = data.clientSecret;
      } else {
        const res = await fetch('/api/stripe/subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountCents,
            donorFirstName: firstName,
            donorLastName: lastName,
            donorEmail: email,
            donorPhone: phone,
            type: 'monthly_donation',
          }),
        });
        const data = await res.json() as { clientSecret?: string; error?: string };
        if (!res.ok || !data.clientSecret) throw new Error(data.error ?? 'Could not initialize subscription.');
        clientSecret = data.clientSecret;
      }

      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: `${firstName} ${lastName}`,
            email,
            phone: phone || undefined,
          },
        },
      });

      if (stripeError) {
        setError(stripeError.message ?? 'Payment failed. Please try again.');
        setProcessing(false);
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        await recordDonation({
          paymentIntentId: paymentIntent.id,
          amountDollars: finalAmount!,
          firstName,
          lastName,
          email,
          donationType: mode === 'monthly' ? 'Monthly' : 'One-Time',
        });
        setSuccess(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setProcessing(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-[600px] mx-auto text-center py-12">
        <div className="text-gold font-display text-[3rem] leading-none mb-4">✦</div>
        <h2 className="text-[2.2rem] text-navy font-bold mb-3">Thank you!</h2>
        <p className="text-muted max-w-[440px] mx-auto">
          {mode === 'monthly'
            ? `Your monthly gift of $${finalAmount?.toLocaleString()} has been set up. A receipt will be sent to ${email}.`
            : `Your gift of $${finalAmount?.toLocaleString()} has been received. A receipt will be sent to ${email}.`}
        </p>
        <Link
          href="/"
          className="inline-block mt-10 bg-navy text-white rounded-full px-10 py-4 font-bold uppercase tracking-wider text-[0.84rem]"
        >
          Return Home
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-[600px] mx-auto">
      {/* ── One-Time / Monthly toggle ── */}
      <div className="flex justify-center mb-7">
        <div className="inline-flex bg-soft border border-line rounded-full p-1.5">
          <ToggleButton active={mode === 'onetime'} onClick={() => setMode('onetime')}>
            One-Time
          </ToggleButton>
          <ToggleButton active={mode === 'monthly'} onClick={() => setMode('monthly')}>
            Monthly
          </ToggleButton>
        </div>
      </div>

      {/* ── Amount grid ── */}
      <div className="grid grid-cols-3 gap-3 mb-2">
        {AMOUNTS.map((amt) => (
          <AmountButton
            key={amt}
            active={selectedAmt === amt}
            onClick={() => { setSelectedAmt(amt); setOtherAmt(''); }}
          >
            ${amt.toLocaleString()}
          </AmountButton>
        ))}
        <AmountButton active={selectedAmt === 'other'} onClick={() => setSelectedAmt('other')}>
          Other
        </AmountButton>
      </div>

      {selectedAmt === 'other' && (
        <div className="max-w-[240px] mx-auto mt-3 mb-1 relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted font-semibold pointer-events-none">
            $
          </span>
          <input
            type="number"
            min={1}
            placeholder="Enter amount"
            value={otherAmt}
            onChange={(e) => setOtherAmt(e.target.value)}
            className="pl-7 text-center"
            autoFocus
          />
        </div>
      )}

      {/* ── Contact + Card in one panel ── */}
      <div className="mt-7 bg-white border border-line rounded-[18px] p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
              First Name <span className="text-gold">*</span>
            </label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
              Last Name <span className="text-gold">*</span>
            </label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
              Email <span className="text-gold">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
              Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>
        </div>

        {/* ── Card details ── */}
        <div className="pt-3 border-t border-line">
          <label className="block text-[0.78rem] font-bold uppercase tracking-wide text-navy mb-1.5">
            Card Information
          </label>
          <div className="border border-line rounded-lg p-3.5 bg-white focus-within:border-navy focus-within:shadow-[0_0_0_3px_rgba(23,38,67,0.08)] transition-all">
            <CardElement options={CARD_STYLE} />
          </div>
        </div>
      </div>

      {/* ── Cover fee checkbox + total ── */}
      {resolvedAmount && resolvedAmount > 0 && (
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
              <span className="text-gold font-semibold"> (+${fee.toFixed(2)})</span>
            </span>
          </label>
          <div className="mt-3 pt-3 border-t border-line flex justify-between items-baseline">
            <span className="text-[0.78rem] font-bold uppercase tracking-wide text-muted">
              {mode === 'monthly' ? 'Monthly total' : 'Contribution total'}
            </span>
            <span className="text-[1.2rem] font-extrabold text-navy">
              ${finalAmount!.toFixed(2)}
              {mode === 'monthly' && <span className="text-[0.78rem] font-normal text-muted">/mo</span>}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 bg-[#fdecea] border border-[#f3c4c0] text-danger rounded-xl px-4 py-3 text-[0.88rem]">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={processing || !stripe}
        className="w-full mt-5 bg-gold text-white rounded-full px-6 py-4.5 font-bold uppercase tracking-wider text-[0.85rem] disabled:opacity-60 transition-opacity"
      >
        {processing
          ? 'Processing…'
          : mode === 'monthly'
          ? `Start Monthly Giving${finalAmount ? ` — $${finalAmount.toFixed(2)}/mo` : ''}`
          : `Donate Now${finalAmount ? ` — $${finalAmount.toFixed(2)}` : ''}`}
      </button>

      <p className="text-center text-[0.75rem] text-muted mt-3">
        Secured by Stripe. Your card details are never stored by HaBayit.
      </p>

      <div className="text-center mt-10 pt-8 border-t border-line">
        <p className="text-muted text-[0.9rem] mb-3.5">Considering a monthly gift of $150 or more?</p>
        <Link
          href="/chai-partner"
          className="inline-block bg-navy text-white rounded-full px-10 py-4 font-bold uppercase tracking-wider text-[0.84rem]"
        >
          Become a Chai Partner
        </Link>
      </div>
    </form>
  );
}

function ToggleButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-7.5 py-3 rounded-full text-[0.8rem] font-bold uppercase tracking-wider transition-all ${
        active ? 'bg-navy text-white' : 'text-muted'
      }`}
    >
      {children}
    </button>
  );
}

function AmountButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-soft border-[1.5px] rounded-xl py-5 text-center text-[1.2rem] font-extrabold text-navy transition-all ${
        active ? 'border-gold bg-white shadow-[0_0_0_2px_var(--color-gold)]' : 'border-line'
      }`}
    >
      {children}
    </button>
  );
}
