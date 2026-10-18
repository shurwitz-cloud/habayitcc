import { notFound } from 'next/navigation';
import { AppBar } from '@/components/attendance/AppBar';
import { SchemaBanner } from '@/components/attendance/SchemaBanner';
import { getAttendanceSnapshot } from '@/lib/attendance/data';
import { formatSessionDate, rosterCoversDate } from '@/lib/attendance/dates';
import { getAttendanceClass, getAttendanceProgram } from '@/lib/attendance/programs';
import { attendanceRate, formatRate } from '@/lib/attendance/stats';
import type { ProgressRecord } from '@/lib/attendance/types';
import { ProgressEditor, RemoveTryoutButton } from './ChildTools';

function currentStanding(rows: ProgressRecord[]): ProgressRecord | null {
  return rows[0] ?? null;
}

export default async function ChildAttendancePage({
  params,
}: {
  params: Promise<{ program: string; classKey: string; childId: string }>;
}) {
  const { program: programSlug, classKey, childId } = await params;
  const program = getAttendanceProgram(programSlug);
  const classDef = program ? getAttendanceClass(program, classKey) : null;
  if (!program || !classDef) notFound();

  const snapshot = await getAttendanceSnapshot(program.slug);
  if (!snapshot.ok) {
    return (
      <>
        <AppBar backHref={`/app/${program.slug}/${classDef.key}`} backLabel={classDef.label} title="Child" />
        <div className="px-4 py-4">
          <SchemaBanner message={snapshot.error} />
        </div>
      </>
    );
  }

  const roster =
    snapshot.data.roster.find((row) => row.childId === childId && row.classKey === classDef.key && !row.removedOn) ??
    snapshot.data.roster
      .filter((row) => row.childId === childId && row.classKey === classDef.key)
      .sort((a, b) => b.joinedOn.localeCompare(a.joinedOn))[0];
  const child = snapshot.data.children.find((entry) => entry.id === childId);
  if (!roster || !child) notFound();

  const sessions = snapshot.data.sessions.filter((session) => session.classKey === classDef.key);
  const marks = snapshot.data.marks.filter((mark) => mark.childId === childId && mark.classKey === classDef.key);
  const rate = attendanceRate(sessions, marks, roster.joinedOn, roster.removedOn);
  const history = [...sessions]
    .filter((session) => rosterCoversDate(roster.joinedOn, roster.removedOn, session.sessionDate))
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
  const torah = snapshot.data.progress.filter((row) => row.childId === childId && row.track === 'torah');
  const hebrew = snapshot.data.progress.filter((row) => row.childId === childId && row.track === 'hebrew_reading');

  return (
    <>
      <AppBar
        backHref={`/app/${program.slug}/${classDef.key}`}
        backLabel={classDef.label}
        title={`${child.firstName} ${child.lastName}`}
        subtitle={roster.status === 'tryout' ? 'Tryout' : classDef.label}
      />
      <div className="px-4 py-4 space-y-4">
        <section className="bg-white border border-line rounded-2xl p-4">
          <p className="text-[0.68rem] font-bold uppercase tracking-wider text-gold">Attendance</p>
          <p className="font-display text-[2.4rem] leading-none text-navy font-bold mt-1">
            {rate.percent == null ? '—' : `${rate.percent}%`}
          </p>
          <p className="text-sm text-muted mt-2">{formatRate(rate)}</p>
          {child.hebrewLevel && (
            <p className="text-sm text-navy mt-3">Hebrew level at registration: {child.hebrewLevel}</p>
          )}
        </section>

        <ProgressCard
          label="Torah study"
          rows={torah}
          current={currentStanding(torah)}
          editor={
            <ProgressEditor programSlug={program.slug} childId={child.id} track="torah" label="Torah study" />
          }
        />
        <ProgressCard
          label="Hebrew reading"
          rows={hebrew}
          current={currentStanding(hebrew)}
          editor={
            <ProgressEditor
              programSlug={program.slug}
              childId={child.id}
              track="hebrew_reading"
              label="Hebrew reading"
            />
          }
        />

        <section className="bg-white border border-line rounded-2xl p-4">
          <h2 className="font-display text-2xl text-navy font-bold">Sundays</h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted mt-2">No class Sundays recorded for this child yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {history.map((session) => {
                const mark = marks.find((entry) => entry.sessionDate === session.sessionDate);
                const attendance =
                  mark?.wasPresent === true ? 'Here' : mark?.wasPresent === false ? 'Absent' : 'Not marked';
                return (
                  <li key={session.id} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold text-navy">{formatSessionDate(session.sessionDate)}</p>
                      <p className="text-sm text-muted">{attendance}</p>
                    </div>
                    {mark?.behaviorNote && (
                      <p className="text-sm mt-1">
                        <span className="font-semibold text-navy">Behavior. </span>
                        {mark.behaviorNote}
                      </p>
                    )}
                    {mark?.participationNote && (
                      <p className="text-sm mt-1">
                        <span className="font-semibold text-navy">Participation. </span>
                        {mark.participationNote}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {roster.status === 'tryout' && !roster.removedOn && <RemoveTryoutButton rosterId={roster.id} />}
      </div>
    </>
  );
}

function ProgressCard({
  label,
  rows,
  current,
  editor,
}: {
  label: string;
  rows: ProgressRecord[];
  current: ProgressRecord | null;
  editor: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-line rounded-2xl p-4">
      <h2 className="font-display text-2xl text-navy font-bold">{label}</h2>
      {current ? (
        <div className="mt-2">
          <p className="text-navy font-semibold">{current.standing}</p>
          {current.note && <p className="text-sm text-muted mt-1 whitespace-pre-wrap">{current.note}</p>}
          <p className="text-xs text-muted mt-1">{formatSessionDate(current.recordedOn)}</p>
        </div>
      ) : (
        <p className="text-sm text-muted mt-2">No updates yet. The registration level stays the starting point.</p>
      )}
      {editor}
      {rows.length > 1 && (
        <ul className="mt-4 pt-3 border-t border-line space-y-3">
          {rows.slice(1).map((row) => (
            <li key={row.id}>
              <p className="text-sm font-semibold text-navy">{row.standing}</p>
              {row.note && <p className="text-sm text-muted whitespace-pre-wrap">{row.note}</p>}
              <p className="text-xs text-muted">{formatSessionDate(row.recordedOn)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
