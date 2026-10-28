import type { CrmSnapshot } from '@/lib/admin/crm/types';

export type CrmPersonSuggestion = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  /** Short secondary line in the picker (interest, Chai, etc.). */
  meta?: string;
};

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

function pushUnique(
  map: Map<string, CrmPersonSuggestion>,
  person: CrmPersonSuggestion,
) {
  const email = normEmail(person.email);
  if (!email.includes('@')) return;
  const existing = map.get(email);
  if (!existing) {
    map.set(email, { ...person, email });
    return;
  }
  // Prefer rows that already have a phone / fuller name.
  const preferNew =
    (!existing.phone && person.phone) ||
    (existing.firstName.length < person.firstName.length && person.firstName.length > 0);
  if (preferNew) {
    map.set(email, {
      ...existing,
      ...person,
      email,
      phone: person.phone || existing.phone,
      meta: existing.meta || person.meta,
    });
  } else if (!existing.phone && person.phone) {
    map.set(email, { ...existing, phone: person.phone });
  }
}

/** Unique people for CRM name autocomplete (contacts + donors + chai + parents). */
export function buildPersonSuggestions(snapshot: CrmSnapshot): CrmPersonSuggestion[] {
  const map = new Map<string, CrmPersonSuggestion>();

  for (const c of snapshot.contacts) {
    pushUnique(map, {
      id: `contact:${c.id}`,
      firstName: c.first_name,
      lastName: c.last_name,
      email: c.email,
      phone: c.phone,
      meta: c.interest ?? 'Contact',
    });
  }

  for (const d of snapshot.donations) {
    pushUnique(map, {
      id: `donation:${d.id}`,
      firstName: d.first_name,
      lastName: d.last_name,
      email: d.email,
      phone: d.phone,
      meta: 'Donor',
    });
  }

  for (const c of snapshot.chaiPartners) {
    pushUnique(map, {
      id: `chai:${c.id}`,
      firstName: c.first_name,
      lastName: c.last_name,
      email: c.email,
      phone: c.phone,
      meta: 'Chai partner',
    });
  }

  for (const f of snapshot.families) {
    for (const p of f.parents) {
      if (!p.email) continue;
      pushUnique(map, {
        id: `parent:${p.id}`,
        firstName: p.first_name,
        lastName: p.last_name,
        email: p.email,
        phone: p.phone,
        meta: f.familyName ? `Family · ${f.familyName}` : 'Family',
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const ln = a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' });
    if (ln !== 0) return ln;
    return a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' });
  });
}

export function filterPersonSuggestions(
  people: CrmPersonSuggestion[],
  query: string,
  limit = 8,
): CrmPersonSuggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];

  const scored: Array<{ person: CrmPersonSuggestion; score: number }> = [];
  for (const person of people) {
    const full = `${person.firstName} ${person.lastName}`.toLowerCase();
    const email = person.email.toLowerCase();
    const phone = (person.phone || '').toLowerCase();
    let score = 0;
    if (full.startsWith(q) || person.lastName.toLowerCase().startsWith(q)) score = 3;
    else if (person.firstName.toLowerCase().startsWith(q)) score = 2;
    else if (full.includes(q) || email.includes(q) || phone.includes(q)) score = 1;
    if (score > 0) scored.push({ person, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.person.lastName.localeCompare(b.person.lastName, undefined, {
      sensitivity: 'base',
    });
  });

  return scored.slice(0, limit).map((s) => s.person);
}
