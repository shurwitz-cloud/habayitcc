'use client';

import { useEffect, useState } from 'react';

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; english: string; hebrew: string; note: string }
  | { status: 'error' };

export function HebrewBirthdayPreview({
  dateOfBirth,
  bornBeforeSunset,
}: {
  dateOfBirth: string;
  bornBeforeSunset: string;
}) {
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' });

  useEffect(() => {
    if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      setPreview({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setPreview({ status: 'loading' });

    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ date: dateOfBirth });
        if (bornBeforeSunset) {
          params.set('sunset', bornBeforeSunset);
        }

        const res = await fetch(`/api/hebrew-birthday?${params.toString()}`);
        const data = (await res.json()) as {
          english?: string;
          hebrew?: string;
          note?: string;
          error?: string;
        };

        if (cancelled) return;

        if (!res.ok || !data.english) {
          setPreview({ status: 'error' });
          return;
        }

        setPreview({
          status: 'ready',
          english: data.english,
          hebrew: data.hebrew ?? '',
          note: data.note ?? '',
        });
      } catch {
        if (!cancelled) setPreview({ status: 'error' });
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dateOfBirth, bornBeforeSunset]);

  if (preview.status === 'idle') {
    return null;
  }

  return (
    <div
      className="mt-3 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3"
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="text-[0.72rem] font-bold uppercase tracking-wide text-gold">Hebrew birthday</p>
      {preview.status === 'loading' && (
        <p className="mt-1 text-sm text-muted">Looking up Hebrew date…</p>
      )}
      {preview.status === 'error' && (
        <p className="mt-1 text-sm text-muted">Could not look up Hebrew date right now.</p>
      )}
      {preview.status === 'ready' && (
        <>
          <p className="mt-1 font-display text-[1.15rem] font-bold text-navy">{preview.english}</p>
          {preview.hebrew && (
            <p className="mt-0.5 text-sm text-navy/80" dir="rtl" lang="he">
              {preview.hebrew}
            </p>
          )}
          <p className="mt-1 text-[0.78rem] text-muted">{preview.note}</p>
        </>
      )}
    </div>
  );
}
