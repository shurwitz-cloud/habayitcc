/**
 * Generic helpers for CRM event registration totals.
 * Works for free RSVPs and paid events. New paid events should store
 * adults/kids (when applicable) and ticketSubtotal inside registration_details.
 */

export type EventRegistrationDetails = {
  type?: string;
  dinner?: { adults?: number; kids?: number };
  fair?: { children?: unknown[] };
  womens?: { women?: number };
  /** Generic adults/kids for future event types */
  adults?: number;
  kids?: number;
  ticketSubtotal?: number;
  coverFee?: boolean;
  fairChildLines?: unknown;
  [key: string]: unknown;
};

export type EventPeopleBreakdown = {
  adults: number | null;
  kids: number | null;
  guests: number;
};

export type EventMoneyBreakdown = {
  ticket: number;
  donation: number;
  fee: number;
  total: number;
  hasMoney: boolean;
};

function asDetails(raw: unknown): EventRegistrationDetails | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as EventRegistrationDetails;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Extract adults / kids / guest count from a registration row. */
export function parseEventPeople(row: {
  guest_count?: number | null;
  notes?: string | null;
  registration_details?: unknown;
}): EventPeopleBreakdown {
  const details = asDetails(row.registration_details);
  const guestFallback = Math.max(0, num(row.guest_count));

  if (details?.dinner) {
    const adults = Math.max(0, num(details.dinner.adults));
    const kids = Math.max(0, num(details.dinner.kids));
    return { adults, kids, guests: adults + kids || guestFallback };
  }

  if (details?.fair?.children && Array.isArray(details.fair.children)) {
    const kids = details.fair.children.length;
    return { adults: null, kids, guests: kids || guestFallback };
  }

  if (details?.womens) {
    const women = Math.max(0, num(details.womens.women));
    // Headcount-only event — do not treat women as "adults" for CRM breakdowns.
    return { adults: null, kids: null, guests: women || guestFallback };
  }

  // Generic future shape: { adults, kids } at top level of details
  if (details && (details.adults != null || details.kids != null)) {
    const adults = details.adults != null ? Math.max(0, num(details.adults)) : null;
    const kids = details.kids != null ? Math.max(0, num(details.kids)) : null;
    const guests =
      (adults ?? 0) + (kids ?? 0) > 0 ? (adults ?? 0) + (kids ?? 0) : guestFallback;
    return { adults, kids, guests };
  }

  return { adults: null, kids: null, guests: guestFallback };
}

/** Ticket / donation / fee / grand total for one registration. */
export function parseEventMoney(row: {
  amount?: number | null;
  sponsor_amount?: number | null;
  card_fee?: number | null;
  registration_details?: unknown;
}): EventMoneyBreakdown {
  const total = Math.max(0, num(row.amount));
  const donation = Math.max(0, num(row.sponsor_amount));
  const fee = Math.max(0, num(row.card_fee));
  const details = asDetails(row.registration_details);
  const ticketFromDetails =
    details?.ticketSubtotal != null ? Math.max(0, num(details.ticketSubtotal)) : null;
  const ticket =
    ticketFromDetails != null ? ticketFromDetails : Math.max(0, total - donation - fee);
  const hasMoney = total > 0 || donation > 0 || ticket > 0 || fee > 0;

  return { ticket, donation, fee, total, hasMoney };
}

export type EventAggregateStats = {
  submissionCount: number;
  guestTotal: number;
  adultsTotal: number | null;
  kidsTotal: number | null;
  hasAdultsKids: boolean;
  ticketTotal: number;
  donationTotal: number;
  feeTotal: number;
  revenueTotal: number;
  hasMoney: boolean;
};

export function aggregateEventRegistrations(
  rows: Array<{
    guest_count?: number | null;
    amount?: number | null;
    sponsor_amount?: number | null;
    card_fee?: number | null;
    registration_details?: unknown;
  }>,
): EventAggregateStats {
  let guestTotal = 0;
  let adultsTotal = 0;
  let kidsTotal = 0;
  let hasAdultsKids = false;
  let ticketTotal = 0;
  let donationTotal = 0;
  let feeTotal = 0;
  let revenueTotal = 0;
  let hasMoney = false;

  for (const row of rows) {
    const people = parseEventPeople(row);
    guestTotal += people.guests;
    if (people.adults != null || people.kids != null) {
      hasAdultsKids = true;
      adultsTotal += people.adults ?? 0;
      kidsTotal += people.kids ?? 0;
    }

    const money = parseEventMoney(row);
    if (money.hasMoney) {
      hasMoney = true;
      ticketTotal += money.ticket;
      donationTotal += money.donation;
      feeTotal += money.fee;
      revenueTotal += money.total;
    }
  }

  return {
    submissionCount: rows.length,
    guestTotal,
    adultsTotal: hasAdultsKids ? adultsTotal : null,
    kidsTotal: hasAdultsKids ? kidsTotal : null,
    hasAdultsKids,
    ticketTotal,
    donationTotal,
    feeTotal,
    revenueTotal,
    hasMoney,
  };
}
