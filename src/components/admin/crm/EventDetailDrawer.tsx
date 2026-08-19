'use client';

import type { CrmEventRecord, CrmRsvpRecord } from '@/lib/admin/crm/types';
import {
  parseEventMoney,
  parseEventPeople,
} from '@/lib/admin/crm/event-registration-stats';
import { formatDateTime, formatUsd } from '@/lib/admin/crm/utils';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-soft/40 border border-line rounded-xl p-4">
      <h3 className="text-[0.65rem] uppercase tracking-wider text-gold font-bold mb-3">{title}</h3>
      {children}
    </section>
  );
}

function StatTile({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-line px-3 py-2.5 ${
        emphasize ? 'bg-navy text-white border-navy' : 'bg-white'
      }`}
    >
      <p
        className={`text-[0.62rem] uppercase tracking-wider font-bold ${
          emphasize ? 'text-gold-light' : 'text-muted'
        }`}
      >
        {label}
      </p>
      <p className={`text-lg font-bold mt-0.5 tabular-nums ${emphasize ? 'text-white' : 'text-navy'}`}>
        {value}
      </p>
    </div>
  );
}

function peopleLine(r: CrmRsvpRecord): string {
  const people = parseEventPeople(r);
  if (people.adults != null && people.kids != null) {
    return `${people.adults} adult${people.adults === 1 ? '' : 's'} · ${people.kids} kid${
      people.kids === 1 ? '' : 's'
    }`;
  }
  if (people.adults != null) {
    return `${people.adults} adult${people.adults === 1 ? '' : 's'}`;
  }
  if (people.kids != null) {
    return `${people.kids} kid${people.kids === 1 ? '' : 's'}`;
  }
  return `${people.guests} guest${people.guests === 1 ? '' : 's'}`;
}

function moneyLine(r: CrmRsvpRecord): string | null {
  const money = parseEventMoney(r);
  if (!money.hasMoney) return null;
  const parts = [`Tickets ${formatUsd(money.ticket)}`];
  if (money.donation > 0) parts.push(`Donation ${formatUsd(money.donation)}`);
  if (money.fee > 0) parts.push(`Fee ${formatUsd(money.fee)}`);
  parts.push(`Total ${formatUsd(money.total)}`);
  return parts.join(' · ');
}

export function EventDetailDrawer({
  event,
  onClose,
}: {
  event: CrmEventRecord;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <aside className="relative w-full max-w-xl bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 bg-navy text-white px-6 py-5 border-b border-navy-deep">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.65rem] uppercase tracking-wider text-gold-light font-bold">Event</p>
              <h2 className="text-2xl font-bold mt-1">{event.title}</h2>
              <p className="text-white/80 text-sm mt-1">
                {event.dateLabel ?? formatDateTime(event.startsAt)}
                {event.time && ` · ${event.time}`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <SectionCard title="Summary">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <StatTile label="Submissions" value={String(event.rsvpCount)} />
              <StatTile label="Total people" value={String(event.guestTotal)} />
              {event.hasAdultsKids ? (
                <>
                  <StatTile label="Adults" value={String(event.adultsTotal ?? 0)} />
                  <StatTile label="Kids" value={String(event.kidsTotal ?? 0)} />
                </>
              ) : null}
              {event.hasMoney ? (
                <>
                  <StatTile label="Tickets" value={formatUsd(event.ticketTotal)} />
                  <StatTile label="Donations" value={formatUsd(event.donationTotal)} />
                  <StatTile
                    label="Total collected"
                    value={formatUsd(event.revenueTotal)}
                    emphasize
                  />
                </>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Event details">
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[0.62rem] uppercase tracking-wider text-muted font-bold">When</dt>
                <dd className="text-navy mt-0.5">{event.dateLabel ?? formatDateTime(event.startsAt)}</dd>
              </div>
              <div>
                <dt className="text-[0.62rem] uppercase tracking-wider text-muted font-bold">Time</dt>
                <dd className="text-navy mt-0.5">{event.time ?? '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[0.62rem] uppercase tracking-wider text-muted font-bold">Location</dt>
                <dd className="text-navy mt-0.5">{event.location ?? '—'}</dd>
              </div>
              {event.description && (
                <div className="sm:col-span-2">
                  <dt className="text-[0.62rem] uppercase tracking-wider text-muted font-bold">
                    Description
                  </dt>
                  <dd className="text-navy mt-0.5">{event.description}</dd>
                </div>
              )}
              {event.program && (
                <div>
                  <dt className="text-[0.62rem] uppercase tracking-wider text-muted font-bold">
                    Program
                  </dt>
                  <dd className="text-navy mt-0.5">{event.program}</dd>
                </div>
              )}
            </dl>
          </SectionCard>

          <SectionCard title={`Submissions (${event.rsvpCount}) · newest first`}>
            {!event.rsvps.length ? (
              <p className="text-sm text-muted">No submissions yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {event.rsvps.map((r) => {
                  const money = moneyLine(r);
                  return (
                    <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-navy">
                            {r.first_name} {r.last_name}
                          </p>
                          <p className="text-sm text-muted">{r.email}</p>
                          {r.phone && <p className="text-sm text-muted">{r.phone}</p>}
                        </div>
                        <span className="shrink-0 text-sm font-bold text-navy text-right">
                          {peopleLine(r)}
                        </span>
                      </div>
                      {money ? (
                        <p className="text-xs text-navy/80 mt-2 font-medium">{money}</p>
                      ) : null}
                      {r.notes && (
                        <p className="text-xs text-muted mt-2 bg-white rounded-lg px-3 py-2 border border-line whitespace-pre-line">
                          {r.notes}
                        </p>
                      )}
                      <p className="text-[0.62rem] text-muted mt-1">
                        {formatDateTime(r.created_at)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>
      </aside>
    </div>
  );
}
