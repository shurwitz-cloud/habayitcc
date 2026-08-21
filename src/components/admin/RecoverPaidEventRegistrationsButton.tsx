'use client';

import { useState, useTransition } from 'react';

/**
 * One-click recovery for Stripe-paid event registrations that never landed in CRM.
 * Creates one CRM row per person/event and sends at most one confirmation email.
 */
export function RecoverPaidEventRegistrationsButton({
  defaultEmail = '',
}: {
  defaultEmail?: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function run(dryRun: boolean) {
    setMessage('');
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/recover-paid-event-registrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            confirm: true,
            dryRun,
            email: email.trim() || undefined,
            days: 14,
            oneRegistrationPerPerson: true,
            sendEmail: true,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          created?: number;
          wouldCreate?: number;
          results?: Array<{ pi: string; email: string; amount: number; action: string }>;
        };
        if (!res.ok) {
          setMessage(data.error ?? 'Recovery failed.');
          return;
        }
        if (dryRun) {
          setMessage(
            `Preview: ${data.wouldCreate ?? 0} registration(s) to create. Check console for details.`,
          );
          console.log('[recover paid events preview]', data);
          return;
        }
        setMessage(
          `Recovered ${data.created ?? 0} registration(s). Confirmation emailed once per person. Extra Stripe charges are noted for refund.`,
        );
        console.log('[recover paid events]', data);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Recovery failed.');
      }
    });
  }

  return (
    <div className="mx-4 mt-3 mb-1 p-3 rounded-xl border border-line bg-soft/40 space-y-2">
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">
        Recover Stripe event payments
      </p>
      <p className="text-xs text-muted">
        Pulls succeeded Stripe charges that never saved to CRM. One person → one CRM row + one
        confirmation email. You refund duplicate charges in Stripe.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Optional: filter by email"
          className="min-w-[220px] text-sm"
        />
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(true)}
          className="px-3 py-1.5 text-sm rounded-full border border-line bg-white font-semibold text-navy disabled:opacity-50"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(false)}
          className="px-3 py-1.5 text-sm rounded-full bg-navy text-white font-semibold disabled:opacity-50"
        >
          {isPending ? 'Working…' : 'Recover & email once'}
        </button>
      </div>
      {message ? <p className="text-sm text-navy font-medium">{message}</p> : null}
    </div>
  );
}
