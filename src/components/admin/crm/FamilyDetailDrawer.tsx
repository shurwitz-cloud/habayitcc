'use client';

import type { CrmFamilyRecord } from '@/lib/admin/crm/types';
import { formatDate, formatDateTime, formatUsd, statusBadgeClass, stripeCustomerUrl } from '@/lib/admin/crm/utils';
import type { Waiver } from '@/types/database';

function labelize(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-[0.62rem] uppercase tracking-wider text-muted font-bold">{label}</p>
      <p className="text-navy text-sm mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-soft/40 border border-line rounded-xl p-4">
      <h3 className="text-[0.65rem] uppercase tracking-wider text-gold font-bold mb-3">{title}</h3>
      {children}
    </section>
  );
}

export function FamilyDetailDrawer({
  family,
  waivers,
  programName,
  onClose,
}: {
  family: CrmFamilyRecord;
  waivers: Waiver[];
  programName?: string;
  onClose: () => void;
}) {
  const primary = family.parents.find((p) => p.is_primary_contact) ?? family.parents[0];
  const status = family.registrations[0]?.status ?? 'unknown';
  const totalTuition = family.registrations.reduce((s, r) => s + Number(r.tuition_total ?? 0), 0);
  const headerLabel = programName ?? family.registrations[0]?.programName ?? 'Program application';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <aside className="relative w-full max-w-xl bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right">
        <div className="sticky top-0 z-10 bg-navy text-white px-6 py-5 border-b border-navy-deep">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.65rem] uppercase tracking-wider text-gold-light font-bold">
                {headerLabel}
              </p>
              <h2 className="text-2xl font-bold mt-1">{family.familyName}</h2>
              <p className="text-white/80 text-sm mt-1">
                Submitted {formatDateTime(family.createdAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-lg leading-none"
              aria-label="Close panel"
            >
              ×
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <span
              className={`inline-block px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase ${statusBadgeClass(status)}`}
            >
              {status}
            </span>
            {family.registrations[0]?.is_chai_partner_rate && (
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase bg-[#fff8e6] text-gold">
                Chai partner rate
              </span>
            )}
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold bg-white/15">
              {family.children.length} child{family.children.length === 1 ? '' : 'ren'}
            </span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {family.parents.map((p) => (
            <SectionCard
              key={p.id}
              title={`${p.relationship ?? 'Parent'} — ${p.first_name} ${p.last_name}`}
            >
              <div className="grid sm:grid-cols-2 gap-4">
                <DetailField label="Email" value={p.email} />
                <DetailField label="Phone" value={p.phone} />
                <DetailField label="Jewish status" value={labelize(p.jewish_status)} />
                {p.jewish_status === 'jewish_by_conversion' && (
                  <>
                    <DetailField label="Conversion org" value={p.conversion_org} />
                    <DetailField label="Certifying rabbi" value={p.conversion_rabbi} />
                  </>
                )}
              </div>
              {p.is_primary_contact && (
                <p className="mt-2 text-[0.62rem] uppercase tracking-wider text-gold font-bold">
                  Primary contact
                </p>
              )}
            </SectionCard>
          ))}

          <SectionCard title="Home & emergency">
            <div className="grid sm:grid-cols-2 gap-4">
              <DetailField label="Address" value={family.address} />
              <DetailField label="Emergency contact" value={family.emergencyContactName} />
              <DetailField label="Emergency phone" value={family.emergencyContactPhone} />
            </div>
          </SectionCard>

          {family.children.map((c) => {
            const reg = family.registrations.find((r) => r.child_id === c.id);
            return (
              <SectionCard key={c.id} title={`Child — ${c.first_name} ${c.last_name}`}>
                <div className="grid sm:grid-cols-2 gap-4">
                  <DetailField label="Hebrew name" value={c.hebrew_name} />
                  <DetailField label="Date of birth" value={c.date_of_birth} />
                  <DetailField label="Birth before sunset" value={labelize(c.born_sunset_timing)} />
                  <DetailField label="Grade" value={c.grade} />
                  <DetailField label="School" value={c.school_attending} />
                  <DetailField label="Hebrew level" value={c.hebrew_level} />
                  <DetailField label="Attended before" value={c.attended_before} />
                  <DetailField label="Allergies" value={c.allergies} />
                  <DetailField label="Medications" value={c.medications} />
                  <DetailField label="Notes" value={c.notes} />
                </div>
                {reg && (
                  <div className="mt-4 pt-4 border-t border-line grid sm:grid-cols-2 gap-4">
                    <DetailField label="Term" value={reg.term} />
                    <DetailField label="Tuition" value={formatUsd(Number(reg.tuition_total ?? 0))} />
                    <DetailField label="Status" value={labelize(reg.status)} />
                    {reg.chai_partner_code_used && (
                      <DetailField label="Chai code used" value={reg.chai_partner_code_used} />
                    )}
                  </div>
                )}
              </SectionCard>
            );
          })}

          <SectionCard title="Billing">
            <div className="grid sm:grid-cols-2 gap-4">
              <DetailField
                label="Payment plan"
                value={family.registrations[0]?.payment_plan?.replace(/_/g, ' ') ?? null}
              />
              <DetailField
                label="Payment method"
                value={
                  family.paymentMethodPreference === 'card'
                    ? 'Credit card (+3%)'
                    : family.paymentMethodPreference === 'bank'
                      ? 'Bank account (ACH)'
                      : family.paymentMethodPreference
                }
              />
              <DetailField label="Total tuition" value={formatUsd(totalTuition)} />
              <DetailField label="Term" value={family.registrations[0]?.term} />
            </div>
            {family.registrations[0]?.notes && (
              <DetailField label="Registration notes" value={family.registrations[0].notes} />
            )}
          </SectionCard>

          {family.notes && (
            <SectionCard title="Family notes">
              <p className="text-sm text-navy whitespace-pre-wrap">{family.notes}</p>
            </SectionCard>
          )}

          {waivers.length > 0 && (
            <SectionCard title="Waivers signed">
              <ul className="space-y-2 text-sm">
                {waivers.map((w) => (
                  <li key={w.id} className="text-navy">
                    {labelize(w.waiver_type)} — signed by {w.signed_by}
                    <span className="text-muted text-xs block">
                      {formatDateTime(w.signed_at)}
                      {w.document_version && ` · ${w.document_version}`}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            {family.stripeCustomerId && (
              <a
                href={stripeCustomerUrl(family.stripeCustomerId)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-full bg-gold text-white text-sm font-bold"
              >
                Open Stripe customer
              </a>
            )}
            <a
              href="/admin/registrations"
              className="px-4 py-2 rounded-full border border-navy text-navy text-sm font-semibold"
            >
              Billing admin →
            </a>
            {primary?.email && (
              <a
                href={`mailto:${primary.email}`}
                className="px-4 py-2 rounded-full border border-line text-navy text-sm font-semibold"
              >
                Email {primary.first_name}
              </a>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
