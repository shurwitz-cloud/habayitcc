'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminLogoutButton } from './AdminLogoutButton';
import type { AdminRole } from '@/lib/admin/roles';
import { roleHasCapability } from '@/lib/admin/roles';

const LINKS = [
  { href: '/admin/crm', label: 'CRM', capability: 'crm' as const },
  { href: '/admin/registrations', label: 'Registrations', capability: 'registrations' as const },
  { href: '/admin/photos', label: 'Photos', capability: 'photos' as const },
] as const;

export function AdminNav({ role = 'admin' }: { role?: AdminRole }) {
  const pathname = usePathname();
  const links = LINKS.filter((link) => roleHasCapability(role, link.capability));

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-line">
      <nav className="flex flex-wrap gap-2 items-center">
        {links.map((link) => {
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
        {role === 'volunteer' && (
          <span className="text-xs text-muted font-semibold uppercase tracking-wide ml-1">
            Volunteer access
          </span>
        )}
      </nav>
      <AdminLogoutButton />
    </div>
  );
}
