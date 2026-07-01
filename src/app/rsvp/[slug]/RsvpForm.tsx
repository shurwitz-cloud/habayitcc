'use client';

import { useState } from 'react';
import { submitRsvp } from './actions';
import type { EventConfig } from '@/lib/events/config';

export function RsvpForm({ event }: { event: EventConfig }) {
  const [firstName, setFirstName]   = useState('');
  const [lastName, setLastName]     = useState('');
  const [email, setEmail]           = useState('');
  const [phone, setPhone]           = useState('');
  const [attending, setAttending]   = useState(1);
  const [notes, setNotes]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [submitted, setSubmitted]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const result = await submitRsvp({
      slug: event.slug,
      firstName,
      lastName,
      email,
      phone,
      attending,
      notes,
    });

    setSubmitting(false);

    if (result.success) {
      setSubmitted(true);
    } else {
      setError(result.error || 'Something went wrong. Please try again.');
    }
  }

  if (submitted) {
    return (
      <div className="max-w-[560px] mx-auto text-center py-16">
        <div className="text-[3rem] mb-4">🎉</div>
        <h2 className="text-[2rem] text-navy font-bold mb-3">You&apos;re registered!</h2>
        <p className="text-muted text-[1rem] leading-relaxed">
          Thank you, {firstName}! We&apos;ve received your RSVP for{' '}
          <strong>{event.title}</strong> on {event.dateLabel} at {event.time}.
          {event.locationPrivate && (
            <> Location details will be sent to <strong>{email}</strong> closer to the event.</>
          )}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-[560px] mx-auto space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="First Name" required>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            required
          />
        </Field>
        <Field label="Last Name" required>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            required
          />
        </Field>
      </div>

      <Field label="Email" required>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
        />
      </Field>

      <Field label="Phone" required>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 555-5555"
          required
        />
      </Field>

      <Field label="Number of people attending" required>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAttending((n) => Math.max(1, n - 1))}
            className="w-10 h-10 rounded-full border border-line bg-soft text-navy font-bold text-xl flex items-center justify-center hover:bg-[#ede8e0] transition-colors"
          >
            −
          </button>
          <span className="text-[1.4rem] font-bold text-navy w-8 text-center tabular-nums">
            {attending}
          </span>
          <button
            type="button"
            onClick={() => setAttending((n) => n + 1)}
            className="w-10 h-10 rounded-full border border-line bg-soft text-navy font-bold text-xl flex items-center justify-center hover:bg-[#ede8e0] transition-colors"
          >
            +
          </button>
        </div>
      </Field>

      <Field label="Notes or Questions">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything you'd like us to know…"
          rows={3}
        />
      </Field>

      {event.locationPrivate && (
        <div className="bg-soft border border-line text-muted rounded-2xl px-5 py-3.5 text-[0.9rem]">
          <strong className="text-navy">Location note:</strong> The venue address will be sent to your email address upon registration.
        </div>
      )}

      {error && (
        <div className="bg-[#fdecea] border border-[#f3c4c0] text-red-700 rounded-2xl px-5 py-3.5 text-[0.9rem]">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-gold text-white rounded-full px-6 py-4 font-black uppercase tracking-wider text-[0.9rem] disabled:opacity-60 hover:bg-[#b8892a] transition-colors"
      >
        {submitting ? 'Submitting…' : 'RSVP Now'}
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
        {label} {required && <span className="text-gold">*</span>}
      </label>
      {children}
    </div>
  );
}
