import { createAdminClient } from '@/lib/supabase/server';
import { ensureCrmContact } from '@/lib/admin/ensure-contact';

const BAD_FIRST = new Set(['', 'unknown', 'friend', 'n/a', 'na', 'none', 'test']);
const BAD_LAST = new Set(['', 'unknown', 'partner', 'n/a', 'na', 'none', 'test']);

function isBadFirst(v: string | null | undefined): boolean {
  return BAD_FIRST.has(String(v || '').trim().toLowerCase());
}

function isBadLast(v: string | null | undefined): boolean {
  return BAD_LAST.has(String(v || '').trim().toLowerCase());
}

function pickName(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function splitFullName(full: string): { first: string; last: string } {
  const parts = full.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!parts.length) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/** Pull best-effort names from a form_submissions payload / raw blob. */
export function extractNamesFromPayload(payload: unknown): {
  first: string;
  last: string;
} {
  const p =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  let first = pickName(
    p.firstName,
    p.first_name,
    p.FirstName,
    p['First Name'],
    p.donorFirstName,
    p.buyerFirstName,
  );
  let last = pickName(
    p.lastName,
    p.last_name,
    p.LastName,
    p['Last Name'],
    p.donorLastName,
    p.buyerLastName,
  );

  const full = pickName(p.name, p.fullName, p.full_name, p.donorName, p.Name);
  if ((!first || !last) && full) {
    const split = splitFullName(full);
    if (!first) first = split.first;
    if (!last) last = split.last;
  }

  // Nested contact / buyer objects (Zeffy-style)
  for (const key of ['contact', 'buyer', 'donor', 'customer']) {
    const nested = p[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const n = nested as Record<string, unknown>;
      if (!first) {
        first = pickName(n.firstName, n.first_name, n.FirstName);
      }
      if (!last) {
        last = pickName(n.lastName, n.last_name, n.LastName);
      }
      if ((!first || !last) && typeof n.name === 'string') {
        const split = splitFullName(n.name);
        if (!first) first = split.first;
        if (!last) last = split.last;
      }
    }
  }

  // Stripe unified Name field sometimes lands as `Name` in imports
  if ((!first || !last) && typeof p.Name === 'string') {
    const split = splitFullName(p.Name);
    if (!first) first = split.first;
    if (!last) last = split.last;
  }

  return { first, last };
}

function guessFromEmail(email: string): { first: string; last: string } {
  const local = email.split('@')[0] || '';
  const cleaned = local.replace(/[._+-]+/g, ' ').trim();
  if (!cleaned || cleaned.length < 2) return { first: '', last: '' };
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    // scdalmao → leave blank rather than invent a fake first name
    return { first: '', last: '' };
  }
  const title = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return {
    first: title(parts[0]),
    last: parts.slice(1).map(title).join(' '),
  };
}

export type RepairChaiNamesStats = {
  partnersScanned: number;
  partnersUpdated: number;
  contactsUpdated: number;
  stillMissing: string[];
  errors: number;
  errorSamples: string[];
};

/**
 * Repair Chai Partner + Contact rows that have Unknown / Friend / empty names
 * using form_submissions payloads and other CRM rows for the same email.
 */
