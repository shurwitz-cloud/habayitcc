export type PaidEventSlug =
  | 'rosh-hashana-dinner'
  | 'rosh-hashana-family-fair'
  | 'pre-rosh-hashana-womens'
  | 'simchat-torah'
  | 'erev-zugot';

export type PaidEventType = 'dinner' | 'family-fair' | 'womens' | 'celebration' | 'couples';

export type PaidEventSponsorOption = {
  amount: number;
  label: string;
};

/**
 * CRM headcount display for this event (kept with the event definition so
 * every surface — summary, table, drawer — stays consistent).
 * - people: attendees only
 * - adults_kids: adults + kids + total
 * - kids: children + total
 * - couples: couple tickets
 */
export type PaidEventPeopleMode = 'people' | 'adults_kids' | 'kids' | 'couples';

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
  /** When true, HaBayit Hebrew Adventure kids can enter free with a unique HA- code (once per event). */
  hebrewKidsFreeWithCode?: boolean;
  /** When true, HaBayit members can use a unique Chai Partner code once for a discounted first ticket. */
  memberPriceWithCode?: boolean;
  /** Preset sponsor amounts (optional add-on). */
  sponsorPresets: number[];
  /** Optional labels for donation/sponsor presets. */
  sponsorOptions?: PaidEventSponsorOption[];
  /** Extra line under Become a Sponsor — dinner only. */
  sponsorNote?: string;
  /** Guest must pick a donation amount or “None at this time.” */
  requireDonationChoice?: boolean;
  /** Tab name in the shared events spreadsheet. */
  sheetTab: string;
  /** When true, public registration is closed. */
  soldOut?: boolean;
  /** Max public units (couples for couples events). Do not display remaining on the form. */
  capacity?: number;
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
    sheetTab: 'Kintsugi - For Women',
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
    hebrewKidsFreeWithCode: true,
    sponsorPresets: [54, 72, 180, 360],
    sheetTab: 'Rosh Hashana Family Fair',
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
    sheetTab: 'Rosh Hashana Dinner',
    soldOut: true,
  },
  {
    slug: 'simchat-torah',
    title: 'Simchat Torah Celebration',
    program: 'Community',
    month: 'Oct',
    day: '3',
    dateLabel: 'Shabbos, October 3rd',
    time: '5:45 PM',
    startsAt: '2026-10-03T17:45:00-04:00',
    description:
      'Kids activities at 5:45 PM, then hakafot and a family celebration at 6:30 PM — dinner, dancing, and a special hakafah in memory of those we lost on Simchat Torah 2023. Embassy Lakes Clubhouse.',
    location: 'Embassy Lakes Clubhouse',
    flyer: '/flyers/simchat-torah.jpg',
    type: 'celebration',
    peopleMode: 'adults_kids',
    sponsorPresets: [54, 72, 100, 180, 360, 770, 1800],
    sponsorOptions: [
      { amount: 54, label: 'Contribution' },
      { amount: 72, label: 'Family suggested donation' },
      { amount: 100, label: 'Family suggested donation' },
      { amount: 180, label: 'HaBayit Friend' },
      { amount: 360, label: 'Flags & Swag Sponsor' },
      { amount: 770, label: 'Co-sponsor' },
      { amount: 1800, label: 'Event Co-sponsor' },
    ],
    sponsorNote: 'A donation helps cover dinner, kids activities, an open bar for adults, and hakafot.',
    requireDonationChoice: true,
    sheetTab: 'Simchat Torah',
  },
  {
    slug: 'erev-zugot',
    title: 'Erev Zugot',
    program: 'Community',
    month: 'Nov',
    day: '19',
    dateLabel: 'Thursday, November 19th',
    time: '8:00 PM',
    startsAt: '2026-11-19T20:00:00-05:00',
    description:
      'Two worlds, one conversation — Rabbi Daniel Shahino of Kehillat Rashbi and Eti Lissani, a couples and family therapist. An open evening on marriage, parenting, and family, with practical tools.',
    location: 'Embassy Lakes Clubhouse',
    flyer: '/flyers/erev-zugot.jpg',
    type: 'couples',
    peopleMode: 'couples',
    memberPriceWithCode: true,
    sponsorPresets: [54, 72, 180, 360],
    sheetTab: 'Erev Zugot',
    capacity: 22,
  },
];

/** Shared events workbook — one tab per event. */
const DEFAULT_EVENTS_SHEET_ID = '1U-bUkAuoGllTTlmZxMPK4ZE2FTyJI4FBaeqpkrgVqPI';

export function getPaidEvent(slug: string): PaidEventConfig | undefined {
  return PAID_EVENTS.find((e) => e.slug === slug);
}

export function paidEventRegisterPath(slug: PaidEventSlug): string {
  return `/events/register/${slug}`;
}

export function paidEventSharePath(event: PaidEventConfig): string {
  if (event.slug === 'simchat-torah') return '/st';
  if (event.slug === 'erev-zugot') return '/zugot';
  return paidEventRegisterPath(event.slug);
}

export function getPaidEventSheetId(_config?: PaidEventConfig): string | undefined {
  return process.env.GOOGLE_SHEETS_EVENTS_ID?.trim() || DEFAULT_EVENTS_SHEET_ID;
}

export function getPaidEventSheetTab(config: PaidEventConfig): string {
  return config.sheetTab;
}

export function isPaidEventSoldOut(event: PaidEventConfig): boolean {
  return event.soldOut === true;
}

export function eventUsesAdultsKids(event: PaidEventConfig): boolean {
  return event.type === 'dinner' || event.type === 'celebration';
}

export function upcomingPaidEvents(now = new Date()): PaidEventConfig[] {
  return PAID_EVENTS.filter((event) => new Date(event.startsAt).getTime() >= now.getTime());
}
