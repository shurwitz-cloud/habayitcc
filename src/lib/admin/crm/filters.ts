import type { DateFilter } from './types';
import { matchesDateFilter } from './utils';

export type SortDir = 'asc' | 'desc';

export type DateRange = {
  preset: DateFilter;
  from: string;
  to: string;
};

export type DetailFilters = {
  interest: string;
  event: string;
  amountMin: string;
  amountMax: string;
};

export const EMPTY_DETAIL_FILTERS: DetailFilters = {
  interest: 'all',
  event: 'all',
  amountMin: '',
  amountMax: '',
};

export function matchesDateRange(iso: string, range: DateRange): boolean {
  const d = new Date(iso);
  if (range.from) {
    const start = new Date(`${range.from}T00:00:00`);
    if (d < start) return false;
  }
  if (range.to) {
    const end = new Date(`${range.to}T23:59:59.999`);
    if (d > end) return false;
  }
  if (range.from || range.to) return true;
  return matchesDateFilter(iso, range.preset);
}

export function matchesAmountRange(
  amount: number,
  min: string,
  max: string,
): boolean {
  if (min && amount < Number(min)) return false;
  if (max && amount > Number(max)) return false;
  return true;
}

export function sortRows<T>(
  rows: T[],
  getValue: (row: T) => string | number,
  dir: SortDir,
): T[] {
  return [...rows].sort((a, b) => {
    const av = getValue(a);
    const bv = getValue(b);
    let cmp = 0;
    if (typeof av === 'number' && typeof bv === 'number') {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

export function toggleSort(
  currentKey: string,
  currentDir: SortDir,
  nextKey: string,
  defaultDir: SortDir = 'asc',
): { key: string; dir: SortDir } {
  if (currentKey === nextKey) {
    return { key: nextKey, dir: currentDir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: nextKey, dir: defaultDir };
}

export const DEFAULT_SORT_KEY: Record<string, string> = {
  activity: 'date',
  contacts: 'date',
  events: 'date',
  applications: 'date',
  rsvps: 'date',
  donations: 'date',
  chai: 'date',
  payments: 'date',
  dates: 'yearOrder',
  submissions: 'date',
};

/** Default direction when first clicking a column */
export const SORT_DEFAULT_DIR: Record<string, SortDir> = {
  date: 'desc',
  amount: 'desc',
  monthly: 'desc',
  guests: 'desc',
  rsvps: 'desc',
  name: 'asc',
  event: 'asc',
  email: 'asc',
  type: 'asc',
  status: 'asc',
  interest: 'asc',
  family: 'asc',
  source: 'asc',
  form: 'asc',
  yearOrder: 'asc',
  hebrew: 'asc',
};

export function getSortDefaultDir(key: string): SortDir {
  return SORT_DEFAULT_DIR[key] ?? 'desc';
}
