import { createAdminClient } from '@/lib/supabase/server';

const SKIP_EMAILS = new Set(['test@habayitcc.org', 't@t.com']);

export type StripeCustomerImportStats = {
  uniqueImported: number;
  contactsCreated: number;
  contactsUpdated: number;
  familiesCreated: number;
  familiesUpdated: number;
  parentsCreated: number;
  parentsUpdated: number;
  chaiUpserted: number;
  audits: number;
  errors: number;
  errorSamples: string[];
};

type MergedCustomer = {
  email: string;
  names: string[];
  stripeIds: string[];
  last4s: Set<string>;
  spend: number;
  payCount: number;
  types: Set<string>;
  sources: Set<string>;
  street: string;
  city: string;
  state: string;
  zip: string;
  first: string;
  last: string;
  payPref: string;
  plan: string;
  created: string;
  familyName: string;
  primaryStripeId: string | null;
  last4List: string[];
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

function splitName(name: string): { first: string; last: string } {
  const parts = String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);
  if (!parts.length) return { first: 'Unknown', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function interestFor(type: string, source: string, spend: number): string {
  if (type === 'chai_partner') return 'Chai Partner';
  if (source.includes('hebrew')) return 'Hebrew Adventure';
  if (spend > 0) return 'Donor';
  return 'Stripe customer';
}

function mergeNotes(existing: string | null | undefined, additions: string[]): string | null {
  const base = (existing || '').trim();
  const block = additions.filter(Boolean).join('\n');
  if (!block) return base || null;
  if (!base) return block;
  if (base.includes('Stripe import')) {
    const cleaned = base
      .split(/\n--- Stripe import[^\n]*\n?/)
      .join('\n')
      .trim();
    return `${cleaned}\n\n${block}`.trim();
  }
  return `${base}\n\n${block}`.trim();
}

function col(row: string[], idx: Record<string, number>, name: string): string {
  const i = idx[name];
  if (i == null) return '';
  return String(row[i] ?? '').trim();
}

function buildMerged(csvText: string): Map<string, MergedCustomer> {
  const rows = parseCsv(csvText);
  const header = rows[0] ?? [];
  const idx = Object.fromEntries(header.map((k, i) => [k, i]));
  const data = rows.slice(1).filter((r) => r.some((x) => String(x).trim()));
  const byEmail = new Map<string, MergedCustomer>();

  for (const r of data) {
    const email = col(r, idx, 'Email').toLowerCase();
    if (!email || SKIP_EMAILS.has(email)) continue;

    const stripeId = col(r, idx, 'id');
    const name = col(r, idx, 'Name');
    const created = col(r, idx, 'Created (UTC)');
    const spend = Number(col(r, idx, 'Total Spend') || 0);
    const payCount = Number(col(r, idx, 'Payment Count') || 0);
    const type = col(r, idx, 'type (metadata)');
    const source = col(r, idx, 'source (metadata)');
    const last4 =
      col(r, idx, 'Card Last4') || col(r, idx, 'card_last4 (metadata)');
    const firstMeta = col(r, idx, 'first_name (metadata)');
    const lastMeta = col(r, idx, 'last_name (metadata)');
    const street =
      col(r, idx, 'street (metadata)') ||
      col(r, idx, 'Address Line1') ||
      col(r, idx, 'Card Address Line1');
    const city =
      col(r, idx, 'city (metadata)') ||
      col(r, idx, 'Address City') ||
      col(r, idx, 'Card Address City');
    const state =
      col(r, idx, 'state (metadata)') ||
      col(r, idx, 'Address State') ||
      col(r, idx, 'Card Address State');
    const zip =
      col(r, idx, 'zip (metadata)') ||
      col(r, idx, 'Address Postal Code') ||
      col(r, idx, 'Card Address Zip');
    const payPref = col(r, idx, 'payment_method_preference (metadata)');
    const plan = col(r, idx, 'payment_plan (metadata)');

    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email,
        names: [],
        stripeIds: [],
        last4s: new Set(),
        spend: 0,
        payCount: 0,
        types: new Set(),
        sources: new Set(),
        street: '',
        city: '',
        state: '',
        zip: '',
        first: '',
        last: '',
        payPref: '',
        plan: '',
        created,
        familyName: '',
        primaryStripeId: null,
        last4List: [],
      });
    }

    const m = byEmail.get(email)!;
    if (name) m.names.push(name);
    if (stripeId) m.stripeIds.push(stripeId);
    if (last4) m.last4s.add(last4);
    m.spend += spend;
    m.payCount += payCount;
    if (type) m.types.add(type);
    if (source) m.sources.add(source);
    if (street && !m.street) m.street = street;
    if (city && !m.city) m.city = city;
    if (state && !m.state) m.state = state;
    if (zip && !m.zip) m.zip = zip;
    if (firstMeta && !m.first) m.first = firstMeta;
    if (lastMeta && !m.last) m.last = lastMeta;
    if (payPref && !m.payPref) m.payPref = payPref;
    if (plan && !m.plan) m.plan = plan;
    if (created && (!m.created || created < m.created)) m.created = created;
  }

  for (const m of byEmail.values()) {
    if (!m.first || !m.last) {
      const fromName = splitName(m.names[0] || '');
      if (!m.first) m.first = fromName.first;
      if (!m.last) m.last = fromName.last;
    }
    m.familyName = m.last || m.first || 'Family';
    m.primaryStripeId =
      m.stripeIds.find((id) => id.startsWith('cus_')) || m.stripeIds[0] || null;
    m.last4List = [...m.last4s];
  }

  return byEmail;
}

