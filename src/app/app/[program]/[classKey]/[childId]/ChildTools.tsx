'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addProgressAction, removeTryoutAction } from '@/app/app/actions';
import { todayIso } from '@/lib/attendance/dates';
import type { ProgressTrack } from '@/lib/attendance/types';

export function ProgressEditor({
  programSlug,
  childId,
  track,
  label,
}: {
  programSlug: string;
  childId: string;
  track: ProgressTrack;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [standing, setStanding] = useState('');
  const [note, setNote] = useState('');
  const [recordedOn, setRecordedOn] = useState(todayIso());
  const [error, setError] = useState('');

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    startTransition(async () => {
      const result = await addProgressAction({
        programSlug,
        childId,
        track,
        standing,
        note,
        recordedOn,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStanding('');
      setNote('');
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <input
        value={standing}
        onChange={(event) => setStanding(event.target.value)}
        placeholder="Where they are now"
        aria-label={`${label} standing`}
        required
      />
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        placeholder="Note"
        aria-label={`${label} note`}
      />
      <input
        type="date"
        value={recordedOn}
        onChange={(event) => setRecordedOn(event.target.value)}
        aria-label={`${label} date`}
        required
      />
      {error && <p className="text-danger text-sm">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full min-h-11 rounded-full bg-navy text-white font-bold disabled:opacity-50"
      >
        {pending ? 'Saving…' : `Save ${label}`}
      </button>
    </form>
  );
}

export function RemoveTryoutButton({ rosterId }: { rosterId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  return (
    <div className="mt-6">
      {error && <p className="text-danger text-sm mb-2">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError('');
          startTransition(async () => {
            const result = await removeTryoutAction(rosterId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
        className="text-sm font-semibold text-danger"
      >
        {pending ? 'Removing…' : 'Remove tryout from this class'}
      </button>
    </div>
  );
}
