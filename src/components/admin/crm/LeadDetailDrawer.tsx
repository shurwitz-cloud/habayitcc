'use client';

import type { CrmLeadRecord } from '@/lib/admin/crm/types';
import { formatDate, formatDateTime, statusBadgeClass } from '@/lib/admin/crm/utils';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-soft/40 border border-line rounded-xl p-4">
      <h3 className="text-[0.65rem] uppercase tracking-wider text-gold font-bold mb-3">{title}</h3>
      {children}
    </section>
  );
}

export function LeadDetailDrawer({
  lead,
  programName,
  onClose,
  onResolve,
  isPending,
}: {
  lead: CrmLeadRecord;
  programName: string;
  onClose: () => void;
  onResolve?: (contactId: string, resolved: boolean) => void;
  isPending?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <aside className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 bg-navy text-white px-6 py-5 border-b border-navy-deep">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.65rem] uppercase tracking-wider text-gold-light font-bold">
                {programName} inquiry
              </p>
              <h2 className="text-2xl font-bold mt-1">
                {lead.firstName} {lead.lastName}
              </h2>
              <p className="text-white/80 text-sm mt-1">{formatDateTime(lead.createdAt)}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div className="mt-4">
            <span
              className={`inline-block px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase ${statusBadgeClass(lead.isResolved ? 'resolved' : 'open')}`}
            >
              {lead.isResolved ? 'Resolved' : 'Open'}
            </span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <SectionCard title="Contact">
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[0.62rem] uppercase tracking-wider text-muted font-bold">Email</dt>
                <dd className="text-navy mt-0.5">{lead.email}</dd>
              </div>
              <div>
                <dt className="text-[0.62rem] uppercase tracking-wider text-muted font-bold">Phone</dt>
                <dd className="text-navy mt-0.5">{lead.phone ?? '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[0.62rem] uppercase tracking-wider text-muted font-bold">Interest</dt>
                <dd className="text-navy mt-0.5">{lead.interest ?? '—'}</dd>
              </div>
            </dl>
          </SectionCard>

          {lead.message && (
            <SectionCard title="Message">
              <p className="text-sm text-navy whitespace-pre-wrap">{lead.message}</p>
            </SectionCard>
          )}

          <div className="flex flex-wrap gap-3">
            <a
              href={`mailto:${lead.email}`}
              className="px-4 py-2 rounded-full bg-gold text-white text-sm font-bold"
            >
              Email {lead.firstName}
            </a>
            {onResolve && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => onResolve(lead.id, !lead.isResolved)}
                className="px-4 py-2 rounded-full border border-navy text-navy text-sm font-semibold disabled:opacity-60"
              >
                {lead.isResolved ? 'Reopen' : 'Mark resolved'}
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

export function ProgramLeadsTable({
  rows,
  onSelect,
}: {
  rows: CrmLeadRecord[];
  onSelect: (lead: CrmLeadRecord) => void;
}) {
  if (!rows.length) return null;

  return (
    <div className="border-t border-line">
      <p className="px-4 py-3 text-[0.65rem] uppercase tracking-wider text-muted font-bold bg-soft/30">
        Inquiries &amp; leads ({rows.length})
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="px-4 py-3 text-left text-[0.65rem] font-bold uppercase tracking-wide text-muted">
              Date
            </th>
            <th className="px-4 py-3 text-left text-[0.65rem] font-bold uppercase tracking-wide text-muted">
              Name
            </th>
            <th className="px-4 py-3 text-left text-[0.65rem] font-bold uppercase tracking-wide text-muted">
              Email
            </th>
            <th className="px-4 py-3 text-left text-[0.65rem] font-bold uppercase tracking-wide text-muted">
              Interest
            </th>
            <th className="px-4 py-3 text-left text-[0.65rem] font-bold uppercase tracking-wide text-muted">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((lead) => (
            <tr
              key={lead.id}
              className="border-b border-line hover:bg-soft/40 cursor-pointer transition-colors"
              onClick={() => onSelect(lead)}
            >
              <td className="px-4 py-3">{formatDate(lead.createdAt)}</td>
              <td className="px-4 py-3 font-medium text-navy">
                {lead.firstName} {lead.lastName}
              </td>
              <td className="px-4 py-3">{lead.email}</td>
              <td className="px-4 py-3 text-muted">{lead.interest ?? '—'}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[0.62rem] font-bold uppercase ${statusBadgeClass(lead.isResolved ? 'resolved' : 'open')}`}
                >
                  {lead.isResolved ? 'Resolved' : 'Open'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
