/**
 * Donor-facing receipt dates for HaBayit (Cooper City, FL) must always use
 * America/New_York, regardless of the server runtime zone. Serverless
 * runtimes commonly run in UTC, and runtime-local date getters made gifts
 * recorded in the evening (after 8pm ET) render the next calendar day.
 */
export const RECEIPT_TIME_ZONE = 'America/New_York';

const shortFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: RECEIPT_TIME_ZONE,
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
});

const longFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: RECEIPT_TIME_ZONE,
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

/** "MM/DD/YYYY" in the receipt time zone. */
export function formatReceiptDate(date: Date): string {
  return shortFormatter.format(date);
}

/** "Month D, YYYY" in the receipt time zone. */
export function formatReceiptDateLong(date: Date): string {
  return longFormatter.format(date);
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface ReceiptLinkDates {
  long: string;
  short: string;
}

/**
 * Parse the signed receipt-link date param into display strings.
 * An explicit MM/DD/YYYY param renders exactly that calendar day in any
 * runtime zone: components are formatted directly instead of round-tripping
 * through a server-local-midnight Date, so legacy signed links keep showing
 * the date they were signed with.
 */
export function parseReceiptLinkDates(raw: string | undefined): ReceiptLinkDates {
  const fallback = new Date();
  if (!raw?.trim()) {
    return {
      long: formatReceiptDateLong(fallback),
      short: formatReceiptDate(fallback),
    };
  }

  const mdy = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      // Zone-independent validity check (rejects e.g. 02/30/2026).
      const check = new Date(Date.UTC(year, month - 1, day));
      if (
        check.getUTCFullYear() === year &&
        check.getUTCMonth() === month - 1 &&
        check.getUTCDate() === day
      ) {
        return {
          long: `${MONTH_NAMES[month - 1]} ${day}, ${year}`,
          short: `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`,
        };
      }
    }
  }

  // Other date-only legacy forms (YYYY-MM-DD, "Month D, YYYY") also render
  // their stated calendar day, independent of the runtime zone.
  const iso = raw.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const check = new Date(Date.UTC(y, m - 1, d));
    if (
      m >= 1 && m <= 12 && d >= 1 && d <= 31 &&
      check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d
    ) {
      return {
        long: `${MONTH_NAMES[m - 1]} ${d}, ${y}`,
        short: `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`,
      };
    }
  }
  const named = raw.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (named) {
    const m = MONTH_NAMES.findIndex(
      (name) => name.toLowerCase() === named[1].toLowerCase(),
    );
    const d = Number(named[2]);
    const y = Number(named[3]);
    if (m >= 0 && d >= 1 && d <= 31) {
      const check = new Date(Date.UTC(y, m, d));
      if (check.getUTCFullYear() === y && check.getUTCMonth() === m && check.getUTCDate() === d) {
        return {
          long: `${MONTH_NAMES[m]} ${d}, ${y}`,
          short: `${String(m + 1).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`,
        };
      }
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { long: raw, short: raw };
  }

  return {
    long: formatReceiptDateLong(parsed),
    short: formatReceiptDate(parsed),
  };
}

/**
 * LEGACY RECONSTRUCTION ONLY. Links minted before the ET fix were formatted
 * with the server's local zone, which was UTC on the production runtime.
 * Used solely to recompute the signature of an already-sent link so a
 * correction can be bound to that exact link. Never use for new links.
 */
export function formatReceiptDateUTC(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getUTCFullYear()}`;
}
