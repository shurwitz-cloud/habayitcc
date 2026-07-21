'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type EntryType = 'chai_partner' | 'donation';

const empty = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  street: '',
  city: '',
  state: '',
  zip: '',
  amount: '',
  paidAtLocal: '',
  campaign: '',
  memo: '',
};

export function ManualZeffyEntryForm({ defaultType = 'chai_partner' }: { defaultType?: EntryType }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<EntryType>(defaultType);
  const [form, setForm] = useState(empty);
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
      const res = await fetch('/api/admin/zeffy-manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          type,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone || undefined,
          street: form.street || undefined,
          city: form.city || undefined,
          state: form.state || undefined,
          zip: form.zip || undefined,
          amount,
          paidAt,
          sendEmail,
          campaign: form.campaign || undefined,
          memo: form.memo || undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        accessCode?: string;
        duplicate?: boolean;
        emailed?: boolean;
        donationId?: string;
        partnerId?: string;
      };
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Could not save entry.');
        return;
      }
      setStatus('done');
      if (data.duplicate) {
        setMessage('Already in CRM (duplicate). No new email sent.');
      } else if (type === 'chai_partner') {
        setMessage(
          `Saved Chai Partner${data.accessCode ? ` — code ${data.accessCode}` : ''}.${
            data.emailed ? ' Welcome email sent.' : ' No email sent.'
          }`
        );
      } else {
        setMessage(
          `Saved donation.${data.emailed ? ' Receipt email sent.' : ' No email sent.'}`
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
          <p className="text-sm font-semibold text-[#172643]">Add Zeffy entry manually</p>
          <p className="text-sm text-[#6f6a60] mt-0.5">
            When the webhook misses a gift — enter details yourself. Email is optional and off by
            default unless you check the box.
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
          {open ? 'Close' : 'New Zeffy entry'}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-4 border-t border-[#e4ded2] pt-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2 text-[#172643]">
              <input
                type="radio"
                name="zeffy-type"
                checked={type === 'chai_partner'}
                onChange={() => setType('chai_partner')}
              />
              Chai Partner (monthly, $150+)
            </label>
            <label className="flex items-center gap-2 text-[#172643]">
              <input
                type="radio"
                name="zeffy-type"
                checked={type === 'donation'}
                onChange={() => setType('donation')}
              />
              Donor (one-time gift)
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
              label={type === 'chai_partner' ? 'Monthly amount ($)' : 'Amount ($)'}
              type="number"
              value={form.amount}
              onChange={(v) => setField('amount', v)}
              required
              min={type === 'chai_partner' ? 150 : 1}
              step="0.01"
            />
            <Field
              label="Street"
              value={form.street}
              onChange={(v) => setField('street', v)}
              className="sm:col-span-2"
            />
            <Field label="City" value={form.city} onChange={(v) => setField('city', v)} />
            <Field label="State" value={form.state} onChange={(v) => setField('state', v)} />
            <Field label="ZIP" value={form.zip} onChange={(v) => setField('zip', v)} />
            <Field
              label="Paid at (optional)"
              type="datetime-local"
              value={form.paidAtLocal}
              onChange={(v) => setField('paidAtLocal', v)}
            />
            {type === 'donation' && (
              <>
                <Field
                  label="Campaign (optional)"
                  value={form.campaign}
                  onChange={(v) => setField('campaign', v)}
                  placeholder="zeffy"
                />
                <Field
                  label="Memo (optional)"
                  value={form.memo}
                  onChange={(v) => setField('memo', v)}
                  className="sm:col-span-2"
                />
              </>
            )}
          </div>

          <label className="flex items-start gap-2 text-sm text-[#172643]">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              {type === 'chai_partner'
                ? 'Send Chai Partner welcome email (with access code)'
                : 'Send donation tax-receipt email'}
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
