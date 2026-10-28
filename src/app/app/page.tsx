import Link from 'next/link';
import { AppBar } from '@/components/attendance/AppBar';
import { ATTENDANCE_PROGRAMS } from '@/lib/attendance/programs';

export default function AttendanceHomePage() {
  return (
    <>
      <AppBar title="Programs" subtitle="Open a program, then your class." />
      <div className="px-4 py-4 space-y-3">
        {ATTENDANCE_PROGRAMS.map((program) => (
          <Link
            key={program.slug}
            href={`/app/${program.slug}`}
            className="block bg-white border border-line rounded-2xl px-5 py-5"
          >
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-gold">Program</p>
            <h2 className="font-display text-[2rem] leading-none text-navy font-bold mt-1">{program.name}</h2>
            <p className="text-sm text-muted mt-2">
              {program.classes.length} {program.classes.length === 1 ? 'class' : 'classes'}
            </p>
          </Link>
        ))}
        <p className="text-xs text-muted leading-relaxed pt-4">
          On an iPhone, open Share and choose Add to Home Screen. On Android, open the browser menu and choose Add to
          Home screen. It opens full screen like any other app.
        </p>
        <Link href="/admin/attendance" className="inline-block text-sm font-semibold text-navy pt-2">
          Attendance reports
        </Link>
      </div>
    </>
  );
}
