'use client';

import { useMemo, useState } from 'react';
import { Elements, useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import type { StripeCardElementOptions } from '@stripe/stripe-js';
import { stripePromise } from '@/lib/stripe/client';
import type { PaidEventConfig } from '@/lib/events/paid-events';
import {
  computePaidEventTotal,
  DINNER_ADULT_PRICE,
  DINNER_CHILD_PRICE,
  FAIR_CHILD_PRICE,
  WOMENS_TICKET_PRICE,
  totalToCents,
  type FairChildEntry,
} from '@/lib/events/paid-event-pricing';
import { submitPaidEventRegistration, verifyHebrewFairCodeAction } from './actions';

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

export function PaidEventForm({ event }: { event: PaidEventConfig }) {
  return (
    <Elements stripe={stripePromise}>
      <PaidEventFormInner event={event} />
    </Elements>
  );
}

function PaidEventFormInner({ event }: { event: PaidEventConfig }) {
  const stripe = useStripe();
  const elements = useElements();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [adults, setAdults] = useState(1);
  const [kids, setKids] = useState(0);
  const [women, setWomen] = useState(1);
  const [fairChildCount, setFairChildCount] = useState(1);
  const [hebrewStudent, setHebrewStudent] = useState(false);
  const [hebrewCodes, setHebrewCodes] = useState<string[]>(['']);
  const [fairCodeStatus, setFairCodeStatus] = useState<Record<number, 'valid' | 'invalid' | 'checking'>>({});

  const [sponsorPreset, setSponsorPreset] = useState<number | 'other' | null>(null);
  const [sponsorOther, setSponsorOther] = useState('');
  const [coverFee, setCoverFee] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState('');
  /** After Stripe succeeds, keep the PI so a failed CRM save can retry without recharging. */
  const [paidIntentId, setPaidIntentId] = useState<string | null>(null);

  const sponsorAmount = useMemo(() => {
    if (sponsorPreset === 'other') return parseFloat(sponsorOther) || 0;
    return sponsorPreset ?? 0;
  }, [sponsorPreset, sponsorOther]);

  const fairChildren: FairChildEntry[] = useMemo(
    () =>
      Array.from({ length: fairChildCount }, (_, i) => ({
        hebrewCode: hebrewStudent ? hebrewCodes[i] ?? '' : '',
      })),
    [fairChildCount, hebrewStudent, hebrewCodes]
  );

  const fairFreeChildIndices = useMemo(() => {
    const set = new Set<number>();
    if (!hebrewStudent) return set;
    fairChildren.forEach((child, i) => {
      if (child.hebrewCode?.trim() && fairCodeStatus[i] === 'valid') set.add(i);
    });
    return set;
  }, [hebrewStudent, fairChildren, fairCodeStatus]);

  const pricing = useMemo(
    () =>
      computePaidEventTotal({
        event,
        dinner: event.type === 'dinner' ? { adults, kids } : undefined,
        fair: event.type === 'family-fair' ? { children: fairChildren } : undefined,
        fairFreeChildIndices,
        womens: event.type === 'womens' ? { women } : undefined,
        sponsorAmount,
        coverFee,
      }),
    [event, adults, kids, women, fairChildren, fairFreeChildIndices, sponsorAmount, coverFee]
  );

  async function verifyFairCode(index: number, code: string) {
    if (!code.trim()) {
      setFairCodeStatus((s) => {
        const next = { ...s };
        delete next[index];
        return next;
      });
      return;
    }
    const normalized = code.trim().toUpperCase();
    const duplicate = hebrewCodes.some(
      (c, i) => i !== index && c.trim().toUpperCase() === normalized
    );
    if (duplicate) {
      setFairCodeStatus((s) => ({ ...s, [index]: 'invalid' }));
      return;
    }
    setFairCodeStatus((s) => ({ ...s, [index]: 'checking' }));
    const result = await verifyHebrewFairCodeAction(code, event.slug);
    setFairCodeStatus((s) => ({ ...s, [index]: result.valid ? 'valid' : 'invalid' }));
  }

  function updateHebrewCode(index: number, code: string) {
    setHebrewCodes((prev) => {
      const next = [...prev];
      next[index] = code;
      return next;
    });
    void verifyFairCode(index, code);
  }

  function addHebrewCodeField() {
    setHebrewCodes((prev) => {
      if (prev.length >= fairChildCount) return prev;
      return [...prev, ''];
    });
  }

  function setFairCount(n: number) {
    setFairChildCount(n);
    setHebrewCodes((prev) => prev.slice(0, n));
    setFairCodeStatus((s) => {
      const next = { ...s };
      Object.keys(next).forEach((key) => {
        if (Number(key) >= n) delete next[Number(key)];
      });
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    if (event.type === 'dinner' && adults + kids < 1) {
      setError('Please enter at least one adult or child.');
      return;
    }
    if (event.type === 'family-fair' && fairChildCount < 1) {
      setError('Please add at least one child.');
      return;
    }
    if (event.type === 'womens' && women < 1) {
      setError('Please enter how many women are attending.');
      return;
    }

    if (event.type === 'family-fair' && hebrewStudent) {
      if (!hebrewCodes[0]?.trim()) {
        setError('Please enter a HaBayit Hebrew code.');
        return;
      }
      const seen = new Set<string>();
      for (let i = 0; i < hebrewCodes.length; i++) {
        const code = hebrewCodes[i]?.trim();
        if (!code) {
          setError(`Please enter a HaBayit Hebrew code for child ${i + 1}.`);
          return;
        }
        const normalized = code.toUpperCase();
        if (seen.has(normalized)) {
          setError(`Each Hebrew code can only free one child. Duplicate code on child ${i + 1}.`);
          return;
        }
        seen.add(normalized);
        if (fairCodeStatus[i] !== 'valid') {
          setError(`Please enter a valid HaBayit Hebrew code for child ${i + 1}.`);
          return;
        }
      }
    }

    setProcessing(true);

    try {
      let paymentIntentId: string | undefined = paidIntentId ?? undefined;
      const totalCents = totalToCents(pricing.total);

      if (totalCents > 0) {
        if (!paymentIntentId) {
          if (!stripe || !elements) {
            setError('Payment is still loading. Please wait a moment.');
            return;
          }

          const cardElement = elements.getElement(CardElement);
          if (!cardElement) {
            setError('Please enter your card details.');
            return;
          }

          const res = await fetch('/api/stripe/event-payment-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slug: event.slug,
              amountCents: totalCents,
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              email: email.trim(),
              phone: phone.trim(),
              coverFee,
              sponsorAmount,
              dinner: event.type === 'dinner' ? { adults, kids } : undefined,
              fair: event.type === 'family-fair' ? { children: fairChildren } : undefined,
              womens: event.type === 'womens' ? { women } : undefined,
            }),
          });

          const data = (await res.json()) as {
            clientSecret?: string;
            paymentIntentId?: string;
            error?: string;
          };
          if (!res.ok || !data.clientSecret) {
            throw new Error(data.error ?? 'Could not initialize payment.');
          }

          const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
            data.clientSecret,
            {
              payment_method: {
                card: cardElement,
                billing_details: {
                  name: `${firstName.trim()} ${lastName.trim()}`,
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

          paymentIntentId = paymentIntent.id;
          setPaidIntentId(paymentIntent.id);
        }
      }

      const result = await submitPaidEventRegistration({
        slug: event.slug,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        coverFee,
        sponsorAmount,
        paymentIntentId,
        dinner: event.type === 'dinner' ? { adults, kids } : undefined,
        fair: event.type === 'family-fair' ? { children: fairChildren } : undefined,
        womens: event.type === 'womens' ? { women } : undefined,
      });

      if (!result.success) {
        throw new Error(result.error ?? 'Registration failed.');
      }

      if (result.receiptUrl) setReceiptUrl(result.receiptUrl);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-4">
        <div className="text-[3rem] mb-4">🎉</div>
        <h2 className="text-[2rem] text-navy font-bold mb-3">You&apos;re registered!</h2>
        <p className="text-muted text-[1rem] leading-relaxed mb-6">
          Thank you, {firstName}! We&apos;ve received your registration for{' '}
          <strong>{event.title}</strong> on {event.dateLabel}.
        </p>
        {receiptUrl && (
          <a
            href={receiptUrl}
            className="inline-block text-gold font-bold border-b border-gold pb-0.5 hover:text-navy"
          >
            View receipt
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Field label="First Name" required>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </Field>
        <Field label="Last Name" required>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Email" required>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Phone" required>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </Field>
      </div>

      {event.type === 'dinner' && (
        <div className="space-y-4 border-t border-line pt-5">
          <p className="text-[0.78rem] font-bold uppercase tracking-wide text-gold">Tickets</p>
          <StepperField
            label={`Adults — $${DINNER_ADULT_PRICE} each`}
            value={adults}
            onChange={setAdults}
            min={0}
            required
          />
          <StepperField
            label={`Children (12 & under) — $${DINNER_CHILD_PRICE} each`}
            value={kids}
            onChange={setKids}
            min={0}
            required
          />
        </div>
      )}

      {event.type === 'family-fair' && (
        <div className="space-y-4 border-t border-line pt-5">
          <StepperField
            label={`Children (ages 3–10) — $${FAIR_CHILD_PRICE} each`}
            value={fairChildCount}
            onChange={setFairCount}
            min={1}
            required
          />

          <div className="space-y-3">
            <p className="text-[0.78rem] font-bold uppercase tracking-wide text-navy">
              Free Admission For Children at HaBayit Hebrew
            </p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hebrewStudent}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setHebrewStudent(checked);
                  if (!checked) {
                    setHebrewCodes(['']);
                    setFairCodeStatus({});
                  }
                }}
              />
              <span className="text-[0.92rem] text-navy">My child is in HaBayit Hebrew</span>
            </label>
            {hebrewStudent && (
              <p className="text-[0.82rem] text-muted">
                Enter each child&apos;s unique code (one code per child). Each code works once for
                this event.
              </p>
            )}

            {hebrewStudent && (
              <div className="space-y-3">
                {hebrewCodes.map((code, i) => (
                  <div key={i} className="space-y-1.5">
                    <Field label={i === 0 ? 'HaBayit Hebrew Code' : `HaBayit Hebrew Code ${i + 1}`}>
                      <input
                        value={code}
                        onChange={(e) => updateHebrewCode(i, e.target.value)}
                        placeholder="HA-XXXXXX"
                        className="uppercase"
                      />
                    </Field>
                    {fairCodeStatus[i] === 'checking' && (
                      <p className="text-[0.8rem] text-muted">Checking code…</p>
                    )}
                    {fairCodeStatus[i] === 'valid' && (
                      <p className="text-[0.8rem] text-green-700 font-semibold">Code confirmed — free admission</p>
                    )}
                    {fairCodeStatus[i] === 'invalid' && (
                      <p className="text-[0.8rem] text-red-700">Code not recognized.</p>
                    )}
                  </div>
                ))}
                {fairChildCount > 1 && hebrewCodes.length < fairChildCount && (
                  <button
                    type="button"
                    onClick={addHebrewCodeField}
                    className="text-[0.85rem] font-bold text-navy border-b border-gold pb-0.5 hover:text-gold"
                  >
                    Add another HaBayit Hebrew Code
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {event.type === 'womens' && (
        <div className="border-t border-line pt-5">
          <StepperField
            label={`Women attending — $${WOMENS_TICKET_PRICE} each`}
            value={women}
            onChange={setWomen}
            min={1}
            required
          />
        </div>
      )}

      <SponsorSection
        presets={event.sponsorPresets}
        note={event.sponsorNote}
        preset={sponsorPreset}
        onPresetChange={setSponsorPreset}
        otherAmount={sponsorOther}
        onOtherChange={setSponsorOther}
      />

      <div className="border-t border-line pt-5 space-y-3">
        <p className="text-[0.78rem] font-bold uppercase tracking-wide text-gold">Order Summary</p>
        <SummaryLine label="Tickets" amount={pricing.ticketSubtotal} />
        {pricing.sponsorAmount > 0 && (
          <SummaryLine label="Sponsorship" amount={pricing.sponsorAmount} />
        )}
        {pricing.cardFee > 0 && <SummaryLine label="Card processing (3%)" amount={pricing.cardFee} />}
        <div className="flex justify-between font-bold text-navy text-[1.1rem] pt-2 border-t border-line">
          <span>Total</span>
          <span>${pricing.total.toFixed(2)}</span>
        </div>
      </div>

      {pricing.total > 0 && !paidIntentId && (
        <>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={coverFee}
              onChange={(e) => setCoverFee(e.target.checked)}
              className="mt-1"
            />
            <span className="text-[0.88rem] text-muted">
              Add 3% to cover credit card processing fees
              {coverFee && pricing.cardFee > 0 ? ` (+$${pricing.cardFee.toFixed(2)})` : ''}
            </span>
          </label>

          <Field label="Card Details" required>
            <div className="border border-line rounded-xl px-4 py-3.5 bg-white">
              <CardElement options={CARD_STYLE} />
            </div>
          </Field>
        </>
      )}

      {paidIntentId && pricing.total > 0 ? (
        <p className="text-[0.88rem] text-navy bg-soft/60 border border-line rounded-2xl px-5 py-3">
          Payment received. Completing your registration now…
        </p>
      ) : null}

      {error && (
        <div className="bg-[#fdecea] border border-[#f3c4c0] text-red-700 rounded-2xl px-5 py-3.5 text-[0.9rem]">
          {error}
          {paidIntentId ? (
            <p className="mt-2 text-[0.85rem] text-red-800/90">
              Your card was already charged. Tap the button again to finish saving your
              registration — you will not be charged again.
            </p>
          ) : null}
        </div>
      )}

      <button
        type="submit"
        disabled={processing}
        className="w-full bg-gold text-white rounded-full px-6 py-4 font-black uppercase tracking-wider text-[0.9rem] disabled:opacity-60 hover:bg-[#b8892a] transition-colors"
      >
        {processing
          ? 'Processing…'
          : paidIntentId
            ? 'Finish registration (no extra charge)'
            : pricing.total > 0
              ? `Register & Pay $${pricing.total.toFixed(2)}`
              : 'Complete Registration'}
      </button>
    </form>
  );
}

function SponsorSection({
  presets,
  note,
  preset,
  onPresetChange,
  otherAmount,
  onOtherChange,
}: {
  presets: number[];
  note?: string;
  preset: number | 'other' | null;
  onPresetChange: (v: number | 'other' | null) => void;
  otherAmount: string;
  onOtherChange: (v: string) => void;
}) {
  return (
    <div className="border-t border-line pt-5 space-y-3">
      <p className="text-[0.78rem] font-bold uppercase tracking-wide text-gold">Become a Sponsor</p>
      {note && <p className="text-[0.92rem] text-muted leading-relaxed">{note}</p>}
      <div className="flex flex-wrap gap-2">
        {presets.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => onPresetChange(preset === amt ? null : amt)}
            className={`px-4 py-2 rounded-full text-[0.8rem] font-bold border transition-colors ${
              preset === amt
                ? 'bg-gold text-white border-gold'
                : 'bg-white text-navy border-line hover:border-gold'
            }`}
          >
            ${amt}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPresetChange(preset === 'other' ? null : 'other')}
          className={`px-4 py-2 rounded-full text-[0.8rem] font-bold border transition-colors ${
            preset === 'other'
              ? 'bg-gold text-white border-gold'
              : 'bg-white text-navy border-line hover:border-gold'
          }`}
        >
          Other
        </button>
        {preset === 'other' && (
          <input
            type="number"
            min="1"
            step="1"
            value={otherAmount}
            onChange={(e) => onOtherChange(e.target.value)}
            placeholder="Amount"
            className="w-28 px-3 py-2 rounded-xl border border-line"
          />
        )}
      </div>
    </div>
  );
}

function SummaryLine({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between text-[0.92rem] text-muted">
      <span>{label}</span>
      <span>${amount.toFixed(2)}</span>
    </div>
  );
}

function StepperField({
  label,
  value,
  onChange,
  min,
  required,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  required?: boolean;
}) {
  return (
    <Field label={label} required={required}>
      <StepperCompact value={value} onChange={onChange} min={min} />
    </Field>
  );
}

function StepperCompact({
  value,
  onChange,
  min,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-10 h-10 rounded-full border border-line bg-soft text-navy font-bold text-xl flex items-center justify-center hover:bg-[#ede8e0] transition-colors"
      >
        −
      </button>
      <span className="text-[1.4rem] font-bold text-navy w-8 text-center tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-10 h-10 rounded-full border border-line bg-soft text-navy font-bold text-xl flex items-center justify-center hover:bg-[#ede8e0] transition-colors"
      >
        +
      </button>
    </div>
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
        {label} {required && <span className="text-gold">*</span>}
      </label>
      <div className="[&_input]:w-full [&_input]:border [&_input]:border-line [&_input]:rounded-xl [&_input]:px-4 [&_input]:py-3 [&_input]:text-[0.95rem] [&_input]:bg-white">
        {children}
      </div>
    </div>
  );
}
