import type { Metadata, Viewport } from 'next';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';

export const metadata: Metadata = {
  title: 'HaBayit',
  applicationName: 'HaBayit',
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: 'HaBayit',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#172643',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function AttendanceAppLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAdminAuthenticated();
  if (!authed) {
    return (
      <div className="min-h-dvh bg-cream px-4 py-10">
        <AdminLoginForm
          title="HaBayit"
          description="Teachers: name teacher, then your password. Open Hebrew Adventure and your class."
          defaultEmail="teacher"
          emailLabel="Name"
          emailPlaceholder="teacher"
          emailInputMode="text"
        />
      </div>
    );
  }

  return <div className="min-h-dvh bg-cream">{children}</div>;
}
