'use server';

import { revalidatePath } from 'next/cache';
import { getAdminRole, isAdminAuthenticated } from '@/lib/admin/auth';
import { OPEN_HOUSE_EVENTS } from '@/lib/events/config';
import {
  contactMatchesTrack,
  familiesForProgram,
  resolveCrmProgramTracks,
} from '@/lib/admin/crm/program-tracks';
import { createAdminClient } from '@/lib/supabase/server';
import type {
  ChaiPartner,
  Child,
  Contact,
  Donation,
  Event,
  EventRegistration,
  FormSubmission,
  ImportantDate,
  Parent,
  Payment,
  ProgramRegistration,
  Waiver,
} from '@/types/database';
import type {
  CrmEventRecord,
  CrmFamilyRecord,
  CrmLeadRecord,
  CrmProgramTrackSnapshot,
  CrmRsvpRecord,
  CrmSnapshot,
  CrmStats,
} from '@/lib/admin/crm/types';

async function requireAdmin() {
  if (!(await isAdminAuthenticated())) {
    throw new Error('Unauthorized');
  }
}

function redactCrmSnapshotForVolunteer(snapshot: CrmSnapshot): CrmSnapshot {
  const hiddenFormTypes = new Set(['donation', 'chai_partner']);
  const formSubmissions = snapshot.formSubmissions.filter(
    (f) => !hiddenFormTypes.has(f.form_type)
  );

  return {
    ...snapshot,
    donations: [],
    chaiPartners: [],
    payments: [],
    formSubmissions,
    stats: {
      ...snapshot.stats,
      donations: 0,
      donationsTotal: 0,
      chaiPartners: 0,
      chaiMonthlyTotal: 0,
      payments: 0,
      paymentsTotal: 0,
      formSubmissions: formSubmissions.length,
    },
  };
}

const EVENT_TITLE_BY_SLUG = new Map(OPEN_HOUSE_EVENTS.map((e) => [e.slug, e.title]));

function eventTitleForRsvp(row: EventRegistration, eventsById: Map<string, string>): string {
  if (row.event_slug) {
    return (
      EVENT_TITLE_BY_SLUG.get(row.event_slug) ??
      eventsById.get(row.event_id) ??
      row.event_slug
    );
  }
  return eventsById.get(row.event_id) ?? 'Event';
}

