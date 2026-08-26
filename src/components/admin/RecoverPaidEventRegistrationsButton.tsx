'use client';

import { useState, useTransition } from 'react';

const DEFAULT_EMAILS = ['adi_sagie@hotmail.com', 'rebecca.greenberg3@gmail.com'];

/**
 * CRM tools for paid-event Stripe recovery and duplicate cleanup.
 */
export function RecoverPaidEventRegistrationsButton({
  defaultEmails = DEFAULT_EMAILS,
}: {
  defaultEmails?: string[];
}) {
  const [emailsText, setEmailsText] = useState(defaultEmails.join(', '));
  const [message, setMessage] = useState('');
  const [dedupeMsg, setDedupeMsg] = useState('');
  const [isPending, startTransition] = useTransition();
  const [dedupePending, startDedupe] = useTransition();

  function parseEmails(): string[] {
    return emailsText
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@'));
  }

  function run(dryRun: boolean) {
    setMessage('');
    startTransition(async () => {
      try {
        const emails = parseEmails();
        const res = await fetch('/api/admin/recover-paid-event-registrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            confirm: true,
            dryRun,
            emails: emails.length ? emails : undefined,
            days: 14,
            oneRegistrationPerPerson: true,
            sendEmail: true,
            sendApology: true,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          created?: number;
          wouldCreate?: number;
          results?: Array<{ action: string }>;
        };
        if (!res.ok) {
          setMessage(data.error ?? 'Recovery failed.');
          return;
        }
        console.log(dryRun ? '[recover preview]' : '[recover]', data);
        if (dryRun) {
          setMessage(
            `Preview: ${data.wouldCreate ?? 0} registration(s) to create (see console for PaymentIntents).`,
          );
          return;
        }
        setMessage(
          `Recovered ${data.created ?? 0} registration(s). Each person got one confirmation email` +
            (data.results?.some((r) => r.action.includes('apology'))
              ? ' plus one apology note about refunds.'
              : '.'),
        );
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Recovery failed.');
      }
    });
  }

  function runDedupe(dryRun: boolean) {
    setDedupeMsg('');
    startDedupe(async () => {
      try {
        const res = await fetch('/api/admin/dedupe-event-registrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true, dryRun }),
        });
        const data = (await res.json()) as {
          error?: string;
          duplicateGroups?: number;
          wouldDelete?: number;
          deleted?: number;
        };
        if (!res.ok) {
          setDedupeMsg(data.error ?? 'Dedupe failed.');
          return;
        }
        console.log(dryRun ? '[dedupe preview]' : '[dedupe]', data);
        if (dryRun) {
          setDedupeMsg(
            `Preview: ${data.duplicateGroups ?? 0} people with doubles → would remove ${data.wouldDelete ?? 0} extra rows (no emails).`,
          );
          return;
        }
        setDedupeMsg(
          `Removed ${data.deleted ?? 0} duplicate submission(s) across ${data.duplicateGroups ?? 0} people. No emails sent.`,
        );
      } catch (err) {
        setDedupeMsg(err instanceof Error ? err.message : 'Dedupe failed.');
      }
    });
  }

  return (
    <div className="mx-4 mt-3 mb-1 space-y-3">
      <div className="p-3 rounded-xl border border-line bg-soft/40 space-y-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">
          Remove duplicate submissions
        </p>
        <p className="text-xs text-muted">
          If someone appears twice for the same event (form + Stripe webhook), keep one row and
          delete the extras. Does not send emails.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={dedupePending}
            onClick={() => runDedupe(true)}
            className="px-3 py-1.5 text-sm rounded-full border border-line bg-white font-semibold text-navy disabled:opacity-50"
          >
            Preview duplicates
          </button>
          <button
            type="button"
            disabled={dedupePending}
            onClick={() => runDedupe(false)}
            className="px-3 py-1.5 text-sm rounded-full bg-navy text-white font-semibold disabled:opacity-50"
          >
            {dedupePending ? 'Working…' : 'Remove duplicates'}
          </button>
        </div>
        {dedupeMsg ? <p className="text-sm text-navy font-medium">{dedupeMsg}</p> : null}
      </div>

      <div className="p-3 rounded-xl border border-line bg-soft/40 space-y-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">
          Recover Stripe event payments
        </p>
        <p className="text-xs text-muted">
          Creates one CRM row per person (even if Stripe shows multiple charges), sends one
          confirmation email, and one warm apology about refunds (from info@habayitcc.org). You
          refund the extras in Stripe.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={emailsText}
            onChange={(e) => setEmailsText(e.target.value)}
            placeholder="Emails to recover (comma-separated)"
            className="min-w-[280px] flex-1 text-sm"
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
            {isPending ? 'Working…' : 'Recover + emails'}
          </button>
        </div>
        {message ? <p className="text-sm text-navy font-medium">{message}</p> : null}
      </div>
    </div>
  );
}
