'use client';

import { useState } from 'react';

export function SyncImportantDatesSheetButton() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function run() {
    setStatus('running');
    setMessage('');
    try {
      const res = await fetch('/api/admin/sync-important-dates-sheet', { method: 'POST' });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        synced?: number;
        skipped?: number;
      };

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Sync failed.');
        return;
      }

      setStatus('done');
      setMessage(
        data.message ??
          `Synced ${data.synced ?? 0} row(s)${data.skipped ? `, skipped ${data.skipped}` : ''}.`,
      );
    } catch {
      setStatus('error');
      setMessage('Network error — try again.');
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-[#d4cfc4] bg-white p-4">
      <p className="text-sm text-[#172643]">
        <strong>Google Sheets</strong> — push all CRM birthdays to the Birthdays tab and yahrzeit
        dates to the Yahrzeit tab. In the sheet, sort by the <strong>Year Order</strong> column
        (Tishrei = start of year). Hebrew Month shows the month name — not a day number.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={status === 'running'}
        className="mt-3 rounded bg-[#172643] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {status === 'running' ? 'Syncing…' : 'Sync to Google Sheet'}
      </button>
      {message ? (
        <p className={`mt-2 text-sm ${status === 'error' ? 'text-red-700' : 'text-[#4a6741]'}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
