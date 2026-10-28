'use client';

import type { CrmSnapshot, CrmView, DateFilter } from '@/lib/admin/crm/types';
import type { DetailFilters } from '@/lib/admin/crm/filters';

const DATE_PRESETS: { id: DateFilter; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'year', label: 'This year' },
];

export function CrmFilterBar({
  view,
  snapshot,
  search,
  onSearchChange,
  datePreset,
  onDatePresetChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  detailFilters,
  onDetailFiltersChange,
  onExport,
  onClearFilters,
}: {
  view: CrmView;
  snapshot: CrmSnapshot;
  search: string;
  onSearchChange: (v: string) => void;
  datePreset: DateFilter;
  onDatePresetChange: (v: DateFilter) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  statusOptions: string[];
  detailFilters: DetailFilters;
  onDetailFiltersChange: (patch: Partial<DetailFilters>) => void;
  onExport: () => void;
  onClearFilters: () => void;
}) {
  const interests = getUniqueInterests(snapshot);

  const showInterest = view === 'contacts';
  // Events / RSVPs use EventTabsPanel for event filtering (including past-event picker).
  const showAmount = view === 'donations' || view === 'payments' || view === 'chai';

  const hasActiveFilters =
    search.trim() !== '' ||
    datePreset !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    statusFilter !== 'all' ||
    detailFilters.interest !== 'all' ||
    detailFilters.amountMin !== '' ||
    detailFilters.amountMax !== '';

  return (
    <div className="p-4 border-b border-line space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[200px]">
          <span className="text-[0.65rem] font-bold uppercase tracking-wide text-navy block mb-1">
            Search
          </span>
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Name, email, notes…"
            className="w-full"
          />
        </label>

        {statusOptions.length > 1 && (
          <label>
            <span className="text-[0.65rem] font-bold uppercase tracking-wide text-navy block mb-1">
              Status
            </span>
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="min-w-[130px] capitalize"
            >
              {statusOptions.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s === 'all' ? 'All statuses' : s}
                </option>
              ))}
            </select>
          </label>
        )}

        {showInterest && (
          <label>
            <span className="text-[0.65rem] font-bold uppercase tracking-wide text-navy block mb-1">
              Interest
            </span>
            <select
              value={detailFilters.interest}
              onChange={(e) => onDetailFiltersChange({ interest: e.target.value })}
              className="min-w-[150px]"
            >
              <option value="all">All interests</option>
              {interests.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
        )}

        {showAmount && (
          <>
            <label>
              <span className="text-[0.65rem] font-bold uppercase tracking-wide text-navy block mb-1">
                Min $
              </span>
              <input
                type="number"
                min={0}
                step={1}
                value={detailFilters.amountMin}
                onChange={(e) => onDetailFiltersChange({ amountMin: e.target.value })}
                className="w-24"
                placeholder="0"
              />
            </label>
            <label>
              <span className="text-[0.65rem] font-bold uppercase tracking-wide text-navy block mb-1">
                Max $
              </span>
              <input
                type="number"
                min={0}
                step={1}
                value={detailFilters.amountMax}
                onChange={(e) => onDetailFiltersChange({ amountMax: e.target.value })}
                className="w-24"
                placeholder="Any"
              />
            </label>
          </>
        )}

        <button
          type="button"
          onClick={onExport}
          className="px-4 py-2 rounded-full border border-line text-sm font-semibold text-navy hover:bg-soft"
        >
          Export CSV
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="px-4 py-2 rounded-full text-sm font-semibold text-muted hover:text-navy"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-end pt-1 border-t border-line/60">
        <span className="text-[0.65rem] font-bold uppercase tracking-wide text-navy w-full sm:w-auto">
          Date range
        </span>
        <label>
          <span className="text-[0.65rem] font-bold uppercase tracking-wide text-muted block mb-1">
            Quick
          </span>
          <select
            value={datePreset}
            onChange={(e) => onDatePresetChange(e.target.value as DateFilter)}
            className="min-w-[130px]"
            disabled={!!dateFrom || !!dateTo}
          >
            {DATE_PRESETS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-[0.65rem] font-bold uppercase tracking-wide text-muted block mb-1">
            From
          </span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="min-w-[140px]"
          />
        </label>
        <label>
          <span className="text-[0.65rem] font-bold uppercase tracking-wide text-muted block mb-1">
            To
          </span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="min-w-[140px]"
          />
        </label>
        {(dateFrom || dateTo) && (
          <p className="text-xs text-muted pb-2">
            Custom range active — quick presets paused until cleared.
          </p>
        )}
      </div>
    </div>
  );
}

function getUniqueInterests(snapshot: CrmSnapshot): string[] {
  const set = new Set<string>();
  for (const c of snapshot.contacts) {
    if (c.interest?.trim()) set.add(c.interest.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
