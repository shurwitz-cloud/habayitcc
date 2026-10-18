import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { AdminNav } from '@/components/admin/AdminNav';
import { getAdminRole, isAdminAuthenticated, roleHasCapability } from '@/lib/admin/auth';
import { getAttendanceSnapshot } from '@/lib/attendance/data';
import { getAttendanceProgram } from '@/lib/attendance/programs';
import { AttendanceReport, defaultProgram, reportView } from './AttendanceReport';

export const metadata = {
  title: 'Admin — Attendance',
  robots: { index: false, follow: false },
};

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; class?: string; child?: string; program?: string }>;
}) {
  const authed = await isAdminAuthenticated();
  const role = authed ? await getAdminRole() : null;
  const params = await searchParams;
  const program = getAttendanceProgram(params.program ?? '') ?? defaultProgram();
  const snapshot = authed && role && roleHasCapability(role, 'crm') ? await getAttendanceSnapshot(program.slug) : null;

  return (
    <>
      <Header />
      <main className="flex-1">
        <Section background="cream">
          {!authed || !role ? (
            <AdminLoginForm
              title="Admin sign in"
              description="Sign in to view Hebrew Adventure attendance."
              alternateLink={{ href: '/app', label: 'Open the attendance app' }}
            />
          ) : !roleHasCapability(role, 'crm') ? (
            <div>
              <AdminNav role={role} />
              <p className="text-muted">This account cannot open attendance.</p>
            </div>
          ) : (
            <div>
              <AdminNav role={role} />
              <AttendanceReport
                program={program}
                snapshotError={snapshot && !snapshot.ok ? snapshot.error : null}
                snapshot={snapshot && snapshot.ok ? snapshot.data : null}
                view={reportView(params.view)}
                date={params.date}
                classKey={params.class}
                childId={params.child}
              />
            </div>
          )}
        </Section>
      </main>
      <Footer />
    </>
  );
}
