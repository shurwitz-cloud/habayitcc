import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { getAdminRole, isAdminAuthenticated, roleHasCapability } from '@/lib/admin/auth';
import type { AdminRole } from '@/lib/admin/roles';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminRegistrationsPanel } from './AdminPanel';
import { getPendingRegistrations, getScheduledInstallments } from './actions';

export const metadata = {
  title: 'Admin — Program Registrations',
  robots: { index: false, follow: false },
};

export default async function AdminRegistrationsPage() {
  const authed = await isAdminAuthenticated();
  const role = authed ? await getAdminRole() : null;

  return (
    <>
      <Header />
      <main className="flex-1">
        <Section background="cream">
          {!authed ? (
            <AdminLoginForm
              title="Admin sign in"
              description="Manage Hebrew Adventure registrations and site photos."
              alternateLink={{ href: '/admin/crm', label: 'Go to CRM' }}
            />
          ) : role && !roleHasCapability(role, 'registrations') ? (
            <div>
              <AdminNav role={role} />
              <div className="max-w-lg mx-auto bg-white border border-line rounded-2xl p-8 text-center">
                <h1 className="text-2xl font-bold text-navy mb-2">Registrations are restricted</h1>
                <p className="text-muted text-sm">
                  This account can use CRM for events, RSVPs, and applications. Tuition billing stays
                  with office or full admins.
                </p>
              </div>
            </div>
          ) : (
            <AdminRegistrationsPageContent role={role ?? 'admin'} />
          )}
        </Section>
      </main>
      <Footer />
    </>
  );
}

async function AdminRegistrationsPageContent({ role }: { role: AdminRole }) {
  const [pending, scheduled] = await Promise.all([
    getPendingRegistrations(),
    getScheduledInstallments(),
  ]);

  return <AdminRegistrationsPanel pending={pending} scheduled={scheduled} role={role} />;
}
