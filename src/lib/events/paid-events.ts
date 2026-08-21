export type PaidEventSlug =
  | 'rosh-hashana-dinner'
  | 'rosh-hashana-family-fair'
  | 'pre-rosh-hashana-womens';

export type PaidEventType = 'dinner' | 'family-fair' | 'womens';

/**
 * CRM headcount display for this event (kept with the event definition so
 * every surface — summary, table, drawer — stays consistent).
 * - people: attendees only
 * - adults_kids: adults + kids + total
 * - kids: children + total
 */
export type PaidEventPeopleMode = 'people' | 'adults_kids' | 'kids';

export interface PaidEventConfig {
  slug: PaidEventSlug;
  title: string;
  program: string;
  month: string;
  day: string;
  dateLabel: string;
  time: string;
  startsAt: string;
  description: string;
  location?: string;
  flyer?: string;
  type: PaidEventType;
  /** How CRM counts attendees for this event. */
  peopleMode: PaidEventPeopleMode;
  /** Preset sponsor amounts (optional add-on). */
  sponsorPresets: number[];
  /** Extra line under Become a Sponsor — dinner only. */
  sponsorNote?: string;
  /** Env var name for this event's Google Sheet ID. */
  sheetEnvVar: string;
}

export const CARD_PROCESSING_RATE = 0.03;

/** Ordered by date. */
export const PAID_EVENTS: PaidEventConfig[] = [
  {
    slug: 'pre-rosh-hashana-womens',
    title: 'The Art of Kintsugi \u2014 For Women',
    program: 'HaBayit Ladies',
    month: 'Sep',
    day: '1',
    dateLabel: 'Tuesday, September 1st',
    time: '7:45 PM',
    startsAt: '2026-09-01T19:45:00-04:00',
    description:
      'Discover the ancient Japanese art of Kintsugi — repairing broken pottery with gold — and its beautiful connection to teshuvah, renewal, and new beginnings.',
    flyer: '/flyers/pre-rosh-hashana-womens.png',
    type: 'womens',
    peopleMode: 'people',
    sponsorPresets: [54, 72, 180, 360],
    sheetEnvVar: 'GOOGLE_SHEETS_PRE_RH_WOMENS_ID',
  },
  {
    slug: 'rosh-hashana-family-fair',
    title: 'Rosh Hashana Family Fair',
    program: 'HaBayit Hebrew Adventure',
    month: 'Sep',
    day: '6',
    dateLabel: 'Sunday, September 6th',
    time: '11:00 AM – 2:00 PM',
    startsAt: '2026-09-06T11:00:00-04:00',
    description:
      'Bake your own round challah and enjoy Rosh Hashana activities, arts & crafts, and family fun. For children ages 3–10.',
    location: 'Pool & Tennis Center — Rock Creek',
    flyer: '/flyers/rosh-hashana-family-fair.png',
    type: 'family-fair',
    peopleMode: 'kids',
    sponsorPresets: [54, 72, 180, 360],
    sheetEnvVar: 'GOOGLE_SHEETS_ROSH_HASHANA_FAIR_ID',
  },
  {
    slug: 'rosh-hashana-dinner',
    title: 'Community Rosh Hashana Dinner',
    program: 'Community',
    month: 'Sep',
    day: '11',
    dateLabel: 'Friday, September 11th',
    time: '6:30 PM',
    startsAt: '2026-09-11T18:30:00-04:00',
    description:
      'A Rosh Hashana night meal in an Israeli atmosphere — beautiful blessings, delicious food, and great company.',
    flyer: '/flyers/rosh-hashana-dinner.png',
    type: 'dinner',
    peopleMode: 'adults_kids',
    sponsorPresets: [54, 72, 180, 360, 1000],
    sponsorNote: 'Sponsorship makes this meal possible.',
    sheetEnvVar: 'GOOGLE_SHEETS_ROSH_HASHANA_DINNER_ID',
  },
];

export function getPaidEvent(slug: string): PaidEventConfig | undefined {
  return PAID_EVENTS.find((e) => e.slug === slug);
}

export function paidEventRegisterPath(slug: PaidEventSlug): string {
  return `/events/register/${slug}`;
}

export function getPaidEventSheetId(config: PaidEventConfig): string | undefined {
  return process.env[config.sheetEnvVar];
}
