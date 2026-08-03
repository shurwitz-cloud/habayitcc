// Public event display data — safe to import in client or server components.
// Sheet IDs live in actions.ts only (server-side).

import { BMX_FULL_NAME, HEBREW_ADVENTURE_NAME } from '@/lib/programs/names';

export interface EventConfig {
  slug: string;
  title: string;
  program: string;
  month: string;
  day: string;
  dateLabel: string;   // e.g. "Monday, August 4th"
  time: string;
  /** ISO 8601 — used for Supabase events table sync */
  startsAt: string;
  description: string;
  locationPrivate: boolean; // true = hide address until after RSVP (or until revealed)
  /** Full address — shown on confirmation page + email after RSVP. */
  locationAddress?: string;
  tabName: string;          // Google Sheet tab name auto-created on first RSVP
  rsvpLabel: string;        // e.g. "Meet & Greet", "Open House" — used in form heading
  flyer?: string;           // path relative to /public, e.g. "/flyers/achim.png"
}

export const OPEN_HOUSE_EVENTS: EventConfig[] = [
  {
    slug: 'hebrew-adventure',
    title: HEBREW_ADVENTURE_NAME,
    program: HEBREW_ADVENTURE_NAME,
    month: 'Aug',
    day: '4',
    dateLabel: 'Tuesday, August 4th',
    time: '8:30 PM',
    startsAt: '2026-08-04T20:30:00-04:00',
    description:
      `Meet & greet and Q&A for parents. Come discover ${HEBREW_ADVENTURE_NAME} for the upcoming year.`,
    locationPrivate: true,
    tabName: 'HaBayit Hebrew Adventure - Aug 4',
    rsvpLabel: 'Meet & Greet',
    flyer: '/flyers/hebrew-adventure.png',
  },
  {
    slug: 'achim',
    title: 'HaBayit Achim',
    program: 'Achim — 6th Grade Boys',
    month: 'Jul',
    day: '28',
    dateLabel: 'Tuesday, July 28th',
    time: '7:30 PM',
    startsAt: '2026-07-28T19:30:00-04:00',
    description:
      '7:30–8:30 PM — Fun program for the boys.\n8:30 PM — Parents are welcome to join for a program overview and Q&A.',
    locationPrivate: true,
    locationAddress: '4025 Augusta Ave\nEmbassy Lakes',
    tabName: 'RSVP',
    rsvpLabel: 'Open House',
    flyer: '/flyers/achim.png',
  },
  {
    slug: 'bmx',
    title: BMX_FULL_NAME,
    program: 'BMX — Bar Mitzvah Experience, 7th Grade Boys',
    month: 'Aug',
    day: '13',
    dateLabel: 'Thursday, August 13th',
    time: '7:00 PM',
    startsAt: '2026-08-13T19:00:00-04:00',
    description:
      '7:00–8:30 PM — An evening for 7th grade boys to experience HaBayit BMX: Jewish pride, mitzvah projects, and real conversation. Parents are welcome to join for a program overview and Q&A.',
    locationPrivate: true,
    tabName: 'RSVP',
    rsvpLabel: 'Open House',
    flyer: '/flyers/bmx.png',
  },
  {
    slug: 'bloom',
    title: 'HaBayit Bloom',
    program: 'Bloom — Bat Mitzvah Program, 6th Grade Girls',
    month: 'Aug',
    day: '6',
    dateLabel: 'Wednesday, August 6th',
    time: '7:30 PM',
    startsAt: '2026-08-06T19:30:00-04:00',
    description:
      'Open House and program for the girls. An exciting evening for 6th grade girls to experience what HaBayit Bloom is all about.',
    locationPrivate: true,
    tabName: 'Open House - Aug 6',
    rsvpLabel: 'Open House',
    flyer: '/flyers/bloom.png',
  },
];

export function getOpenHouseEvent(slug: string): EventConfig | undefined {
  return OPEN_HOUSE_EVENTS.find((e) => e.slug === slug);
}
