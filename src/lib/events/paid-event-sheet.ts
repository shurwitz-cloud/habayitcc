import { appendPaidEventRow, replacePaidEventTab } from '@/lib/google/sheets';
import { enrichEventRegistrationsFromFormSubmissions } from '@/lib/admin/crm/enrich-event-money';
import {
  parseEventMoney,
  parseEventPeople,
} from '@/lib/admin/crm/event-registration-stats';
import {
  PAID_EVENTS,
  getPaidEvent,
  getPaidEventSheetId,
  getPaidEventSheetTab,
  type PaidEventConfig,
} from '@/lib/events/paid-events';
import { createAdminClient } from '@/lib/supabase/server';
import type { EventRegistration, FormSubmission } from '@/types/database';
import type {
  CouplesRegistrationData,
  DinnerRegistrationData,
  FairRegistrationData,
  PricingBreakdown,
  WomensRegistrationData,
} from '@/lib/events/paid-event-pricing';

export type PaidEventSheetRowInput = {
  event: PaidEventConfig;
  createdAt?: string | Date | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  dinner?: DinnerRegistrationData;
  fair?: FairRegistrationData;
  womens?: WomensRegistrationData;
  couples?: CouplesRegistrationData;
  fairChildLines?: PricingBreakdown['fairChildLines'];
  coupleLines?: PricingBreakdown['coupleLines'];
  ticketSubtotal: number;
  sponsorAmount: number;
  cardFee: number;
  total: number;
  coverFee?: boolean;
  paymentMethod?: string | null;
  paymentId?: string | null;
  notes?: string | null;
};

