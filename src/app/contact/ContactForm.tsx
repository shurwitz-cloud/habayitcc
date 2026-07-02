'use client';

import { useState } from 'react';
import { submitContactForm } from './actions';
import { HEBREW_ADVENTURE_NAME } from '@/lib/programs/names';

export function ContactForm() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    interest: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const result = await submitContactForm(form);
    setSubmitting(false);

    if (result.success) {
      setSubmitted(true);
      setForm({ firstName: '', lastName: '', email: '', phone: '', interest: '', message: '' });
    } else {
      setError(result.error || 'Something went wrong. Please try again.');
    }
  }

  if (submitted) {
    return (
      <div className="bg-soft border border-line rounded-[18px] p-9 text-center">
        <h3 className="text-[1.5rem] text-navy font-bold mb-2">Thank you!</h3>
        <p className="text-muted">We&apos;ll be in touch soon.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <input
          placeholder="First Name"
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          required
        />
        <input
          placeholder="Last Name"
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          required
        />
      </div>
      <input
        type="email"
        placeholder="Email Address"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        required
      />
      <input
        type="tel"
        placeholder="Phone (optional)"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />
      <select
        value={form.interest}
        onChange={(e) => setForm({ ...form, interest: e.target.value })}
      >
        <option value="" disabled>
          I&apos;m interested in...
        </option>
        <option>Shabbat &amp; Synagogue</option>
        <option>{HEBREW_ADVENTURE_NAME}</option>
        <option>Bar / Bat Mitzvah</option>
        <option>Chai Partnership</option>
        <option>General Information</option>
      </select>
      <textarea
        placeholder="Your message..."
        rows={4}
        value={form.message}
        onChange={(e) => setForm({ ...form, message: e.target.value })}
      />

      {error && <p className="text-danger text-[0.88rem]">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 bg-gold text-white rounded-full px-9 py-3.5 font-bold uppercase tracking-wider text-[0.8rem] disabled:opacity-60"
      >
        {submitting ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  );
}
