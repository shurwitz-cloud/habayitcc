'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const METHODS = ['Zelle', 'Cash', 'Check', 'Cash App', 'Other'] as const;
type PaymentMethod = (typeof METHODS)[number];

type Partner = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  monthly_amount: number | string;
};

/** Whole months covered by amount at a monthly rate (cent-tolerant). */
export function monthsCoveredByAmount(
  amount: number,
  monthly: number,
): { months: number; exact: boolean } | null {
  if (!(amount > 0) || !(monthly > 0)) return null;
  const ratio = amount / monthly;
  const months = Math.round(ratio);
  if (months < 1 || months > 36) return null;
  const exact = Math.abs(amount - months * monthly) < 0.02;
  return { months, exact };
}

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * Record a Zelle/cash/etc. payment against an existing Chai partner (renewal).
 * Months covered = amount ÷ monthly rate (default). Optional: change monthly rate.
 */
export function ChaiAddPaymentForm({ partner }: { partner: Partner }) {
  const router = useRouter();
  const partnerMonthly = Number(partner.monthly_amount) || 150;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Zelle');
  const [methodOther, setMethodOther] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [paidAtLocal, setPaidAtLocal] = useState('');
  const [memo, setMemo] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [includeReceiptLink, setIncludeReceiptLink] = useState(false);
  const [changeMonthly, setChangeMonthly] = useState(false);
  const [monthlyInput, setMonthlyInput] = useState(String(partnerMonthly));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const effectiveMonthly = changeMonthly
    ? Number(monthlyInput)
    : partnerMonthly;

  const amountNum = Number(amount);
  const coverage = useMemo(
    () =>
      Number.isFinite(amountNum) && amountNum > 0 && Number.isFinite(effectiveMonthly)
        ? monthsCoveredByAmount(amountNum, effectiveMonthly)
        : null,
    [amountNum, effectiveMonthly],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('Enter the amount they paid.');
      return;
    }
    if (!Number.isFinite(effectiveMonthly) || effectiveMonthly < 150) {
      setError('Monthly rate must be at least $150.');
      return;
    }
    if (!coverage?.exact) {
      setError(
        `Amount should be a whole multiple of ${formatUsd(effectiveMonthly)}/mo ` +
          `(e.g. ${formatUsd(effectiveMonthly * 4)} = 4 months).`,
      );
      return;
    }

    let paidAt: string | undefined;
    if (paidAtLocal.trim()) {
      const d = new Date(paidAtLocal);
      if (!Number.isNaN(d.getTime())) paidAt = d.toISOString();
    }

    const confirmed = window.confirm(
      `Record ${formatUsd(amountNum)} via ${paymentMethod} for ${partner.first_name} ${partner.last_name}?\n` +
        `Covers ${coverage.months} month${coverage.months === 1 ? '' : 's'} at ${formatUsd(effectiveMonthly)}/mo` +
        (changeMonthly && effectiveMonthly !== partnerMonthly
          ? `\nAlso update monthly rate to ${formatUsd(effectiveMonthly)}.`
          : ''),
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const res = await fetch('/api/admin/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          kind: 'chai_partner',
          firstName: partner.first_name,
          lastName: partner.last_name,
          email: partner.email,
          phone: partner.phone || undefined,
          amount: amountNum,
          monthlyAmount: effectiveMonthly,
          paymentMethod,
          paymentMethodOther: paymentMethod === 'Other' ? methodOther || undefined : undefined,
          checkNumber:
            paymentMethod === 'Check' && checkNumber.trim() ? checkNumber.trim() : undefined,
          coverageMonths: coverage.months,
          paidAt,
          memo: memo.trim() || undefined,
          sendEmail,
          includeReceiptLink: sendEmail && includeReceiptLink,
          paymentKey: `manual-chai-renewal-${partner.id}-${Date.now()}`,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        duplicate?: boolean;
        emailed?: boolean;
        paymentMethod?: string;
      };
      if (!res.ok) {
        setError(data.error || 'Could not record payment.');
        return;
      }
      if (data.duplicate) {
        setError('That payment was already recorded (duplicate).');
        return;
      }
      setSuccess(
        `Recorded ${formatUsd(amountNum)} via ${data.paymentMethod || paymentMethod} · ` +
          `${coverage.months} month${coverage.months === 1 ? '' : 's'}.` +
          (data.emailed ? ' Email sent.' : ''),
      );
      setAmount('');
      setPaidAtLocal('');
      setMemo('');
      setCheckNumber('');
      setMethodOther('');
      setSendEmail(false);
      setIncludeReceiptLink(false);
      setChangeMonthly(false);
      setMonthlyInput(String(effectiveMonthly));
      router.refresh();
    } catch {
      setError('Could not record payment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-white p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-navy">Add payment</p>
          <p className="text-xs text-muted">
            Enter what they paid — months are calculated from {formatUsd(partnerMonthly)}/mo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setError('');
            setSuccess('');
          }}
          className="rounded-full border border-line bg-soft px-3 py-1.5 text-xs font-semibold text-navy hover:bg-white"
        >
          {open ? 'Close' : 'Add payment'}
        </button>
      </div>

      {open ? (
        <form className="space-y-3 border-t border-line pt-3" onSubmit={(e) => void submit(e)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-navy sm:col-span-2">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-wide text-muted">
                Amount paid
              </span>
              <input
                type="number"
                min={1}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(partnerMonthly)}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm"
                required
              />
              {coverage?.exact ? (
                <span className="mt-1 block text-xs text-emerald-800">
                  Covers {coverage.months} month{coverage.months === 1 ? '' : 's'} at{' '}
                  {formatUsd(effectiveMonthly)}/mo
                </span>
              ) : amount.trim() && Number.isFinite(amountNum) && amountNum > 0 ? (
                <span className="mt-1 block text-xs text-amber-800">
                  Not a whole multiple of {formatUsd(effectiveMonthly)}/mo
                </span>
              ) : (
                <span className="mt-1 block text-xs text-muted">
                  e.g. {formatUsd(partnerMonthly * 4)} → 4 months
                </span>
              )}
            </label>

            <label className="block text-sm text-navy">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-wide text-muted">
                Method
              </span>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm bg-white"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-navy">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-wide text-muted">
                Paid date <span className="font-normal normal-case">(optional)</span>
              </span>
              <input
                type="datetime-local"
                value={paidAtLocal}
                onChange={(e) => setPaidAtLocal(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm"
              />
            </label>
          </div>

          {paymentMethod === 'Check' ? (
            <label className="block text-sm text-navy">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-wide text-muted">
                Check #
              </span>
              <input
                type="text"
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm"
              />
            </label>
          ) : null}

          {paymentMethod === 'Other' ? (
            <label className="block text-sm text-navy">
              <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-wide text-muted">
                Method detail
              </span>
              <input
                type="text"
                value={methodOther}
                onChange={(e) => setMethodOther(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm"
              />
            </label>
          ) : null}

          <label className="block text-sm text-navy">
            <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-wide text-muted">
              Memo <span className="font-normal normal-case">(optional)</span>
            </span>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="e.g. Oct Zelle"
              className="w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
          </label>

          <div className="rounded-xl border border-dashed border-line bg-soft/40 px-3 py-2 space-y-2">
            <label className="flex items-center gap-2 text-sm text-navy cursor-pointer">
              <input
                type="checkbox"
                checked={changeMonthly}
                onChange={(e) => {
                  setChangeMonthly(e.target.checked);
                  if (e.target.checked) setMonthlyInput(String(partnerMonthly));
                }}
              />
              Update monthly amount
            </label>
            {changeMonthly ? (
              <label className="block text-sm text-navy">
                <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-wide text-muted">
                  New monthly rate
                </span>
                <input
                  type="number"
                  min={150}
                  step="0.01"
                  value={monthlyInput}
                  onChange={(e) => setMonthlyInput(e.target.value)}
                  className="w-full max-w-xs rounded-xl border border-line bg-white px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-muted">
                  Months for this payment will use the new rate. CRM monthly is updated when you
                  record.
                </span>
              </label>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-navy">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => {
                  setSendEmail(e.target.checked);
                  if (!e.target.checked) setIncludeReceiptLink(false);
                }}
              />
              Email receipt
            </label>
            {sendEmail ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeReceiptLink}
                  onChange={(e) => setIncludeReceiptLink(e.target.checked)}
                />
                Include tax-receipt link
              </label>
            ) : null}
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-800">{success}</p> : null}

          <button
            type="submit"
            disabled={busy || !coverage?.exact}
            className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy
              ? 'Saving…'
              : coverage?.exact
                ? `Record ${formatUsd(amountNum)} · ${coverage.months} mo`
                : 'Record payment'}
          </button>
        </form>
      ) : null}
    </div>
  );
}

