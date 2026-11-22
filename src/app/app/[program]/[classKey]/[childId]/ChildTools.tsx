'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addChildNoteAction,
  addProgressAction,
  removeTryoutAction,
  updateChildNoteAction,
} from '@/app/app/actions';
import { todayIso } from '@/lib/attendance/dates';
import type { ChildNote, ProgressTrack } from '@/lib/attendance/types';

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

function formatNoteDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ChildNotesEditor({ childId, notes }: { childId: string; notes: ChildNote[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  function addNote(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    startTransition(async () => {
      const result = await addChildNoteAction(childId, draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft('');
      router.refresh();
    });
  }

  function saveEdit(noteId: string) {
    setError('');
    startTransition(async () => {
      const result = await updateChildNoteAction(noteId, editText);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      setEditText('');
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-3">
      {notes.length === 0 ? (
        <p className="text-sm text-muted">No notes yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {notes.map((entry) => (
            <li key={entry.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs text-muted">
                  {formatNoteDate(entry.createdAt)}
                  {entry.createdBy ? ` · ${entry.createdBy}` : ''}
                </p>
                {editingId === entry.id ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(entry.id);
                      setEditText(entry.note);
                    }}
                    className="text-xs font-semibold text-navy"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editingId === entry.id ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                    rows={3}
                    aria-label="Edit note"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => saveEdit(entry.id)}
                      className="flex-1 min-h-11 rounded-full bg-navy text-white font-bold disabled:opacity-50"
                    >
                      {pending ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setEditingId(null);
                        setEditText('');
                      }}
                      className="flex-1 min-h-11 rounded-full border border-line text-navy font-bold disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm mt-1 whitespace-pre-wrap">{entry.note}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={addNote} className="space-y-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          placeholder="Add a note about this child"
          aria-label="New child note"
        />
        {error && <p className="text-danger text-sm">{error}</p>}
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="w-full min-h-11 rounded-full bg-navy text-white font-bold disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Add note'}
        </button>
      </form>
    </div>
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
