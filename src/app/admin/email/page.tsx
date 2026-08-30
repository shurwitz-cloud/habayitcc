import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { getAdminRole, isAdminAuthenticated, roleHasCapability } from '@/lib/admin/auth';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { AdminNav } from '@/components/admin/AdminNav';
import { EmailAdminPanel } from './EmailAdminPanel';

export const metadata = {
  title: 'Admin — Email',
  robots: { index: false, follow: false },
};

export default async function AdminEmailPage() {
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
              description="View sent mail and compose from info@habayitcc.org."
              alternateLink={{ href: '/admin/crm', label: 'Go to CRM' }}
            />
          ) : role && !roleHasCapability(role, 'emails') ? (
            <div>
              <AdminNav role={role} />
              <div className="max-w-lg mx-auto bg-white border border-line rounded-2xl p-8 text-center">
                <h1 className="text-2xl font-bold text-navy mb-2">Email is admin-only</h1>
                <p className="text-muted text-sm">
                  Volunteer accounts can use CRM. Ask an admin if you need email access.
                </p>
              </div>
            </div>
          ) : (
            <EmailAdminPanel role={role ?? 'admin'} />
          )}
        </Section>
      </main>
      <Footer />
    </>
  );
}
