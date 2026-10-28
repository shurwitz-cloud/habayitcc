'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ReconcileStripeButton() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function run() {
    setStatus('running');
    setMessage('');
    try {
      const res = await fetch('/api/admin/reconcile-stripe?days=30', { method: 'POST' });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        imported?: number;
        skipped?: number;
        failed?: number;
        failures?: Array<{ amount?: number; email?: string; note?: string }>;
      };
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Reconcile failed.');
        return;
      }
      setStatus('done');
      setMessage(
        data.message ??
          `Imported ${data.imported ?? 0}, skipped ${data.skipped ?? 0}, failed ${data.failed ?? 0}.`
      );
      if (Array.isArray(data.failures) && data.failures.length) {
        const notes = data.failures
          .map((f: { amount?: number; email?: string; note?: string }) =>
            `${f.email ?? 'unknown'} $${f.amount ?? '?'}: ${f.note ?? 'failed'}`
          )
          .join(' | ');
        setMessage((prev) => `${prev} ${notes}`);
      }
      router.refresh();
    } catch {
      setStatus('error');
      setMessage('Network error — try again.');
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-[#d4cfc4] bg-white p-4">
      <p className="text-sm text-[#172643]">
        <strong>Missing Stripe donations?</strong> Import recent gifts from Stripe into CRM (safe to run
        more than once).
      </p>
      <button
        type="button"
        onClick={run}
        disabled={status === 'running'}
        className="mt-3 rounded bg-[#172643] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {status === 'running' ? 'Importing…' : 'Import from Stripe'}
      </button>
      {message ? (
        <p className={`mt-2 text-sm ${status === 'error' ? 'text-red-700' : 'text-[#4a6741]'}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
