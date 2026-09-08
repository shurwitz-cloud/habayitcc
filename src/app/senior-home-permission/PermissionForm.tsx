'use client';

import { useState } from 'react';
import { submitSeniorHomePermission } from './actions';

export function SeniorHomePermissionForm() {
  const [childName, setChildName] = useState('');
  const [parentName, setParentName] = useState('');
  const [email, setEmail] = useState('');
  const [permissionYes, setPermissionYes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const result = await submitSeniorHomePermission({
      childName,
      parentName,
      email,
      permissionYes,
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
      <div className="py-2 text-center">
        <h3 className="font-display text-[1.8rem] text-navy">Permission received</h3>
        <p className="mt-3 text-[1rem] leading-relaxed text-muted">
          Thank you, {parentName.trim() || 'friend'}! We&apos;ve recorded permission for{' '}
          <strong className="text-navy">{childName.trim()}</strong> to join the senior
          home visit.
        </p>
        <p className="mt-4 text-[0.95rem] text-navy/80">
          A confirmation was sent to <strong>{email.trim()}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="Child’s Name" required>
        <input
          value={childName}
          onChange={(e) => setChildName(e.target.value)}
          placeholder="Child’s full name"
          required
          autoComplete="name"
        />
      </Field>

      <Field label="Parent / Guardian Name" required>
        <input
          value={parentName}
          onChange={(e) => setParentName(e.target.value)}
          placeholder="Your full name"
          required
          autoComplete="name"
        />
      </Field>

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

      <div className="rounded-2xl border border-line bg-soft/70 px-4 py-4">
        <p className="mb-3 text-[0.78rem] font-bold uppercase tracking-wide text-navy">
          Permission <span className="text-gold">*</span>
        </p>
        <label className="flex cursor-pointer items-start gap-3 text-[0.95rem] leading-relaxed text-ink">
          <input
            type="checkbox"
            checked={permissionYes}
            onChange={(e) => setPermissionYes(e.target.checked)}
            className="mt-1 h-4 w-4 flex-shrink-0"
            required
          />
          <span>
            <strong>YES</strong>, I give permission for my child to participate in the
            visit to the senior home and to be transported to and from the senior home by
            a designated adult driver.
          </span>
        </label>
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#f3c4c0] bg-[#fdecea] px-5 py-3.5 text-[0.9rem] text-red-700">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-gold px-6 py-4 text-[0.9rem] font-black uppercase tracking-wider text-white transition-opacity disabled:opacity-60"
      >
        {submitting ? 'Submitting…' : 'Submit Permission'}
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
