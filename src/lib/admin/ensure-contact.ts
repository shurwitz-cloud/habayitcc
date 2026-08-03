import { createAdminClient } from '@/lib/supabase/server';

const SKIP_EMAILS = new Set(['test@habayitcc.org', 't@t.com']);

export type EnsureContactInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  interest?: string | null;
  /** Appended to message if not already present */
  note?: string | null;
  /** Prefer older of existing vs this when set */
  createdAt?: string | null;
  /** Mark resolved (historical / transactional) vs open lead */
  isResolved?: boolean;
  /** Overwrite placeholder names (Unknown / Friend / Partner) */
  forceName?: boolean;
};

const PLACEHOLDER_FIRST = new Set(['unknown', 'friend', 'n/a', 'na', 'none', '']);
const PLACEHOLDER_LAST = new Set(['unknown', 'partner', 'n/a', 'na', 'none', '']);

function isPlaceholderFirst(v: string): boolean {
  return PLACEHOLDER_FIRST.has(v.trim().toLowerCase());
}
function isPlaceholderLast(v: string): boolean {
  return PLACEHOLDER_LAST.has(v.trim().toLowerCase());
}

/**
 * Upsert a CRM contact by email. Every person-producing flow should call this
 * so Contacts stays the unified people directory.
 */
export async function ensureCrmContact(
  input: EnsureContactInput,
): Promise<{ id: string; created: boolean } | null> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@') || SKIP_EMAILS.has(email)) return null;

  let first = input.firstName.trim();
  let last = input.lastName.trim();
  if (isPlaceholderFirst(first)) first = '';
  if (isPlaceholderLast(last)) last = '';

  const phone = input.phone?.trim() || null;
  const interest = input.interest?.trim() || null;
  const note = input.note?.trim() || null;

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, phone, interest, message, created_at, is_resolved')
    .ilike('email', email)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const patch: Record<string, unknown> = {};
    const existingFirstBad = isPlaceholderFirst(existing.first_name || '');
    const existingLastBad = isPlaceholderLast(existing.last_name || '');

    if (first) {
      if (input.forceName || existingFirstBad || !existing.first_name) {
        patch.first_name = first;
      }
    }
    if (last) {
      if (input.forceName || existingLastBad || !existing.last_name) {
        patch.last_name = last;
      }
    }
    if (phone && !existing.phone) patch.phone = phone;
    if (interest && !existing.interest) patch.interest = interest;
    if (note) {
      const base = (existing.message || '').trim();
      if (!base) patch.message = note;
      else if (!base.includes(note.slice(0, Math.min(40, note.length)))) {
        patch.message = `${base}\n\n${note}`.trim();
      }
    }
    if (
      input.createdAt &&
      (!existing.created_at ||
        new Date(input.createdAt).getTime() < new Date(existing.created_at).getTime())
    ) {
      patch.created_at = input.createdAt;
    }

    if (Object.keys(patch).length) {
      const { error } = await supabase.from('contacts').update(patch).eq('id', existing.id);
      if (error) {
        console.error('[ensureCrmContact] update', error.message);
        return null;
      }
    }
    return { id: existing.id, created: false };
  }

  // Don't create brand-new contacts with no usable name unless we have interest note
  const insertFirst = first || 'Member';
  const insertLast = last;

  const { data: created, error } = await supabase
    .from('contacts')
    .insert({
      first_name: insertFirst,
      last_name: insertLast,
      email,
      phone,
      interest,
      message: note,
      is_resolved: input.isResolved ?? true,
      ...(input.createdAt ? { created_at: input.createdAt } : {}),
    })
    .select('id')
    .single();

  if (error || !created) {
    console.error('[ensureCrmContact] insert', error?.message);
    return null;
  }
  return { id: created.id, created: true };
}

export type SyncContactsStats = {
  fromChai: number;
  fromRsvps: number;
  fromDonations: number;
  fromParents: number;
  fromProgramRegs: number;
  fromFormLog: number;
  fromWaivers: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  errorSamples: string[];
};

