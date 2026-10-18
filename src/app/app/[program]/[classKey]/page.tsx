import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar } from '@/components/attendance/AppBar';
import { SchemaBanner } from '@/components/attendance/SchemaBanner';
import { getAttendanceSnapshot } from '@/lib/attendance/data';
import { addDays, formatSessionDate, parseSessionDate, rosterCoversDate, sessionDateLabel } from '@/lib/attendance/dates';
import { getAttendanceClass, getAttendanceProgram } from '@/lib/attendance/programs';
import { ClassBoard } from './ClassBoard';

export default async function ClassSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string; classKey: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { program: programSlug, classKey } = await params;
  const { date } = await searchParams;
  const program = getAttendanceProgram(programSlug);
  const classDef = program ? getAttendanceClass(program, classKey) : null;
  if (!program || !classDef) notFound();

  const sessionDate = parseSessionDate(date);
  const snapshot = await getAttendanceSnapshot(program.slug);
  const prev = `/app/${program.slug}/${classDef.key}?date=${addDays(sessionDate, -7)}`;
  const next = `/app/${program.slug}/${classDef.key}?date=${addDays(sessionDate, 7)}`;

  const children = snapshot.ok
    ? snapshot.data.roster
        .filter((row) => row.classKey === classDef.key && rosterCoversDate(row.joinedOn, row.removedOn, sessionDate))
        .map((row) => {
          const child = snapshot.data.children.find((entry) => entry.id === row.childId);
          const mark = snapshot.data.marks.find(
            (entry) => entry.childId === row.childId && entry.classKey === classDef.key && entry.sessionDate === sessionDate,
          );
          return {
            rosterId: row.id,
            childId: row.childId,
            firstName: child?.firstName ?? 'Child',
            lastName: child?.lastName ?? '',
            status: row.status,
            wasPresent: mark?.wasPresent ?? null,
            behaviorNote: mark?.behaviorNote ?? '',
            participationNote: mark?.participationNote ?? '',
            hebrewNote: mark?.hebrewNote ?? '',
          };
        })
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
    : [];

  return (
    <>
      <AppBar
        backHref={`/app/${program.slug}`}
        backLabel={program.name}
        title={classDef.label}
        subtitle={sessionDateLabel(sessionDate)}
      />
      <div className="px-4 pt-3 flex items-center justify-between gap-3">
        <Link href={prev} className="text-sm font-bold text-navy px-3 py-2 rounded-full bg-white border border-line">
          Previous
        </Link>
        <p className="text-sm font-semibold text-navy text-center">{formatSessionDate(sessionDate)}</p>
        <Link href={next} className="text-sm font-bold text-navy px-3 py-2 rounded-full bg-white border border-line">
          Next
        </Link>
      </div>
      {!snapshot.ok ? (
        <div className="px-4 py-4">
          <SchemaBanner message={snapshot.error} />
        </div>
      ) : (
        <ClassBoard
          key={sessionDate}
          programSlug={program.slug}
          classKey={classDef.key}
          sessionDate={sessionDate}
          grades={classDef.grades}
          children={children}
        />
      )}
    </>
  );
}
