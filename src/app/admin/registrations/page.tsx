import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { AdminRegistrationsPanel } from './AdminPanel';
import { getPendingRegistrations, getScheduledInstallments } from './actions';

export const metadata = {
  title: 'Admin — Hebrew Adventure Registrations',
  robots: { index: false, follow: false },
};

export default async function AdminRegistrationsPage() {
  const authed = await isAdminAuthenticated();

  return (
    <>
      <Header />
      <main className="flex-1">
        <Section background="cream">
          {!authed ? (
            <AdminLoginForm
              title="Admin sign in"
              description="Manage Hebrew Adventure registrations and site photos."
              alternateLink={{ href: '/admin/photos', label: 'Go to photo admin' }}
            />
          ) : (
            <AdminRegistrationsPageContent />
          )}
        </Section>
      </main>
      <Footer />
    </>
  );
}

async function AdminRegistrationsPageContent() {
  const [pending, scheduled] = await Promise.all([
    getPendingRegistrations(),
    getScheduledInstallments(),
  ]);

  return <AdminRegistrationsPanel pending={pending} scheduled={scheduled} />;
}
