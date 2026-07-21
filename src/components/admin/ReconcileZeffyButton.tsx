'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Import is disabled after a bad run treated non-Chai Zeffy gifts as monthly partners.
 * Re-enable only after ZEFFY_CHAI_CAMPAIGN_ID is set and campaign matching is verified.
 */
export function ReconcileZeffyButton() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const enabled = process.env.NEXT_PUBLIC_ZEFFY_RECONCILE_ENABLED === 'true';

  async function run() {
    if (!enabled) return;
    setStatus('running');
    setMessage('');
    try {
      const res = await fetch('/api/admin/zeffy-reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 25 }),
      });
      const data = (await res.json()) as {
        error?: string;
        scanned?: number;
        recorded?: number;
        duplicates?: number;
        results?: Array<{
          email?: string;
          amount?: number;
          status: string;
        }>;
      };
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Zeffy import failed.');
        return;
      }
      setStatus('done');
      const recorded = data.recorded ?? 0;
      const duplicates = data.duplicates ?? 0;
      setMessage(
        `Scanned ${data.scanned ?? 0} Zeffy payments → imported ${recorded}, already in CRM ${duplicates}. (No emails sent.)`
      );
      const newly = (data.results ?? []).filter((r) => r.status === 'recorded');
      if (newly.length) {
        const notes = newly
          .map((r) => `${r.email ?? 'unknown'} $${r.amount ?? '?'}`)
          .join(' · ');
        setMessage((prev) => `${prev} New: ${notes}`);
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
        <strong>Zeffy import</strong>
        {enabled
          ? ' — Chai Partner form only, $150+, monthly. Never sends email (approve welcomes manually later).'
          : ' is temporarily disabled after a bad import emailed past one-time donors as monthly partners.'}
      </p>
      <button
        type="button"
        onClick={run}
        disabled={!enabled || status === 'running'}
        className="mt-3 rounded bg-[#172643] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {!enabled ? 'Import disabled' : status === 'running' ? 'Importing…' : 'Import from Zeffy'}
      </button>
      {message ? (
        <p className={`mt-2 text-sm ${status === 'error' ? 'text-red-700' : 'text-[#4a6741]'}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
