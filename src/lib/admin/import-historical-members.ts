import { createAdminClient } from '@/lib/supabase/server';
import {
  importStripeCustomersCsv,
  type StripeCustomerImportStats,
} from '@/lib/admin/import-stripe-customers';

const SKIP_EMAILS = new Set(['test@habayitcc.org', 't@t.com']);

export type HistoricalImportFile = {
  filename: string;
  csvText: string;
};

export type EventSheetImportStats = {
  source: string;
  slug: string;
  rows: number;
  contactsCreated: number;
  contactsUpdated: number;
  familiesCreated: number;
  familiesUpdated: number;
  parentsCreated: number;
  parentsUpdated: number;
  rsvpsCreated: number;
  rsvpsSkipped: number;
  audits: number;
  errors: number;
  errorSamples: string[];
};

export type HistoricalImportStats = {
  quiet: true;
  emailsSent: false;
  filesProcessed: string[];
  stripe: StripeCustomerImportStats | null;
  events: EventSheetImportStats[];
  totals: {
    contactsCreated: number;
    contactsUpdated: number;
    familiesCreated: number;
    familiesUpdated: number;
    parentsCreated: number;
    parentsUpdated: number;
    rsvpsCreated: number;
    audits: number;
    errors: number;
  };
};

type EventSourceConfig = {
  match: RegExp;
  slug: string;
  title: string;
  startsAt: string;
  interest: string;
};

const EVENT_SOURCES: EventSourceConfig[] = [
  {
    match: /matzah/i,
    slug: 'matzah-bakery',
    title: 'Matzah Bakery',
    startsAt: '2026-03-15T10:00:00-04:00',
    interest: 'Matzah Bakery',
  },
  {
    match: /purim|urban\s*air/i,
    slug: 'purim-urban-air',
    title: 'Purim Urban Air',
    startsAt: '2026-03-03T16:00:00-05:00',
    interest: 'Purim Urban Air',
  },
  {
    match: /shavuot/i,
    slug: 'shavuot-2026',
    title: 'Shavuot 2026',
    startsAt: '2026-05-11T18:00:00-04:00',
    interest: 'Shavuot',
  },
  {
    match: /lag\s*baomer|lag_baomer|5786/i,
    slug: 'lag-baomer-5786',
    title: 'Lag BaOmer 5786',
    startsAt: '2026-04-16T17:00:00-04:00',
    interest: 'Lag BaOmer',
  },
];