function etTimestamp(value?: string | Date | null): string {
  const d = value instanceof Date ? value : value ? new Date(value) : new Date();
  const date = Number.isNaN(d.getTime()) ? new Date() : d;
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function usd(n: number): string {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function childDetails(
  fair?: FairRegistrationData,
  lines?: PricingBreakdown['fairChildLines'],
): string {
  if (lines?.length) {
    return lines
      .map(
        (l) =>
          `#${l.index}: ${l.free ? 'HaBayit Hebrew (free)' : usd(l.price)}${l.codeUsed ? ` [${l.codeUsed}]` : ''}`,
      )
      .join('; ');
  }
  const children = fair?.children ?? [];
  if (!children.length) return '';
  return children
    .map((c, i) => {
      const code = c.hebrewCode?.trim();
      return `#${i + 1}:${code ? ` [${code.toUpperCase()}]` : ' paid'}`;
    })
    .join('; ');
}

export function buildPaidEventSheetValues(input: PaidEventSheetRowInput): (string | number)[] {
  const timestamp = etTimestamp(input.createdAt);
  const coverFee = input.coverFee || input.cardFee > 0 ? 'Yes' : '';
  const paymentMethod = (input.paymentMethod || '').trim();
  const paymentId = (input.paymentId || '').trim();
  const notes = (input.notes || '').trim();

  const sharedTail = [
    usd(input.ticketSubtotal),
    input.sponsorAmount > 0 ? usd(input.sponsorAmount) : '',
    coverFee,
    input.cardFee > 0 ? usd(input.cardFee) : '',
    usd(input.total),
    paymentMethod,
    paymentId,
    notes,
  ];

  if (input.event.type === 'dinner' || input.event.type === 'celebration') {
    return [
      timestamp,
      input.lastName,
      input.firstName,
      input.email ?? '',
      input.phone ?? '',
      input.dinner?.adults ?? 0,
      input.dinner?.kids ?? 0,
      ...sharedTail,
    ];
  }

  if (input.event.type === 'family-fair') {
    return [
      timestamp,
      input.lastName,
      input.firstName,
      input.email ?? '',
      input.phone ?? '',
      input.fair?.children.length ?? 0,
      childDetails(input.fair, input.fairChildLines),
      ...sharedTail,
    ];
  }

  if (input.event.type === 'couples') {
    const coupleNote = (input.coupleLines ?? [])
      .map((l) => `#${l.index}: ${usd(l.price)}${l.member ? ' member' : ''}`)
      .join('; ');
    return [
      timestamp,
      input.lastName,
      input.firstName,
      input.email ?? '',
      input.phone ?? '',
      input.couples?.couples ?? 0,
      input.couples?.memberDiscount ? input.couples.memberCode?.trim().toUpperCase() || 'Yes' : '',
      coupleNote,
      ...sharedTail,
    ];
  }

  return [
    timestamp,
    input.lastName,
    input.firstName,
    input.email ?? '',
    input.phone ?? '',
    input.womens?.women ?? 0,
    ...sharedTail,
  ];
}

export async function appendPaidEventToSheet(input: PaidEventSheetRowInput): Promise<void> {
  const sheetId = getPaidEventSheetId(input.event);
  if (!sheetId) return;
  await appendPaidEventRow(
    sheetId,
    input.event.type,
    buildPaidEventSheetValues(input),
    getPaidEventSheetTab(input.event),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function inferPaymentMethod(row: EventRegistration): string {
  const details = asRecord(row.registration_details);
  const fromDetails = String(details?.paymentMethod || '').trim();
  if (fromDetails) return fromDetails;

  const pi = String(row.stripe_payment_intent_id || '').trim();
  const notes = String(row.notes || '');
  if (pi.startsWith('pi_')) return 'Card';
  if (/zelle/i.test(pi) || /zelle/i.test(notes)) return 'Zelle';
  if (/cash app/i.test(pi) || /cash app/i.test(notes)) return 'Cash App';
  if (/\bcheck\b/i.test(pi) || /\bcheck\b/i.test(notes)) return 'Check';
  if (/\bcash\b/i.test(pi) || /\bcash\b/i.test(notes)) return 'Cash';
  if (pi) return 'Card';
  return Number(row.amount) > 0 ? 'Card' : '';
}

function paymentIdFromRow(row: EventRegistration): string {
  const pi = String(row.stripe_payment_intent_id || '').trim();
  if (!pi) return '';
  if (/^(pi_|manual:|zeffy:)/i.test(pi)) return pi;
  return '';
}

function sheetInputFromRegistration(
  event: PaidEventConfig,
  row: EventRegistration,
): PaidEventSheetRowInput {
  const details = asRecord(row.registration_details);
  const money = parseEventMoney(row);
  const people = parseEventPeople(row);
  const dinner = (details?.dinner as DinnerRegistrationData | undefined) ?? undefined;
  const fair = (details?.fair as FairRegistrationData | undefined) ?? undefined;
  const womens = (details?.womens as WomensRegistrationData | undefined) ?? undefined;
  const couples = (details?.couples as CouplesRegistrationData | undefined) ?? undefined;
  const fairChildLines = details?.fairChildLines as PricingBreakdown['fairChildLines'];
  const coupleLines = details?.coupleLines as PricingBreakdown['coupleLines'];

  return {
    event,
    createdAt: row.created_at,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    dinner:
      dinner ??
      (event.type === 'dinner' || event.type === 'celebration'
        ? { adults: people.adults ?? people.guests, kids: people.kids ?? 0 }
        : undefined),
    fair:
      fair ??
      (event.type === 'family-fair'
        ? { children: Array.from({ length: people.guests || people.kids || 0 }, () => ({})) }
        : undefined),
    womens:
      womens ??
      (event.type === 'womens' ? { women: people.guests || 1 } : undefined),
    couples:
      couples ??
      (event.type === 'couples' ? { couples: people.guests || 1 } : undefined),
    fairChildLines,
    coupleLines,
    ticketSubtotal: money.ticket,
    sponsorAmount: money.donation,
    cardFee: money.fee,
    total: money.total,
    coverFee: Boolean(details?.coverFee) || money.fee > 0,
    paymentMethod: inferPaymentMethod(row),
    paymentId: paymentIdFromRow(row),
    notes: row.notes,
  };
}

export async function syncPaidEventSheets(): Promise<{
  ok: boolean;
  counts: Record<string, number>;
  error?: string;
}> {
  const spreadsheetId = getPaidEventSheetId();
  if (!spreadsheetId) return { ok: false, counts: {}, error: 'Events spreadsheet is not configured.' };

  const supabase = createAdminClient();
  const slugs = PAID_EVENTS.map((e) => e.slug);

  const [{ data: rsvps, error: rsvpErr }, { data: submissions, error: subErr }] = await Promise.all([
    supabase
      .from('event_registrations')
      .select('*')
      .in('event_slug', slugs)
      .order('created_at', { ascending: true }),
    supabase
      .from('form_submissions')
      .select('*')
      .eq('form_type', 'rsvp')
      .order('created_at', { ascending: false })
      .limit(3000),
  ]);

  if (rsvpErr) return { ok: false, counts: {}, error: rsvpErr.message };
  if (subErr) console.error('[event sheet sync] form_submissions:', subErr.message);

  const enriched = enrichEventRegistrationsFromFormSubmissions(
    (rsvps ?? []) as EventRegistration[],
    (submissions ?? []) as FormSubmission[],
  );

  const counts: Record<string, number> = {};

  for (const event of PAID_EVENTS) {
    const rows = enriched
      .filter((r) => r.event_slug === event.slug)
      .map((r) => buildPaidEventSheetValues(sheetInputFromRegistration(event, r)));
    await replacePaidEventTab(
      spreadsheetId,
      event.type,
      getPaidEventSheetTab(event),
      rows,
    );
    counts[event.sheetTab] = rows.length;
  }

  return { ok: true, counts };
}
