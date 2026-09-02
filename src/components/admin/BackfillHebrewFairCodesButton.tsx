'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function BackfillHebrewFairCodesButton() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function run() {
    setStatus('running');
    setMessage('');
    try {
      const res = await fetch('/api/admin/backfill-hebrew-fair-codes', { method: 'POST' });
      const data = (await res.json()) as {
        ok?: boolean;
        created?: number;
        total?: number;
        error?: string;
        hint?: string;
        migrationRequired?: boolean;
        codes?: Array<{ childName: string; code: string }>;
      };

      if (!res.ok || data.ok === false) {
        setStatus('error');
        const parts = [data.error ?? 'Backfill failed.'];
        if (data.hint) parts.push(data.hint);
        if (data.migrationRequired) {
          parts.push(
            'Open Supabase → SQL → run migrations 0012_paid_event_registrations.sql and 0013_hebrew_fair_code_redemptions.sql, then click again.',
          );
        }
        setMessage(parts.join(' '));
        return;
      }

      setStatus('done');
      const sample = (data.codes ?? [])
        .slice(0, 6)
        .map((row) => `${row.childName}: ${row.code}`)
        .join(' · ');
      let text = `Issued ${data.created ?? 0} new code(s) across ${data.total ?? 0} accepted/active child(ren).`;
      if (sample) text += ` ${sample}`;
      setMessage(text);
      router.refresh();
    } catch {
      setStatus('error');
      setMessage('Network error — try again.');
    }
  }

  return (
    <div className="px-4 py-3 border-b border-line bg-soft/30">
      <p className="text-sm text-navy">
        <strong className="font-semibold">Hebrew event codes</strong> — unique{' '}
        <span className="font-mono text-xs">HA-</span> code per accepted Hebrew Adventure child for
        free entry at promo events. Safe to run more than once. Does not email families.
      </p>
      <button
        type="button"
        onClick={() => void run()}
        disabled={status === 'running'}
        className="mt-2 rounded bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {status === 'running' ? 'Issuing codes…' : 'Issue / refresh Hebrew event codes'}
      </button>
      {message ? (
        <p className={`mt-2 text-sm ${status === 'error' ? 'text-danger' : 'text-navy'}`}>{message}</p>
      ) : null}
    </div>
  );
}
