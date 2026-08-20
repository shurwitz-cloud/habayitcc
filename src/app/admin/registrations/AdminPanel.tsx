'use client';

import { useState, useTransition } from 'react';
import { AdminNav } from '@/components/admin/AdminNav';
import type {
  PendingFamilyRegistration,
  ScheduledInstallment,
} from './actions';
import {
  acceptAndChargeFamily,
  acceptFamilyOnly,
  acceptFamilyOffline,
  chargeScheduledInstallment,
  recordOfflineInstallmentPayment,
} from './actions';
import {
  OFFLINE_TUITION_METHODS,
  type OfflineTuitionMethod,
} from '@/lib/programs/offline-tuition-methods';

export function StripeCheatSheet() {
  return (
    <div className="bg-white border border-line rounded-2xl p-6 mb-8 text-[0.9rem] leading-relaxed">
      <h2 className="text-xl font-bold text-navy mb-3">Stripe Dashboard cheat sheet</h2>
      <p className="text-muted mb-4">
        Use the buttons below first. If you need to charge manually in Stripe:
      </p>
      <ol className="list-decimal pl-5 space-y-3 text-muted">
        <li>
          Open{' '}
          <a
            href="https://dashboard.stripe.com/customers"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold font-semibold"
          >
            Stripe → Customers
          </a>{' '}
          and search the parent&apos;s <strong>email</strong>.
        </li>
        <li>
          Open the customer → confirm a <strong>saved card or bank</strong> appears (from
          registration).
        </li>
        <li>
          Click <strong>Create payment</strong> → enter the installment amount → select the saved
          payment method → confirm.
        </li>
        <li>
          For installment plans, charge the amount shown on Accept (tuition already reflects any
          pay-in-full / two-payment discount saved at registration). Card adds 3%.
        </li>
        <li>
          Enable ACH once:{' '}
          <a
            href="https://dashboard.stripe.com/settings/payment_methods"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold font-semibold"
          >
            Settings → Payment methods → US bank account
          </a>
          .
        </li>
      </ol>
      <p className="mt-4 text-[0.85rem] text-muted">
        ACH payments may show as <strong>Processing</strong> for a few business days before they
        succeed. To accept without charging Stripe: use <strong>Accept only</strong> (record payment
        later) or <strong>Accept &amp; record payment</strong> if you already have the check/Zelle.
      </p>
    </div>
  );
}

function OfflineMethodFields({
  method,
  detail,
  onMethod,
  onDetail,
}: {
  method: OfflineTuitionMethod;
  detail: string;
  onMethod: (m: OfflineTuitionMethod) => void;
  onDetail: (d: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-end">
      <label className="text-sm text-navy">
        <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-wide text-muted">
          Payment method
        </span>
        <select
          value={method}
          onChange={(e) => onMethod(e.target.value as OfflineTuitionMethod)}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
        >
          {OFFLINE_TUITION_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      {method === 'Check' || method === 'Other' ? (
        <label className="text-sm text-navy">
          <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-wide text-muted">
            {method === 'Check' ? 'Check number (optional)' : 'Other detail (optional)'}
          </span>
          <input
            type="text"
            value={detail}
            onChange={(e) => onDetail(e.target.value)}
            placeholder={method === 'Check' ? 'e.g. 123' : 'e.g. Venmo'}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm w-36"
          />
        </label>
      ) : null}
    </div>
  );
}

function OfflineAcceptControls({
  row,
  disabled,
  onAcceptOnly,
  onAcceptAndRecord,
}: {
  row: PendingFamilyRegistration;
  disabled: boolean;
  onAcceptOnly: () => void;
  onAcceptAndRecord: (method: OfflineTuitionMethod, detail?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<OfflineTuitionMethod>('Check');
  const [detail, setDetail] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="border border-line rounded-full px-5 py-2.5 text-sm font-semibold text-navy hover:bg-soft disabled:opacity-50"
      >
        Accept without charging…
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-line bg-soft/40 p-3 space-y-3">
      <p className="text-xs text-muted">
        No Stripe charge. Payment 1 is ${row.firstInstallment.toFixed(2)}.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const ok = window.confirm(
              `Accept ${row.parentName} for ${row.programName} now without recording payment?\n\nYou can add check/Zelle/etc. later under Scheduled installments.`,
            );
            if (!ok) return;
            onAcceptOnly();
          }}
          className="bg-navy text-white rounded-full px-5 py-2.5 font-bold text-sm uppercase tracking-wide disabled:opacity-50"
        >
          Accept only
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(false)}
          className="text-sm text-muted px-2 py-2"
        >
          Cancel
        </button>
      </div>
      <div className="border-t border-line pt-3 space-y-2">
        <p className="text-xs font-semibold text-navy">Or accept &amp; record payment now</p>
        <OfflineMethodFields
          method={method}
          detail={detail}
          onMethod={setMethod}
          onDetail={setDetail}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const ok = window.confirm(
              `Accept ${row.parentName} and record payment 1 ($${row.firstInstallment.toFixed(2)}) as ${method}${detail.trim() ? ` (${detail.trim()})` : ''}?`,
            );
            if (!ok) return;
            onAcceptAndRecord(method, detail.trim() || undefined);
          }}
          className="border border-navy text-navy rounded-full px-5 py-2.5 font-bold text-sm uppercase tracking-wide disabled:opacity-50"
        >
          Accept &amp; record payment
        </button>
      </div>
    </div>
  );
}

