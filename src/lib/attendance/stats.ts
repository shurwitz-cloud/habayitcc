import { rosterCoversDate } from './dates';

export type AttendanceMark = {
  sessionDate: string;
  wasPresent: boolean | null;
};

export type AttendanceRate = {
  present: number;
  counted: number;
  percent: number | null;
};

/**
 * Percentage is present Sundays divided by Sundays the class met
 * while this child was on the roster and someone marked them here or absent.
 * A note with no here/absent mark does not count yet.
 */
export function attendanceRate(
  sessions: { sessionDate: string }[],
  marks: AttendanceMark[],
  joinedOn: string,
  removedOn: string | null,
): AttendanceRate {
  const markByDate = new Map<string, boolean | null>();
  for (const mark of marks) markByDate.set(mark.sessionDate, mark.wasPresent);

  let present = 0;
  let counted = 0;
  for (const session of sessions) {
    if (!rosterCoversDate(joinedOn, removedOn, session.sessionDate)) continue;
    const mark = markByDate.get(session.sessionDate);
    if (mark == null) continue;
    counted += 1;
    if (mark) present += 1;
  }

  return {
    present,
    counted,
    percent: counted === 0 ? null : Math.round((present / counted) * 100),
  };
}

export function formatPercent(percent: number | null): string {
  return percent == null ? '—' : `${percent}%`;
}

export function formatRate(rate: AttendanceRate): string {
  if (rate.counted === 0) return 'No Sundays marked yet';
  const sunday = rate.counted === 1 ? 'Sunday' : 'Sundays';
  return `${rate.present} of ${rate.counted} ${sunday} · ${rate.percent}%`;
}
