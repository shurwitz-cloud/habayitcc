const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function todayIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Meeting weekday on or before this date (0 = Sunday … 6 = Saturday). */
export function meetingDayOnOrBefore(iso: string, meetingWeekday: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const delta = (weekday - meetingWeekday + 7) % 7;
  return addDays(iso, -delta);
}

/** @deprecated Prefer meetingDayOnOrBefore(iso, 0). */
export function sundayOnOrBefore(iso: string): string {
  return meetingDayOnOrBefore(iso, 0);
}

export function recentMeetingDay(meetingWeekday: number, now = new Date()): string {
  return meetingDayOnOrBefore(todayIso(now), meetingWeekday);
}

export function recentSunday(now = new Date()): string {
  return recentMeetingDay(0, now);
}

export function parseSessionDate(
  value: string | undefined,
  meetingWeekday = 0,
  fallback = recentMeetingDay(meetingWeekday),
): string {
  if (!value || !isIsoDate(value)) return fallback;
  return meetingDayOnOrBefore(value, meetingWeekday);
}

export function formatSessionDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? 'day';
}

export function sessionDateLabel(iso: string, meetingWeekday = 0, today = todayIso()): string {
  const formatted = formatSessionDate(iso);
  if (iso === today) return `${formatted} · today`;
  if (iso === recentMeetingDay(meetingWeekday)) {
    return `${formatted} · last ${weekdayName(meetingWeekday)}`;
  }
  return formatted;
}

/** First date the child is off the roster. Earlier dates still belong to them. */
export function rosterCoversDate(joinedOn: string, removedOn: string | null, sessionDate: string): boolean {
  if (sessionDate < joinedOn) return false;
  if (removedOn && sessionDate >= removedOn) return false;
  return true;
}