export async function repairChaiPartnerNames(): Promise<RepairChaiNamesStats> {
  const supabase = createAdminClient();
  const stats: RepairChaiNamesStats = {
    partnersScanned: 0,
    partnersUpdated: 0,
    contactsUpdated: 0,
    stillMissing: [],
    errors: 0,
    errorSamples: [],
  };

  const { data: partners, error } = await supabase
    .from('chai_partners')
    .select('id, email, first_name, last_name, phone, created_at, monthly_amount, status')
    .not('email', 'is', null)
    .limit(5000);

  if (error) throw error;

  for (const partner of partners || []) {
    stats.partnersScanned++;
    const email = String(partner.email || '').trim().toLowerCase();
    if (!email) continue;

    const needsFirst = isBadFirst(partner.first_name);
    const needsLast = isBadLast(partner.last_name);

    // Also repair contacts even if partner names look OK but contact says Unknown
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, phone, created_at')
      .ilike('email', email)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const contactNeeds =
      !contact ||
      isBadFirst(contact.first_name) ||
      isBadLast(contact.last_name);

    if (!needsFirst && !needsLast && !contactNeeds) continue;

    let first = needsFirst ? '' : String(partner.first_name || '').trim();
    let last = needsLast ? '' : String(partner.last_name || '').trim();

    // 1) form_submissions for this email
    const { data: subs } = await supabase
      .from('form_submissions')
      .select('payload, form_type, created_at')
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(40);

    for (const s of subs || []) {
      const extracted = extractNamesFromPayload(s.payload);
      if (!first && !isBadFirst(extracted.first)) first = extracted.first;
      if (!last && !isBadLast(extracted.last)) last = extracted.last;
      if (first && last) break;
    }

    // 2b) Stripe customer import payloads often have Name / metadata names
    if (!first || !last) {
      for (const s of subs || []) {
        if (s.form_type !== 'stripe_customer_import') continue;
        const p = (s.payload || {}) as Record<string, unknown>;
        const extracted = extractNamesFromPayload(p);
        if (!first && extracted.first) first = extracted.first;
        if (!last && extracted.last) last = extracted.last;
        // Also check nested address/name leftovers
        if ((!first || !last) && typeof p.name === 'string') {
          const split = splitFullName(p.name);
          if (!first) first = split.first;
          if (!last) last = split.last;
        }
      }
    }

    // 2) parents / rsvps / donations
    if (!first || !last) {
      const { data: parent } = await supabase
        .from('parents')
        .select('first_name, last_name')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
      if (parent) {
        if (!first && !isBadFirst(parent.first_name)) first = parent.first_name;
        if (!last && !isBadLast(parent.last_name)) last = parent.last_name;
      }
    }
    if (!first || !last) {
      const { data: rsvp } = await supabase
        .from('event_registrations')
        .select('first_name, last_name')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
      if (rsvp) {
        if (!first && !isBadFirst(rsvp.first_name)) first = rsvp.first_name;
        if (!last && !isBadLast(rsvp.last_name)) last = rsvp.last_name;
      }
    }
    if (!first || !last) {
      const { data: donation } = await supabase
        .from('donations')
        .select('first_name, last_name')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
      if (donation) {
        if (!first && !isBadFirst(donation.first_name)) first = donation.first_name;
        if (!last && !isBadLast(donation.last_name)) last = donation.last_name;
      }
    }

    // 3) contact message "Name:" blocks / Stripe Name in notes — skip if still empty
    if ((!first || !last) && contact) {
      // Prefer existing good contact half-names
      if (!first && !isBadFirst(contact.first_name)) first = contact.first_name;
      if (!last && !isBadLast(contact.last_name)) last = contact.last_name;
    }

    if (!first && !last) {
      const guess = guessFromEmail(email);
      first = guess.first;
      last = guess.last;
    }

    if (!first && !last) {
      if (stats.stillMissing.length < 30) stats.stillMissing.push(email);
      continue;
    }

    // Keep a usable display: if only one side found, don't invent the other as Partner
    if (!first) first = 'Member';
    if (!last) last = '';

    try {
      if (
        needsFirst ||
        needsLast ||
        isBadFirst(partner.first_name) ||
        isBadLast(partner.last_name)
      ) {
        const { error: upErr } = await supabase
          .from('chai_partners')
          .update({
            first_name: first,
            last_name: last || partner.last_name || '',
          })
          .eq('id', partner.id);
        if (upErr) throw upErr;
        stats.partnersUpdated++;
      }

      const ensured = await ensureCrmContact({
        firstName: first,
        lastName: last,
        email,
        phone: partner.phone,
        interest: 'Chai Partner',
        note: null,
        createdAt: partner.created_at,
        isResolved: true,
        forceName: true,
      });
      if (ensured) stats.contactsUpdated++;
    } catch (err) {
      stats.errors++;
      const msg = `${email}: ${err instanceof Error ? err.message : String(err)}`;
      if (stats.errorSamples.length < 8) stats.errorSamples.push(msg);
    }
  }

  // Also fix orphan contacts marked Chai Partner with Unknown even if no partner row
  const { data: badContacts } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name, phone, created_at, interest')
    .ilike('interest', '%chai%')
    .limit(2000);

  for (const c of badContacts || []) {
    if (!c.email) continue;
    if (!isBadFirst(c.first_name) && !isBadLast(c.last_name)) continue;
    // Will be covered if partner exists; for orphans, try form log only
    const { data: partner } = await supabase
      .from('chai_partners')
      .select('id')
      .ilike('email', c.email)
      .limit(1)
      .maybeSingle();
    if (partner) continue;

    const { data: subs } = await supabase
      .from('form_submissions')
      .select('payload')
      .ilike('email', c.email)
      .limit(20);
    let first = '';
    let last = '';
    for (const s of subs || []) {
      const extracted = extractNamesFromPayload(s.payload);
      if (!first && extracted.first) first = extracted.first;
      if (!last && extracted.last) last = extracted.last;
    }
    if (!first && !last) continue;
    await ensureCrmContact({
      firstName: first || 'Member',
      lastName: last,
      email: c.email,
      phone: c.phone,
      interest: 'Chai Partner',
      forceName: true,
      isResolved: true,
    });
    stats.contactsUpdated++;
  }

  return stats;
}