function RecordOfflinePaymentControls({
  row,
  disabled,
  onRecord,
}: {
  row: ScheduledInstallment;
  disabled: boolean;
  onRecord: (method: OfflineTuitionMethod, detail?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<OfflineTuitionMethod>('Check');
  const [detail, setDetail] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="border border-line rounded-full px-4 py-2 text-sm font-semibold text-navy hover:bg-soft disabled:opacity-50"
      >
        Record payment…
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-soft/40 p-3 space-y-2 w-full sm:w-auto">
      <OfflineMethodFields
        method={method}
        detail={detail}
        onMethod={setMethod}
        onDetail={setDetail}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const ok = window.confirm(
              `Record payment ${row.installmentNumber} ($${row.amount.toFixed(2)}) for ${row.familyName} as ${method}${detail.trim() ? ` (${detail.trim()})` : ''}?`,
            );
            if (!ok) return;
            onRecord(method, detail.trim() || undefined);
          }}
          className="bg-navy text-white rounded-full px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          Confirm
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(false)}
          className="text-sm text-muted px-2 py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function AdminRegistrationsPanel({
  pending,
  scheduled,
  role = 'admin',
}: {
  pending: PendingFamilyRegistration[];
  scheduled: ScheduledInstallment[];
  role?: 'admin' | 'volunteer';
}) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function runAction(action: () => Promise<{ success: boolean; error?: string; message?: string }>) {
    setMessage('');
    setError('');
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        setMessage(result.message ?? 'Done.');
      } else {
        setError(result.error ?? 'Failed.');
      }
    });
  }

  return (
    <div>
      <AdminNav role={role} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Program Registrations</h1>
        <p className="text-muted text-sm mt-1">
          Accept pending Hebrew Adventure, Achim, BMX, and Bloom registrations. Charge Stripe, accept
          only (record payment later), or accept and record check/Zelle/etc. now.
        </p>
      </div>

      <StripeCheatSheet />

      {(message || error) && (
        <div
          className={`rounded-2xl px-5 py-4 mb-6 ${error ? 'bg-[#fdecea] text-danger border border-[#f3c4c0]' : 'bg-soft border border-line text-navy'}`}
        >
          {error || message}
        </div>
      )}

      <h2 className="text-lg font-bold text-navy mb-3">
        Pending ({pending.length})
      </h2>

      {pending.length === 0 ? (
        <p className="text-muted mb-10">No pending registrations.</p>
      ) : (
        <div className="space-y-4 mb-10">
          {pending.map((row) => (
            <div
              key={`${row.familyId}-${row.programSlug}`}
              className="bg-white border border-line rounded-2xl p-5"
            >
              <div className="flex flex-wrap justify-between gap-3 mb-3">
                <div>
                  <p className="text-[0.72rem] uppercase tracking-wider text-gold font-bold mb-1">
                    {row.programName}
                  </p>
                  <p className="font-bold text-navy text-lg">{row.parentName}</p>
                  <p className="text-muted text-sm">{row.parentEmail}</p>
                </div>
                <div className="text-right text-sm">
                  <p>
                    <span className="text-muted">Plan:</span> {row.paymentPlan.replace(/_/g, ' ')}
                  </p>
                  <p>
                    <span className="text-muted">Method on file:</span>{' '}
                    {row.paymentMethod === 'card' ? 'Card (+3%)' : 'Bank (free)'}
                  </p>
                </div>
              </div>

              <ul className="text-sm text-muted mb-3 space-y-1">
                {row.children.map((c) => (
                  <li key={c.name}>
                    {c.name}
                    {c.grade ? ` · grade ${c.grade}` : ''} — ${c.tuition.toLocaleString()}
                  </li>
                ))}
              </ul>

              <p className="text-sm mb-4">
                <strong className="text-navy">
                  Accept & charge payment 1: ${row.firstInstallment.toFixed(2)}
                </strong>
                {' · '}
                total ${row.grandTotal.toFixed(2)} ({row.installmentCount} payment
                {row.installmentCount === 1 ? '' : 's'})
              </p>

              {!row.stripeCustomerId && (
                <p className="text-danger text-sm mb-3">
                  No Stripe payment method on file — use Accept only / Accept &amp; record payment,
                  or ask them to complete the registration payment step for card/ACH.
                </p>
              )}

              <div className="flex flex-wrap gap-3 items-start">
                <button
                  type="button"
                  disabled={isPending || !row.stripeCustomerId}
                  onClick={() =>
                    runAction(() => acceptAndChargeFamily(row.familyId, row.programSlug))
                  }
                  className="bg-gold text-white rounded-full px-5 py-2.5 font-bold text-sm uppercase tracking-wide disabled:opacity-50"
                >
                  Accept & charge
                </button>
                <OfflineAcceptControls
                  row={row}
                  disabled={isPending}
                  onAcceptOnly={() =>
                    runAction(() => acceptFamilyOnly(row.familyId, row.programSlug))
                  }
                  onAcceptAndRecord={(method, paymentDetail) =>
                    runAction(() =>
                      acceptFamilyOffline(row.familyId, row.programSlug, {
                        paymentMethod: method,
                        paymentDetail,
                      }),
                    )
                  }
                />
                {row.stripeCustomerUrl && (
                  <a
                    href={row.stripeCustomerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border border-line rounded-full px-5 py-2.5 text-sm font-semibold text-navy hover:bg-soft"
                  >
                    Open in Stripe
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-lg font-bold text-navy mb-3">
        Scheduled installments ({scheduled.length})
      </h2>
      <p className="text-sm text-muted mb-3">
        Includes payment 1 after <strong>Accept only</strong>. Use <strong>Record payment</strong>{' '}
        when the check/Zelle/cash arrives, or Charge now for Stripe.
      </p>

      {scheduled.length === 0 ? (
        <p className="text-muted">No upcoming installments.</p>
      ) : (
        <div className="space-y-3">
          {scheduled.map((row) => (
            <div
              key={row.id}
              className="bg-white border border-line rounded-xl p-4 flex flex-wrap items-start justify-between gap-3"
            >
              <div>
                <p className="font-semibold text-navy">{row.familyName}</p>
                <p className="text-sm text-muted">
                  Payment {row.installmentNumber} · ${row.amount.toFixed(2)} · due{' '}
                  {new Date(row.dueDate + 'T12:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {row.status !== 'scheduled' ? ` · ${row.status}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-start">
                <button
                  type="button"
                  disabled={isPending || row.status === 'processing' || !row.stripeCustomerUrl}
                  onClick={() => runAction(() => chargeScheduledInstallment(row.id))}
                  className="bg-navy text-white rounded-full px-4 py-2 text-sm font-bold disabled:opacity-50"
                  title={!row.stripeCustomerUrl ? 'No Stripe customer on file' : undefined}
                >
                  Charge now
                </button>
                <RecordOfflinePaymentControls
                  row={row}
                  disabled={isPending || row.status === 'processing'}
                  onRecord={(method, paymentDetail) =>
                    runAction(() =>
                      recordOfflineInstallmentPayment(row.id, {
                        paymentMethod: method,
                        paymentDetail,
                      }),
                    )
                  }
                />
                {row.stripeCustomerUrl && (
                  <a
                    href={row.stripeCustomerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border border-line rounded-full px-4 py-2 text-sm text-navy"
                  >
                    Stripe
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
