'use client';

import { useMemo, useState, useTransition, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { AdminNav } from '@/components/admin/AdminNav';
import { CrmFilterBar } from '@/components/admin/crm/CrmFilterBar';
import { EventDetailDrawer } from '@/components/admin/crm/EventDetailDrawer';
import { FamilyDetailDrawer } from '@/components/admin/crm/FamilyDetailDrawer';
import { LeadDetailDrawer, ProgramLeadsTable } from '@/components/admin/crm/LeadDetailDrawer';
import {
  ProgramApplicationsPanel,
  ProgramApplicationsSummary,
} from '@/components/admin/crm/ProgramApplicationsPanel';
import { BackfillHebrewFairCodesButton } from '@/components/admin/BackfillHebrewFairCodesButton';
import { HEBREW_ADVENTURE_SLUG } from '@/lib/programs/names';
import {
  EventTabsPanel,
  EventTabsSummary,
} from '@/components/admin/crm/EventTabsPanel';
import { SortableTh } from '@/components/admin/crm/SortableTh';
import type {
  CrmEventRecord,
  CrmFamilyRecord,
  CrmLeadRecord,
  CrmSnapshot,
  CrmView,
  DateFilter,
} from '@/lib/admin/crm/types';
import type { AdminRole } from '@/lib/admin/roles';
import { roleHasCapability, VOLUNTEER_HIDDEN_CRM_VIEWS } from '@/lib/admin/roles';
import { activityTypeLabel, buildActivityFeed } from '@/lib/admin/crm/activity';
import { resolvePaymentParty } from '@/lib/admin/crm/payment-party';
import {
  DEFAULT_SORT_KEY,
  EMPTY_DETAIL_FILTERS,
  getSortDefaultDir,
  matchesAmountRange,
  matchesDateRange,
  sortRows,
  toggleSort,
  type DateRange,
  type DetailFilters,
  type SortDir,
} from '@/lib/admin/crm/filters';
import {
  exportCsv,
  formatDate,
  formatDateTime,
  formatUsd,
  matchesSearch,
  statusBadgeClass,
  stripeCustomerUrl,
  stripePaymentUrl,
} from '@/lib/admin/crm/utils';
import { setContactResolved, addImportantDate } from './actions';
import { ReconcileStripeButton } from '@/components/admin/ReconcileStripeButton';
import { ReconcileZeffyButton } from '@/components/admin/ReconcileZeffyButton';
import { BackfillHebrewBirthdaysButton } from '@/components/admin/BackfillHebrewBirthdaysButton';
import { SyncImportantDatesSheetButton } from '@/components/admin/SyncImportantDatesSheetButton';
import { ManualEntryForm } from '@/components/admin/ManualEntryForm';
import { DeleteCrmEntryButton } from '@/components/admin/DeleteCrmEntryButton';
import { RecoverPaidEventRegistrationsButton } from '@/components/admin/RecoverPaidEventRegistrationsButton';
import {
  parseEventMoney,
  parseEventPeople,
} from '@/lib/admin/crm/event-registration-stats';
import {
  coverageMonthsOf,
  paymentCoversThrough,
} from '@/lib/donations/payment-coverage';
import {
  formatHebrewAnnualLabel,
  formatHebrewDisplayDate,
  getHebrewAnnualSortKey,
  getHebrewYearSortKey,
} from '@/lib/hebrew-birthday/hebrew-annual-order';
import {
  eventShowsAdults,
  eventShowsKids,
  resolveEventPeopleMode,
  type EventPeopleMode,
} from '@/lib/admin/crm/event-display';

const VIEWS: { id: CrmView; label: string }[] = [
  { id: 'activity', label: 'All activity' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'events', label: 'Events' },
  { id: 'rsvps', label: 'RSVPs' },
  { id: 'applications', label: 'Applications' },
  { id: 'donations', label: 'Donations' },
  { id: 'chai', label: 'Chai partners' },
  { id: 'payments', label: 'Payments' },
  { id: 'dates', label: 'Birthdays & yahrzeit' },
  { id: 'submissions', label: 'Form log' },
];

export function CrmPanel({
  snapshot,
  role = 'admin',
}: {
  snapshot: CrmSnapshot;
  role?: AdminRole;
}) {
  const router = useRouter();
  const canSeeFinance = roleHasCapability(role, 'crm_finance');
  const views = useMemo(
    () =>
      canSeeFinance
        ? VIEWS
        : VIEWS.filter(
            (v) =>
              !(VOLUNTEER_HIDDEN_CRM_VIEWS as readonly string[]).includes(v.id)
          ),
    [canSeeFinance]
  );
  const [view, setView] = useState<CrmView>('activity');
  const [search, setSearch] = useState('');
  const [datePreset, setDatePreset] = useState<DateFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [detailFilters, setDetailFilters] = useState<DetailFilters>(EMPTY_DETAIL_FILTERS);
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerFamily, setDrawerFamily] = useState<CrmFamilyRecord | null>(null);
  const [drawerEvent, setDrawerEvent] = useState<CrmEventRecord | null>(null);
  const [drawerLead, setDrawerLead] = useState<CrmLeadRecord | null>(null);
  const [applicationProgramSlug, setApplicationProgramSlug] = useState(
    () => snapshot.programTracks[0]?.programSlug ?? 'hebrew-adventure',
  );
  /** Event sub-tab under Events / RSVPs (`all` or event id). */
  const [selectedEventId, setSelectedEventId] = useState('all');
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const dateRange: DateRange = useMemo(
    () => ({ preset: datePreset, from: dateFrom, to: dateTo }),
    [datePreset, dateFrom, dateTo],
  );

  function switchView(next: CrmView) {
    setView(next);
    setStatusFilter('all');
    setDetailFilters(EMPTY_DETAIL_FILTERS);
    setSelectedEventId('all');
    setExpandedId(null);
    setDrawerFamily(null);
    setDrawerEvent(null);
    setDrawerLead(null);
    const nextSortKey = DEFAULT_SORT_KEY[next] ?? 'date';
    setSortKey(nextSortKey);
    setSortDir(getSortDefaultDir(nextSortKey));
  }

  function clearFilters() {
    setSearch('');
    setDatePreset('all');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
    setDetailFilters(EMPTY_DETAIL_FILTERS);
    setSelectedEventId('all');
  }

  function handleSort(key: string) {
    const next = toggleSort(sortKey, sortDir, key, getSortDefaultDir(key));
    setSortKey(next.key);
    setSortDir(next.dir);
  }

  const activity = useMemo(() => buildActivityFeed(snapshot), [snapshot]);

  const statusOptions = useMemo(() => {
    if (view === 'contacts') return ['all', 'open', 'resolved'];
    if (view === 'donations' || view === 'payments') {
      return ['all', 'succeeded', 'pending', 'failed', 'refunded'];
    }
    if (view === 'chai') return ['all', 'active', 'paused', 'cancelled'];
    if (view === 'applications') return ['all', 'open', 'resolved', 'pending', 'accepted', 'active', 'withdrawn'];
    if (view === 'dates') return ['all', 'birthday', 'yahrzeit', 'anniversary', 'other'];
    if (view === 'submissions') return ['all', 'contact', 'donation', 'chai_partner', 'hebrew_adventure_registration', 'achim_registration', 'rsvp'];
    return ['all'];
  }, [view]);

  const filteredActivity = useMemo(() => {
    const typeFilter = viewSingular(view);
    return activity.filter((item) => {
      if (view !== 'activity' && typeFilter && item.type !== typeFilter) return false;
      if (!matchesDateRange(item.createdAt, dateRange)) return false;
      if (statusFilter !== 'all' && (item.status ?? '').toLowerCase() !== statusFilter) return false;
      return matchesSearch(search, [item.title, item.subtitle, item.email, item.status]);
    });
  }, [activity, view, dateRange, statusFilter, search]);

  const filteredContacts = useMemo(
    () => filterContacts(snapshot, search, dateRange, statusFilter, detailFilters),
    [snapshot, search, dateRange, statusFilter, detailFilters],
  );
  const filteredDonations = useMemo(
    () => filterDonations(snapshot, search, dateRange, statusFilter, detailFilters),
    [snapshot, search, dateRange, statusFilter, detailFilters],
  );
  const filteredChai = useMemo(
    () => filterChai(snapshot, search, dateRange, statusFilter, detailFilters),
    [snapshot, search, dateRange, statusFilter, detailFilters],
  );
  const activeProgramTrack = useMemo(
    () =>
      snapshot.programTracks.find((t) => t.programSlug === applicationProgramSlug) ??
      snapshot.programTracks[0],
    [snapshot.programTracks, applicationProgramSlug],
  );

  const filteredApplications = useMemo(
    () =>
      filterApplications(
        snapshot,
        applicationProgramSlug,
        search,
        dateRange,
        statusFilter,
      ),
    [snapshot, applicationProgramSlug, search, dateRange, statusFilter],
  );
  const filteredLeads = useMemo(
    () => filterLeads(snapshot, applicationProgramSlug, search, dateRange, statusFilter),
    [snapshot, applicationProgramSlug, search, dateRange, statusFilter],
  );
  const activeEvent = useMemo(
    () =>
      selectedEventId === 'all'
        ? undefined
        : snapshot.events.find((e) => e.id === selectedEventId),
    [snapshot.events, selectedEventId],
  );

  const filteredEvents = useMemo(
    () => filterEvents(snapshot, search, dateRange, selectedEventId),
    [snapshot, search, dateRange, selectedEventId],
  );
  const filteredPayments = useMemo(
    () => filterPayments(snapshot, search, dateRange, statusFilter, detailFilters),
    [snapshot, search, dateRange, statusFilter, detailFilters],
  );
  const filteredRsvps = useMemo(
    () => filterRsvps(snapshot, search, dateRange, selectedEventId),
    [snapshot, search, dateRange, selectedEventId],
  );
  const filteredDates = useMemo(
    () => filterDates(snapshot, search, statusFilter),
    [snapshot, search, statusFilter],
  );
  const filteredSubmissions = useMemo(
    () => filterSubmissions(snapshot, search, dateRange, statusFilter),
    [snapshot, search, dateRange, statusFilter],
  );

  const sortedActivity = useMemo(
    () =>
      sortRows(filteredActivity, (r) => {
        if (sortKey === 'name') return r.title;
        if (sortKey === 'email') return r.email ?? '';
        if (sortKey === 'amount') return r.amount ?? -1;
        if (sortKey === 'type') return r.type;
        if (sortKey === 'status') return r.status ?? '';
        return new Date(r.createdAt).getTime();
      }, sortDir),
    [filteredActivity, sortKey, sortDir],
  );
  const sortedContacts = useMemo(
    () =>
      sortRows(filteredContacts, (c) => {
        if (sortKey === 'name') return `${c.last_name} ${c.first_name}`;
        if (sortKey === 'email') return c.email;
        if (sortKey === 'interest') return c.interest ?? '';
        if (sortKey === 'status') return c.is_resolved ? 'resolved' : 'open';
        return new Date(c.created_at).getTime();
      }, sortDir),
    [filteredContacts, sortKey, sortDir],
  );
  const sortedDonations = useMemo(
    () =>
      sortRows(filteredDonations, (d) => {
        if (sortKey === 'name') return `${d.last_name} ${d.first_name}`;
        if (sortKey === 'email') return d.email;
        if (sortKey === 'amount') return Number(d.amount);
        if (sortKey === 'status') return d.status;
        return new Date(d.created_at).getTime();
      }, sortDir),
    [filteredDonations, sortKey, sortDir],
  );
  const sortedChai = useMemo(
    () =>
      sortRows(filteredChai, (c) => {
        if (sortKey === 'name') return `${c.last_name} ${c.first_name}`;
        if (sortKey === 'email') return c.email;
        if (sortKey === 'monthly') return Number(c.monthly_amount);
        if (sortKey === 'status') return c.status;
        return new Date(c.created_at).getTime();
      }, sortDir),
    [filteredChai, sortKey, sortDir],
  );
  const chaiSummary = useMemo(() => {
    const count = sortedChai.length;
    const monthlyTotal = sortedChai.reduce(
      (sum, c) => sum + Number(c.monthly_amount || 0),
      0,
    );
    return {
      count,
      monthlyTotal,
      average: count > 0 ? monthlyTotal / count : 0,
      yearlyTotal: monthlyTotal * 12,
    };
  }, [sortedChai]);
  const sortedApplications = useMemo(
    () =>
      sortRows(filteredApplications, (f) => {
        if (sortKey === 'family') return f.familyName;
        const primary = f.parents.find((p) => p.is_primary_contact) ?? f.parents[0];
        if (sortKey === 'email') return primary?.email ?? '';
        if (sortKey === 'status') return f.registrations[0]?.status ?? '';
        if (sortKey === 'children') return f.children.length;
        return new Date(f.createdAt).getTime();
      }, sortDir),
    [filteredApplications, sortKey, sortDir],
  );
  const sortedEvents = useMemo(
    () =>
      sortRows(filteredEvents, (e) => {
        if (sortKey === 'name') return e.title;
        if (sortKey === 'rsvps') return e.rsvpCount;
        if (sortKey === 'guests') return e.guestTotal;
        return new Date(e.startsAt).getTime();
      }, sortDir),
    [filteredEvents, sortKey, sortDir],
  );
  const sortedRsvps = useMemo(
    () =>
      sortRows(filteredRsvps, (r) => {
        if (sortKey === 'event') return r.eventTitle;
        if (sortKey === 'name') return `${r.last_name} ${r.first_name}`;
        if (sortKey === 'email') return r.email ?? '';
        if (sortKey === 'guests') return r.guest_count;
        if (sortKey === 'donation') return parseEventMoney(r).donation;
        if (sortKey === 'adults') return parseEventPeople(r).adults ?? 0;
        if (sortKey === 'kids') return parseEventPeople(r).kids ?? 0;
        return new Date(r.created_at).getTime();
      }, sortDir),
    [filteredRsvps, sortKey, sortDir],
  );
  const sortedPayments = useMemo(
    () =>
      sortRows(filteredPayments, (p) => {
        const party = resolvePaymentParty(p, snapshot);
        if (sortKey === 'name') return party.name;
        if (sortKey === 'email') return party.email ?? '';
        if (sortKey === 'source') return party.sourceLabel;
        if (sortKey === 'amount') return Number(p.amount);
        if (sortKey === 'status') return p.status;
        return new Date(p.paid_at ?? p.created_at).getTime();
      }, sortDir),
    [filteredPayments, sortKey, sortDir, snapshot],
  );
  const sortedDates = useMemo(() => {
    const rows = [...filteredDates];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
      } else if (sortKey === 'type') {
        cmp = a.date_type.localeCompare(b.date_type);
      } else if (sortKey === 'yearOrder') {
        cmp = getHebrewAnnualSortKey(a.hebrew_date) - getHebrewAnnualSortKey(b.hebrew_date);
        if (cmp === 0) {
          cmp = (a.gregorian_date ?? '').localeCompare(b.gregorian_date ?? '');
        }
      } else if (sortKey === 'hebrew') {
        cmp = getHebrewYearSortKey(a.hebrew_date) - getHebrewYearSortKey(b.hebrew_date);
        if (cmp === 0) {
          cmp = getHebrewAnnualSortKey(a.hebrew_date) - getHebrewAnnualSortKey(b.hebrew_date);
        }
        if (cmp === 0) {
          cmp = (a.gregorian_date ?? '').localeCompare(b.gregorian_date ?? '');
        }
      } else if (sortKey === 'date') {
        cmp = (a.gregorian_date ?? '').localeCompare(b.gregorian_date ?? '');
      } else {
        cmp = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filteredDates, sortKey, sortDir]);
  const sortedSubmissions = useMemo(
    () =>
      sortRows(filteredSubmissions, (s) => {
        if (sortKey === 'form') return s.form_type;
        if (sortKey === 'email') return s.email ?? '';
        return new Date(s.created_at).getTime();
      }, sortDir),
    [filteredSubmissions, sortKey, sortDir],
  );

  const sortProps = { sortKey, sortDir, onSort: handleSort };

  function handleResolve(contactId: string, resolved: boolean) {
    setMessage('');
    startTransition(async () => {
      const result = await setContactResolved(contactId, resolved);
      if (result.success) {
        setMessage(resolved ? 'Marked resolved.' : 'Reopened.');
        router.refresh();
      } else {
        setMessage(result.error ?? 'Update failed.');
      }
    });
  }

  function handleExport() {
    if (view === 'contacts') {
      exportCsv(
        'habayit-contacts.csv',
        ['Date', 'Name', 'Email', 'Phone', 'Interest', 'Status', 'Message'],
        filteredContacts.map((c) => [
          formatDate(c.created_at),
          `${c.first_name} ${c.last_name}`,
          c.email,
          c.phone ?? '',
          c.interest ?? '',
          c.is_resolved ? 'Resolved' : 'Open',
          c.message ?? '',
        ]),
      );
      return;
    }
    if (view === 'rsvps') {
      exportCsv(
        'habayit-rsvps.csv',
        ['Date', 'Event', 'Name', 'Email', 'Phone', 'Guests', 'Notes'],
        filteredRsvps.map((r) => [
          formatDate(r.created_at),
          r.eventTitle,
          `${r.first_name} ${r.last_name}`,
          r.email ?? '',
          r.phone ?? '',
          String(r.guest_count),
          r.notes ?? '',
        ]),
      );
      return;
    }
    if (view === 'donations') {
      exportCsv(
        'habayit-donations.csv',
        ['Date', 'Name', 'Email', 'Amount', 'Status', 'Dedication'],
        filteredDonations.map((d) => [
          formatDate(d.created_at),
          `${d.first_name} ${d.last_name}`,
          d.email,
          String(d.amount),
          d.status,
          d.dedication_name ?? '',
        ]),
      );
      return;
    }
    if (view === 'chai') {
      exportCsv(
        'habayit-chai-partners.csv',
        ['Date', 'Name', 'Email', 'Monthly', 'Status', 'City', 'Access code'],
        filteredChai.map((c) => [
          formatDate(c.created_at),
          `${c.first_name} ${c.last_name}`,
          c.email,
          String(c.monthly_amount),
          c.status,
          c.city ?? '',
          c.access_code ?? '',
        ]),
      );
      return;
    }
    if (view === 'applications') {
      const label = activeProgramTrack?.tabLabel ?? 'program';
      exportCsv(
        `habayit-${label.toLowerCase().replace(/\s+/g, '-')}-applications.csv`,
        ['Date', 'Family', 'Parent email', 'Children', 'Status', 'Tuition', 'Hebrew event codes'],
        filteredApplications.map((f) => {
          const primary = f.parents.find((p) => p.is_primary_contact) ?? f.parents[0];
          const total = f.registrations.reduce((s, r) => s + Number(r.tuition_total ?? 0), 0);
          const codes = f.registrations
            .map((r) =>
              r.fair_access_code
                ? `${r.childName}: ${r.fair_access_code}`
                : null
            )
            .filter(Boolean)
            .join('; ');
          return [
            formatDate(f.createdAt),
            f.familyName,
            primary?.email ?? '',
            String(f.children.length),
            f.registrations.map((r) => r.status).join('; '),
            String(total),
            codes,
          ];
        }),
      );
      return;
    }
    if (view === 'events') {
      if (selectedEventId !== 'all') {
          exportCsv(
          'habayit-event-submissions.csv',
          [
            'Date',
            'Event',
            'Name',
            'Email',
            'Phone',
            'People',
            'Adults',
            'Kids',
            'Tickets',
            'Donation',
            'Total',
            'Notes',
          ],
          filteredRsvps.map((r) => {
            const mode = resolveEventPeopleMode(r.event_slug);
            const people = parseEventPeople(r);
            const money = parseEventMoney(r);
            return [
              formatDateTime(r.created_at),
              r.eventTitle,
              `${r.first_name} ${r.last_name}`,
              r.email ?? '',
              r.phone ?? '',
              String(people.guests),
              eventShowsAdults(mode) ? String(people.adults ?? 0) : '',
              eventShowsKids(mode) ? String(people.kids ?? 0) : '',
              money.hasMoney ? String(money.ticket) : '',
              money.hasMoney ? String(money.donation) : '',
              money.hasMoney ? String(money.total) : '',
              r.notes ?? '',
            ];
          }),
        );
        return;
      }
      exportCsv(
        'habayit-events.csv',
        [
          'Event',
          'Date',
          'Submissions',
          'People',
          'Adults',
          'Kids',
          'Tickets',
          'Donations',
          'Total',
          'Location',
        ],
        filteredEvents.map((e) => [
          e.title,
          e.dateLabel ?? formatDateTime(e.startsAt),
          String(e.rsvpCount),
          String(e.guestTotal),
          e.adultsTotal != null ? String(e.adultsTotal) : '',
          e.kidsTotal != null ? String(e.kidsTotal) : '',
          String(e.ticketTotal),
          String(e.donationTotal),
          String(e.revenueTotal),
          e.location ?? '',
        ]),
      );
      return;
    }
    if (view === 'payments') {
      exportCsv(
        'habayit-payments.csv',
        ['Date', 'Name', 'Email', 'Source', 'Amount', 'Status', 'Stripe PI'],
        filteredPayments.map((p) => {
          const party = resolvePaymentParty(p, snapshot);
          return [
            formatDate(p.paid_at ?? p.created_at),
            party.name,
            party.email ?? '',
            party.sourceLabel,
            String(p.amount),
            p.status,
            p.stripe_payment_intent_id ?? '',
          ];
        }),
      );
      return;
    }
    exportCsv(
      'habayit-activity.csv',
      ['Date', 'Type', 'Name', 'Email', 'Amount', 'Status', 'Detail'],
      filteredActivity.map((a) => [
        formatDate(a.createdAt),
        activityTypeLabel(a.type),
        a.title,
        a.email ?? '',
        a.amount != null && (a.type === 'donation' || a.type === 'chai' || a.type === 'payment')
          ? String(a.amount)
          : '',
        a.status ?? '',
        a.subtitle,
      ]),
    );
  }

  const rowCount =
    view === 'activity'
      ? filteredActivity.length
      : view === 'contacts'
        ? filteredContacts.length
        : view === 'events'
          ? selectedEventId === 'all'
            ? filteredEvents.length
            : filteredRsvps.length
          : view === 'rsvps'
            ? filteredRsvps.length
            : view === 'applications'
              ? filteredApplications.length + filteredLeads.length
              : view === 'donations'
                ? filteredDonations.length
                : view === 'chai'
                  ? filteredChai.length
                  : view === 'dates'
                    ? filteredDates.length
                    : view === 'submissions'
                      ? filteredSubmissions.length
                      : filteredPayments.length;

  return (
    <div>
      <AdminNav role={role} />

      <div className="mb-6">
        <p className="text-[0.65rem] uppercase tracking-wider text-gold font-bold">Admin</p>
        <h1 className="text-3xl font-bold text-navy">CRM</h1>
        <p className="text-sm text-muted mt-1">
          {canSeeFinance
            ? 'All form data from Supabase — contacts, RSVPs, registrations, donations, payments, and more.'
            : 'Volunteer CRM — contacts, events, RSVPs, applications, and form log. Donations and Chai are admin-only.'}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
        <StatCard label="Open contacts" value={snapshot.stats.contactsOpen} />
        <StatCard label="Events" value={snapshot.stats.events} />
        <StatCard label="RSVPs" value={snapshot.stats.rsvps} />
        <StatCard label="Applications" value={snapshot.stats.applications} />
        <StatCard label="Pending reg." value={snapshot.stats.pendingRegistrations} />
        {canSeeFinance && (
          <>
            <StatCard label="Donated" value={formatUsd(snapshot.stats.donationsTotal)} />
            <StatCard label="Chai / mo" value={formatUsd(snapshot.stats.chaiMonthlyTotal)} />
            <StatCard label="Payments" value={formatUsd(snapshot.stats.paymentsTotal)} />
          </>
        )}
        <StatCard label="Important dates" value={snapshot.stats.importantDates} />
        <StatCard label="Form log" value={snapshot.stats.formSubmissions} />
      </div>

      <div className="bg-white border border-line rounded-2xl overflow-hidden">
        <div className="flex flex-wrap gap-2 p-4 border-b border-line bg-soft/50">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => switchView(v.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                view === v.id ? 'bg-navy text-white' : 'text-navy hover:bg-white'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {view === 'applications' && (
          <>
            <ProgramApplicationsPanel
              tracks={snapshot.programTracks}
              activeSlug={applicationProgramSlug}
              onSelect={setApplicationProgramSlug}
            />
            <ProgramApplicationsSummary track={activeProgramTrack} />
            {applicationProgramSlug === HEBREW_ADVENTURE_SLUG && (
              <BackfillHebrewFairCodesButton />
            )}
          </>
        )}

        {(view === 'events' || view === 'rsvps') && (
          <>
            <EventTabsPanel
              events={snapshot.events}
              activeEventId={selectedEventId}
              onSelect={(eventId) => {
                setSelectedEventId(eventId);
                setExpandedId(null);
                if (eventId !== 'all') {
                  setSortKey('date');
                  setSortDir('desc');
                }
              }}
              mode={view}
            />
            <EventTabsSummary event={activeEvent} mode={view} />
          </>
        )}

        <CrmFilterBar
          view={view}
          snapshot={snapshot}
          search={search}
          onSearchChange={setSearch}
          datePreset={datePreset}
          onDatePresetChange={setDatePreset}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusOptions={statusOptions}
          detailFilters={detailFilters}
          onDetailFiltersChange={(patch) => setDetailFilters((f) => ({ ...f, ...patch }))}
          onExport={handleExport}
          onClearFilters={clearFilters}
        />

        <p className="px-4 py-2 text-xs text-muted border-b border-line">
          {rowCount} record{rowCount === 1 ? '' : 's'}
          <span className="ml-2">
            · Sorted by {sortKey} ({sortDir === 'asc' ? 'A→Z / low→high' : 'Z→A / high→low'})
          </span>
          {message && <span className="ml-3 text-navy font-medium">{message}</span>}
        </p>

        <div className="overflow-x-auto">
          {view === 'activity' && (
            <ActivityTable
              rows={sortedActivity}
              expandedId={expandedId}
              onToggle={setExpandedId}
              snapshot={snapshot}
              onResolve={handleResolve}
              isPending={isPending}
              {...sortProps}
            />
          )}
          {view === 'contacts' && (
            <ContactsTable
              rows={sortedContacts}
              expandedId={expandedId}
              onToggle={setExpandedId}
              onResolve={handleResolve}
              isPending={isPending}
              {...sortProps}
            />
          )}
          {view === 'donations' && canSeeFinance && (
            <>
              <ReconcileStripeButton />
              <ManualEntryForm defaultKind="one_time" />
              <DonationsTable rows={sortedDonations} expandedId={expandedId} onToggle={setExpandedId} {...sortProps} />
            </>
          )}
          {view === 'chai' && canSeeFinance && (
            <>
              <ManualEntryForm defaultKind="chai_partner" />
              <ReconcileZeffyButton />
              <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Chai partners" value={chaiSummary.count} />
                <StatCard
                  label="Total monthly"
                  value={formatUsd(chaiSummary.monthlyTotal)}
                />
                <StatCard
                  label="Average / mo"
                  value={formatUsd(chaiSummary.average)}
                />
                <StatCard
                  label="Total / year"
                  value={formatUsd(chaiSummary.yearlyTotal)}
                />
              </div>
              <ChaiTable
                rows={sortedChai}
                snapshot={snapshot}
                expandedId={expandedId}
                onToggle={setExpandedId}
                {...sortProps}
              />
            </>
          )}
          {view === 'events' && canSeeFinance && (
            <RecoverPaidEventRegistrationsButton />
          )}
          {view === 'events' &&
            (selectedEventId === 'all' ? (
              <EventsTable
                rows={sortedEvents}
                onSelect={setDrawerEvent}
                {...sortProps}
              />
            ) : (
              <RsvpsTable
                rows={sortedRsvps}
                expandedId={expandedId}
                onToggle={setExpandedId}
                peopleMode={activeEvent?.peopleMode}
                {...sortProps}
              />
            ))}
          {view === 'applications' && (
            <>
              <ApplicationsTable
                rows={sortedApplications}
                programName={activeProgramTrack?.fullName ?? 'Program'}
                onSelect={setDrawerFamily}
                {...sortProps}
              />
              <ProgramLeadsTable rows={filteredLeads} onSelect={setDrawerLead} />
            </>
          )}
          {view === 'rsvps' && (
            <RsvpsTable
              rows={sortedRsvps}
              expandedId={expandedId}
              onToggle={setExpandedId}
              peopleMode={activeEvent?.peopleMode}
              {...sortProps}
            />
          )}
          {view === 'payments' && canSeeFinance && (
            <PaymentsTable
              rows={sortedPayments}
              snapshot={snapshot}
              expandedId={expandedId}
              onToggle={setExpandedId}
              {...sortProps}
            />
          )}
          {view === 'dates' && (
            <>
              <BackfillHebrewBirthdaysButton />
              <SyncImportantDatesSheetButton />
              <ImportantDatesPanel
                rows={sortedDates}
                families={snapshot.families}
                onAdded={() => router.refresh()}
                {...sortProps}
              />
            </>
          )}
          {view === 'submissions' && (
            <SubmissionsTable rows={sortedSubmissions} expandedId={expandedId} onToggle={setExpandedId} {...sortProps} />
          )}
        </div>
      </div>

      {drawerFamily && (
        <FamilyDetailDrawer
          family={drawerFamily}
          waivers={snapshot.waiversByFamily[drawerFamily.id] ?? []}
          programName={activeProgramTrack?.fullName}
          onClose={() => setDrawerFamily(null)}
        />
      )}
      {drawerLead && (
        <LeadDetailDrawer
          lead={drawerLead}
          programName={activeProgramTrack?.fullName ?? 'Program'}
          onClose={() => setDrawerLead(null)}
          onResolve={handleResolve}
          isPending={isPending}
        />
      )}
      {drawerEvent && (
        <EventDetailDrawer event={drawerEvent} onClose={() => setDrawerEvent(null)} />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-line rounded-xl p-3">
      <p className="text-[0.6rem] uppercase tracking-wider text-muted font-bold">{label}</p>
      <p className="text-lg font-bold text-navy mt-0.5">{value}</p>
    </div>
  );
}

function viewSingular(view: CrmView): string | null {
  const map: Partial<Record<CrmView, string>> = {
    contacts: 'contact',
    donations: 'donation',
    chai: 'chai',
    applications: 'family',
    rsvps: 'rsvp',
    payments: 'payment',
  };
  return map[view] ?? null;
}

function filterContacts(
  snapshot: CrmSnapshot,
  search: string,
  dateRange: DateRange,
  statusFilter: string,
  detail: DetailFilters,
) {
  return snapshot.contacts.filter((c) => {
    if (!matchesDateRange(c.created_at, dateRange)) return false;
    if (statusFilter === 'open' && c.is_resolved) return false;
    if (statusFilter === 'resolved' && !c.is_resolved) return false;
    if (detail.interest !== 'all' && c.interest !== detail.interest) return false;
    return matchesSearch(search, [
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      c.interest,
      c.message,
    ]);
  });
}

function filterDonations(
  snapshot: CrmSnapshot,
  search: string,
  dateRange: DateRange,
  statusFilter: string,
  detail: DetailFilters,
) {
  return snapshot.donations.filter((d) => {
    if (!matchesDateRange(d.created_at, dateRange)) return false;
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (!matchesAmountRange(Number(d.amount), detail.amountMin, detail.amountMax)) return false;
    return matchesSearch(search, [d.first_name, d.last_name, d.email, d.phone, d.memo, d.campaign]);
  });
}

function filterChai(
  snapshot: CrmSnapshot,
  search: string,
  dateRange: DateRange,
  statusFilter: string,
  detail: DetailFilters,
) {
  return snapshot.chaiPartners.filter((c) => {
    if (!matchesDateRange(c.created_at, dateRange)) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (!matchesAmountRange(Number(c.monthly_amount), detail.amountMin, detail.amountMax)) return false;
    return matchesSearch(search, [
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      c.city,
      c.access_code,
    ]);
  });
}

function filterApplications(
  snapshot: CrmSnapshot,
  programSlug: string,
  search: string,
  dateRange: DateRange,
  statusFilter: string,
) {
  const rows = snapshot.applicationsByProgram[programSlug] ?? [];
  return rows.filter((f) => {
    if (!matchesDateRange(f.createdAt, dateRange)) return false;
    if (statusFilter === 'open' || statusFilter === 'resolved') return false;
    if (statusFilter !== 'all' && !f.registrations.some((r) => r.status === statusFilter)) {
      return false;
    }
    const parentFields = f.parents.flatMap((p) => [p.first_name, p.last_name, p.email, p.phone]);
    const childFields = f.children.flatMap((c) => [c.first_name, c.last_name, c.grade]);
    const codeFields = f.registrations.map((r) => r.fair_access_code);
    return matchesSearch(search, [
      f.familyName,
      f.address,
      ...parentFields,
      ...childFields,
      ...codeFields,
    ]);
  });
}

function filterLeads(
  snapshot: CrmSnapshot,
  programSlug: string,
  search: string,
  dateRange: DateRange,
  statusFilter: string,
) {
  const rows = snapshot.leadsByProgram[programSlug] ?? [];
  return rows.filter((lead) => {
    if (!matchesDateRange(lead.createdAt, dateRange)) return false;
    if (statusFilter === 'pending' || statusFilter === 'accepted' || statusFilter === 'active' || statusFilter === 'withdrawn') {
      return false;
    }
    if (statusFilter === 'open' && lead.isResolved) return false;
    if (statusFilter === 'resolved' && !lead.isResolved) return false;
    return matchesSearch(search, [
      lead.firstName,
      lead.lastName,
      lead.email,
      lead.phone,
      lead.interest,
      lead.message,
    ]);
  });
}

function filterEvents(
  snapshot: CrmSnapshot,
  search: string,
  dateRange: DateRange,
  eventId: string,
) {
  return snapshot.events.filter((e) => {
    if (!matchesDateRange(e.startsAt, dateRange)) return false;
    if (eventId !== 'all' && e.id !== eventId) return false;
    return matchesSearch(search, [
      e.title,
      e.description,
      e.location,
      e.program,
      e.dateLabel,
      e.slug,
    ]);
  });
}

function filterPayments(
  snapshot: CrmSnapshot,
  search: string,
  dateRange: DateRange,
  statusFilter: string,
  detail: DetailFilters,
) {
  return snapshot.payments.filter((p) => {
    const date = p.paid_at ?? p.created_at;
    if (!matchesDateRange(date, dateRange)) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (!matchesAmountRange(Number(p.amount), detail.amountMin, detail.amountMax)) return false;
    const party = resolvePaymentParty(p, snapshot);
    return matchesSearch(search, [
      party.name,
      party.email,
      party.sourceLabel,
      p.source_type,
      p.stripe_payment_intent_id,
      p.status,
    ]);
  });
}

function filterRsvps(
  snapshot: CrmSnapshot,
  search: string,
  dateRange: DateRange,
  eventId: string,
) {
  const eventTitle =
    eventId === 'all' ? null : snapshot.events.find((e) => e.id === eventId)?.title ?? null;
  const eventSlug =
    eventId === 'all' ? null : snapshot.events.find((e) => e.id === eventId)?.slug ?? null;

  return snapshot.rsvps.filter((r) => {
    if (!matchesDateRange(r.created_at, dateRange)) return false;
    if (eventId !== 'all') {
      const matchesId =
        (eventSlug && r.event_slug === eventSlug) ||
        (eventTitle && r.eventTitle === eventTitle) ||
        r.event_id === eventId;
      if (!matchesId) return false;
    }
    return matchesSearch(search, [
      r.first_name,
      r.last_name,
      r.email,
      r.phone,
      r.eventTitle,
      r.notes,
      r.event_slug,
    ]);
  });
}

function filterDates(snapshot: CrmSnapshot, search: string, statusFilter: string) {
  return snapshot.importantDates.filter((d) => {
    if (statusFilter !== 'all' && d.date_type !== statusFilter) return false;
    return matchesSearch(search, [d.label, d.date_type, d.hebrew_date, d.notes]);
  });
}

function filterSubmissions(
  snapshot: CrmSnapshot,
  search: string,
  dateRange: DateRange,
  statusFilter: string,
) {
  return snapshot.formSubmissions.filter((s) => {
    if (!matchesDateRange(s.created_at, dateRange)) return false;
    if (statusFilter !== 'all' && s.form_type !== statusFilter) return false;
    return matchesSearch(search, [s.form_type, s.email, JSON.stringify(s.payload)]);
  });
}

type SortProps = {
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
};

function StatusPill({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted">—</span>;
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wide ${statusBadgeClass(status)}`}
    >
      {status}
    </span>
  );
}

function ExpandButton({
  id,
  expandedId,
  onToggle,
}: {
  id: string;
  expandedId: string | null;
  onToggle: (id: string | null) => void;
}) {
  const open = expandedId === id;
  return (
    <button
      type="button"
      onClick={() => onToggle(open ? null : id)}
      className="text-gold text-xs font-bold uppercase tracking-wide"
    >
      {open ? 'Hide' : 'Details'}
    </button>
  );
}

function DetailGrid({ pairs }: { pairs: Array<[string, string | null | undefined]> }) {
  return (
    <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {pairs.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[0.65rem] uppercase tracking-wide text-muted font-bold">{label}</dt>
          <dd className="text-navy whitespace-pre-wrap">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function ActivityTable({
  rows,
  expandedId,
  onToggle,
  snapshot,
  onResolve,
  isPending,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: ReturnType<typeof buildActivityFeed>;
  expandedId: string | null;
  onToggle: (id: string | null) => void;
  snapshot: CrmSnapshot;
  onResolve: (id: string, resolved: boolean) => void;
  isPending: boolean;
} & SortProps) {
  if (!rows.length) return <EmptyState />;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line">
          <SortableTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Type" sortKey="type" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Email" sortKey="email" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <ActivityRow
            key={row.id}
            row={row}
            expandedId={expandedId}
            onToggle={onToggle}
            snapshot={snapshot}
            onResolve={onResolve}
            isPending={isPending}
          />
        ))}
      </tbody>
    </table>
  );
}

function ActivityRow({
  row,
  expandedId,
  onToggle,
  snapshot,
  onResolve,
  isPending,
}: {
  row: ReturnType<typeof buildActivityFeed>[number];
  expandedId: string | null;
  onToggle: (id: string | null) => void;
  snapshot: CrmSnapshot;
  onResolve: (id: string, resolved: boolean) => void;
  isPending: boolean;
}) {
  const open = expandedId === row.id;
  const contact =
    row.type === 'contact' ? snapshot.contacts.find((c) => c.id === row.recordId) : null;

  return (
    <Fragment key={row.id}>
      <tr className="border-b border-line hover:bg-soft/40">
        <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.createdAt)}</td>
        <td className="px-4 py-3">{activityTypeLabel(row.type)}</td>
        <td className="px-4 py-3 font-medium text-navy">{row.title}</td>
        <td className="px-4 py-3">{row.email ?? '—'}</td>
        <td className="px-4 py-3">
          {row.amount != null && (row.type === 'donation' || row.type === 'chai' || row.type === 'payment')
            ? formatUsd(row.amount)
            : '—'}
        </td>
        <td className="px-4 py-3">
          <StatusPill status={row.status} />
        </td>
        <td className="px-4 py-3 text-right">
          <ExpandButton id={row.id} expandedId={expandedId} onToggle={onToggle} />
        </td>
      </tr>
      {open && (
        <tr className="bg-soft/30">
          <td colSpan={7} className="px-4 py-4">
            <p className="text-sm text-muted mb-3">{row.subtitle}</p>
            {contact && (
              <>
                <DetailGrid
                  pairs={[
                    ['Interest', contact.interest],
                    ['Phone', contact.phone],
                    ['Message', contact.message],
                  ]}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onResolve(contact.id, !contact.is_resolved)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold bg-navy text-white disabled:opacity-60"
                  >
                    {contact.is_resolved ? 'Reopen' : 'Mark resolved'}
                  </button>
                </div>
              </>
            )}
            {row.type === 'donation' && (
              <DonationDetail id={row.recordId} snapshot={snapshot} />
            )}
            {row.type === 'chai' && <ChaiDetail id={row.recordId} snapshot={snapshot} />}
            {row.type === 'family' && <FamilyDetail id={row.recordId} snapshot={snapshot} />}
            {row.type === 'payment' && <PaymentDetail id={row.recordId} snapshot={snapshot} />}
            {row.type === 'rsvp' && <RsvpDetail id={row.recordId} snapshot={snapshot} />}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function ContactsTable({
  rows,
  expandedId,
  onToggle,
  onResolve,
  isPending,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: CrmSnapshot['contacts'];
  expandedId: string | null;
  onToggle: (id: string | null) => void;
  onResolve: (id: string, resolved: boolean) => void;
  isPending: boolean;
} & SortProps) {
  if (!rows.length) return <EmptyState />;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line">
          <SortableTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Email" sortKey="email" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Interest" sortKey="interest" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => {
          const id = c.id;
          const open = expandedId === id;
          return (
            <Fragment key={id}>
              <tr className="border-b border-line hover:bg-soft/40">
                <td className="px-4 py-3">{formatDate(c.created_at)}</td>
                <td className="px-4 py-3 font-medium text-navy">
                  {c.first_name} {c.last_name}
                </td>
                <td className="px-4 py-3">{c.email}</td>
                <td className="px-4 py-3">{c.interest ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusPill status={c.is_resolved ? 'resolved' : 'open'} />
                </td>
                <td className="px-4 py-3 text-right">
                  <ExpandButton id={id} expandedId={expandedId} onToggle={onToggle} />
                </td>
              </tr>
              {open && (
                <tr className="bg-soft/30">
                  <td colSpan={6} className="px-4 py-4">
                    <DetailGrid
                      pairs={[
                        ['Phone', c.phone],
                        ['Message', c.message],
                        ['Submitted', formatDateTime(c.created_at)],
                      ]}
                    />
                    <div className="mt-3">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => onResolve(c.id, !c.is_resolved)}
                        className="px-3 py-1.5 rounded-full text-xs font-bold bg-navy text-white disabled:opacity-60"
                      >
                        {c.is_resolved ? 'Reopen' : 'Mark resolved'}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function DonationsTable({
  rows,
  expandedId,
  onToggle,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: CrmSnapshot['donations'];
  expandedId: string | null;
  onToggle: (id: string | null) => void;
} & SortProps) {
  if (!rows.length) return <EmptyState />;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line">
          <SortableTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Donor" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Email" sortKey="email" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => {
          const open = expandedId === d.id;
          return (
            <Fragment key={d.id}>
              <tr className="border-b border-line hover:bg-soft/40">
                <td className="px-4 py-3">{formatDate(d.created_at)}</td>
                <td className="px-4 py-3 font-medium text-navy">
                  {d.first_name} {d.last_name}
                </td>
                <td className="px-4 py-3">{d.email}</td>
                <td className="px-4 py-3 font-semibold">{formatUsd(Number(d.amount))}</td>
                <td className="px-4 py-3">
                  <StatusPill status={d.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <ExpandButton id={d.id} expandedId={expandedId} onToggle={onToggle} />
                </td>
              </tr>
              {open && (
                <tr className="bg-soft/30">
                  <td colSpan={6} className="px-4 py-4">
                    <DonationDetailRow d={d} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function DonationDetailRow({ d }: { d: CrmSnapshot['donations'][number] }) {
  return (
    <>
      <DetailGrid
        pairs={[
          ['Phone', d.phone],
          ['Type', d.donation_type],
          ['Memo', d.memo],
          ['Campaign', d.campaign],
          ['Dedication', d.dedication_name],
          ['Dedication type', d.dedication_type],
          ['Stripe payment', d.stripe_payment_intent_id],
          ['Submitted', formatDateTime(d.created_at)],
        ]}
      />
      <DeleteCrmEntryButton
        kind="donation"
        id={d.id}
        label={`${d.first_name} ${d.last_name} · ${d.email} · ${formatUsd(Number(d.amount))}`}
      />
    </>
  );
}

function DonationDetail({ id, snapshot }: { id: string; snapshot: CrmSnapshot }) {
  const d = snapshot.donations.find((x) => x.id === id);
  if (!d) return null;
  return <DonationDetailRow d={d} />;
}

function ChaiTable({
  rows,
  snapshot,
  expandedId,
  onToggle,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: CrmSnapshot['chaiPartners'];
  snapshot: CrmSnapshot;
  expandedId: string | null;
  onToggle: (id: string | null) => void;
} & SortProps) {
  if (!rows.length) return <EmptyState />;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line">
          <SortableTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Email" sortKey="email" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Monthly" sortKey="monthly" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => {
          const open = expandedId === c.id;
          return (
            <Fragment key={c.id}>
              <tr className="border-b border-line hover:bg-soft/40">
                <td className="px-4 py-3">{formatDate(c.created_at)}</td>
                <td className="px-4 py-3 font-medium text-navy">
                  {c.first_name} {c.last_name}
                </td>
                <td className="px-4 py-3">{c.email}</td>
                <td className="px-4 py-3 font-semibold">{formatUsd(Number(c.monthly_amount))}</td>
                <td className="px-4 py-3">
                  <StatusPill status={c.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <ExpandButton id={c.id} expandedId={expandedId} onToggle={onToggle} />
                </td>
              </tr>
              {open && (
                <tr className="bg-soft/30">
                  <td colSpan={6} className="px-4 py-4">
                    <ChaiDetailRow c={c} snapshot={snapshot} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function ChaiDetailRow({
  c,
  snapshot,
}: {
  c: CrmSnapshot['chaiPartners'][number];
  snapshot: CrmSnapshot;
}) {
  const address = [c.street_address, c.city, c.state, c.zip].filter(Boolean).join(', ');
  const isRecurring = Boolean(c.stripe_subscription_id);
  const payments = snapshot.payments
    .filter((p) => p.source_type === 'chai_partner' && p.source_id === c.id)
    .sort(
      (a, b) =>
        new Date(b.paid_at || b.created_at).getTime() -
        new Date(a.paid_at || a.created_at).getTime(),
    );
  const latestMethod =
    payments.find((p) => p.payment_method)?.payment_method ||
    (isRecurring ? 'Credit Card (Stripe)' : null);
  const paidThrough =
    payments.length > 0
      ? payments.reduce((latest, p) => {
          const end = paymentCoversThrough(p);
          return end > latest ? end : latest;
        }, new Date(0))
      : null;

  return (
    <>
      <DetailGrid
        pairs={[
          ['Phone', c.phone],
          ['Address', address || null],
          ['Access code', c.access_code],
          [
            'Billing',
            isRecurring ? 'Recurring (Stripe)' : 'Offline (cash / Zelle / etc.)',
          ],
          ['Payment method', latestMethod],
          [
            'Paid through',
            !isRecurring && paidThrough && paidThrough.getTime() > 0
              ? formatDate(paidThrough.toISOString())
              : isRecurring
                ? 'Auto-billed monthly'
                : null,
          ],
          ['Stripe customer', c.stripe_customer_id],
          ['Stripe subscription', c.stripe_subscription_id],
          ['Joined', formatDateTime(c.created_at)],
        ]}
      />

      {payments.length > 0 ? (
        <div className="mt-4">
          <p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted mb-2">
            Payments
          </p>
          <ul className="space-y-2 text-sm text-[#172643]">
            {payments.map((p) => {
              const months = coverageMonthsOf(p);
              const start = p.paid_at || p.created_at;
              const end = paymentCoversThrough(p);
              return (
                <li
                  key={p.id}
                  className="rounded border border-line bg-[#faf8f4] px-3 py-2"
                >
                  <span className="font-semibold">{formatUsd(Number(p.amount))}</span>
                  <span className="text-muted"> · </span>
                  {p.payment_method || '—'}
                  <span className="text-muted"> · </span>
                  {formatDate(start)}
                  {!isRecurring || months > 1 ? (
                    <span className="block text-muted text-xs mt-0.5">
                      Covers {months} month{months === 1 ? '' : 's'}
                      {months > 1
                        ? ` · through ${formatDate(end.toISOString())}`
                        : ''}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">No payments recorded yet.</p>
      )}

      {c.stripe_customer_id && (
        <a
          href={stripeCustomerUrl(c.stripe_customer_id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-sm text-gold font-semibold"
        >
          Open in Stripe →
        </a>
      )}
      <DeleteCrmEntryButton
        kind="chai_partner"
        id={c.id}
        label={`${c.first_name} ${c.last_name} · ${c.email} · ${formatUsd(Number(c.monthly_amount))}/mo`}
      />
    </>
  );
}

function ChaiDetail({ id, snapshot }: { id: string; snapshot: CrmSnapshot }) {
  const c = snapshot.chaiPartners.find((x) => x.id === id);
  if (!c) return null;
  return <ChaiDetailRow c={c} snapshot={snapshot} />;
}

function ApplicationsTable({
  rows,
  programName,
  onSelect,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: CrmFamilyRecord[];
  programName: string;
  onSelect: (family: CrmFamilyRecord) => void;
} & SortProps) {
  if (!rows.length) {
    return (
      <div className="px-4 py-10 text-center text-muted text-sm border-b border-line">
        No full registrations for {programName} yet.
        <span className="block text-xs mt-1">Inquiry leads appear below when available.</span>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line">
          <SortableTh label="Submitted" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Family" sortKey="family" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Contact" sortKey="email" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Children" sortKey="children" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <th className="px-4 py-3 text-[0.65rem] font-bold uppercase tracking-wide text-muted">
            Event code
          </th>
          <th className="px-4 py-3 text-[0.65rem] font-bold uppercase tracking-wide text-muted">Tuition</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((f) => {
          const primary = f.parents.find((p) => p.is_primary_contact) ?? f.parents[0];
          const status = f.registrations[0]?.status ?? 'unknown';
          const total = f.registrations.reduce((s, r) => s + Number(r.tuition_total ?? 0), 0);
          const codes = f.registrations
            .filter((r) => r.fair_access_code)
            .map((r) => r.fair_access_code as string);
          return (
            <tr
              key={f.id}
              className="border-b border-line hover:bg-soft/40 cursor-pointer transition-colors"
              onClick={() => onSelect(f)}
            >
              <td className="px-4 py-3">{formatDate(f.createdAt)}</td>
              <td className="px-4 py-3 font-medium text-navy">{f.familyName}</td>
              <td className="px-4 py-3">{primary?.email ?? '—'}</td>
              <td className="px-4 py-3">{f.children.length}</td>
              <td className="px-4 py-3">
                <StatusPill status={status} />
              </td>
              <td className="px-4 py-3">
                {codes.length ? (
                  <div className="space-y-0.5">
                    {f.registrations
                      .filter((r) => r.fair_access_code)
                      .map((r) => (
                        <div key={r.id} className="font-mono text-xs font-semibold text-gold tracking-wide">
                          {r.fair_access_code}
                          <span className="text-muted font-sans font-normal"> · {r.childName.split(' ')[0]}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="px-4 py-3 font-semibold text-navy">{formatUsd(total)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function EventsTable({
  rows,
  onSelect,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: CrmSnapshot['events'];
  onSelect: (event: CrmEventRecord) => void;
} & SortProps) {
  if (!rows.length) return <EmptyState message="No events configured yet." />;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line">
          <SortableTh label="Event" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <th className="px-4 py-3 text-[0.65rem] font-bold uppercase tracking-wide text-muted">Time</th>
          <SortableTh label="RSVPs" sortKey="rsvps" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Guests" sortKey="guests" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <th className="px-4 py-3 text-[0.65rem] font-bold uppercase tracking-wide text-muted">Location</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => (
          <tr
            key={e.id}
            className="border-b border-line hover:bg-soft/40 cursor-pointer transition-colors"
            onClick={() => onSelect(e)}
          >
            <td className="px-4 py-3 font-medium text-navy">{e.title}</td>
            <td className="px-4 py-3">{e.dateLabel ?? formatDateTime(e.startsAt)}</td>
            <td className="px-4 py-3">{e.time ?? '—'}</td>
            <td className="px-4 py-3">{e.rsvpCount}</td>
            <td className="px-4 py-3">{e.guestTotal}</td>
            <td className="px-4 py-3 text-muted">{e.location ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FamilyDetailRow({ f }: { f: CrmSnapshot['families'][number] }) {
  return (
    <>
      <DetailGrid
        pairs={[
          ['Address', f.address],
          ['Emergency contact', f.emergencyContactName],
          ['Emergency phone', f.emergencyContactPhone],
          ['Payment method', f.paymentMethodPreference],
          ['Notes', f.notes],
        ]}
      />
      {f.parents.length > 0 && (
        <div className="mt-4">
          <p className="text-[0.65rem] uppercase tracking-wide text-muted font-bold mb-2">Parents</p>
          <ul className="space-y-2 text-sm">
            {f.parents.map((p) => (
              <li key={p.id} className="text-navy">
                {p.first_name} {p.last_name}
                {p.is_primary_contact && (
                  <span className="ml-2 text-[0.6rem] uppercase text-gold font-bold">Primary</span>
                )}
                <span className="text-muted"> · {p.email ?? 'no email'}</span>
                {p.phone && <span className="text-muted"> · {p.phone}</span>}
                {p.jewish_status && (
                  <span className="block text-muted text-xs">Jewish status: {p.jewish_status}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {f.children.length > 0 && (
        <div className="mt-4">
          <p className="text-[0.65rem] uppercase tracking-wide text-muted font-bold mb-2">Children</p>
          <ul className="space-y-2 text-sm">
            {f.children.map((c) => {
              const reg = f.registrations.find((r) => r.child_id === c.id);
              return (
                <li key={c.id} className="text-navy">
                  {c.first_name} {c.last_name}
                  {c.grade && <span className="text-muted"> · Grade {c.grade}</span>}
                  {c.hebrew_name && <span className="text-muted"> · {c.hebrew_name}</span>}
                  {c.hebrew_level && <span className="text-muted"> · Level: {c.hebrew_level}</span>}
                  {reg?.fair_access_code && (
                    <span className="block font-mono text-xs text-gold font-semibold mt-0.5">
                      Hebrew event code: {reg.fair_access_code}
                    </span>
                  )}
                  {c.attended_before && (
                    <span className="text-muted"> · Attended before: {c.attended_before}</span>
                  )}
                  {c.date_of_birth && <span className="text-muted"> · DOB: {c.date_of_birth}</span>}
                  {c.hebrew_birthday && (
                    <span className="text-muted"> · Hebrew birthday: {c.hebrew_birthday}</span>
                  )}
                  {c.born_sunset_timing && (
                    <span className="text-muted"> · Birth timing: {c.born_sunset_timing}</span>
                  )}
                  {c.allergies && (
                    <span className="block text-xs text-danger">Allergies: {c.allergies}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {f.registrations.length > 0 && (
        <div className="mt-4">
          <p className="text-[0.65rem] uppercase tracking-wide text-muted font-bold mb-2">
            Program registrations
          </p>
          <ul className="space-y-2 text-sm">
            {f.registrations.map((r) => (
              <li key={r.id} className="text-navy">
                {r.childName} — {r.programName}
                <StatusPill status={r.status} />
                {r.fair_access_code && (
                  <span className="block font-mono text-xs text-gold font-semibold">
                    Hebrew event code: {r.fair_access_code}
                  </span>
                )}
                {r.payment_plan && (
                  <span className="text-muted text-xs block">
                    Plan: {r.payment_plan}
                    {r.tuition_total != null && ` · ${formatUsd(Number(r.tuition_total))}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        {f.stripeCustomerId && (
          <a
            href={stripeCustomerUrl(f.stripeCustomerId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gold font-semibold"
          >
            Stripe customer →
          </a>
        )}
        <a href="/admin/registrations" className="text-sm text-gold font-semibold">
          Billing admin →
        </a>
      </div>
    </>
  );
}

function FamilyDetail({ id, snapshot }: { id: string; snapshot: CrmSnapshot }) {
  const f = snapshot.families.find((x) => x.id === id);
  if (!f) return null;
  return <FamilyDetailRow f={f} />;
}

function PaymentsTable({
  rows,
  snapshot,
  expandedId,
  onToggle,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: CrmSnapshot['payments'];
  snapshot: CrmSnapshot;
  expandedId: string | null;
  onToggle: (id: string | null) => void;
} & SortProps) {
  if (!rows.length) return <EmptyState />;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line">
          <SortableTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Email" sortKey="email" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Source" sortKey="source" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const open = expandedId === p.id;
          const date = p.paid_at ?? p.created_at;
          const party = resolvePaymentParty(p, snapshot);
          return (
            <Fragment key={p.id}>
              <tr className="border-b border-line hover:bg-soft/40">
                <td className="px-4 py-3">{formatDate(date)}</td>
                <td className="px-4 py-3 font-medium text-navy">{party.name || '—'}</td>
                <td className="px-4 py-3">{party.email ?? '—'}</td>
                <td className="px-4 py-3">{party.sourceLabel}</td>
                <td className="px-4 py-3 font-semibold">{formatUsd(Number(p.amount))}</td>
                <td className="px-4 py-3">
                  <StatusPill status={p.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <ExpandButton id={p.id} expandedId={expandedId} onToggle={onToggle} />
                </td>
              </tr>
              {open && (
                <tr className="bg-soft/30">
                  <td colSpan={7} className="px-4 py-4">
                    <PaymentDetailRow p={p} party={party} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function PaymentDetailRow({
  p,
  party,
}: {
  p: CrmSnapshot['payments'][number];
  party: ReturnType<typeof resolvePaymentParty>;
}) {
  return (
    <>
      <DetailGrid
        pairs={[
          ['Name', party.name || null],
          ['Email', party.email],
          ['Source', party.sourceLabel],
          ['Source ID', p.source_id],
          ['Stripe payment intent', p.stripe_payment_intent_id],
          ['Stripe charge', p.stripe_charge_id],
          ['Paid at', p.paid_at ? formatDateTime(p.paid_at) : null],
          ['Created', formatDateTime(p.created_at)],
        ]}
      />
      {p.stripe_payment_intent_id && (
        <a
          href={stripePaymentUrl(p.stripe_payment_intent_id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-sm text-gold font-semibold"
        >
          Open in Stripe →
        </a>
      )}
    </>
  );
}

function PaymentDetail({ id, snapshot }: { id: string; snapshot: CrmSnapshot }) {
  const p = snapshot.payments.find((x) => x.id === id);
  if (!p) return null;
  return <PaymentDetailRow p={p} party={resolvePaymentParty(p, snapshot)} />;
}

function RsvpDetail({ id, snapshot }: { id: string; snapshot: CrmSnapshot }) {
  const r = snapshot.rsvps.find((x) => x.id === id);
  if (!r) return null;
  const mode = resolveEventPeopleMode(r.event_slug);
  const people = parseEventPeople(r);
  const money = parseEventMoney(r);
  return (
    <DetailGrid
      pairs={[
        ['Event', r.eventTitle],
        ['Phone', r.phone],
        ['People', String(people.guests)],
        eventShowsAdults(mode) ? ['Adults', String(people.adults ?? 0)] : null,
        eventShowsKids(mode) ? ['Kids', String(people.kids ?? 0)] : null,
        money.hasMoney ? ['Tickets', formatUsd(money.ticket)] : null,
        money.hasMoney ? ['Donation', formatUsd(money.donation)] : null,
        money.hasMoney ? ['Total paid', formatUsd(money.total)] : null,
        ['Notes', r.notes],
        ['Submitted', formatDateTime(r.created_at)],
      ].filter(Boolean) as Array<[string, string | null | undefined]>}
    />
  );
}

function RsvpsTable({
  rows,
  expandedId,
  onToggle,
  peopleMode: peopleModeProp,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: CrmSnapshot['rsvps'];
  expandedId: string | null;
  onToggle: (id: string | null) => void;
  /** When viewing one event, use its configured people mode. */
  peopleMode?: EventPeopleMode;
} & SortProps) {
  if (!rows.length) return <EmptyState />;

  const showAdultsCol =
    peopleModeProp != null
      ? eventShowsAdults(peopleModeProp)
      : rows.some((r) => eventShowsAdults(resolveEventPeopleMode(r.event_slug)));
  const showKidsCol =
    peopleModeProp != null
      ? eventShowsKids(peopleModeProp)
      : rows.some((r) => eventShowsKids(resolveEventPeopleMode(r.event_slug)));
  const colSpan = 7 + (showAdultsCol ? 1 : 0) + (showKidsCol ? 1 : 0);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line">
          <SortableTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Event" sortKey="event" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Email" sortKey="email" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="People" sortKey="guests" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          {showAdultsCol ? (
            <SortableTh label="Adults" sortKey="adults" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          ) : null}
          {showKidsCol ? (
            <SortableTh label="Kids" sortKey="kids" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          ) : null}
          <SortableTh
            label="Donation"
            sortKey="donation"
            activeKey={sortKey}
            dir={sortDir}
            onSort={onSort}
          />
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const open = expandedId === r.id;
          const mode = peopleModeProp ?? resolveEventPeopleMode(r.event_slug);
          const people = parseEventPeople(r);
          const money = parseEventMoney(r);
          return (
            <Fragment key={r.id}>
              <tr className="border-b border-line hover:bg-soft/40">
                <td className="px-4 py-3">{formatDate(r.created_at)}</td>
                <td className="px-4 py-3 font-medium text-navy">{r.eventTitle}</td>
                <td className="px-4 py-3">
                  {r.first_name} {r.last_name}
                </td>
                <td className="px-4 py-3">{r.email ?? '—'}</td>
                <td className="px-4 py-3">{people.guests}</td>
                {showAdultsCol ? (
                  <td className="px-4 py-3">
                    {eventShowsAdults(mode) ? (people.adults ?? 0) : '—'}
                  </td>
                ) : null}
                {showKidsCol ? (
                  <td className="px-4 py-3">
                    {eventShowsKids(mode) ? (people.kids ?? 0) : '—'}
                  </td>
                ) : null}
                <td className="px-4 py-3 tabular-nums">
                  {money.hasMoney ? formatUsd(money.donation) : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <ExpandButton id={r.id} expandedId={expandedId} onToggle={onToggle} />
                </td>
              </tr>
              {open && (
                <tr className="bg-soft/30">
                  <td colSpan={colSpan} className="px-4 py-4">
                    <DetailGrid
                      pairs={[
                        ['Phone', r.phone],
                        ['People', String(people.guests)],
                        eventShowsAdults(mode) ? ['Adults', String(people.adults ?? 0)] : null,
                        eventShowsKids(mode) ? ['Kids', String(people.kids ?? 0)] : null,
                        money.hasMoney ? ['Tickets', formatUsd(money.ticket)] : null,
                        money.hasMoney ? ['Donation', formatUsd(money.donation)] : null,
                        money.hasMoney ? ['Total paid', formatUsd(money.total)] : null,
                        ['Notes', r.notes],
                        ['Event slug', r.event_slug],
                        ['Family linked', r.family_id ? 'Yes' : 'No'],
                        ['Submitted', formatDateTime(r.created_at)],
                      ].filter(Boolean) as Array<[string, string | null | undefined]>}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function ImportantDatesPanel({
  rows,
  families,
  onAdded,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: CrmSnapshot['importantDates'];
  families: CrmSnapshot['families'];
  onAdded: () => void;
} & SortProps) {
  const [label, setLabel] = useState('');
  const [dateType, setDateType] = useState('birthday');
  const [gregorianDate, setGregorianDate] = useState('');
  const [hebrewDate, setHebrewDate] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();
  const [formMsg, setFormMsg] = useState('');

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg('');
    startTransition(async () => {
      const result = await addImportantDate({
        label,
        dateType,
        gregorianDate: gregorianDate || undefined,
        hebrewDate: hebrewDate || undefined,
        familyId: familyId || undefined,
        notes,
      });
      if (result.success) {
        setLabel('');
        setGregorianDate('');
        setHebrewDate('');
        setNotes('');
        setFormMsg('Saved.');
        onAdded();
      } else {
        setFormMsg(result.error ?? 'Failed.');
      }
    });
  }

  return (
    <div className="p-4">
      <form onSubmit={handleAdd} className="mb-6 p-4 bg-soft/50 rounded-xl border border-line grid md:grid-cols-2 gap-4">
        <p className="md:col-span-2 text-sm text-muted">
          Birthdays from program registrations appear here automatically. Default sort is by
          position in the Jewish year (Tishrei → Elul). Use the filter above to show birthdays
          only.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-bold uppercase text-navy">Name</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-bold uppercase text-navy">Type</span>
          <select value={dateType} onChange={(e) => setDateType(e.target.value)}>
            <option value="birthday">Birthday</option>
            <option value="yahrzeit">Yahrzeit</option>
            <option value="anniversary">Anniversary</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-bold uppercase text-navy">Gregorian date</span>
          <input type="date" value={gregorianDate} onChange={(e) => setGregorianDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-bold uppercase text-navy">Hebrew date</span>
          <input value={hebrewDate} onChange={(e) => setHebrewDate(e.target.value)} placeholder="e.g. 12/13 Tammuz 5778" />
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[0.65rem] font-bold uppercase text-navy">Link to family (optional)</span>
          <select value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
            <option value="">— None —</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.familyName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[0.65rem] font-bold uppercase text-navy">Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="md:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-full bg-navy text-white text-sm font-bold disabled:opacity-60"
          >
            {isPending ? 'Savingâ€¦' : 'Add date'}
          </button>
          {formMsg && <span className="text-sm text-muted">{formMsg}</span>}
        </div>
      </form>

      {!rows.length ? (
        <EmptyState />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <SortableTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
              <SortableTh label="Type" sortKey="type" activeKey={sortKey} dir={sortDir} onSort={onSort} />
              <SortableTh label="Gregorian" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={onSort} />
              <SortableTh label="In year" sortKey="yearOrder" activeKey={sortKey} dir={sortDir} onSort={onSort} />
              <SortableTh label="Hebrew" sortKey="hebrew" activeKey={sortKey} dir={sortDir} onSort={onSort} />
              <th className="px-4 py-3 text-[0.65rem] font-bold uppercase tracking-wide text-muted">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-line hover:bg-soft/40">
                <td className="px-4 py-3 font-medium text-navy">{d.label}</td>
                <td className="px-4 py-3 capitalize">{d.date_type}</td>
                <td className="px-4 py-3">{d.gregorian_date ? formatDate(d.gregorian_date) : '—'}</td>
                <td className="px-4 py-3 font-medium text-navy">
                  {formatHebrewAnnualLabel(d.hebrew_date) ?? '—'}
                </td>
                <td className="px-4 py-3">{formatHebrewDisplayDate(d.hebrew_date) ?? '—'}</td>
                <td className="px-4 py-3">{d.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SubmissionsTable({
  rows,
  expandedId,
  onToggle,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: CrmSnapshot['formSubmissions'];
  expandedId: string | null;
  onToggle: (id: string | null) => void;
} & SortProps) {
  if (!rows.length) return <EmptyState />;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line">
          <SortableTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Form" sortKey="form" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <SortableTh label="Email" sortKey="email" activeKey={sortKey} dir={sortDir} onSort={onSort} />
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const open = expandedId === s.id;
          return (
            <Fragment key={s.id}>
              <tr className="border-b border-line hover:bg-soft/40">
                <td className="px-4 py-3">{formatDateTime(s.created_at)}</td>
                <td className="px-4 py-3 capitalize">{s.form_type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3">{s.email ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <ExpandButton id={s.id} expandedId={expandedId} onToggle={onToggle} />
                </td>
              </tr>
              {open && (
                <tr className="bg-soft/30">
                  <td colSpan={4} className="px-4 py-4">
                    <pre className="text-xs bg-white border border-line rounded-lg p-3 overflow-x-auto max-h-80">
                      {JSON.stringify(s.payload, null, 2)}
                    </pre>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function EmptyState({ message = 'No records match your filters.' }: { message?: string }) {
  return (
    <div className="px-4 py-16 text-center text-muted text-sm">
      {message}
    </div>
  );
}