type SheetPerson = {
  first: string;
  last: string;
  email: string | null;
  phone: string | null;
  phoneDigits: string | null;
  adults: number;
  children: number;
  donation: number;
  total: number;
  childrenNames: string;
  stampedAt: string | null;
};

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    const n = csv[i + 1];
    if (q) {
      if (c === '"' && n === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || (c === '\r' && n === '\n')) {
      if (c === '\r') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function col(row: string[], idx: Record<string, number>, ...names: string[]): string {
  for (const name of names) {
    const i = idx[name];
    if (i != null) return String(row[i] ?? '').trim();
  }
  return '';
}

function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  if (SKIP_EMAILS.has(email)) return null;
  return email;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits.slice(-10);
}

function formatPhone(digits: string | null): string | null {
  if (!digits || digits.length !== 10) return digits;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function parseMoney(raw: string): number {
  const n = Number(String(raw || '').replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse sheet / Stripe timestamps into ISO for created_at.
 * Sheets are treated as America/New_York wall time when no zone is present.
 */
export function parseHistoricalDate(
  raw: string | null | undefined,
  assumeUtc = false,
): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;

  // Stripe-style: "2026-07-20 01:29" (UTC)
  const utcish = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (utcish && assumeUtc) {
    const [, y, mo, d, h, mi, sec] = utcish;
    const iso = `${y}-${mo}-${d}T${h.padStart(2, '0')}:${mi}:${(sec || '00').padStart(2, '0')}Z`;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }

  // "2026-03-03 16:37:53" or "3/13/2026 3:24 PM" / "5/11/2026, 12:42:43 PM"
  const cleaned = s.replace(',', '');
  const mdY = cleaned.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i,
  );
  if (mdY) {
    let hour = Number(mdY[4]);
    const min = Number(mdY[5]);
    const sec = Number(mdY[6] || 0);
    const ap = (mdY[7] || '').toUpperCase();
    if (ap === 'PM' && hour < 12) hour += 12;
    if (ap === 'AM' && hour === 12) hour = 0;
    const y = Number(mdY[3]);
    const mo = Number(mdY[1]);
    const d = Number(mdY[2]);
    // Interpret as ET (UTC-4 during DST months Mar–Nov for these 2026 events)
    const offset = mo >= 3 && mo <= 11 ? '-04:00' : '-05:00';
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}${offset}`;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }

  const ymd = cleaned.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (ymd) {
    const [, y, mo, d, h, mi, sec] = ymd;
    const month = Number(mo);
    const offset = month >= 3 && month <= 11 ? '-04:00' : '-05:00';
    const iso = `${y}-${mo}-${d}T${h.padStart(2, '0')}:${mi}:${(sec || '00').padStart(2, '0')}${offset}`;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }

  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function parseIntSafe(raw: string): number {
  const n = Number(String(raw || '').trim());
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function mergeNotes(existing: string | null | undefined, block: string): string | null {
  const base = (existing || '').trim();
  if (!block.trim()) return base || null;
  if (!base) return block.trim();
  if (base.includes(block.trim().split('\n')[0] || '___never___')) {
    // Same header already present — append only if not exact duplicate chunk
    if (base.includes(block.trim())) return base;
  }
  return `${base}\n\n${block.trim()}`.trim();
}

function detectSource(
  filename: string,
  csvText: string,
): { kind: 'stripe' } | { kind: 'event'; config: EventSourceConfig } | { kind: 'unknown' } {
  const name = filename.toLowerCase();
  if (name.includes('unified_customers') || csvText.includes('Total Spend')) {
    return { kind: 'stripe' };
  }
  for (const config of EVENT_SOURCES) {
    if (config.match.test(filename) || config.match.test(name)) {
      return { kind: 'event', config };
    }
  }
  return { kind: 'unknown' };
}

function parseEventSheet(csvText: string): SheetPerson[] {
  const rows = parseCsv(csvText);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = Object.fromEntries(header.map((k, i) => [k, i]));
  // Also allow case-insensitive lookup
  for (const [k, i] of Object.entries(idx)) {
    idx[k.toLowerCase()] = i;
  }

  const people: SheetPerson[] = [];
  for (const r of rows.slice(1)) {
    if (!r.some((x) => String(x).trim())) continue;
    const first = col(r, idx, 'First Name', 'first name', 'First name');
    const last = col(r, idx, 'Last Name', 'last name', 'Last name');
    const email = normalizeEmail(col(r, idx, 'Email', 'email'));
    const phoneDigits = normalizePhone(col(r, idx, 'Phone', 'phone'));
    if (!email && !phoneDigits && !first && !last) continue;

    const adults = parseIntSafe(col(r, idx, 'Adults', 'adults'));
    const children = parseIntSafe(col(r, idx, 'Children', 'children'));
    const donation = parseMoney(
      col(r, idx, 'Donation', 'donation', 'pay and Donation', 'Pay and Donation'),
    );
    const total = parseMoney(col(r, idx, 'Total', 'total')) || donation;
    const childrenNames = col(r, idx, 'Children names', 'children names', 'Children Names');
    const stampedAt =
      col(r, idx, 'Timestamp', 'timestamp', 'Date', 'date') || null;

    people.push({
      first: first || 'Unknown',
      last: last || '',
      email,
      phone: formatPhone(phoneDigits),
      phoneDigits,
      adults,
      children,
      donation,
      total,
      childrenNames,
      stampedAt,
    });
  }
  return people;
}

async function ensureHistoricalEvent(
  slug: string,
  title: string,
  startsAt: string,
): Promise<string> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from('events')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from('events')
    .insert({
      slug,
      title,
      description: `Historical import: ${title}`,
      starts_at: startsAt,
      location: null,
      is_published: true,
    })
    .select('id')
    .single();

  if (error) {
    const { data: retry } = await supabase
      .from('events')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (retry?.id) return retry.id;
    throw error;
  }
  return data.id;
}

type FamilyHit = {
  id: string;
  notes: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

async function resolveFamilyIdForPerson(person: SheetPerson): Promise<string | null> {
  const supabase = createAdminClient();

  if (person.email) {
    const { data: byEmail } = await supabase
      .from('parents')
      .select('family_id')
      .ilike('email', person.email)
      .limit(1)
      .maybeSingle();
    if (byEmail?.family_id) return byEmail.family_id;
  }

  if (person.phoneDigits) {
    const { data: parents } = await supabase
      .from('parents')
      .select('id, family_id, phone')
      .not('phone', 'is', null)
      .limit(500);
    const hit = (parents || []).find((p) => {
      const d = normalizePhone(String(p.phone || ''));
      return d && d === person.phoneDigits;
    });
    if (hit?.family_id) return hit.family_id;
  }

  return null;
}

async function importEventSheet(
  filename: string,
  csvText: string,
  config: EventSourceConfig,
): Promise<EventSheetImportStats> {
  const supabase = createAdminClient();
  const people = parseEventSheet(csvText);
  const eventId = await ensureHistoricalEvent(config.slug, config.title, config.startsAt);

  const stats: EventSheetImportStats = {
    source: filename,
    slug: config.slug,
    rows: people.length,
    contactsCreated: 0,
    contactsUpdated: 0,
    familiesCreated: 0,
    familiesUpdated: 0,
    parentsCreated: 0,
    parentsUpdated: 0,
    rsvpsCreated: 0,
    rsvpsSkipped: 0,
    audits: 0,
    errors: 0,
    errorSamples: [],
  };

  for (const person of people) {
    try {
      const guestCount = Math.max(1, person.adults + person.children);
      const amountBits = [
        person.donation > 0 ? `donation noted: $${person.donation.toFixed(2)}` : '',
        person.total > 0 && person.total !== person.donation
          ? `total noted: $${person.total.toFixed(2)}`
          : '',
      ].filter(Boolean);
      const importBlock = [
        `--- Event import (${config.title}) ---`,
        person.stampedAt ? `Registered: ${person.stampedAt}` : '',
        `Adults: ${person.adults}, Children: ${person.children}`,
        person.childrenNames ? `Children names: ${person.childrenNames}` : '',
        ...amountBits,
        '(Amounts noted only — not imported as payments)',
      ]
        .filter(Boolean)
        .join('\n');

      let familyId = await resolveFamilyIdForPerson(person);
      const occurredAt = parseHistoricalDate(person.stampedAt);

      if (familyId) {
        const { data: fam } = await supabase
          .from('families')
          .select('id, notes, street_address, city, state, zip, created_at')
          .eq('id', familyId)
          .single();
        const famPatch: Record<string, unknown> = {
          family_name: person.last || person.first || 'Family',
          notes: mergeNotes((fam as FamilyHit | null)?.notes, importBlock),
        };
        if (
          occurredAt &&
          (!fam?.created_at ||
            new Date(occurredAt).getTime() < new Date(fam.created_at).getTime())
        ) {
          famPatch.created_at = occurredAt;
        }
        const { error } = await supabase
          .from('families')
          .update(famPatch)
          .eq('id', familyId);
        if (error) throw error;
        stats.familiesUpdated++;
      } else {
        const { data: fam, error } = await supabase
          .from('families')
          .insert({
            family_name: person.last || person.first || 'Family',
            notes: importBlock,
            ...(occurredAt ? { created_at: occurredAt } : {}),
          })
          .select('id')
          .single();
        if (error) throw error;
        familyId = fam.id;
        stats.familiesCreated++;
      }

      // Contact by email
      if (person.email) {
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id, message, interest, phone, last_name, created_at')
          .ilike('email', person.email)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (existingContact?.id) {
          const patch: Record<string, unknown> = {
            first_name: person.first,
            last_name: person.last || existingContact.last_name || '',
            phone: person.phone || existingContact.phone || null,
            interest: existingContact.interest || config.interest,
            message: mergeNotes(existingContact.message, importBlock),
            is_resolved: true,
          };
          if (
            occurredAt &&
            (!existingContact.created_at ||
              new Date(occurredAt).getTime() <
                new Date(existingContact.created_at).getTime())
          ) {
            patch.created_at = occurredAt;
          }
          const { error } = await supabase
            .from('contacts')
            .update(patch)
            .eq('id', existingContact.id);
          if (error) throw error;
          stats.contactsUpdated++;
        } else {
          const { error } = await supabase.from('contacts').insert({
            first_name: person.first,
            last_name: person.last || '',
            email: person.email,
            phone: person.phone,
            interest: config.interest,
            message: importBlock,
            is_resolved: true,
            ...(occurredAt ? { created_at: occurredAt } : {}),
          });
          if (error) throw error;
          stats.contactsCreated++;
        }
      }

      // Parent upsert / spouse attach
      let parentHit: {
        id: string;
        family_id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
      } | null = null;

      if (person.email) {
        const { data } = await supabase
          .from('parents')
          .select('id, family_id, first_name, last_name, email, phone')
          .ilike('email', person.email)
          .limit(1)
          .maybeSingle();
        parentHit = data;
      }

      if (!parentHit && person.phoneDigits) {
        const { data: parents } = await supabase
          .from('parents')
          .select('id, family_id, first_name, last_name, email, phone')
          .eq('family_id', familyId!)
          .limit(20);
        parentHit =
          (parents || []).find((p) => {
            const sameEmail =
              person.email &&
              p.email &&
              p.email.toLowerCase() === person.email.toLowerCase();
            const samePhone = normalizePhone(String(p.phone || '')) === person.phoneDigits;
            const sameName =
              p.first_name?.toLowerCase() === person.first.toLowerCase() &&
              (p.last_name || '').toLowerCase() === (person.last || '').toLowerCase();
            return sameEmail || samePhone || sameName;
          }) || null;

        // Phone match on another family already set familyId via resolveFamilyIdForPerson;
        // if this person is a different name/email on same phone → add as second parent
        if (!parentHit) {
          const { data: phoneParents } = await supabase
            .from('parents')
            .select('id, family_id, first_name, last_name, email, phone')
            .not('phone', 'is', null)
            .limit(500);
          const phoneHit = (phoneParents || []).find(
            (p) => normalizePhone(String(p.phone || '')) === person.phoneDigits,
          );
          if (phoneHit) {
            familyId = phoneHit.family_id;
            const differentPerson =
              (person.email &&
                phoneHit.email &&
                phoneHit.email.toLowerCase() !== person.email.toLowerCase()) ||
              phoneHit.first_name.toLowerCase() !== person.first.toLowerCase();
            if (!differentPerson) parentHit = phoneHit;
          }
        }
      }

      if (parentHit?.id) {
        const { error } = await supabase
          .from('parents')
          .update({
            first_name: person.first || parentHit.first_name,
            last_name: person.last || parentHit.last_name,
            email: person.email || parentHit.email,
            phone: person.phone || parentHit.phone,
            is_primary_contact: true,
          })
          .eq('id', parentHit.id);
        if (error) throw error;
        stats.parentsUpdated++;
        familyId = parentHit.family_id || familyId;
      } else {
        const { error } = await supabase.from('parents').insert({
          family_id: familyId!,
          first_name: person.first,
          last_name: person.last || '',
          email: person.email,
          phone: person.phone,
          is_primary_contact: true,
        });
        if (error) throw error;
        stats.parentsCreated++;
      }

      const rsvpNotes = [
        person.childrenNames ? `Children: ${person.childrenNames}` : '',
        ...amountBits,
        'quiet historical import',
      ]
        .filter(Boolean)
        .join(' | ');

      // Idempotent RSVP: update created_at from sheet date when row already exists
      if (person.email) {
        const { data: existingRsvp } = await supabase
          .from('event_registrations')
          .select('id')
          .eq('event_slug', config.slug)
          .ilike('email', person.email)
          .limit(1)
          .maybeSingle();
        if (existingRsvp?.id) {
          if (occurredAt) {
            await supabase
              .from('event_registrations')
              .update({ created_at: occurredAt })
              .eq('id', existingRsvp.id);
          }
          stats.rsvpsSkipped++;
        } else {
          const { error } = await supabase.from('event_registrations').insert({
            event_id: eventId,
            event_slug: config.slug,
            family_id: familyId,
            first_name: person.first,
            last_name: person.last || '',
            email: person.email,
            phone: person.phone,
            guest_count: guestCount,
            notes: rsvpNotes,
            ...(occurredAt ? { created_at: occurredAt } : {}),
          });
          if (error) throw error;
          stats.rsvpsCreated++;
        }
      } else {
        // Phone-only: skip if same phone+slug exists
        const { data: existingByPhone } = await supabase
          .from('event_registrations')
          .select('id, phone')
          .eq('event_slug', config.slug)
          .limit(500);
        const phoneHit = (existingByPhone || []).find(
          (r) => normalizePhone(String(r.phone || '')) === person.phoneDigits,
        );
        if (phoneHit?.id) {
          if (occurredAt) {
            await supabase
              .from('event_registrations')
              .update({ created_at: occurredAt })
              .eq('id', phoneHit.id);
          }
          stats.rsvpsSkipped++;
        } else {
          const { error } = await supabase.from('event_registrations').insert({
            event_id: eventId,
            event_slug: config.slug,
            family_id: familyId,
            first_name: person.first,
            last_name: person.last || '',
            email: null,
            phone: person.phone,
            guest_count: guestCount,
            notes: 'quiet historical import (no email)',
            ...(occurredAt ? { created_at: occurredAt } : {}),
          });
          if (error) throw error;
          stats.rsvpsCreated++;
        }
      }

      const { error: auditErr } = await supabase.from('form_submissions').insert({
        form_type: 'historical_event_import',
        email: person.email,
        ...(occurredAt ? { created_at: occurredAt } : {}),
        payload: {
          quiet: true,
          no_email: true,
          source_file: filename,
          event_slug: config.slug,
          first_name: person.first,
          last_name: person.last,
          phone: person.phone,
          adults: person.adults,
          children: person.children,
          children_names: person.childrenNames,
          donation_noted: person.donation,
          total_noted: person.total,
          stamped_at: person.stampedAt,
          family_id: familyId,
        },
      });
      if (auditErr) throw auditErr;
      stats.audits++;
    } catch (err) {
      stats.errors++;
      const label = person.email || person.phone || `${person.first} ${person.last}`;
      const msg = `${label}: ${err instanceof Error ? err.message : String(err)}`;
      if (stats.errorSamples.length < 8) stats.errorSamples.push(msg);
      console.error('[historical-event-import]', msg);
    }
  }

  return stats;
}

function emptyStripeStats(): StripeCustomerImportStats {
  return {
    uniqueImported: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    familiesCreated: 0,
    familiesUpdated: 0,
    parentsCreated: 0,
    parentsUpdated: 0,
    chaiUpserted: 0,
    audits: 0,
    errors: 0,
    errorSamples: [],
  };
}

/**
 * Quiet multi-file historical import.
 * Order: Stripe first (richest address/card), then event sheets.
 * Never sends email.
 */
export async function importHistoricalMembers(
  files: HistoricalImportFile[],
): Promise<HistoricalImportStats> {
  if (!files.length) {
    throw new Error('No files provided');
  }

  const classified = files.map((f) => ({
    ...f,
    detected: detectSource(f.filename, f.csvText),
  }));

  const stripeFiles = classified.filter((f) => f.detected.kind === 'stripe');
  const eventFiles = classified.filter((f) => f.detected.kind === 'event');
  const unknown = classified.filter((f) => f.detected.kind === 'unknown');
  if (unknown.length) {
    throw new Error(
      `Unrecognized file(s): ${unknown.map((u) => u.filename).join(', ')}`,
    );
  }

  let stripe: StripeCustomerImportStats | null = null;
  for (const f of stripeFiles) {
    const part = await importStripeCustomersCsv(f.csvText);
    if (!stripe) {
      stripe = part;
    } else {
      stripe.uniqueImported += part.uniqueImported;
      stripe.contactsCreated += part.contactsCreated;
      stripe.contactsUpdated += part.contactsUpdated;
      stripe.familiesCreated += part.familiesCreated;
      stripe.familiesUpdated += part.familiesUpdated;
      stripe.parentsCreated += part.parentsCreated;
      stripe.parentsUpdated += part.parentsUpdated;
      stripe.chaiUpserted += part.chaiUpserted;
      stripe.audits += part.audits;
      stripe.errors += part.errors;
      stripe.errorSamples.push(...part.errorSamples.slice(0, 4));
    }
  }

  const events: EventSheetImportStats[] = [];
  // Stable order matching EVENT_SOURCES
  const orderedEvents = [...eventFiles].sort((a, b) => {
    const ai = EVENT_SOURCES.findIndex((c) => c.slug === (a.detected as { config: EventSourceConfig }).config.slug);
    const bi = EVENT_SOURCES.findIndex((c) => c.slug === (b.detected as { config: EventSourceConfig }).config.slug);
    return ai - bi;
  });

  for (const f of orderedEvents) {
    const config = (f.detected as { kind: 'event'; config: EventSourceConfig }).config;
    events.push(await importEventSheet(f.filename, f.csvText, config));
  }

  const stripeStats = stripe || emptyStripeStats();
  const totals = {
    contactsCreated:
      (stripe?.contactsCreated || 0) + events.reduce((s, e) => s + e.contactsCreated, 0),
    contactsUpdated:
      (stripe?.contactsUpdated || 0) + events.reduce((s, e) => s + e.contactsUpdated, 0),
    familiesCreated:
      (stripe?.familiesCreated || 0) + events.reduce((s, e) => s + e.familiesCreated, 0),
    familiesUpdated:
      (stripe?.familiesUpdated || 0) + events.reduce((s, e) => s + e.familiesUpdated, 0),
    parentsCreated:
      (stripe?.parentsCreated || 0) + events.reduce((s, e) => s + e.parentsCreated, 0),
    parentsUpdated:
      (stripe?.parentsUpdated || 0) + events.reduce((s, e) => s + e.parentsUpdated, 0),
    rsvpsCreated: events.reduce((s, e) => s + e.rsvpsCreated, 0),
    audits: (stripe?.audits || 0) + events.reduce((s, e) => s + e.audits, 0),
    errors: (stripe?.errors || 0) + events.reduce((s, e) => s + e.errors, 0),
  };

  return {
    quiet: true,
    emailsSent: false,
    filesProcessed: classified.map((f) => f.filename),
    stripe: stripeFiles.length ? stripeStats : null,
    events,
    totals,
  };
}

/**
 * Fix dates on already-imported rows using stamped_at / stripe_created stored
 * in form_submissions (and note text fallbacks). Also sets families.created_at.
 * Quiet — no emails.
 */
export async function backfillHistoricalImportDates(): Promise<{
  rsvpsUpdated: number;
  contactsUpdated: number;
  familiesUpdated: number;
  auditsUpdated: number;
  skipped: number;
  errors: number;
  errorSamples: string[];
}> {
  const supabase = createAdminClient();
  const stats = {
    rsvpsUpdated: 0,
    contactsUpdated: 0,
    familiesUpdated: 0,
    auditsUpdated: 0,
    skipped: 0,
    errors: 0,
    errorSamples: [] as string[],
  };

  const { data: audits, error } = await supabase
    .from('form_submissions')
    .select('id, email, form_type, created_at, payload')
    .in('form_type', ['historical_event_import', 'stripe_customer_import'])
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) throw error;

  // Earliest date per family / email for family backfill
  const familyEarliest = new Map<string, string>();
  const emailEarliest = new Map<string, string>();

  function rememberEarliest(map: Map<string, string>, key: string, iso: string) {
    const prev = map.get(key);
    if (!prev || new Date(iso).getTime() < new Date(prev).getTime()) {
      map.set(key, iso);
    }
  }

  for (const row of audits || []) {
    try {
      const payload = (row.payload || {}) as Record<string, unknown>;
      let occurredAt: string | null = null;

      if (row.form_type === 'historical_event_import') {
        occurredAt = parseHistoricalDate(String(payload.stamped_at || ''));
      } else {
        occurredAt = parseHistoricalDate(
          String(payload.stripe_created || ''),
          true,
        );
      }

      if (!occurredAt) {
        stats.skipped++;
        continue;
      }

      const familyId = payload.family_id ? String(payload.family_id) : '';
      if (familyId) rememberEarliest(familyEarliest, familyId, occurredAt);

      // Always align the audit row itself
      if (row.created_at !== occurredAt) {
        await supabase
          .from('form_submissions')
          .update({ created_at: occurredAt })
          .eq('id', row.id);
        stats.auditsUpdated++;
      }

      const email = row.email?.trim().toLowerCase();
      if (email) {
        rememberEarliest(emailEarliest, email, occurredAt);
        const { data: contact } = await supabase
          .from('contacts')
          .select('id, created_at')
          .ilike('email', email)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (
          contact?.id &&
          (!contact.created_at ||
            new Date(occurredAt).getTime() < new Date(contact.created_at).getTime())
        ) {
          await supabase
            .from('contacts')
            .update({ created_at: occurredAt })
            .eq('id', contact.id);
          stats.contactsUpdated++;
        }
      }

      if (row.form_type === 'historical_event_import') {
        const slug = String(payload.event_slug || '');
        if (slug && email) {
          const { data: rsvp } = await supabase
            .from('event_registrations')
            .select('id, created_at, family_id')
            .eq('event_slug', slug)
            .ilike('email', email)
            .limit(1)
            .maybeSingle();
          if (rsvp?.id) {
            if (rsvp.created_at !== occurredAt) {
              await supabase
                .from('event_registrations')
                .update({ created_at: occurredAt })
                .eq('id', rsvp.id);
              stats.rsvpsUpdated++;
            }
            if (rsvp.family_id) {
              rememberEarliest(familyEarliest, rsvp.family_id, occurredAt);
            }
          }
        }
      }
    } catch (err) {
      stats.errors++;
      const msg = `${row.id}: ${err instanceof Error ? err.message : String(err)}`;
      if (stats.errorSamples.length < 8) stats.errorSamples.push(msg);
    }
  }

  // Resolve family ids via parents for emails we have dates for
  for (const [email, iso] of emailEarliest) {
    const { data: parent } = await supabase
      .from('parents')
      .select('family_id')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    if (parent?.family_id) {
      rememberEarliest(familyEarliest, parent.family_id, iso);
    }
  }

  for (const [familyId, iso] of familyEarliest) {
    try {
      const { data: fam } = await supabase
        .from('families')
        .select('id, created_at')
        .eq('id', familyId)
        .maybeSingle();
      if (
        fam?.id &&
        (!fam.created_at ||
          new Date(iso).getTime() < new Date(fam.created_at).getTime())
      ) {
        await supabase
          .from('families')
          .update({ created_at: iso })
          .eq('id', familyId);
        stats.familiesUpdated++;
      }
    } catch (err) {
      stats.errors++;
      const msg = `family ${familyId}: ${err instanceof Error ? err.message : String(err)}`;
      if (stats.errorSamples.length < 8) stats.errorSamples.push(msg);
    }
  }

  // Fallback: imported contacts still stamped with the import-day created_at
  const { data: recentContacts } = await supabase
    .from('contacts')
    .select('id, email, message, created_at')
    .or(
      'message.ilike.%--- Event import%,message.ilike.%--- Stripe import%,message.ilike.%Registered:%,message.ilike.%Stripe created:%',
    )
    .limit(3000);

  for (const c of recentContacts || []) {
    try {
      const msg = String(c.message || '');
      let occurredAt: string | null = null;
      const reg = msg.match(/Registered:\s*([^\n]+)/i);
      if (reg) occurredAt = parseHistoricalDate(reg[1].trim());
      if (!occurredAt) {
        const sc = msg.match(/Stripe created:\s*([^\n]+)/i);
        if (sc) {
          occurredAt = parseHistoricalDate(
            sc[1].replace(/\s*UTC\s*$/i, '').trim(),
            true,
          );
        }
      }
      // Prefer earliest date already known for this email from audits
      const emailKey = (c.email || '').trim().toLowerCase();
      if (emailKey && emailEarliest.has(emailKey)) {
        const fromAudit = emailEarliest.get(emailKey)!;
        if (
          !occurredAt ||
          new Date(fromAudit).getTime() < new Date(occurredAt).getTime()
        ) {
          occurredAt = fromAudit;
        }
      }
      if (!occurredAt) continue;
      if (
        !c.created_at ||
        new Date(occurredAt).getTime() < new Date(c.created_at).getTime()
      ) {
        await supabase
          .from('contacts')
          .update({ created_at: occurredAt })
          .eq('id', c.id);
        stats.contactsUpdated++;
      }
    } catch (err) {
      stats.errors++;
      const m = `contact ${c.id}: ${err instanceof Error ? err.message : String(err)}`;
      if (stats.errorSamples.length < 8) stats.errorSamples.push(m);
    }
  }

  return stats;
}
