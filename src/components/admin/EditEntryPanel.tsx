'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Kind = 'donation' | 'goods';
type TypeTarget = 'one_time' | 'monthly' | 'goods_services';

const inputCls =
  'w-full rounded border border-line bg-white px-2 py-1 text-sm text-navy';
const labelCls = 'block text-[0.65rem] uppercase tracking-wide text-muted font-bold';

/**
 * Edit one payment's details, or reclassify it between donation and
 * goods/services. Both run as single database transactions with an
 * audit row. Saving never sends email; after a save the admin can
 * explicitly choose to send an updated receipt email.
 */
export default function EditEntryPanel({
  kind,
  paymentKey,
  initial,
  donationType,
  goodsInfo,
  defaultOpen = false,
}: {
  kind: Kind;
  paymentKey: string;
  initial: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    amount: string;
    memo: string;
    paidAt: string; // yyyy-mm-dd
    paymentMethod: string;
    campaign: string;
  };
  donationType?: string | null; // 'One-time' | 'Monthly' | ...
  goodsInfo?: {
    itemLabel: string;
    includeInYearEnd: boolean;
    includeAsDonation: boolean;
  } | null;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const currentTarget: TypeTarget =
    kind === 'goods'
      ? 'goods_services'
      : donationType === 'Monthly'
        ? 'monthly'
        : 'one_time';

  const [open, setOpen] = useState(defaultOpen);
  const [fields, setFields] = useState(initial);
  const [typeTarget, setTypeTarget] = useState<TypeTarget>(currentTarget);
  const [itemLabel, setItemLabel] = useState(goodsInfo?.itemLabel ?? 'Other');
  const [fmv, setFmv] = useState(initial.amount);
  const [includeYearEnd, setIncludeYearEnd] = useState(
    goodsInfo?.includeInYearEnd ?? false,
  );
  const [supersedeReceipt, setSupersedeReceipt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'failed'>(
    'idle',
  );

  const typeChanged = typeTarget !== currentTarget;
  const deductible =
    typeChanged && typeTarget !== 'goods_services' && kind === 'goods'
      ? Math.max(0, (Number(fields.amount) || 0) - (Number(fmv) || 0))
      : null;

  function field(key: keyof typeof initial, label: string, type = 'text') {
    return (
      <label className="block">
        <span className={labelCls}>{label}</span>
        <input
          className={inputCls}
          type={type}
          value={fields[key]}
          onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
        />
      </label>
    );
  }

  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const changes: Record<string, unknown> = {};
      if (fields.firstName.trim() !== initial.firstName)
        changes.first_name = fields.firstName.trim();
      if (fields.lastName.trim() !== initial.lastName)
        changes.last_name = fields.lastName.trim();
      if (fields.email.trim().toLowerCase() !== initial.email.toLowerCase())
        changes.email = fields.email.trim();
      if (fields.phone.trim() !== initial.phone) changes.phone = fields.phone.trim();
      if (Number(fields.amount) !== Number(initial.amount))
        changes.amount = Number(fields.amount);
      if (fields.memo !== initial.memo) changes.memo = fields.memo;
      if (fields.paidAt !== initial.paidAt)
        changes.paid_at = new Date(`${fields.paidAt}T12:00:00`).toISOString();
      if (fields.paymentMethod.trim() !== initial.paymentMethod)
        changes.payment_method = fields.paymentMethod.trim();
      if (kind === 'donation' && fields.campaign !== initial.campaign)
        changes.campaign = fields.campaign;
      if (kind === 'goods' && !typeChanged) {
        if (itemLabel.trim() && itemLabel.trim() !== (goodsInfo?.itemLabel ?? 'Other'))
          changes.item_label = itemLabel.trim();
        if (includeYearEnd !== (goodsInfo?.includeInYearEnd ?? false))
          changes.include_in_year_end = includeYearEnd;
      }

      if (Object.keys(changes).length > 0) {
        const res = await fetch('/api/admin/edit-entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            confirm: true,
            paymentKey,
            changes,
            supersedePriorReceipt:
              kind === 'donation' && supersedeReceipt ? true : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Edit failed.');
      }

      if (typeChanged) {
        const res = await fetch('/api/admin/reclassify-entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            confirm: true,
            paymentKey,
            toKind: typeTarget,
            goodsItemLabel:
              typeTarget === 'goods_services' ? itemLabel.trim() || 'Other' : undefined,
            goodsFmv:
              typeTarget !== 'goods_services' && kind === 'goods'
                ? Number(fmv)
                : undefined,
            includeInYearEnd: includeYearEnd,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Reclassify failed.');
      }

      if (Object.keys(changes).length === 0 && !typeChanged) {
        setError('Nothing changed.');
        return;
      }
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function resendEmail() {
    setEmailState('sending');
    try {
      const res = await fetch('/api/admin/resend-entry-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, paymentKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Send failed.');
      setEmailState('sent');
    } catch {
      setEmailState('failed');
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-xs font-bold uppercase tracking-wide text-gold hover:underline"
      >
        Edit entry
      </button>
    );
  }

  return (
    <div className="mt-3 rounded border border-line bg-white p-3">
      <p className="text-xs text-muted mb-3">
        Changes save as one transaction with an audit record. If a receipt or email
        for this payment was already sent, the old copy does not change by itself -
        after saving you can choose to send an updated email.
      </p>
      {kind === 'donation' && (
        <label className="mb-3 flex items-start gap-2 text-xs text-navy">
          <input
            type="checkbox"
            checked={supersedeReceipt}
            onChange={(e) => setSupersedeReceipt(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Replace previously emailed receipt links for this entry. Old links stop
            showing the outdated receipt and display a &quot;receipt replaced&quot;
            notice instead. Leave unchecked to keep old links working as they are.
          </span>
        </label>
      )}
      <div className="grid sm:grid-cols-3 gap-2">
        {field('firstName', 'First name')}
        {field('lastName', 'Last name')}
        {field('email', 'Email', 'email')}
        {field('phone', 'Phone')}
        {field('amount', 'Amount ($)', 'number')}
        {field('paidAt', 'Paid date', 'date')}
        {field('paymentMethod', 'Payment method')}
        {kind === 'donation' && field('campaign', 'Campaign')}
        <label className="block sm:col-span-2">
          <span className={labelCls}>Memo</span>
          <input
            className={inputCls}
            value={fields.memo}
            onChange={(e) => setFields({ ...fields, memo: e.target.value })}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Type / category</span>
          <select
            className={inputCls}
            value={typeTarget}
            onChange={(e) => setTypeTarget(e.target.value as TypeTarget)}
          >
            <option value="one_time">One-time donation</option>
            <option value="monthly">Monthly donation</option>
            <option value="goods_services">Goods / Services / Classes</option>
          </select>
        </label>
        {kind === 'goods' && !typeChanged && (
          <>
            <label className="block">
              <span className={labelCls}>Item</span>
              <input
                className={inputCls}
                value={itemLabel}
                onChange={(e) => setItemLabel(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-navy">
              <input
                type="checkbox"
                checked={includeYearEnd}
                onChange={(e) => setIncludeYearEnd(e.target.checked)}
              />
              Include in year-end goods &amp; services receipt
            </label>
          </>
        )}
        {typeChanged && typeTarget === 'goods_services' && (
          <>
            <label className="block">
              <span className={labelCls}>Item</span>
              <input
                className={inputCls}
                value={itemLabel}
                onChange={(e) => setItemLabel(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-navy">
              <input
                type="checkbox"
                checked={includeYearEnd}
                onChange={(e) => setIncludeYearEnd(e.target.checked)}
              />
              Include in year-end goods &amp; services receipt
            </label>
          </>
        )}
        {typeChanged && typeTarget !== 'goods_services' && kind === 'goods' && (
          <>
            <label className="block">
              <span className={labelCls}>Good-faith value of what they received ($)</span>
              <input
                className={inputCls}
                type="number"
                value={fmv}
                onChange={(e) => setFmv(e.target.value)}
              />
            </label>
            <p className="text-xs text-muted self-end">
              Potentially deductible portion: ${(deductible ?? 0).toFixed(2)} (IRS quid
              pro quo rules)
            </p>
            <label className="flex items-center gap-2 text-sm text-navy">
              <input
                type="checkbox"
                checked={includeYearEnd}
                onChange={(e) => setIncludeYearEnd(e.target.checked)}
              />
              Keep on year-end goods &amp; services receipt
            </label>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {saved && (
        <div className="mt-2 flex items-center gap-3">
          <p className="text-sm text-green-700">Saved.</p>
          {emailState === 'idle' && (
            <button
              type="button"
              onClick={resendEmail}
              className="text-xs font-bold uppercase tracking-wide text-gold hover:underline"
            >
              Send updated receipt email
            </button>
          )}
          {emailState === 'sending' && (
            <span className="text-xs text-muted">Sending email…</span>
          )}
          {emailState === 'sent' && (
            <span className="text-xs text-green-700">Updated email sent.</span>
          )}
          {emailState === 'failed' && (
            <span className="text-xs text-red-700">Email failed to send.</span>
          )}
        </div>
      )}
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded bg-navy px-3 py-1 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="text-xs font-bold uppercase tracking-wide text-muted hover:underline"
        >
          Close
        </button>
      </div>
    </div>
  );
}