function buildEventRecords(dbEvents: Event[], rsvps: CrmRsvpRecord[]): CrmEventRecord[] {
  const bySlug = new Map(dbEvents.filter((e) => e.slug).map((e) => [e.slug as string, e]));
  const usedDbIds = new Set<string>();
  const records: CrmEventRecord[] = [];

  for (const config of OPEN_HOUSE_EVENTS) {
    const db = bySlug.get(config.slug);
    if (db) usedDbIds.add(db.id);

    const eventRsvps = rsvps.filter(
      (r) => r.event_slug === config.slug || (db != null && r.event_id === db.id),
    );

    records.push({
      id: db?.id ?? `slug:${config.slug}`,
      slug: config.slug,
      title: db?.title ?? config.title,
      description: db?.description ?? config.description,
      startsAt: db?.starts_at ?? config.startsAt,
      location:
        db?.location ??
        (config.locationPrivate ? 'Provided upon registration' : 'HaBayit Jewish Center'),
      dateLabel: config.dateLabel,
      time: config.time,
      program: config.program,
      rsvpCount: eventRsvps.length,
      guestTotal: eventRsvps.reduce((sum, r) => sum + r.guest_count, 0),
      rsvps: [...eventRsvps].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    });
  }

  for (const db of dbEvents) {
    if (usedDbIds.has(db.id)) continue;
    const eventRsvps = rsvps.filter((r) => r.event_id === db.id);
    records.push({
      id: db.id,
      slug: db.slug,
      title: db.title,
      description: db.description,
      startsAt: db.starts_at,
      location: db.location,
      dateLabel: null,
      time: null,
      program: null,
      rsvpCount: eventRsvps.length,
      guestTotal: eventRsvps.reduce((sum, r) => sum + r.guest_count, 0),
      rsvps: [...eventRsvps].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    });
  }

  return records.sort(
    (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
  );
}

export async function getCrmSnapshot(): Promise<CrmSnapshot> {
  await requireAdmin();
  const supabase = createAdminClient();

  const [
    contactsRes,
    donationsRes,
    chaiRes,
    familiesRes,
    parentsRes,
    childrenRes,
    registrationsRes,
    programsRes,
    paymentsRes,
    rsvpsRes,
    eventsRes,
    datesRes,
    submissionsRes,
    waiversRes,
  ] = await Promise.all([
    supabase.from('contacts').select('*').order('created_at', { ascending: false }),
    supabase.from('donations').select('*').order('created_at', { ascending: false }),
    supabase.from('chai_partners').select('*').order('created_at', { ascending: false }),
    supabase.from('families').select('*').order('created_at', { ascending: false }),
    supabase.from('parents').select('*'),
    supabase.from('children').select('*'),
    supabase.from('program_registrations').select('*').order('created_at', { ascending: false }),
    supabase.from('programs').select('id, name, slug, is_active'),
    supabase.from('payments').select('*').order('created_at', { ascending: false }),
    supabase.from('event_registrations').select('*').order('created_at', { ascending: false }),
    supabase.from('events').select('*').order('starts_at', { ascending: false }),
    supabase.from('important_dates').select('*').order('gregorian_date', { ascending: true }),
    supabase
      .from('form_submissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('waivers').select('*').order('signed_at', { ascending: false }),
  ]);

  if (rsvpsRes.error) console.error('[CRM] rsvps:', rsvpsRes.error.message);
  if (datesRes.error) console.error('[CRM] important_dates:', datesRes.error.message);
  if (submissionsRes.error) console.error('[CRM] form_submissions:', submissionsRes.error.message);
  if (waiversRes.error) console.error('[CRM] waivers:', waiversRes.error.message);

  const contacts = (contactsRes.data ?? []) as Contact[];
  const donations = (donationsRes.data ?? []) as Donation[];
  const chaiPartners = (chaiRes.data ?? []) as ChaiPartner[];
  const familiesRaw = familiesRes.data ?? [];
  const parents = (parentsRes.data ?? []) as Parent[];
  const children = (childrenRes.data ?? []) as Child[];
  const registrations = (registrationsRes.data ?? []) as ProgramRegistration[];
  const payments = (paymentsRes.data ?? []) as Payment[];
  const rsvpRows = (rsvpsRes.data ?? []) as EventRegistration[];
  const dbEvents = (eventsRes.data ?? []) as Event[];
  const importantDates = (datesRes.data ?? []) as ImportantDate[];
  const formSubmissions = (submissionsRes.data ?? []) as FormSubmission[];
  const waivers = (waiversRes.data ?? []) as Waiver[];

  const eventsById = new Map(dbEvents.map((e) => [e.id, e.title]));

  const programById = new Map(
    (programsRes.data ?? []).map((p) => [p.id, { name: p.name as string, slug: p.slug as string }]),
  );

  const parentsByFamily = new Map<string, Parent[]>();
  for (const p of parents) {
    const list = parentsByFamily.get(p.family_id) ?? [];
    list.push(p);
    parentsByFamily.set(p.family_id, list);
  }

  const childrenByFamily = new Map<string, Child[]>();
  const childById = new Map<string, Child>();
  for (const c of children) {
    childById.set(c.id, c);
    const list = childrenByFamily.get(c.family_id) ?? [];
    list.push(c);
    childrenByFamily.set(c.family_id, list);
  }

  const regsByFamily = new Map<string, CrmFamilyRecord['registrations']>();
  for (const reg of registrations) {
    const child = childById.get(reg.child_id);
    const program = programById.get(reg.program_id);
    const list = regsByFamily.get(reg.family_id) ?? [];
    list.push({
      ...reg,
      programName: program?.name ?? 'Program',
      programSlug: program?.slug ?? '',
      childName: child ? `${child.first_name} ${child.last_name}` : '—',
    });
    regsByFamily.set(reg.family_id, list);
  }

  const families: CrmFamilyRecord[] = familiesRaw.map((f) => {
    const addr = [f.street_address, f.city, f.state, f.zip].filter(Boolean).join(', ');
    return {
      id: f.id,
      familyName: f.family_name,
      address: addr || null,
      notes: f.notes,
      emergencyContactName: f.emergency_contact_name ?? null,
      emergencyContactPhone: f.emergency_contact_phone ?? null,
      stripeCustomerId: f.stripe_customer_id,
      paymentMethodPreference: f.payment_method_preference,
      createdAt: f.created_at,
      parents: parentsByFamily.get(f.id) ?? [],
      children: childrenByFamily.get(f.id) ?? [],
      registrations: regsByFamily.get(f.id) ?? [],
    };
  });

  const dbPrograms = (programsRes.data ?? []) as Array<{
    slug: string;
    name: string;
    is_active?: boolean;
  }>;
  const trackDefs = resolveCrmProgramTracks(dbPrograms);

  const applicationsByProgram: Record<string, CrmFamilyRecord[]> = {};
  const leadsByProgram: Record<string, CrmLeadRecord[]> = {};
  const programTracks: CrmProgramTrackSnapshot[] = [];

  for (const track of trackDefs) {
    const apps = familiesForProgram(families, track.programSlug);
    applicationsByProgram[track.programSlug] = apps;

    const leads: CrmLeadRecord[] = contacts
      .filter((c) => contactMatchesTrack(c.interest, track))
      .map((c) => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        phone: c.phone,
        interest: c.interest,
        message: c.message,
        isResolved: c.is_resolved,
        createdAt: c.created_at,
      }));

    leadsByProgram[track.programSlug] = leads;

    const formSubmissionCount = formSubmissions.filter((s) =>
      track.formTypes.includes(s.form_type),
    ).length;

    programTracks.push({
      id: track.id,
      programSlug: track.programSlug,
      tabLabel: track.tabLabel,
      fullName: track.fullName,
      registrationPath: track.registrationPath,
      applicationCount: apps.length,
      pendingCount: apps.reduce(
        (n, f) => n + f.registrations.filter((r) => r.status === 'pending').length,
        0,
      ),
      leadCount: leads.length,
      formSubmissionCount,
    });
  }

  const totalApplications = Object.values(applicationsByProgram).reduce(
    (sum, list) => sum + list.length,
    0,
  );

  const waiversByFamily: Record<string, Waiver[]> = {};
  for (const w of waivers) {
    if (!w.family_id) continue;
    if (!waiversByFamily[w.family_id]) waiversByFamily[w.family_id] = [];
    waiversByFamily[w.family_id].push(w);
  }

  const rsvps: CrmRsvpRecord[] = rsvpRows.map((row) => ({
    ...row,
    eventTitle: eventTitleForRsvp(row, eventsById),
  }));

  const events = buildEventRecords(dbEvents, rsvps);

  const pendingRegistrations = registrations.filter((r) => r.status === 'pending').length;

  const stats: CrmStats = {
    contacts: contacts.length,
    contactsOpen: contacts.filter((c) => !c.is_resolved).length,
    donations: donations.length,
    donationsTotal: donations
      .filter((d) => d.status === 'succeeded')
      .reduce((sum, d) => sum + Number(d.amount), 0),
    chaiPartners: chaiPartners.filter((c) => c.status === 'active').length,
    chaiMonthlyTotal: chaiPartners
      .filter((c) => c.status === 'active')
      .reduce((sum, c) => sum + Number(c.monthly_amount), 0),
    families: families.length,
    applications: totalApplications,
    pendingRegistrations,
    events: events.length,
    rsvps: rsvps.length,
    importantDates: importantDates.length,
    formSubmissions: formSubmissions.length,
    payments: payments.length,
    paymentsTotal: payments
      .filter((p) => p.status === 'succeeded')
      .reduce((sum, p) => sum + Number(p.amount), 0),
  };

  const snapshot: CrmSnapshot = {
    stats,
    contacts,
    donations,
    chaiPartners,
    families,
    programTracks,
    applicationsByProgram,
    leadsByProgram,
    events,
    rsvps,
    payments,
    importantDates,
    formSubmissions,
    waiversByFamily,
  };

  const role = await getAdminRole();
  if (role === 'volunteer') return redactCrmSnapshotForVolunteer(snapshot);
  return snapshot;
}

export async function setContactResolved(
  contactId: string,
  resolved: boolean,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('contacts')
    .update({ is_resolved: resolved })
    .eq('id', contactId);

  if (error) {
    console.error('setContactResolved:', error);
    return { success: false, error: 'Could not update contact.' };
  }

  revalidatePath('/admin/crm');
  return { success: true };
}

export async function addImportantDate(input: {
  label: string;
  dateType: string;
  gregorianDate?: string;
  hebrewDate?: string;
  familyId?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createAdminClient();

  const { error } = await supabase.from('important_dates').insert({
    label: input.label.trim(),
    date_type: input.dateType,
    gregorian_date: input.gregorianDate || null,
    hebrew_date: input.hebrewDate?.trim() || null,
    family_id: input.familyId || null,
    notes: input.notes?.trim() || null,
  });

  if (error) {
    console.error('addImportantDate:', error);
    return { success: false, error: 'Could not save date.' };
  }

  revalidatePath('/admin/crm');
  return { success: true };
}
