import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar } from '@/components/attendance/AppBar';
import { SchemaBanner } from '@/components/attendance/SchemaBanner';
import { getAttendanceSnapshot } from '@/lib/attendance/data';
import { rosterCoversDate, todayIso } from '@/lib/attendance/dates';
import { getAttendanceProgram } from '@/lib/attendance/programs';
import { PlaceChildForm } from './PlaceChildForm';

export default async function ProgramClassesPage({ params }: { params: Promise<{ program: string }> }) {
  const { program: programSlug } = await params;
  const program = getAttendanceProgram(programSlug);
  if (!program) notFound();

  const snapshot = await getAttendanceSnapshot(program.slug);
  const today = todayIso();

  return (
    <>
      <AppBar backHref="/app" backLabel="HaBayit" title={program.name} subtitle="Choose a class" />
      <div className="px-4 py-4 space-y-3">
        {!snapshot.ok && <SchemaBanner message={snapshot.error} />}
        {program.classes.map((entry) => {
          const kids = snapshot.ok
            ? snapshot.data.roster.filter(
                (row) => row.classKey === entry.key && rosterCoversDate(row.joinedOn, row.removedOn, today),
              )
            : [];
          const tryouts = kids.filter((row) => row.status === 'tryout').length;
          return (
            <Link
              key={entry.key}
              href={`/app/${program.slug}/${entry.key}`}
              className="flex items-center justify-between gap-3 bg-white border border-line rounded-2xl px-5 py-4 min-h-16"
            >
              <span className="text-lg font-bold text-navy">{entry.label}</span>
              <span className="text-sm text-muted text-right">
                {snapshot.ok ? `${kids.length} ${kids.length === 1 ? 'child' : 'children'}` : ''}
                {tryouts > 0 ? ` · ${tryouts} tryout${tryouts === 1 ? '' : 's'}` : ''}
              </span>
            </Link>
          );
        })}

        {snapshot.ok && snapshot.data.unplaced.length > 0 && (
          <section className="bg-white border border-line rounded-2xl p-4 mt-4">
            <h2 className="font-display text-2xl text-navy font-bold">Not in a class yet</h2>
            <p className="text-sm text-muted mt-1 mb-3">
              Their grade is outside K through 5th, so pick the class they should join.
            </p>
            <ul className="space-y-3">
              {snapshot.data.unplaced.map((child) => (
                <li key={child.childId}>
                  <PlaceChildForm
                    programSlug={program.slug}
                    childId={child.childId}
                    name={`${child.firstName} ${child.lastName}`}
                    grade={child.grade}
                    classes={program.classes.map((entry) => ({ key: entry.key, label: entry.label }))}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
