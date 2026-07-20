import { HEBREW_ADVENTURE_NAME, HEBREW_ADVENTURE_SLUG } from '@/lib/programs/names';
import type { CrmFamilyRecord } from '@/lib/admin/crm/types';

/** CRM-facing definition for a program application track (tab + filters). */
export type CrmProgramTrackDef = {
  /** Key used in snapshot maps — usually matches `programSlug`. */
  id: string;
  programSlug: string;
  tabLabel: string;
  fullName: string;
  /** Match `contacts.interest` values (case-insensitive substring). */
  contactInterests: string[];
  /** Related `form_submissions.form_type` values. */
  formTypes: string[];
  sortOrder: number;
  registrationPath?: string;
};

/** Programs that always get an Applications sub-tab, even before DB rows exist. */
export const CRM_PROGRAM_TRACKS: CrmProgramTrackDef[] = [
  {
    id: HEBREW_ADVENTURE_SLUG,
    programSlug: HEBREW_ADVENTURE_SLUG,
    tabLabel: 'Hebrew Adventure',
    fullName: HEBREW_ADVENTURE_NAME,
    contactInterests: [HEBREW_ADVENTURE_NAME, 'hebrew adventure', 'hebrew school'],
    formTypes: ['hebrew_adventure_registration'],
    sortOrder: 10,
    registrationPath: '/hebrew-adventure/register',
  },
  {
    id: 'bar-mitzvah-club',
    programSlug: 'bar-mitzvah-club',
    tabLabel: 'Bar Mitzvah',
    fullName: 'Bar Mitzvah Club (HaBayit BMX)',
    contactInterests: ['bar mitzvah', 'bar / bat mitzvah', 'bmx'],
    formTypes: ['bar_mitzvah_registration'],
    sortOrder: 20,
    registrationPath: '/bar-mitzvah',
  },
  {
    id: 'bat-mitzvah-club',
    programSlug: 'bat-mitzvah-club',
    tabLabel: 'Bat Mitzvah',
    fullName: 'Bat Mitzvah Club (HaBayit Bloom)',
    contactInterests: ['bat mitzvah', 'bar / bat mitzvah', 'bloom'],
    formTypes: ['bat_mitzvah_registration'],
    sortOrder: 30,
    registrationPath: '/bat-mitzvah',
  },
  {
    id: 'teen',
    programSlug: 'teen',
    tabLabel: 'Teen',
    fullName: 'HaBayit Teen',
    contactInterests: ['teen', 'teen programs'],
    formTypes: ['teen_registration'],
    sortOrder: 40,
  },
];

export function shortProgramLabel(name: string): string {
  return name
    .replace(/^HaBayit\s+/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
}

/** Merge static tracks with any active DB programs not yet in the registry. */
export function resolveCrmProgramTracks(
  dbPrograms: Array<{ slug: string; name: string; is_active?: boolean }>,
): CrmProgramTrackDef[] {
  const bySlug = new Map(CRM_PROGRAM_TRACKS.map((t) => [t.programSlug, t]));
  const tracks: CrmProgramTrackDef[] = [...CRM_PROGRAM_TRACKS];

  for (const p of dbPrograms) {
    if (p.is_active === false) continue;
    if (bySlug.has(p.slug)) continue;
    tracks.push({
      id: p.slug,
      programSlug: p.slug,
      tabLabel: shortProgramLabel(p.name),
      fullName: p.name,
      contactInterests: [p.name.toLowerCase(), p.slug.replace(/-/g, ' ')],
      formTypes: [`${p.slug.replace(/-/g, '_')}_registration`],
      sortOrder: 100 + tracks.length,
    });
  }

  return tracks.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function contactMatchesTrack(
  interest: string | null | undefined,
  track: CrmProgramTrackDef,
): boolean {
  if (!interest?.trim()) return false;
  const lower = interest.toLowerCase();
  return track.contactInterests.some((needle) => lower.includes(needle.toLowerCase()));
}

export function familiesForProgram(
  families: CrmFamilyRecord[],
  programSlug: string,
): CrmFamilyRecord[] {
  return families
    .filter((f) => f.registrations.some((r) => r.programSlug === programSlug))
    .map((f) => ({
      ...f,
      registrations: f.registrations.filter((r) => r.programSlug === programSlug),
    }));
}
