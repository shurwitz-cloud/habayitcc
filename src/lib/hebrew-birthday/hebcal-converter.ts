export type SunsetTiming = 'before' | 'after' | 'unknown' | '' | null | undefined;

export type SunsetTimingUsed = 'before' | 'after' | 'unknown' | 'same_either_way';

export interface HebrewBirthdayResult {
  english: string;
  hebrew: string;
  hebrewYear: string;
  hy: number;
  hm: string;
  hd: number;
  afterSunset: boolean;
  sunsetTimingUsed: SunsetTimingUsed;
}

import { preferredMonthLabel } from '@/lib/hebrew-birthday/hebrew-annual-order';

interface HebcalConverterResponse {
  hy: number;
  hm: string;
  hd: number;
  hebrew: string;
  afterSunset?: boolean;
  heDateParts?: {
    y?: string;
    m?: string;
    d?: string;
  };
}

function formatEnglishHebrewBirthday(hy: number, hm: string, hd: number): string {
  return `${hd} ${preferredMonthLabel(hm)} ${hy}`;
}

export function isSunsetTimingUnknown(bornSunsetTiming: SunsetTiming): boolean {
  return !bornSunsetTiming || bornSunsetTiming === 'unknown';
}

export function resolveAfterSunset(
  bornSunsetTiming: SunsetTiming,
  bornBeforeSunset?: boolean | null,
): { afterSunset: boolean; sunsetTimingUsed: Exclude<SunsetTimingUsed, 'unknown' | 'same_either_way'> } {
  if (bornSunsetTiming === 'after') {
    return { afterSunset: true, sunsetTimingUsed: 'after' };
  }

  if (bornSunsetTiming === 'before') {
    return { afterSunset: false, sunsetTimingUsed: 'before' };
  }

  if (bornBeforeSunset === false) {
    return { afterSunset: true, sunsetTimingUsed: 'after' };
  }

  return { afterSunset: false, sunsetTimingUsed: 'before' };
}

function formatHebrewBirthdayRange(
  before: HebrewBirthdayResult,
  after: HebrewBirthdayResult,
): Pick<HebrewBirthdayResult, 'english' | 'hebrew' | 'hebrewYear' | 'hy' | 'hm' | 'hd'> {
  if (before.hm === after.hm && before.hy === after.hy) {
    return {
      english: `${before.hd}/${after.hd} ${before.hm} ${before.hy}`,
      hebrew: `${before.hebrew} / ${after.hebrew}`,
      hebrewYear: after.hebrewYear,
      hy: after.hy,
      hm: after.hm,
      hd: after.hd,
    };
  }

  return {
    english: `${before.english} / ${after.english}`,
    hebrew: `${before.hebrew} / ${after.hebrew}`,
    hebrewYear: after.hebrewYear,
    hy: after.hy,
    hm: after.hm,
    hd: after.hd,
  };
}

export async function convertGregorianToHebrewBirthday(
  gregorianDate: string,
  options: {
    afterSunset?: boolean;
  } = {},
): Promise<HebrewBirthdayResult | null> {
  const trimmed = gregorianDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const params = new URLSearchParams({
    cfg: 'json',
    date: trimmed,
    g2h: '1',
    strict: '1',
  });

  if (options.afterSunset) {
    params.set('gs', 'on');
  }

  const response = await fetch(`https://www.hebcal.com/converter?${params.toString()}`, {
    next: { revalidate: 60 * 60 * 24 * 365 },
  });

  if (!response.ok) {
    console.error('[hebrew-birthday] Hebcal converter failed:', response.status, trimmed);
    return null;
  }

  const data = (await response.json()) as HebcalConverterResponse;
  if (!data.hy || !data.hm || !data.hd) {
    return null;
  }

  return {
    english: formatEnglishHebrewBirthday(data.hy, data.hm, data.hd),
    hebrew: data.hebrew,
    hebrewYear: data.heDateParts?.y ?? String(data.hy),
    hy: data.hy,
    hm: data.hm,
    hd: data.hd,
    afterSunset: Boolean(data.afterSunset ?? options.afterSunset),
    sunsetTimingUsed: options.afterSunset ? 'after' : 'before',
  };
}

export async function lookupHebrewBirthday(input: {
  dateOfBirth: string;
  bornSunsetTiming?: SunsetTiming;
  bornBeforeSunset?: boolean | null;
}): Promise<HebrewBirthdayResult | null> {
  if (isSunsetTimingUnknown(input.bornSunsetTiming)) {
    const [before, after] = await Promise.all([
      convertGregorianToHebrewBirthday(input.dateOfBirth, { afterSunset: false }),
      convertGregorianToHebrewBirthday(input.dateOfBirth, { afterSunset: true }),
    ]);

    if (!before && !after) return null;
    if (!before) return after;
    if (!after) return before;

    if (before.hd === after.hd && before.hm === after.hm && before.hy === after.hy) {
      return { ...before, sunsetTimingUsed: 'same_either_way' };
    }

    const ranged = formatHebrewBirthdayRange(before, after);
    return {
      ...ranged,
      afterSunset: false,
      sunsetTimingUsed: 'unknown',
    };
  }

  const { afterSunset, sunsetTimingUsed } = resolveAfterSunset(
    input.bornSunsetTiming,
    input.bornBeforeSunset,
  );

  const result = await convertGregorianToHebrewBirthday(input.dateOfBirth, { afterSunset });
  if (!result) return null;

  return { ...result, sunsetTimingUsed };
}
