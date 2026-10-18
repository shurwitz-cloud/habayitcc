'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addExistingTryoutAction,
  addTryoutAction,
  saveClassAttendanceAction,
  searchChildrenAction,
} from '@/app/app/actions';
import { packRatedNote, ratingLabel, unpackRatedNote } from '@/lib/attendance/notes';
import type { ChildSearchHit } from '@/lib/attendance/types';

export type BoardChild = {
  rosterId: string;
  childId: string;
  firstName: string;
  lastName: string;
  status: 'enrolled' | 'tryout';
  wasPresent: boolean | null;
  behaviorNote: string;
  participationNote: string;
};

type Draft = {
  wasPresent: boolean | null;
  behaviorRating: number | null;
  behaviorNote: string;
  participationRating: number | null;
  participationNote: string;
};

function draftFromChild(child: BoardChild): Draft {
  const behavior = unpackRatedNote(child.behaviorNote);
  const participation = unpackRatedNote(child.participationNote);
  return {
    wasPresent: child.wasPresent,
    behaviorRating: behavior.rating,
    behaviorNote: behavior.note,
    participationRating: participation.rating,
    participationNote: participation.note,
  };
}

export function ClassBoard({
  programSlug,
  classKey,
  sessionDate,
  grades,
  children,
}: {
  programSlug: string;
  classKey: string;
  sessionDate: string;
  grades: string[];
  children: BoardChild[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(children.map((child) => [child.childId, draftFromChild(child)])),
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      for (const child of children) {
        if (next[child.childId]) continue;
        next[child.childId] = draftFromChild(child);
      }
      return next;
    });
  }, [children]);

  function update(childId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [childId]: { ...current[childId], ...patch },
    }));
  }

  function save() {
    setError('');
    setMessage('');
    startTransition(async () => {
      const result = await saveClassAttendanceAction({
        programSlug,
        classKey,
        sessionDate,
        marks: children.map((child) => {
          const draft = drafts[child.childId];
          return {
            childId: child.childId,
            wasPresent: draft?.wasPresent ?? null,
            behaviorNote: packRatedNote(draft?.behaviorRating ?? null, draft?.behaviorNote ?? ''),
            participationNote: packRatedNote(
              draft?.participationRating ?? null,
              draft?.participationNote ?? '',
            ),
          };
        }),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage('Saved.');
      router.refresh();
    });
  }

  return (
    <div className="px-4 pt-4 pb-28">
      {children.length > 0 && (
        <div className="flex justify-end mb-3">
          <button
            type="button"
            className="text-sm font-semibold text-navy underline underline-offset-2"
            onClick={() =>
              setDrafts((current) => {
                const next = { ...current };
                for (const child of children) next[child.childId] = { ...next[child.childId], wasPresent: true };
                return next;
              })
            }
          >
            Mark all here
          </button>
        </div>
      )}

      {children.length === 0 ? (
        <p className="bg-white border border-line rounded-2xl px-4 py-5 text-sm text-muted">
          No children in this class yet. Accepted Hebrew Adventure registrations land here from their grade. Add a
          tryout below.
        </p>
      ) : (
        <ul className="space-y-3">
          {children.map((child) => {
            const draft = drafts[child.childId];
            return (
              <li key={child.childId} className="bg-white border border-line rounded-2xl overflow-hidden">
                <a
                  href={`/app/${programSlug}/${classKey}/${child.childId}`}
                  className="flex items-center justify-between gap-3 bg-navy px-4 py-3"
                >
                  <span className="text-lg font-bold text-white leading-tight">
                    {child.firstName} {child.lastName}
                  </span>
                  {child.status === 'tryout' && (
                    <span className="shrink-0 text-[0.68rem] font-bold uppercase tracking-wider text-gold">
                      Tryout
                    </span>
                  )}
                </a>
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-pressed={draft?.wasPresent === true}
                      onClick={() =>
                        update(child.childId, { wasPresent: draft?.wasPresent === true ? null : true })
                      }
                      className={`min-h-12 rounded-full font-bold ${
                        draft?.wasPresent === true ? 'bg-good text-white' : 'bg-soft text-navy border border-line'
                      }`}
                    >
                      Here
                    </button>
                    <button
                      type="button"
                      aria-pressed={draft?.wasPresent === false}
                      onClick={() =>
                        update(child.childId, { wasPresent: draft?.wasPresent === false ? null : false })
                      }
                      className={`min-h-12 rounded-full font-bold ${
                        draft?.wasPresent === false ? 'bg-danger text-white' : 'bg-soft text-navy border border-line'
                      }`}
                    >
                      Absent
                    </button>
                  </div>

                  <RatingSlider
                    label="Behavior"
                    value={draft?.behaviorRating ?? null}
                    onChange={(rating) => update(child.childId, { behaviorRating: rating })}
                  />
                  <textarea
                    value={draft?.behaviorNote ?? ''}
                    onChange={(event) => update(child.childId, { behaviorNote: event.target.value })}
                    rows={2}
                    placeholder="Behavior notes"
                    aria-label={`${child.firstName} behavior notes`}
                    className="mt-2"
                  />

                  <RatingSlider
                    label="Participation"
                    value={draft?.participationRating ?? null}
                    onChange={(rating) => update(child.childId, { participationRating: rating })}
                  />
                  <textarea
                    value={draft?.participationNote ?? ''}
                    onChange={(event) => update(child.childId, { participationNote: event.target.value })}
                    rows={2}
                    placeholder="Participation notes"
                    aria-label={`${child.firstName} participation notes`}
                    className="mt-2"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AddToClass programSlug={programSlug} classKey={classKey} grades={grades} />

      <div className="fixed inset-x-0 bottom-0 bg-cream/95 backdrop-blur border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error && <p className="text-danger text-sm mb-2">{error}</p>}
        {message && <p className="text-good text-sm font-semibold mb-2">{message}</p>}
        <button
          type="button"
          onClick={save}
          disabled={pending || children.length === 0}
          className="w-full min-h-12 rounded-full bg-gold text-white font-bold uppercase tracking-wider disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save attendance'}
        </button>
      </div>
    </div>
  );
}

function RatingSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const shown = value ?? 3;
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <label className="text-[0.72rem] font-bold uppercase tracking-wide text-muted">{label}</label>
        <span className="text-sm font-semibold text-navy">{ratingLabel(value)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted shrink-0">Less</span>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={shown}
          onChange={(event) => onChange(Number(event.target.value))}
          onPointerDown={() => {
            if (value == null) onChange(3);
          }}
          aria-label={`${label} rating, left less, right more`}
          className="w-full accent-navy h-8"
        />
        <span className="text-xs font-semibold text-muted shrink-0">More</span>
      </div>
      {value != null && (
        <button
          type="button"
          className="text-xs font-semibold text-muted mt-1 underline underline-offset-2"
          onClick={() => onChange(null)}
        >
          Clear {label.toLowerCase()}
        </button>
      )}
    </div>
  );
}

function AddToClass({
  programSlug,
  classKey,
  grades,
}: {
  programSlug: string;
  classKey: string;
  grades: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [grade, setGrade] = useState(grades[0] ?? '');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ChildSearchHit[]>([]);
  const [error, setError] = useState('');

  function addNew(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    startTransition(async () => {
      const result = await addTryoutAction({ programSlug, classKey, firstName, lastName, grade });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFirstName('');
      setLastName('');
      router.refresh();
    });
  }

  function findExisting(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    startTransition(async () => {
      const result = await searchChildrenAction(query);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHits(result.data);
      if (result.data.length === 0) setError('No matching child.');
    });
  }

  function addHit(childId: string) {
    setError('');
    startTransition(async () => {
      const result = await addExistingTryoutAction(programSlug, classKey, childId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHits([]);
      setQuery('');
      router.refresh();
    });
  }

  return (
    <section className="mt-8 bg-white border border-line rounded-2xl p-4">
      <h2 className="font-display text-2xl text-navy font-bold">Add a tryout</h2>
      <p className="text-sm text-muted mt-1 mb-4">They show in this class and in the CRM, marked as tryout.</p>

      <form onSubmit={addNew} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            placeholder="First name"
            aria-label="First name"
            required
          />
          <input
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            placeholder="Last name"
            aria-label="Last name"
            required
          />
        </div>
        <select value={grade} onChange={(event) => setGrade(event.target.value)} aria-label="Grade">
          {grades.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="w-full min-h-11 rounded-full border border-navy text-navy font-bold disabled:opacity-50"
        >
          Add new tryout
        </button>
      </form>

      <form onSubmit={findExisting} className="mt-5 pt-5 border-t border-line">
        <p className="text-sm font-semibold text-navy mb-2">Already in HaBayit</p>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name"
            aria-label="Search children"
          />
          <button
            type="submit"
            disabled={pending}
            className="px-4 rounded-full bg-navy text-white text-sm font-bold disabled:opacity-50"
          >
            Find
          </button>
        </div>
      </form>
      {hits.length > 0 && (
        <ul className="mt-3 space-y-2">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => addHit(hit.id)}
                className="w-full text-left bg-soft border border-line rounded-xl px-3 py-2 text-sm text-navy font-semibold"
              >
                Add {hit.firstName} {hit.lastName}
                {hit.grade ? ` · ${hit.grade}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-danger text-sm mt-3">{error}</p>}
    </section>
  );
}
