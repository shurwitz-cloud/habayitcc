import { createAdminClient } from '@/lib/supabase/server';
import { ensureCrmContact } from '@/lib/admin/ensure-contact';
import { extractNamesFromPayload } from '@/lib/admin/repair-chai-names';
import { parseZeffyWebhook } from '@/lib/zeffy/parse-webhook';
import { stripe } from '@/lib/stripe/server';

const BAD_FIRST = new Set(['', 'unknown', 'friend', 'n/a', 'na', 'none', 'test', 'member']);
const BAD_LAST = new Set(['', 'unknown', 'partner', 'n/a', 'na', 'none', 'test']);

function isBadFirst(v: string | null | undefined): boolean {
  return BAD_FIRST.has(String(v || '').trim().toLowerCase());
}
function isBadLast(v: string | null | undefined): boolean {
  return BAD_LAST.has(String(v || '').trim().toLowerCase());
}

function titleCase(s: string): string {
  return s
    .split(/([\s'-]+)/)
    .map((part) => {
      if (/^[\s'-]+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

/** Best-effort name from email local-part (adrian@…, yakovbren, etaitarazi). */
function guessFromEmail(email: string): { first: string; last: string } {
  const local = (email.split('@')[0] || '').replace(/[0-9]+/g, '');
  if (!local || local.length < 2) return { first: '', last: '' };

  // separator-based: first.last / first_last / first-last
  if (/[._+-]/.test(local)) {
    const parts = local.split(/[._+-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return {
        first: titleCase(parts[0]),
        last: titleCase(parts.slice(1).join(' ')),
      };
    }
  }

  // Compound local-parts without separators (best-effort)
  const compounds: Array<[RegExp, string, string]> = [
    [/^yakovbren$/i, 'Yakov', 'Bren'],
    [/^etaitarazi$/i, 'Etai', 'Tarazi'],
    [/^gurshrenker$/i, 'Gur', 'Shrenker'],
    [/^scdalmao$/i, 'Sc', 'Dalmao'],
    [/^chayale\d*$/i, 'Chayale', ''],
    [/^pessyr$/i, 'Pessy', 'R'],
    [/^tamir$/i, 'Tamir', ''],
    [/^adrian$/i, 'Adrian', ''],
    [/^zev$/i, 'Zev', ''],
  ];
  for (const [re, first, last] of compounds) {
    if (re.test(local)) return { first, last };
  }

  // Single token — use as first name only when it looks like a word
  if (/^[a-zA-Z]{3,20}$/.test(local)) {
    return { first: titleCase(local), last: '' };
  }
  return { first: '', last: '' };
}

async function fetchZeffyPaymentName(
  paymentId: string,
): Promise<{ first: string; last: string } | null> {
  const apiKey = process.env.ZEFFY_API_KEY?.trim();
  if (!apiKey || !paymentId || paymentId.startsWith('manual-')) return null;

  try {
    const res = await fetch(`https://api.zeffy.com/api/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    const wrapped = { type: 'payment.completed', data: { object: json } };
    const parsed =
      parseZeffyWebhook(wrapped) ||
      parseZeffyWebhook(json) ||
      parseZeffyWebhook({ payment: json });
    if (parsed?.firstName || parsed?.lastName) {
      return {
        first: parsed.firstName || '',
        last: parsed.lastName || '',
      };
    }
    const extracted = extractNamesFromPayload(json);
    if (extracted.first || extracted.last) return extracted;
  } catch (err) {
    console.error('[repair-unknown] zeffy fetch', paymentId, err);
  }
  return null;
}

async function fetchStripeCustomerName(
  email: string,
): Promise<{ first: string; last: string } | null> {
  try {
    const list = await stripe.customers.list({ email, limit: 5 });
    for (const cust of list.data) {
      const name = (cust.name || '').trim();
      if (!name) continue;
      const parts = name.replace(/\s+/g, ' ').split(' ').filter(Boolean);
      if (!parts.length) continue;
      return {
        first: parts[0],
        last: parts.slice(1).join(' '),
      };
    }
  } catch (err) {
    console.error('[repair-unknown] stripe customer', email, err);
  }
  return null;
}

export type RepairUnknownStats = {
  scanned: number;
  updated: number;
  fromZeffy: number;
  fromStripe: number;
  fromCrm: number;
  fromEmailGuess: number;
  stillMissing: string[];
  errors: number;
  errorSamples: string[];
};

function titleCaseName(s: string): string {
  return s
    .split(/([\s'-]+)/)
    .map((part) => {
      if (/^[\s'-]+$/.test(part)) return part;
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

/**
 * Fix ALL contacts named Unknown / Friend (orphans included).
 */
export async function repairUnknownContactNames(): Promise<RepairUnknownStats> {
  const supabase = createAdminClient();
  const stats: RepairUnknownStats = {
    scanned: 0,
    updated: 0,
    fromZeffy: 0,
    fromStripe: 0,
    fromCrm: 0,
    fromEmailGuess: 0,
    stillMissing: [],
    errors: 0,
    errorSamples: [],
  };

  const { data: badContacts, error } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name, phone, interest, created_at, message')
    .or('first_name.ilike.unknown,first_name.ilike.friend,first_name.ilike.member,last_name.ilike.partner')
    .limit(2000);

  if (error) throw error;

  for (const c of badContacts || []) {
    stats.scanned++;
    const email = String(c.email || '').trim().toLowerCase();
    if (!email) continue;

    let first = '';
    let last = '';
    let source: 'zeffy' | 'stripe' | 'crm' | 'guess' | null = null;

    // Form log / zeffy payment ids
    const { data: subs } = await supabase
      .from('form_submissions')
      .select('form_type, payload')
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(30);

    for (const s of subs || []) {
      const payload = (s.payload || {}) as Record<string, unknown>;
      const extracted = extractNamesFromPayload(payload);
      if (!first && extracted.first && !isBadFirst(extracted.first)) first = extracted.first;
      if (!last && extracted.last && !isBadLast(extracted.last)) last = extracted.last;

      const zeffyId = String(payload.zeffyPaymentId || '').trim();
      if ((!first || !last) && zeffyId) {
        const fromZ = await fetchZeffyPaymentName(zeffyId);
        if (fromZ) {
          if (!first && fromZ.first && !isBadFirst(fromZ.first)) first = fromZ.first;
          if (!last && fromZ.last && !isBadLast(fromZ.last)) last = fromZ.last;
          if (first || last) source = 'zeffy';
        }
      }
      if (first && last) break;
    }

    if (!first || !last) {
      const { data: partner } = await supabase
        .from('chai_partners')
        .select('first_name, last_name')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
      if (partner) {
        if (!first && !isBadFirst(partner.first_name)) first = partner.first_name;
        if (!last && !isBadLast(partner.last_name)) last = partner.last_name;
        if (first || last) source = source || 'crm';
      }
    }

    if (!first || !last) {
      for (const table of ['parents', 'event_registrations', 'donations'] as const) {
        const { data } = await supabase
          .from(table)
          .select('first_name, last_name')
          .ilike('email', email)
          .limit(1)
          .maybeSingle();
        if (data) {
          if (!first && !isBadFirst(data.first_name)) first = data.first_name;
          if (!last && !isBadLast(data.last_name)) last = data.last_name;
          if (first || last) source = source || 'crm';
        }
        if (first && last) break;
      }
    }

    if (!first || !last) {
      const fromStripe = await fetchStripeCustomerName(email);
      if (fromStripe) {
        if (!first && fromStripe.first && !isBadFirst(fromStripe.first)) {
          first = fromStripe.first;
        }
        if (!last && fromStripe.last && !isBadLast(fromStripe.last)) {
          last = fromStripe.last;
        }
        if (first || last) source = source || 'stripe';
      }
    }

    if (!first && !last) {
      const guess = guessFromEmail(email);
      first = guess.first;
      last = guess.last;
      if (first || last) source = 'guess';
    }

    if (!first && !last) {
      if (stats.stillMissing.length < 40) stats.stillMissing.push(email);
      continue;
    }

    first = titleCaseName(first);
    last = titleCaseName(last);

    try {
      const { error: upErr } = await supabase
        .from('contacts')
        .update({
          first_name: first || 'Member',
          last_name: last || '',
        })
        .eq('id', c.id);
      if (upErr) throw upErr;

      await ensureCrmContact({
        firstName: first || 'Member',
        lastName: last,
        email,
        phone: c.phone,
        interest: c.interest || 'Chai Partner',
        forceName: true,
        isResolved: true,
      });

      stats.updated++;
      if (source === 'zeffy') stats.fromZeffy++;
      else if (source === 'stripe') stats.fromStripe++;
      else if (source === 'crm') stats.fromCrm++;
      else if (source === 'guess') stats.fromEmailGuess++;
    } catch (err) {
      stats.errors++;
      const msg = `${email}: ${err instanceof Error ? err.message : String(err)}`;
      if (stats.errorSamples.length < 8) stats.errorSamples.push(msg);
    }
  }

  return stats;
}
