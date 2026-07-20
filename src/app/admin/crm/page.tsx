import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { getAdminRole, isAdminAuthenticated } from '@/lib/admin/auth';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { CrmPanel } from './CrmPanel';
import { getCrmSnapshot } from './actions';

export const metadata = {
  title: 'Admin — CRM',
  robots: { index: false, follow: false },
};

export default async function AdminCrmPage() {
  const authed = await isAdminAuthenticated();

  return (
    <>
      <Header />
      <main className="flex-1">
        <Section background="cream">
          {!authed ? (
            <AdminLoginForm
              title="Admin sign in"
              description="Full admins see all CRM data. Volunteers use their own email — CRM without donations or Chai."
              alternateLink={{ href: '/admin/registrations', label: 'Go to registrations admin' }}
            />
          ) : (
            <AdminCrmPageContent />
          )}
        </Section>
      </main>
      <Footer />
    </>
  );
}

async function AdminCrmPageContent() {
  const [snapshot, role] = await Promise.all([getCrmSnapshot(), getAdminRole()]);
  return <CrmPanel snapshot={snapshot} role={role ?? 'admin'} />;
}
