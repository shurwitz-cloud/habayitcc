'use client';

import { useActionState } from 'react';
import { placeChildAction } from '@/app/app/actions';

export function PlaceChildForm({
  programSlug,
  childId,
  name,
  grade,
  classes,
}: {
  programSlug: string;
  childId: string;
  name: string;
  grade: string | null;
  classes: { key: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(placeChildAction, null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="programSlug" value={programSlug} />
      <input type="hidden" name="childId" value={childId} />
      <p className="font-semibold text-navy">
        {name}
        {grade ? ` · ${grade}` : ''}
      </p>
      <div className="flex gap-2">
        <select name="classKey" defaultValue={classes[0]?.key} aria-label={`Class for ${name}`}>
          {classes.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="px-4 rounded-full bg-navy text-white text-sm font-bold whitespace-nowrap disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add'}
        </button>
      </div>
      {state?.error && <p className="text-danger text-sm">{state.error}</p>}
    </form>
  );
}
