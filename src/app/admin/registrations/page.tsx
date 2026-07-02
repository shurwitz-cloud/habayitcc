import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { AdminLoginForm, AdminRegistrationsPanel } from './AdminPanel';
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
            <AdminLoginForm />
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
