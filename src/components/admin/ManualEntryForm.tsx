'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const METHODS = ['Zelle', 'Zeffy', 'Cash', 'Check', 'Cash App', 'Other'] as const;
type PaymentMethod = (typeof METHODS)[number];
type EntryKind = 'one_time' | 'monthly' | 'chai_partner';

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
  methodOther: '',
  checkNumber: '',
  spouseFirstName: '',
  spouseLastName: '',
  spouseEmail: '',
  spousePhone: '',
};

export function ManualEntryForm({
  defaultKind = 'one_time',
}: {
  defaultKind?: EntryKind;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EntryKind>(defaultKind);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Zelle');
  const [form, setForm] = useState(empty);
  const [includeSpouse, setIncludeSpouse] = useState(false);
  const [paidUpfront, setPaidUpfront] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [includeReceiptLink, setIncludeReceiptLink] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const amountNumber = Number(form.amount);
  const prepaidMonthly =
    kind === 'chai_partner' &&
    paidUpfront &&
    Number.isFinite(amountNumber) &&
    amountNumber > 0
      ? Math.round((amountNumber / 12) * 100) / 100
      : null;

  function setField(key: keyof typeof empty, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onMethodChange(m: PaymentMethod) {
    setPaymentMethod(m);
    if (m === 'Zelle' || m === 'Cash App') {
      setSendEmail(true);
      setIncludeReceiptLink(true);
    } else if (m === 'Zeffy') {
      setSendEmail(false);
      setIncludeReceiptLink(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');
    setReceiptUrl(null);

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus('error');
      setMessage('Enter a valid amount.');
      return;
    }

    if (includeSpouse && !form.spouseFirstName.trim()) {
      setStatus('error');
      setMessage('Spouse first name is required when adding a spouse.');
      return;
    }

    let paidAt: string | undefined;
    if (form.paidAtLocal.trim()) {
      const d = new Date(form.paidAtLocal);
      if (!Number.isNaN(d.getTime())) paidAt = d.toISOString();
    }

    try {
      const res = await fetch('/api/admin/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          kind,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone || undefined,
          street: form.street || undefined,
          city: form.city || undefined,
          state: form.state || undefined,
          zip: form.zip || undefined,
          amount,
          paymentMethod,
          paymentMethodOther: paymentMethod === 'Other' ? form.methodOther || undefined : undefined,
          checkNumber:
            paymentMethod === 'Check' && form.checkNumber.trim()
              ? form.checkNumber.trim()
              : undefined,
          paidAt,
          sendEmail,
          includeReceiptLink,
          paidUpfront: kind === 'chai_partner' && paidUpfront ? true : undefined,
          campaign: form.campaign || undefined,
          memo: form.memo || undefined,
          ...(includeSpouse
            ? {
                spouseFirstName: form.spouseFirstName,
                spouseLastName: form.spouseLastName || undefined,
                spouseEmail: form.spouseEmail || undefined,
                spousePhone: form.spousePhone || undefined,
              }
            : {}),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        accessCode?: string;
        duplicate?: boolean;
        emailed?: boolean;
        receiptUrl?: string | null;
        paymentMethod?: string;
        greeting?: string;
      };
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Could not save entry.');
        return;
      }
      setStatus('done');
      if (data.receiptUrl) setReceiptUrl(data.receiptUrl);
      if (data.duplicate) {
        setMessage('Already in CRM (duplicate). No new email sent.');
      } else {
        const kindLabel =
          kind === 'chai_partner' && paidUpfront
            ? 'Chai Partner (prepaid year)'
            : kind === 'chai_partner'
              ? 'Chai Partner'
              : kind === 'monthly'
                ? 'Monthly gift'
                : 'Donation';
        const monthlyNote =
          kind === 'chai_partner' && paidUpfront && Number.isFinite(amount)
            ? ` CRM monthly $${(Math.round((amount / 12) * 100) / 100).toFixed(2)}/mo.`
            : '';
        setMessage(
          `Saved ${kindLabel} via ${data.paymentMethod || paymentMethod}${
            data.greeting ? ` (${data.greeting})` : ''
          }.${monthlyNote}${data.accessCode ? ` Code ${data.accessCode}.` : ''}${
            data.emailed ? ' Email sent.' : ' No email sent.'
          }`,
        );
      }
      setForm(empty);
      setIncludeSpouse(false);
      setPaidUpfront(false);
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
          <p className="text-sm font-semibold text-[#172643]">Manual entry</p>
          <p className="text-sm text-[#6f6a60] mt-0.5">
            Record a gift that came in outside the website (Zelle, Zeffy, cash, check, etc.).
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setStatus('idle');
            setMessage('');
            setReceiptUrl(null);
          }}
          className="rounded bg-[#172643] px-4 py-2 text-sm font-medium text-white"
        >
          {open ? 'Close' : 'New entry'}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-4 border-t border-[#e4ded2] pt-4">
          <div>
            <p className="mb-2 text-sm font-medium text-[#172643]">Type</p>
            <div className="flex flex-wrap gap-4 text-sm">
              {(
                [
                  ['one_time', 'One-time'],
                  ['monthly', 'Monthly'],
                  ['chai_partner', 'Chai Partner'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-[#172643]">
                  <input
                    type="radio"
                    name="manual-entry-kind"
                    checked={kind === value}
                    onChange={() => {
                      setKind(value);
                      if (value !== 'chai_partner') setPaidUpfront(false);
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
            {kind === 'chai_partner' ? (
              <label className="mt-3 flex items-start gap-3 text-sm text-[#172643] cursor-pointer">
                <input
                  type="checkbox"
                  checked={paidUpfront}
                  onChange={(e) => setPaidUpfront(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Paid full year upfront</span>
                  <span className="mt-0.5 block text-[#6f6a60]">
                    Enter only the full amount they paid (e.g. 1800). CRM calculates monthly as
                    amount ÷ 12 (e.g. $150). Email and receipt use the full amount.
                  </span>
                </span>
              </label>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-[#172643]">
              <span className="mb-1 block font-medium">Payment method</span>
              <select
                value={paymentMethod}
                onChange={(e) => onMethodChange(e.target.value as PaymentMethod)}
                className="w-full rounded border border-[#d4cfc4] px-3 py-2 text-sm bg-white"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            {paymentMethod === 'Other' ? (
              <Field
                label="Other method (optional)"
                value={form.methodOther}
                onChange={(v) => setField('methodOther', v)}
                placeholder="e.g. Venmo, wire…"
              />
            ) : paymentMethod === 'Check' ? (
              <Field
                label="Check number (optional)"
                value={form.checkNumber}
                onChange={(v) => setField('checkNumber', v)}
                placeholder="e.g. 123"
              />
            ) : (
              <div className="hidden sm:block" />
            )}

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
            <div>
              <Field
                label={
                  kind === 'chai_partner'
                    ? paidUpfront
                      ? 'Full amount paid ($)'
                      : 'Monthly amount ($)'
                    : 'Amount ($)'
                }
                type="number"
                value={form.amount}
                onChange={(v) => setField('amount', v)}
                required
                min={kind === 'chai_partner' ? (paidUpfront ? 1800 : 150) : 1}
                step="0.01"
                placeholder={kind === 'chai_partner' && paidUpfront ? '1800' : undefined}
              />
              {prepaidMonthly != null ? (
                <p className="mt-1.5 text-sm text-[#172643]">
                  CRM monthly:{' '}
                  <strong>
                    ${prepaidMonthly.toFixed(2)}
                    /mo
                  </strong>{' '}
                  <span className="text-[#6f6a60]">(full amount ÷ 12)</span>
                  {prepaidMonthly < 150 ? (
                    <span className="block text-red-700 mt-0.5">
                      Must be at least $150/mo — enter at least $1,800 for a prepaid year.
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
            <Field
              label="Paid at (real date if entering late)"
              type="datetime-local"
              value={form.paidAtLocal}
              onChange={(v) => setField('paidAtLocal', v)}
            />
            {kind === 'chai_partner' ? (
              <>
                <Field
                  label="Memo (optional)"
                  value={form.memo}
                  onChange={(v) => setField('memo', v)}
                  className="sm:col-span-2"
                  placeholder="Optional note"
                />
                <Field label="Street" value={form.street} onChange={(v) => setField('street', v)} className="sm:col-span-2" />
                <Field label="City" value={form.city} onChange={(v) => setField('city', v)} />
                <Field label="State" value={form.state} onChange={(v) => setField('state', v)} />
                <Field label="ZIP" value={form.zip} onChange={(v) => setField('zip', v)} />
              </>
            ) : (
              <>
                <Field
                  label="Campaign (optional)"
                  value={form.campaign}
                  onChange={(v) => setField('campaign', v)}
                  placeholder="e.g. Purim, Lag BaOmer"
                />
                <Field
                  label="Memo (optional)"
                  value={form.memo}
                  onChange={(v) => setField('memo', v)}
                  className="sm:col-span-2"
                  placeholder="Shown on tax receipt if filled"
                />
              </>
            )}
          </div>

          <div className="rounded border border-[#e4ded2] px-3 py-3 space-y-3">
            <label className="flex items-start gap-3 text-sm text-[#172643] cursor-pointer">
              <input
                type="checkbox"
                checked={includeSpouse}
                onChange={(e) => setIncludeSpouse(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">Add spouse</span>
                <span className="mt-0.5 block text-[#6f6a60]">
                  Shared address. Thank-you email goes to both; receipt uses joint names.
                </span>
              </span>
            </label>

            {includeSpouse ? (
              <div className="grid gap-3 sm:grid-cols-2 border-t border-[#e4ded2] pt-3">
                <Field
                  label="Spouse first name"
                  value={form.spouseFirstName}
                  onChange={(v) => setField('spouseFirstName', v)}
                  required
                />
                <Field
                  label="Spouse last name (if different)"
                  value={form.spouseLastName}
                  onChange={(v) => setField('spouseLastName', v)}
                  placeholder="Leave blank if same last name"
                />
                <Field
                  label="Spouse email"
                  type="email"
                  value={form.spouseEmail}
                  onChange={(v) => setField('spouseEmail', v)}
                />
                <Field
                  label="Spouse phone"
                  value={form.spousePhone}
                  onChange={(v) => setField('spousePhone', v)}
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded border border-[#e4ded2] bg-[#faf8f4] px-3 py-3">
            <label className="flex items-start gap-3 text-sm text-[#172643] cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => {
                  const next = e.target.checked;
                  setSendEmail(next);
                  if (!next) setIncludeReceiptLink(false);
                }}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">Send email</span>
                <span className="mt-0.5 block text-[#6f6a60]">
                  {kind === 'chai_partner'
                    ? 'Welcome email with access code (to both emails if spouse added).'
                    : 'Thank-you email from HaBayit (to both emails if spouse added).'}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm text-[#172643] cursor-pointer">
              <input
                type="checkbox"
                checked={includeReceiptLink}
                onChange={(e) => {
                  const next = e.target.checked;
                  setIncludeReceiptLink(next);
                  if (next) setSendEmail(true);
                }}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">Add tax receipt link in email</span>
                <span className="mt-0.5 block text-[#6f6a60]">
                  {paymentMethod === 'Zeffy'
                    ? 'Usually leave off — Zeffy already receipts.'
                    : 'Includes a View & Print Tax Receipt button.'}
                </span>
              </span>
            </label>
          </div>

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

          {receiptUrl ? (
            <p className="text-sm text-[#172643]">
              Tax receipt link:{' '}
              <a
                href={receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[#b8902a] underline"
              >
                Open receipt
              </a>
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
