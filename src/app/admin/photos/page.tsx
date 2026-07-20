import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { getAdminRole, isAdminAuthenticated, roleHasCapability } from '@/lib/admin/auth';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { AdminNav } from '@/components/admin/AdminNav';
import { DEFAULT_SITE_IMAGES, getSiteImages } from '@/lib/site-images/store';
import { PhotoAdminPanel } from './PhotoAdminPanel';

export const metadata = {
  title: 'Admin — Site Photos',
  robots: { index: false, follow: false },
};

export default async function AdminPhotosPage() {
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
              description="Upload, crop, and save photos for each page slot."
              alternateLink={{ href: '/admin/crm', label: 'Go to CRM' }}
            />
          ) : role && !roleHasCapability(role, 'photos') ? (
            <div>
              <AdminNav role={role} />
              <div className="max-w-lg mx-auto bg-white border border-line rounded-2xl p-8 text-center">
                <h1 className="text-2xl font-bold text-navy mb-2">Photos are admin-only</h1>
                <p className="text-muted text-sm">
                  Volunteer accounts can use CRM (without donations or Chai). Ask an admin if you need
                  photo access later.
                </p>
              </div>
            </div>
          ) : (
            <AdminPhotosPageContent role={role ?? 'admin'} />
          )}
        </Section>
      </main>
      <Footer />
    </>
  );
}

async function AdminPhotosPageContent({ role }: { role: 'admin' | 'volunteer' }) {
  const config = await getSiteImages();
  return (
    <PhotoAdminPanel initialConfig={config} defaults={DEFAULT_SITE_IMAGES} role={role} />
  );
}
