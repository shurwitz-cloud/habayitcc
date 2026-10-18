import Link from 'next/link';
import { SchemaBanner } from '@/components/attendance/SchemaBanner';
import { addDays, formatSessionDate, parseSessionDate, rosterCoversDate, sessionDateLabel } from '@/lib/attendance/dates';
import { getAttendanceProgram, type AttendanceProgram } from '@/lib/attendance/programs';
import { attendanceRate, formatPercent, formatRate } from '@/lib/attendance/stats';
import type { AttendanceChild, AttendanceSnapshot, RosterEntry } from '@/lib/attendance/types';

type ReportView = 'week' | 'class' | 'child';

function childById(children: AttendanceChild[], childId: string): AttendanceChild | undefined {
  return children.find((child) => child.id === childId);
}

function displayName(children: AttendanceChild[], childId: string): string {
  const child = childById(children, childId);
  return child ? `${child.firstName} ${child.lastName}` : 'Child';
}

function markLabel(wasPresent: boolean | null | undefined): string {
  if (wasPresent === true) return 'Here';
  if (wasPresent === false) return 'Absent';
  return 'Not marked';
}

export function AttendanceReport({
  program,
  snapshotError,
  snapshot,
  view,
  date,
  classKey,
  childId,
}: {
  program: AttendanceProgram;
  snapshotError: string | null;
  snapshot: AttendanceSnapshot | null;
  view: ReportView;
  date?: string;
  classKey?: string;
  childId?: string;
}) {
  const sessionDate = parseSessionDate(date);
  const selectedClass = program.classes.find((entry) => entry.key === classKey) ?? program.classes[0];
  const base = `/admin/attendance?program=${program.slug}`;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-gold">HaBayit</p>
          <h1 className="font-display text-4xl text-navy font-bold leading-none">{program.name} attendance</h1>
        </div>
        <Link href={`/app/${program.slug}`} className="text-sm font-bold text-white bg-navy rounded-full px-4 py-2">
          Take attendance
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {(
          [
            ['week', 'By week'],
            ['class', 'By class'],
            ['child', 'By child'],
          ] as const
        ).map(([id, label]) => (
          <Link
            key={id}
            href={
              id === 'week'
                ? `${base}&view=week&date=${sessionDate}`
                : id === 'class'
                  ? `${base}&view=class&class=${selectedClass?.key ?? ''}`
                  : `${base}&view=child${childId ? `&child=${childId}` : ''}`
            }
            className={`px-4 py-2 rounded-full text-sm font-semibold ${
              view === id ? 'bg-navy text-white' : 'bg-white text-navy border border-line'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {snapshotError && <SchemaBanner message={snapshotError} />}

      {snapshot && view === 'week' && (
        <WeekView program={program} snapshot={snapshot} sessionDate={sessionDate} base={base} />
      )}
      {snapshot && view === 'class' && selectedClass && (
        <ClassView program={program} snapshot={snapshot} classKey={selectedClass.key} base={base} />
      )}
      {snapshot && view === 'child' && (
        <ChildView program={program} snapshot={snapshot} childId={childId} base={base} />
      )}

      <p className="text-xs text-muted mt-6 max-w-2xl">
        A Sunday counts toward a percentage after the child is marked here or absent. Children who join later are
        counted from the Sundays they were on the roster.
      </p>
    </div>
  );
}

function WeekView({
  program,
  snapshot,
  sessionDate,
  base,
}: {
  program: AttendanceProgram;
  snapshot: AttendanceSnapshot;
  sessionDate: string;
  base: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold text-navy">{sessionDateLabel(sessionDate)}</h2>
        <div className="flex gap-2">
          <Link
            href={`${base}&view=week&date=${addDays(sessionDate, -7)}`}
            className="px-3 py-1.5 rounded-full border border-line bg-white text-sm font-semibold text-navy"
          >
            Previous Sunday
          </Link>
          <Link
            href={`${base}&view=week&date=${addDays(sessionDate, 7)}`}
            className="px-3 py-1.5 rounded-full border border-line bg-white text-sm font-semibold text-navy"
          >
            Next Sunday
          </Link>
        </div>
      </div>
      <div className="space-y-6">
        {program.classes.map((entry) => {
          const kids = snapshot.roster
            .filter((row) => row.classKey === entry.key && rosterCoversDate(row.joinedOn, row.removedOn, sessionDate))
            .sort((a, b) =>
              displayName(snapshot.children, a.childId).localeCompare(displayName(snapshot.children, b.childId)),
            );
          const marks = kids.map((row) =>
            snapshot.marks.find(
              (mark) => mark.childId === row.childId && mark.classKey === entry.key && mark.sessionDate === sessionDate,
            ),
          );
          const here = marks.filter((mark) => mark?.wasPresent === true).length;
          const absent = marks.filter((mark) => mark?.wasPresent === false).length;
          const unmarked = kids.length - here - absent;
          return (
            <section key={entry.key} className="bg-white border border-line rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-line flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-bold text-navy">{entry.label}</h3>
                <p className="text-sm text-muted">
                  {here} here · {absent} absent · {unmarked} not marked
                </p>
              </div>
              {kids.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted">No children on the list for this Sunday.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[0.68rem] uppercase tracking-wide text-muted">
                        <th className="px-4 py-2 font-bold">Child</th>
                        <th className="px-4 py-2 font-bold">Attendance</th>
                        <th className="px-4 py-2 font-bold">Behavior</th>
                        <th className="px-4 py-2 font-bold">Participation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kids.map((row) => {
                        const mark = snapshot.marks.find(
                          (entryMark) =>
                            entryMark.childId === row.childId &&
                            entryMark.classKey === entry.key &&
                            entryMark.sessionDate === sessionDate,
                        );
                        return (
                          <tr key={row.id} className="border-t border-line align-top">
                            <td className="px-4 py-3">
                              <Link
                                href={`${base}&view=child&child=${row.childId}`}
                                className="font-semibold text-navy"
                              >
                                {displayName(snapshot.children, row.childId)}
                              </Link>
                              {row.status === 'tryout' && (
                                <p className="text-[0.68rem] font-bold uppercase tracking-wide text-gold">Tryout</p>
                              )}
                            </td>
                            <td className="px-4 py-3">{markLabel(mark?.wasPresent)}</td>
                            <td className="px-4 py-3 whitespace-pre-wrap">{mark?.behaviorNote || '—'}</td>
                            <td className="px-4 py-3 whitespace-pre-wrap">{mark?.participationNote || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ClassView({
  program,
  snapshot,
  classKey,
  base,
}: {
  program: AttendanceProgram;
  snapshot: AttendanceSnapshot;
  classKey: string;
  base: string;
}) {
  const classDef = program.classes.find((entry) => entry.key === classKey) ?? program.classes[0];
  const stints = snapshot.roster
    .filter((row) => row.classKey === classDef.key)
    .sort((a, b) => displayName(snapshot.children, a.childId).localeCompare(displayName(snapshot.children, b.childId)));
  const sessions = snapshot.sessions
    .filter((session) => session.classKey === classDef.key)
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));

  return (
    <div>
      <form method="get" className="flex flex-wrap items-center gap-2 mb-4">
        <input type="hidden" name="program" value={program.slug} />
        <input type="hidden" name="view" value="class" />
        <label className="text-sm font-semibold text-navy" htmlFor="class-select">
          Class
        </label>
        <select id="class-select" name="class" defaultValue={classDef.key} className="max-w-xs">
          {program.classes.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
        <button type="submit" className="px-4 py-2 rounded-full bg-navy text-white text-sm font-bold">
          Show
        </button>
      </form>

      <section className="bg-white border border-line rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[0.68rem] uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-bold">Child</th>
                <th className="px-4 py-2 font-bold">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {stints.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-muted" colSpan={2}>
                    No children in this class yet.
                  </td>
                </tr>
              )}
              {stints.map((row) => {
                const rate = rateFor(snapshot, row);
                return (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <Link href={`${base}&view=child&child=${row.childId}`} className="font-semibold text-navy">
                        {displayName(snapshot.children, row.childId)}
                      </Link>
                      <p className="text-xs text-muted">
                        {row.status === 'tryout' ? 'Tryout' : 'Enrolled'}
                        {row.removedOn ? ` · left ${formatSessionDate(row.removedOn)}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-navy">{formatPercent(rate.percent)}</span>
                      <span className="text-muted"> · {formatRate(rate)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 bg-white border border-line rounded-2xl p-4">
        <h3 className="font-bold text-navy mb-2">Sundays</h3>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted">No Sundays recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {sessions.map((session) => {
              const roster = snapshot.roster.filter(
                (row) => row.classKey === classDef.key && rosterCoversDate(row.joinedOn, row.removedOn, session.sessionDate),
              );
              const marks = snapshot.marks.filter(
                (mark) => mark.classKey === classDef.key && mark.sessionDate === session.sessionDate,
              );
              const here = marks.filter((mark) => mark.wasPresent === true).length;
              const absent = marks.filter((mark) => mark.wasPresent === false).length;
              return (
                <li key={session.id} className="py-2 flex flex-wrap justify-between gap-2 text-sm">
                  <Link href={`${base}&view=week&date=${session.sessionDate}`} className="font-semibold text-navy">
                    {formatSessionDate(session.sessionDate)}
                  </Link>
                  <span className="text-muted">
                    {here} here · {absent} absent · {Math.max(roster.length - here - absent, 0)} not marked
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function ChildView({
  program,
  snapshot,
  childId,
  base,
}: {
  program: AttendanceProgram;
  snapshot: AttendanceSnapshot;
  childId?: string;
  base: string;
}) {
  const options = [...snapshot.roster].sort((a, b) =>
    displayName(snapshot.children, a.childId).localeCompare(displayName(snapshot.children, b.childId)),
  );
  const seen = new Set<string>();
  const unique = options.filter((row) => {
    if (seen.has(row.childId)) return false;
    seen.add(row.childId);
    return true;
  });
  const child = childId ? childById(snapshot.children, childId) : undefined;
  const stints = childId
    ? snapshot.roster
        .filter((row) => row.childId === childId)
        .sort((a, b) => b.joinedOn.localeCompare(a.joinedOn))
    : [];
  const torah = snapshot.progress.filter((row) => row.childId === childId && row.track === 'torah');
  const hebrew = snapshot.progress.filter((row) => row.childId === childId && row.track === 'hebrew_reading');

  return (
    <div>
      <form method="get" className="flex flex-wrap items-center gap-2 mb-4">
        <input type="hidden" name="program" value={program.slug} />
        <input type="hidden" name="view" value="child" />
        <label className="text-sm font-semibold text-navy" htmlFor="child-select">
          Child
        </label>
        <select id="child-select" name="child" defaultValue={childId ?? ''} className="max-w-sm">
          <option value="">Choose a child</option>
          {unique.map((row) => (
            <option key={row.childId} value={row.childId}>
              {displayName(snapshot.children, row.childId)}
            </option>
          ))}
        </select>
        <button type="submit" className="px-4 py-2 rounded-full bg-navy text-white text-sm font-bold">
          Show
        </button>
      </form>

      {!childId && <p className="text-sm text-muted">Pick a child to see attendance, Torah study, and Hebrew reading.</p>}
      {childId && !child && (
        <p className="text-sm text-muted">This child is not on a Hebrew Adventure class list yet.</p>
      )}

      {child && (
        <div className="space-y-4">
          <section className="bg-white border border-line rounded-2xl p-4">
            <h2 className="font-display text-3xl text-navy font-bold">
              {child.firstName} {child.lastName}
            </h2>
            {child.hebrewLevel && (
              <p className="text-sm text-navy mt-2">Hebrew level at registration: {child.hebrewLevel}</p>
            )}
          </section>

          <div className="grid md:grid-cols-2 gap-4">
            <ProgressPanel title="Torah study" rows={torah} />
            <ProgressPanel title="Hebrew reading" rows={hebrew} />
          </div>

          {stints.map((stint) => {
            const classDef = program.classes.find((entry) => entry.key === stint.classKey);
            const rate = rateFor(snapshot, stint);
            const sessions = snapshot.sessions
              .filter(
                (session) =>
                  session.classKey === stint.classKey &&
                  rosterCoversDate(stint.joinedOn, stint.removedOn, session.sessionDate),
              )
              .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
            return (
              <section key={stint.id} className="bg-white border border-line rounded-2xl p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-bold text-navy">{classDef?.label ?? stint.classKey}</h3>
                  <p className="text-sm text-muted">
                    {stint.status === 'tryout' ? 'Tryout' : 'Enrolled'}
                    {stint.removedOn ? ` · left ${formatSessionDate(stint.removedOn)}` : ''}
                  </p>
                </div>
                <p className="font-display text-3xl text-navy font-bold mt-1">{formatPercent(rate.percent)}</p>
                <p className="text-sm text-muted">{formatRate(rate)}</p>
                <ul className="mt-3 divide-y divide-line">
                  {sessions.length === 0 && <li className="py-2 text-sm text-muted">No Sundays recorded.</li>}
                  {sessions.map((session) => {
                    const mark = snapshot.marks.find(
                      (entry) =>
                        entry.childId === stint.childId &&
                        entry.classKey === stint.classKey &&
                        entry.sessionDate === session.sessionDate,
                    );
                    return (
                      <li key={session.id} className="py-2 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="font-semibold text-navy">{formatSessionDate(session.sessionDate)}</span>
                          <span>{markLabel(mark?.wasPresent)}</span>
                        </div>
                        {mark?.behaviorNote && <p className="mt-1 whitespace-pre-wrap">Behavior: {mark.behaviorNote}</p>}
                        {mark?.participationNote && (
                          <p className="mt-1 whitespace-pre-wrap">Participation: {mark.participationNote}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProgressPanel({
  title,
  rows,
}: {
  title: string;
  rows: AttendanceSnapshot['progress'];
}) {
  const current = rows[0];
  return (
    <section className="bg-white border border-line rounded-2xl p-4">
      <h3 className="font-bold text-navy">{title}</h3>
      {!current && <p className="text-sm text-muted mt-2">No updates yet.</p>}
      {current && (
        <div className="mt-2">
          <p className="font-semibold text-navy">{current.standing}</p>
          {current.note && <p className="text-sm whitespace-pre-wrap mt-1">{current.note}</p>}
          <p className="text-xs text-muted mt-1">{formatSessionDate(current.recordedOn)}</p>
        </div>
      )}
      {rows.length > 1 && (
        <ul className="mt-3 pt-3 border-t border-line space-y-2">
          {rows.slice(1).map((row) => (
            <li key={row.id} className="text-sm">
              <p className="font-semibold text-navy">{row.standing}</p>
              {row.note && <p className="whitespace-pre-wrap">{row.note}</p>}
              <p className="text-xs text-muted">{formatSessionDate(row.recordedOn)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function rateFor(snapshot: AttendanceSnapshot, row: RosterEntry) {
  const sessions = snapshot.sessions.filter((session) => session.classKey === row.classKey);
  const marks = snapshot.marks.filter((mark) => mark.childId === row.childId && mark.classKey === row.classKey);
  return attendanceRate(sessions, marks, row.joinedOn, row.removedOn);
}

export function reportView(value: string | undefined): ReportView {
  if (value === 'class' || value === 'child') return value;
  return 'week';
}

export function defaultProgram(): AttendanceProgram {
  const program = getAttendanceProgram('hebrew-adventure');
  if (!program) throw new Error('Hebrew Adventure attendance is not configured.');
  return program;
}
