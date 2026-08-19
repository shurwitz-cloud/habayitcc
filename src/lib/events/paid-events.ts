export type PaidEventSlug =
  | 'rosh-hashana-dinner'
  | 'rosh-hashana-family-fair'
  | 'pre-rosh-hashana-womens';

export type PaidEventType = 'dinner' | 'family-fair' | 'womens';

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
  type: PaidEventType;
  /** Preset sponsor amounts (optional add-on). */
  sponsorPresets: number[];
  /** Env var name for this event's Google Sheet ID. */
  sheetEnvVar: string;
}

export const CARD_PROCESSING_RATE = 0.03;

export const PAID_EVENTS: PaidEventConfig[] = [
  {
    slug: 'rosh-hashana-dinner',
    title: 'Rosh Hashana Dinner',
    program: 'Community',
    month: 'Sep',
    day: '11',
    dateLabel: 'Thursday, September 11th',
    time: '6:30 PM',
    startsAt: '2026-09-11T18:30:00-04:00',
    description:
      'Join us for a warm, home-style Rosh Hashana dinner — beautiful blessings, delicious food, and great company.',
    type: 'dinner',
    sponsorPresets: [54, 72, 180, 360, 1000],
    sheetEnvVar: 'GOOGLE_SHEETS_ROSH_HASHANA_DINNER_ID',
  },
  {
    slug: 'rosh-hashana-family-fair',
    title: 'Rosh Hashana Family Fair',
    program: 'Community',
    month: 'Sep',
    day: '6',
    dateLabel: 'Sunday, September 6th',
    time: '10:00 AM',
    startsAt: '2026-09-06T10:00:00-04:00',
    description:
      'A fun morning for families with children ages 3–10 — crafts, activities, and Rosh Hashana spirit.',
    type: 'family-fair',
    sponsorPresets: [54, 72, 180, 360],
    sheetEnvVar: 'GOOGLE_SHEETS_ROSH_HASHANA_FAIR_ID',
  },
  {
    slug: 'pre-rosh-hashana-womens',
    title: 'Pre-Rosh Hashana Women\u2019s Event',
    program: 'Community',
    month: 'Sep',
    day: '9',
    dateLabel: 'Wednesday, September 9th',
    time: '7:30 PM',
    startsAt: '2026-09-09T19:30:00-04:00',
    description:
      'An evening of inspiration and connection as we prepare for the New Year together.',
    type: 'womens',
    sponsorPresets: [54, 72, 180, 360],
    sheetEnvVar: 'GOOGLE_SHEETS_PRE_RH_WOMENS_ID',
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