/**
 * Quiet import — writes contacts/families/parents (+ chai metadata).
 * Never sends email.
 */
export async function importStripeCustomersCsv(
  csvText: string,
): Promise<StripeCustomerImportStats> {
  const supabase = createAdminClient();
  const byEmail = buildMerged(csvText);

  const stats: StripeCustomerImportStats = {
    uniqueImported: byEmail.size,
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

  for (const m of byEmail.values()) {
    try {
      const interest = interestFor(
        [...m.types][0] || '',
        [...m.sources].join(' '),
        m.spend,
      );
      const last4Text = m.last4List.length
        ? `Card last4: ${m.last4List.join(', ')}`
        : '';
      const stripeIdsText = m.stripeIds.length
        ? `Stripe customer ids: ${[...new Set(m.stripeIds)].join(', ')}`
        : '';
      const spendText =
        m.spend > 0
          ? `Stripe total spend: $${m.spend.toFixed(2)} (${m.payCount} payments)`
          : 'Stripe total spend: $0';
      const metaBits = [
        m.types.size ? `type: ${[...m.types].join(', ')}` : '',
        m.sources.size ? `source: ${[...m.sources].join(', ')}` : '',
        m.plan ? `payment plan: ${m.plan}` : '',
        m.payPref ? `payment preference: ${m.payPref}` : '',
      ].filter(Boolean);

      const importBlock = [
        '--- Stripe import (unified_customers) ---',
        spendText,
        stripeIdsText,
        last4Text,
        ...metaBits,
        m.created ? `Stripe created: ${m.created} UTC` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const createdAt = m.created
        ? (() => {
            const s = m.created.trim();
            const mUtc = s.match(
              /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/,
            );
            if (mUtc) {
              const [, y, mo, d, h, mi, sec] = mUtc;
              const iso = `${y}-${mo}-${d}T${h.padStart(2, '0')}:${mi}:${(sec || '00').padStart(2, '0')}Z`;
              const t = Date.parse(iso);
              return Number.isFinite(t) ? new Date(t).toISOString() : null;
            }
            const t = Date.parse(s);
            return Number.isFinite(t) ? new Date(t).toISOString() : null;
          })()
        : null;

      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id, message, interest, last_name, created_at')
        .ilike('email', m.email)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const contactMessage = mergeNotes(existingContact?.message, [importBlock]);
      if (existingContact?.id) {
        const patch: Record<string, unknown> = {
          first_name: m.first,
          last_name: m.last || existingContact.last_name || '',
          interest: existingContact.interest || interest,
          message: contactMessage,
          is_resolved: true,
        };
        if (
          createdAt &&
          (!existingContact.created_at ||
            new Date(createdAt).getTime() <
              new Date(existingContact.created_at).getTime())
        ) {
          patch.created_at = createdAt;
        }
        const { error } = await supabase
          .from('contacts')
          .update(patch)
          .eq('id', existingContact.id);
        if (error) throw error;
        stats.contactsUpdated++;
      } else {
        const { error } = await supabase.from('contacts').insert({
          first_name: m.first,
          last_name: m.last || '',
          email: m.email,
          phone: null,
          interest,
          message: contactMessage,
          is_resolved: true,
          ...(createdAt ? { created_at: createdAt } : {}),
        });
        if (error) throw error;
        stats.contactsCreated++;
      }

      const { data: parentHit } = await supabase
        .from('parents')
        .select('id, family_id, first_name, last_name')
        .ilike('email', m.email)
        .limit(1)
        .maybeSingle();

      let familyId = parentHit?.family_id ?? null;

      if (!familyId && m.primaryStripeId) {
        const { data: famByStripe } = await supabase
          .from('families')
          .select('id')
          .eq('stripe_customer_id', m.primaryStripeId)
          .limit(1)
          .maybeSingle();
        familyId = famByStripe?.id ?? null;
      }

      if (familyId) {
        const { data: fam } = await supabase
          .from('families')
          .select(
            'id, notes, street_address, city, state, zip, stripe_customer_id, payment_method_preference',
          )
          .eq('id', familyId)
          .single();

        const { error } = await supabase
          .from('families')
          .update({
            family_name: m.familyName,
            street_address: m.street || fam?.street_address || null,
            city: m.city || fam?.city || null,
            state: m.state || fam?.state || null,
            zip: m.zip || fam?.zip || null,
            stripe_customer_id: m.primaryStripeId || fam?.stripe_customer_id || null,
            payment_method_preference:
              m.payPref || fam?.payment_method_preference || null,
            notes: mergeNotes(fam?.notes, [importBlock]),
          })
          .eq('id', familyId);
        if (error) throw error;
        stats.familiesUpdated++;
      } else {
        const { data: fam, error } = await supabase
          .from('families')
          .insert({
            family_name: m.familyName,
            street_address: m.street || null,
            city: m.city || null,
            state: m.state || null,
            zip: m.zip || null,
            stripe_customer_id: m.primaryStripeId,
            payment_method_preference: m.payPref || null,
            notes: importBlock,
          })
          .select('id')
          .single();
        if (error) throw error;
        familyId = fam.id;
        stats.familiesCreated++;
      }

      if (parentHit?.id) {
        const { error } = await supabase
          .from('parents')
          .update({
            first_name: m.first || parentHit.first_name,
            last_name: m.last || parentHit.last_name,
            email: m.email,
            is_primary_contact: true,
          })
          .eq('id', parentHit.id);
        if (error) throw error;
        stats.parentsUpdated++;
      } else {
        const { error } = await supabase.from('parents').insert({
          family_id: familyId!,
          first_name: m.first,
          last_name: m.last || '',
          email: m.email,
          phone: null,
          is_primary_contact: true,
        });
        if (error) throw error;
        stats.parentsCreated++;
      }

      if (m.types.has('chai_partner')) {
        const { data: existingChai } = await supabase
          .from('chai_partners')
          .select('id')
          .ilike('email', m.email)
          .limit(1)
          .maybeSingle();

        if (!existingChai) {
          const monthlyGuess =
            m.payCount === 1 && m.spend > 0 ? Number(m.spend.toFixed(2)) : 0;
          const { error } = await supabase.from('chai_partners').insert({
            family_id: familyId,
            first_name: m.first,
            last_name: m.last || '',
            email: m.email,
            street_address: m.street || null,
            city: m.city || null,
            state: m.state || null,
            zip: m.zip || null,
            monthly_amount: monthlyGuess,
            stripe_customer_id: m.primaryStripeId,
            status: 'active',
          });
          if (error) throw error;
          stats.chaiUpserted++;
        } else {
          await supabase
            .from('chai_partners')
            .update({
              family_id: familyId,
              stripe_customer_id: m.primaryStripeId,
              street_address: m.street || null,
              city: m.city || null,
              state: m.state || null,
              zip: m.zip || null,
            })
            .eq('id', existingChai.id);
          stats.chaiUpserted++;
        }
      }

      const { error: auditErr } = await supabase.from('form_submissions').insert({
        form_type: 'stripe_customer_import',
        email: m.email,
        ...(createdAt ? { created_at: createdAt } : {}),
        payload: {
          quiet: true,
          no_email: true,
          first_name: m.first,
          last_name: m.last,
          stripe_customer_ids: [...new Set(m.stripeIds)],
          card_last4: m.last4List,
          total_spend: m.spend,
          payment_count: m.payCount,
          stripe_created: m.created || null,
          address: {
            street: m.street,
            city: m.city,
            state: m.state,
            zip: m.zip,
          },
          types: [...m.types],
          sources: [...m.sources],
          family_id: familyId,
        },
      });
      if (auditErr) throw auditErr;
      stats.audits++;
    } catch (err) {
      stats.errors++;
      const msg = `${m.email}: ${err instanceof Error ? err.message : String(err)}`;
      if (stats.errorSamples.length < 8) stats.errorSamples.push(msg);
      console.error('[stripe-import]', msg);
    }
  }

  return stats;
}