function payloadStr(payload: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * Backfill Contacts from every CRM person source.
 */
export async function syncContactsFromCrmPeople(): Promise<SyncContactsStats> {
  const supabase = createAdminClient();
  const stats: SyncContactsStats = {
    fromChai: 0,
    fromRsvps: 0,
    fromDonations: 0,
    fromParents: 0,
    fromProgramRegs: 0,
    fromFormLog: 0,
    fromWaivers: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    errorSamples: [],
  };

  type SourceKey =
    | 'chai'
    | 'rsvp'
    | 'donation'
    | 'parent'
    | 'program'
    | 'form'
    | 'waiver';

  async function apply(source: SourceKey, input: EnsureContactInput) {
    try {
      const result = await ensureCrmContact(input);
      if (!result) {
        stats.skipped++;
        return;
      }
      if (source === 'chai') stats.fromChai++;
      if (source === 'rsvp') stats.fromRsvps++;
      if (source === 'donation') stats.fromDonations++;
      if (source === 'parent') stats.fromParents++;
      if (source === 'program') stats.fromProgramRegs++;
      if (source === 'form') stats.fromFormLog++;
      if (source === 'waiver') stats.fromWaivers++;
      if (result.created) stats.created++;
      else stats.updated++;
    } catch (err) {
      stats.errors++;
      const msg = `${input.email}: ${err instanceof Error ? err.message : String(err)}`;
      if (stats.errorSamples.length < 8) stats.errorSamples.push(msg);
    }
  }

  const { data: chai } = await supabase
    .from('chai_partners')
    .select('first_name, last_name, email, phone, created_at, monthly_amount, status')
    .not('email', 'is', null)
    .limit(10000);

  for (const p of chai || []) {
    if (!p.email) continue;
    await apply('chai', {
      firstName: p.first_name,
      lastName: p.last_name,
      email: p.email,
      phone: p.phone,
      interest: 'Chai Partner',
      note: `--- Synced from Chai partner ---\nStatus: ${p.status}\nMonthly: $${Number(p.monthly_amount).toFixed(2)}`,
      createdAt: p.created_at,
      isResolved: true,
    });
  }

  const { data: rsvps } = await supabase
    .from('event_registrations')
    .select('first_name, last_name, email, phone, created_at, event_slug, guest_count')
    .not('email', 'is', null)
    .limit(10000);

  for (const r of rsvps || []) {
    if (!r.email) continue;
    await apply('rsvp', {
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      phone: r.phone,
      interest: r.event_slug || 'Event RSVP',
      note: `--- Synced from RSVP (${r.event_slug || 'event'}) ---\nGuests: ${r.guest_count}`,
      createdAt: r.created_at,
      isResolved: true,
    });
  }

  const { data: donations } = await supabase
    .from('donations')
    .select('first_name, last_name, email, phone, created_at, amount, campaign')
    .not('email', 'is', null)
    .limit(10000);

  for (const d of donations || []) {
    if (!d.email) continue;
    await apply('donation', {
      firstName: d.first_name,
      lastName: d.last_name,
      email: d.email,
      phone: d.phone,
      interest: 'Donor',
      note: `--- Synced from donation ---\nAmount: $${Number(d.amount).toFixed(2)}${d.campaign ? `\nCampaign: ${d.campaign}` : ''}`,
      createdAt: d.created_at,
      isResolved: true,
    });
  }

  const { data: parents } = await supabase
    .from('parents')
    .select('first_name, last_name, email, phone, created_at, is_primary_contact')
    .not('email', 'is', null)
    .limit(10000);

  for (const p of parents || []) {
    if (!p.email) continue;
    await apply('parent', {
      firstName: p.first_name,
      lastName: p.last_name,
      email: p.email,
      phone: p.phone,
      interest: 'Family',
      note: `--- Synced from family parent ---\nPrimary: ${p.is_primary_contact ? 'yes' : 'no'}`,
      createdAt: p.created_at,
      isResolved: true,
    });
  }

  const { data: regs } = await supabase
    .from('program_registrations')
    .select('id, family_id, program_id, status, created_at')
    .limit(10000);

  const familyIds = [...new Set((regs || []).map((r) => r.family_id).filter(Boolean))];
  const parentByFamily = new Map<
    string,
    { first_name: string; last_name: string; email: string | null; phone: string | null }
  >();

  if (familyIds.length) {
    const { data: famParents } = await supabase
      .from('parents')
      .select('family_id, first_name, last_name, email, phone, is_primary_contact')
      .in('family_id', familyIds)
      .limit(10000);
    for (const p of famParents || []) {
      if (!p.family_id || !p.email) continue;
      const existing = parentByFamily.get(p.family_id);
      if (!existing || p.is_primary_contact) {
        parentByFamily.set(p.family_id, p);
      }
    }
  }

  const { data: programs } = await supabase.from('programs').select('id, name, slug').limit(200);
  const programName = new Map((programs || []).map((p) => [p.id, p.name || p.slug || 'Program']));

  for (const reg of regs || []) {
    const parent = reg.family_id ? parentByFamily.get(reg.family_id) : null;
    if (!parent?.email) continue;
    await apply('program', {
      firstName: parent.first_name,
      lastName: parent.last_name,
      email: parent.email,
      phone: parent.phone,
      interest: programName.get(reg.program_id) || 'Program registration',
      note: `--- Synced from program registration ---\nStatus: ${reg.status}`,
      createdAt: reg.created_at,
      isResolved: true,
    });
  }

  const { data: submissions } = await supabase
    .from('form_submissions')
    .select('email, form_type, created_at, payload')
    .not('email', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10000);

  for (const s of submissions || []) {
    if (!s.email) continue;
    const payload = (s.payload || {}) as Record<string, unknown>;
    const first =
      payloadStr(payload, 'firstName', 'first_name', 'First Name') || '';
    const last = payloadStr(payload, 'lastName', 'last_name', 'Last Name');
    // Prefer full name if first/last missing
    let firstName = first;
    let lastName = last;
    if (!firstName || !lastName) {
      const full = payloadStr(payload, 'name', 'fullName', 'full_name', 'Name');
      if (full) {
        const parts = full.split(/\s+/).filter(Boolean);
        if (!firstName) firstName = parts[0] || '';
        if (!lastName) lastName = parts.slice(1).join(' ');
      }
    }
    if (!firstName && !lastName) {
      // Don't create Unknown contacts from empty form payloads
      stats.skipped++;
      continue;
    }
    const phone = payloadStr(payload, 'phone', 'Phone') || null;
    const interest =
      payloadStr(payload, 'interest', 'Interest') ||
      (s.form_type === 'chai_partner'
        ? 'Chai Partner'
        : s.form_type === 'donation'
          ? 'Donor'
          : s.form_type === 'rsvp'
            ? 'Event RSVP'
            : s.form_type || 'Form');
    await apply('form', {
      firstName: firstName || 'Member',
      lastName: lastName,
      email: s.email,
      phone,
      interest,
      note: `--- Synced from form log (${s.form_type}) ---`,
      createdAt: s.created_at,
      isResolved: true,
    });
  }

  const { data: waivers } = await supabase
    .from('waivers')
    .select('*')
    .limit(5000);

  for (const w of waivers || []) {
    const email = String(w.email || w.signer_email || '').trim();
    if (!email) continue;
    const first = String(
      w.first_name || w.signer_first_name || w.parent_first_name || 'Unknown',
    );
    const last = String(w.last_name || w.signer_last_name || w.parent_last_name || '');
    const phone = String(w.phone || w.signer_phone || '') || null;
    await apply('waiver', {
      firstName: first,
      lastName: last,
      email,
      phone,
      interest: 'Waiver',
      note: '--- Synced from waiver ---',
      createdAt: String(w.signed_at || w.created_at || '') || null,
      isResolved: true,
    });
  }

  const { data: sponsors } = await supabase
    .from('sponsors')
    .select('name, contact_email, created_at, sponsorship_type')
    .not('contact_email', 'is', null)
    .limit(2000);

  for (const s of sponsors || []) {
    if (!s.contact_email) continue;
    const parts = String(s.name || 'Sponsor').trim().split(/\s+/);
    await apply('form', {
      firstName: parts[0] || 'Sponsor',
      lastName: parts.slice(1).join(' '),
      email: s.contact_email,
      interest: 'Sponsor',
      note: `--- Synced from sponsor ---\nType: ${s.sponsorship_type || 'n/a'}`,
      createdAt: s.created_at,
      isResolved: true,
    });
  }

  return stats;
}