/** Change CRM monthly rate without recording a payment. */
export function ChaiUpdateMonthlyForm({ partner }: { partner: Partner }) {
  const router = useRouter();
  const partnerMonthly = Number(partner.monthly_amount) || 150;
  const [open, setOpen] = useState(false);
  const [monthlyInput, setMonthlyInput] = useState(String(partnerMonthly));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const monthly = Number(monthlyInput);
    if (!Number.isFinite(monthly) || monthly < 150) {
      setError('Monthly amount must be at least $150.');
      return;
    }
    if (monthly === partnerMonthly) {
      setError('Enter a different monthly amount.');
      return;
    }
    if (
      !window.confirm(
        `Update ${partner.first_name} ${partner.last_name} to ${formatUsd(monthly)}/mo?`,
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/admin/chai-update-monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          partnerId: partner.id,
          monthlyAmount: monthly,
        }),
      });
      const data = (await res.json()) as { error?: string; monthlyAmount?: number };
      if (!res.ok) {
        setError(data.error || 'Could not update monthly amount.');
        return;
      }
      setSuccess(`Monthly updated to ${formatUsd(Number(data.monthlyAmount ?? monthly))}.`);
      setOpen(false);
      router.refresh();
    } catch {
      setError('Could not update monthly amount.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMonthlyInput(String(partnerMonthly));
            setError('');
            setSuccess('');
          }}
          className="text-xs font-semibold text-navy underline-offset-2 hover:underline"
        >
          Edit monthly amount
        </button>
      ) : (
        <form
          className="rounded-xl border border-line bg-white p-3 space-y-2 max-w-sm"
          onSubmit={(e) => void submit(e)}
        >
          <p className="text-sm font-semibold text-navy">Update monthly amount</p>
          <label className="block text-sm text-navy">
            <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-wide text-muted">
              Monthly rate
            </span>
            <input
              type="number"
              min={150}
              step="0.01"
              value={monthlyInput}
              onChange={(e) => setMonthlyInput(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-800">{success}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save monthly'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-navy"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
