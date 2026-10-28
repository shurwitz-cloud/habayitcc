'use client';

import { useRef } from 'react';
import { ratingLabel } from '@/lib/attendance/notes';

export function RatingDial({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const shown = value ?? 3;

  function setFromClientX(clientX: number) {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onChange(Math.min(5, Math.max(1, Math.round(ratio * 4) + 1)));
  }

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <p className="text-[0.72rem] font-bold uppercase tracking-wide text-muted">{label}</p>
        <p className="text-sm font-semibold text-navy">{ratingLabel(value)}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[#c06b6b] shrink-0">Less</span>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={`${label}, left less, right more`}
          aria-valuemin={1}
          aria-valuemax={5}
          aria-valuenow={shown}
          aria-valuetext={ratingLabel(value)}
          className="relative h-10 flex-1 touch-none select-none cursor-pointer rounded-full"
          style={{
            background: 'linear-gradient(90deg, rgba(220,120,120,0.35), rgba(210,210,170,0.28), rgba(110,180,120,0.4))',
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setFromClientX(event.clientX);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            setFromClientX(event.clientX);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
              event.preventDefault();
              onChange(Math.max(1, shown - 1));
            }
            if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
              event.preventDefault();
              onChange(Math.min(5, shown + 1));
            }
          }}
        >
          <span
            className="pointer-events-none absolute top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-white border-2 border-navy shadow-sm"
            style={{ left: `calc(${((shown - 1) / 4) * 100}% - 0.875rem)` }}
          />
        </div>
        <span className="text-xs font-semibold text-[#5a9a66] shrink-0">More</span>
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
