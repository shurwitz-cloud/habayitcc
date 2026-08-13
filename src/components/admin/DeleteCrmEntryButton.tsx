'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type EntryKind = 'donation' | 'chai_partner';

export function DeleteCrmEntryButton({
  kind,
  id,
  label,
}: {
  kind: EntryKind;
  id: string;
  /** Short description for the confirm dialog, e.g. "Shmuel Hurwitz · $150". */
  label: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'deleting' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onDelete() {
    const kindLabel = kind === 'chai_partner' ? 'Chai Partner' : 'donation';
    const ok = window.confirm(
      `Delete this ${kindLabel}?\n\n${label}\n\nThis cannot be undone. Related payment records will also be removed.`,
    );
    if (!ok) return;

    setStatus('deleting');
    setMessage('');
    try {
      const res = await fetch('/api/admin/crm-delete-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, kind, id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Could not delete entry.');
        return;
      }
      setStatus('idle');
      router.refresh();
    } catch {
      setStatus('error');
      setMessage('Network error — try again.');
    }
  }

  return (
    <div className="mt-4 pt-3 border-t border-[#e4ded2]">
      <button
        type="button"
        onClick={onDelete}
        disabled={status === 'deleting'}
        className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {status === 'deleting' ? 'Deleting…' : 'Delete entry'}
      </button>
      {message ? <p className="mt-2 text-sm text-red-700">{message}</p> : null}
    </div>
  );
}
