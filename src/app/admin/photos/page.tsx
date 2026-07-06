import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { DEFAULT_SITE_IMAGES, getSiteImages } from '@/lib/site-images/store';
import { PhotoAdminPanel } from './PhotoAdminPanel';

export const metadata = {
  title: 'Admin — Site Photos',
  robots: { index: false, follow: false },
};

export default async function AdminPhotosPage() {
  const authed = await isAdminAuthenticated();

  return (
    <>
      <Header />
      <main className="flex-1">
        <Section background="cream">
          {!authed ? (
            <AdminLoginForm
              title="Admin sign in"
              description="Upload, crop, and save photos for each page slot."
              alternateLink={{ href: '/admin/registrations', label: 'Go to registrations admin' }}
            />
          ) : (
            <AdminPhotosPageContent />
          )}
        </Section>
      </main>
      <Footer />
    </>
  );
}

async function AdminPhotosPageContent() {
  const config = await getSiteImages();
  return <PhotoAdminPanel initialConfig={config} defaults={DEFAULT_SITE_IMAGES} />;
}
