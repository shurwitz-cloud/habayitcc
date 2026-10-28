/** HaBayit location — Cooper City, FL */
export const SHABBAT_LOCATION = {
  label: 'Cooper City, FL',
  latitude: 26.0573,
  longitude: -80.2717,
  tzid: 'America/New_York',
} as const;

/**
 * Chabad-aligned Hebcal settings:
 * - b=18: candle lighting 18 minutes before shkiah (sunset)
 * - M=on (default): havdalah at tzeit hakochavim (8.5° below horizon),
 *   matching Chabad.org's astronomical "Shabbos ends" calculation.
 * Do not use m=72 (Rabbeinu Tam) — Chabad does not follow that for Shabbos end.
 */
export const HEBCAL_SHABBAT_PARAMS = {
  cfg: 'json',
  b: '18',
  M: 'on',
} as const;
