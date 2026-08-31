/**
 * Hebrew calendar order for sorting birthdays/yahrzeit by position in the Jewish year.
 * Cycle starts at Tishrei (common for lifecycle dates).
 */

const MONTH_ORDER: Record<string, number> = {
  Tishrei: 1,
  Cheshvan: 2,
  Kislev: 3,
  Tevet: 4,
  "Sh'vat": 5,
  Shevat: 5,
  Shvat: 5,
  Adar: 6,
  'Adar I': 6,
  'Adar II': 7,
  'Adar 2': 7,
  Nisan: 8,
  Iyyar: 9,
  Sivan: 10,
  Tamuz: 11,
  Av: 12,
  Elul: 13,
};

const ORDER_TO_MONTH: Record<number, string> = {
  1: 'Tishrei',
  2: 'Cheshvan',
  3: 'Kislev',
  4: 'Tevet',
  5: "Sh'vat",
  6: 'Adar',
  7: 'Adar II',
  8: 'Nisan',
  9: 'Iyyar',
  10: 'Sivan',
  11: 'Tamuz',
  12: 'Av',
  13: 'Elul',
};

export interface HebrewAnnualDateParts {
  monthOrder: number;
  monthLabel: string;
  day: number;
  hy: number;
  sortKey: number;
}

function normalizeMonthName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed in MONTH_ORDER) return trimmed;
  if (/^Adar\s*II$/i.test(trimmed)) return 'Adar II';
  if (/^Adar\s*I$/i.test(trimmed)) return 'Adar I';
  return trimmed;
}

function parseSegment(segment: string): HebrewAnnualDateParts | null {
  const trimmed = segment.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+)(?:\/(\d+))?\s+(.+?)\s+(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const monthName = normalizeMonthName(match[3]);
  const hy = Number(match[4]);
  const monthOrder = MONTH_ORDER[monthName];

  if (!monthOrder || !Number.isFinite(day) || !Number.isFinite(hy)) {
    return null;
  }

  return {
    monthOrder,
    monthLabel: ORDER_TO_MONTH[monthOrder] ?? monthName,
    day,
    hy,
    sortKey: monthOrder * 1000 + day,
  };
}

export function parseHebrewAnnualDate(hebrewDate: string | null | undefined): HebrewAnnualDateParts | null {
  if (!hebrewDate?.trim()) return null;

  const segments = hebrewDate.split(/\s+\/\s+/);
  let best: HebrewAnnualDateParts | null = null;

  for (const segment of segments) {
    const parsed = parseSegment(segment);
    if (!parsed) continue;
    if (!best || parsed.sortKey < best.sortKey) {
      best = parsed;
    }
  }

  return best;
}

/** Human label for CRM, e.g. "Tishrei 2" or "Adar 23–24". */
export function formatHebrewAnnualLabel(hebrewDate: string | null | undefined): string | null {
  if (!hebrewDate?.trim()) return null;

  const slashDayMatch = hebrewDate.match(/^(\d+)\/(\d+)\s+(.+?)\s+\d{4}$/);
  if (slashDayMatch && !hebrewDate.includes(' / ')) {
    const monthName = normalizeMonthName(slashDayMatch[3]);
    const monthOrder = MONTH_ORDER[monthName];
    const monthLabel = monthOrder ? ORDER_TO_MONTH[monthOrder] : monthName;
    return `${monthLabel} ${slashDayMatch[1]}–${slashDayMatch[2]}`;
  }

  if (hebrewDate.includes(' / ')) {
    const [left, right] = hebrewDate.split(/\s+\/\s+/);
    const leftParts = parseSegment(left);
    const rightParts = parseSegment(right);
    if (leftParts && rightParts) {
      if (leftParts.monthOrder === rightParts.monthOrder) {
        return `${leftParts.monthLabel} ${leftParts.day}–${rightParts.day}`;
      }
      return `${leftParts.monthLabel} ${leftParts.day} – ${rightParts.monthLabel} ${rightParts.day}`;
    }
  }

  const parts = parseHebrewAnnualDate(hebrewDate);
  if (!parts) return hebrewDate.trim();
  return `${parts.monthLabel} ${parts.day}`;
}

export function getHebrewAnnualSortKey(hebrewDate: string | null | undefined): number {
  return parseHebrewAnnualDate(hebrewDate)?.sortKey ?? Number.MAX_SAFE_INTEGER;
}

export function getHebrewAnnualSheetFields(hebrewDate: string | null | undefined): {
  monthLabel: string;
  day: string;
  yearOrder: string;
  inYearLabel: string;
} {
  const parts = parseHebrewAnnualDate(hebrewDate);
  const inYearLabel = formatHebrewAnnualLabel(hebrewDate);

  if (!parts || !inYearLabel) {
    return { monthLabel: '', day: '', yearOrder: '', inYearLabel: '' };
  }

  const slashDayMatch = hebrewDate?.match(/^(\d+)\/(\d+)\s+/);
  const dayDisplay = slashDayMatch && !hebrewDate?.includes(' / ')
    ? `${slashDayMatch[1]}–${slashDayMatch[2]}`
    : String(parts.day);

  return {
    monthLabel: parts.monthLabel,
    day: dayDisplay,
    yearOrder: String(parts.sortKey),
    inYearLabel,
  };
}
