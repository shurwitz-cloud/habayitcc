'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminLogoutButton } from './AdminLogoutButton';

const LINKS = [
  { href: '/admin/registrations', label: 'Registrations' },
  { href: '/admin/photos', label: 'Photos' },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-line">
      <nav className="flex flex-wrap gap-2">
        {LINKS.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                active ? 'bg-navy text-white' : 'text-navy hover:bg-soft'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <AdminLogoutButton />
    </div>
  );
}
