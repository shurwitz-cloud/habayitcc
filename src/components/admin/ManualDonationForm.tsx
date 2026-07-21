'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const METHODS = ['Zelle', 'Zeffy', 'Check', 'Cash', 'Credit Card', 'ACH', 'Other'] as const;

const empty = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  amount: '',
  paidAtLocal: '',
  campaign: '',
  memo: '',
};

export function ManualDonationForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<(typeof METHODS)[number]>('Zelle');
  const [donationType, setDonationType] = useState<'One-Time' | 'Monthly'>('One-Time');
  const [form, setForm] = useState(empty);
  // Default off — check only when you want a receipt (e.g. Zelle yes, Zeffy often no).
  const [sendEmail, setSendEmail] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  function setField(key: keyof typeof empty, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus('error');
      setMessage('Enter a valid amount.');
      return;
    }

    let paidAt: string | undefined;
    if (form.paidAtLocal.trim()) {
      const d = new Date(form.paidAtLocal);
      if (!Number.isNaN(d.getTime())) paidAt = d.toISOString();
    }

    try {
      const res = await fetch('/api/admin/manual-donation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone || undefined,
          amount,
          paymentMethod,
          donationType,
          campaign: form.campaign || undefined,
          memo: form.memo || undefined,
          paidAt,
          sendEmail,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        duplicate?: boolean;
        emailed?: boolean;
        paymentMethod?: string;
      };
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Could not save donation.');
        return;
      }
      setStatus('done');
      if (data.duplicate) {
        setMessage('Already in CRM (duplicate). No new email sent.');
      } else {
        setMessage(
          `Saved ${paymentMethod} donation.$${
            data.emailed ? ' Receipt email sent.' : ' No email sent.'
          }`
        );
      }
      setForm(empty);
      router.refresh();
    } catch {
      setStatus('error');
      setMessage('Network error — try again.');
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-[#d4cfc4] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#172643]">Add donation manually</p>
          <p className="text-sm text-[#6f6a60] mt-0.5">
            Zelle, Zeffy, check, cash, and more. Receipt email is optional — leave unchecked for
            Zeffy if they already got a receipt from Zeffy.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setStatus('idle');
            setMessage('');
          }}
          className="rounded bg-[#172643] px-4 py-2 text-sm font-medium text-white"
        >
          {open ? 'Close' : 'New donation'}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-4 border-t border-[#e4ded2] pt-4">
          <div>
            <p className="mb-2 text-sm font-medium text-[#172643]">Payment method</p>
            <div className="flex flex-wrap gap-2">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(m);
                    // Nudge: Zelle often wants a Habayit receipt; Zeffy often does not.
                    if (m === 'Zelle') setSendEmail(true);
                    if (m === 'Zeffy') setSendEmail(false);
                  }}
                  className={`rounded-full px-3 py-1.5 text-sm border ${
                    paymentMethod === m
                      ? 'bg-[#172643] text-white border-[#172643]'
                      : 'bg-white text-[#172643] border-[#d4cfc4]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2 text-[#172643]">
              <input
                type="radio"
                name="donation-freq"
                checked={donationType === 'One-Time'}
                onChange={() => setDonationType('One-Time')}
              />
              One-time
            </label>
            <label className="flex items-center gap-2 text-[#172643]">
              <input
                type="radio"
                name="donation-freq"
                checked={donationType === 'Monthly'}
                onChange={() => setDonationType('Monthly')}
              />
              Monthly
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" value={form.firstName} onChange={(v) => setField('firstName', v)} required />
            <Field label="Last name" value={form.lastName} onChange={(v) => setField('lastName', v)} required />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(v) => setField('email', v)}
              required
              className="sm:col-span-2"
            />
            <Field label="Phone" value={form.phone} onChange={(v) => setField('phone', v)} />
            <Field
              label="Amount ($)"
              type="number"
              value={form.amount}
              onChange={(v) => setField('amount', v)}
              required
              min={1}
              step="0.01"
            />
            <Field
              label="Paid at (optional)"
              type="datetime-local"
              value={form.paidAtLocal}
              onChange={(v) => setField('paidAtLocal', v)}
            />
            <Field
              label="Campaign (optional)"
              value={form.campaign}
              onChange={(v) => setField('campaign', v)}
              placeholder={paymentMethod === 'Zelle' ? 'zelle' : paymentMethod === 'Zeffy' ? 'zeffy' : ''}
            />
            <Field
              label="Memo (optional)"
              value={form.memo}
              onChange={(v) => setField('memo', v)}
              className="sm:col-span-2"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-[#172643]">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Send Habayit tax-receipt email
              {paymentMethod === 'Zeffy'
                ? ' (usually leave off — Zeffy already receipts)'
                : paymentMethod === 'Zelle'
                  ? ' (recommended for Zelle)'
                  : ''}
            </span>
          </label>

          <button
            type="submit"
            disabled={status === 'saving'}
            className="rounded bg-[#b8902a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {status === 'saving' ? 'Saving…' : 'Save to CRM'}
          </button>

          {message ? (
            <p className={`text-sm ${status === 'error' ? 'text-red-700' : 'text-[#4a6741]'}`}>
              {message}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  className = '',
  min,
  step,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  className?: string;
  min?: number;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className={`block text-sm text-[#172643] ${className}`}>
      <span className="mb-1 block font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        min={min}
        step={step}
        placeholder={placeholder}
        className="w-full rounded border border-[#d4cfc4] px-3 py-2 text-sm"
      />
    </label>
  );
}
