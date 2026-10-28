'use client';

import type { CrmProgramTrackSnapshot } from '@/lib/admin/crm/types';

export function ProgramApplicationsPanel({
  tracks,
  activeSlug,
  onSelect,
}: {
  tracks: CrmProgramTrackSnapshot[];
  activeSlug: string;
  onSelect: (programSlug: string) => void;
}) {
  if (!tracks.length) return null;

  return (
    <div className="px-4 py-3 border-b border-line bg-gradient-to-b from-soft/60 to-white">
      <p className="text-[0.62rem] uppercase tracking-wider text-muted font-bold mb-2">
        Program applications
      </p>
      <div className="flex flex-wrap gap-2">
        {tracks.map((track) => {
          const total = track.applicationCount + track.leadCount;
          const active = track.programSlug === activeSlug;
          return (
            <button
              key={track.programSlug}
              type="button"
              onClick={() => onSelect(track.programSlug)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                active
                  ? 'bg-gold text-white shadow-sm'
                  : 'bg-white border border-line text-navy hover:border-gold/40'
              }`}
            >
              <span>{track.tabLabel}</span>
              <span
                className={`inline-flex min-w-[1.25rem] justify-center px-1.5 py-0.5 rounded-full text-[0.62rem] font-bold ${
                  active ? 'bg-white/20 text-white' : 'bg-soft text-muted'
                }`}
              >
                {total}
              </span>
              {track.pendingCount > 0 && (
                <span className="text-[0.6rem] uppercase tracking-wide opacity-80">
                  {track.pendingCount} pending
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProgramApplicationsSummary({
  track,
}: {
  track: CrmProgramTrackSnapshot | undefined;
}) {
  if (!track) return null;

  return (
    <div className="px-4 py-3 border-b border-line bg-soft/20 text-sm text-muted flex flex-wrap gap-x-6 gap-y-1">
      <span>
        <strong className="text-navy">{track.applicationCount}</strong> full application
        {track.applicationCount === 1 ? '' : 's'}
      </span>
      <span>
        <strong className="text-navy">{track.leadCount}</strong> inquiry lead
        {track.leadCount === 1 ? '' : 's'}
      </span>
      {track.formSubmissionCount > 0 && (
        <span>
          <strong className="text-navy">{track.formSubmissionCount}</strong> in form log
        </span>
      )}
      {track.registrationPath && track.applicationCount === 0 && (
        <span className="text-xs">
          Registration form:{' '}
          <a href={track.registrationPath} className="text-gold font-semibold">
            {track.registrationPath}
          </a>
        </span>
      )}
    </div>
  );
}
