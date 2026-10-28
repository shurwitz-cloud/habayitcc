'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function BackfillHebrewBirthdaysButton() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function run(force = false) {
    setStatus('running');
    setMessage('');
    try {
      const url = force
        ? '/api/admin/backfill-hebrew-birthdays?force=1'
        : '/api/admin/backfill-hebrew-birthdays';
      const res = await fetch(url, { method: 'POST' });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        updated?: number;
        failed?: number;
        migrationRequired?: boolean;
        results?: Array<{ name: string; hebrewBirthday?: string; error?: string }>;
      };

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Backfill failed.');
        return;
      }

      setStatus('done');
      const sample = (data.results ?? [])
        .filter((row) => row.hebrewBirthday)
        .slice(0, 5)
        .map((row) => `${row.name}: ${row.hebrewBirthday}`)
        .join(' · ');

      let text = data.message ?? `Updated ${data.updated ?? 0} record(s).`;
      if (data.failed) text += ` ${data.failed} failed.`;
      if (data.migrationRequired) {
        text +=
          ' Some child rows could not be updated — run migration 0016_hebrew_birthday.sql in Supabase SQL editor.';
      }
      if (sample) text += ` ${sample}`;

      setMessage(text);
      router.refresh();
    } catch {
      setStatus('error');
      setMessage('Network error — try again.');
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-[#d4cfc4] bg-white p-4">
      <p className="text-sm text-[#172643]">
        <strong>Hebrew birthdays</strong> — look up Hebrew birth dates for all children with a date of
        birth (uses before/after sunset from registration). Safe to run more than once.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run(false)}
          disabled={status === 'running'}
          className="rounded bg-[#172643] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {status === 'running' ? 'Computing…' : 'Compute Hebrew birthdays'}
        </button>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={status === 'running'}
          className="rounded border border-[#172643] px-4 py-2 text-sm font-medium text-[#172643] disabled:opacity-60"
        >
          Recompute all
        </button>
      </div>
      {message ? (
        <p className={`mt-2 text-sm ${status === 'error' ? 'text-red-700' : 'text-[#4a6741]'}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
