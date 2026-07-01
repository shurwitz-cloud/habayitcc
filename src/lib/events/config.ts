// Public event display data — safe to import in client or server components.
// Sheet IDs live in actions.ts only (server-side).

export interface EventConfig {
  slug: string;
  title: string;
  program: string;
  month: string;
  day: string;
  dateLabel: string;   // e.g. "Monday, August 4th"
  time: string;
  description: string;
  locationPrivate: boolean; // true = "Location provided upon registration"
  tabName: string;          // Google Sheet tab name auto-created on first RSVP
  rsvpLabel: string;        // e.g. "Meet & Greet", "Open House" — used in form heading
  flyer?: string;           // path relative to /public, e.g. "/flyers/achim.png"
}

export const OPEN_HOUSE_EVENTS: EventConfig[] = [
  {
    slug: 'hebrew-adventure',
    title: 'HaBayit Hebrew Adventure',
    program: 'Hebrew School',
    month: 'Aug',
    day: '4',
    dateLabel: 'Monday, August 4th',
    time: '8:30 PM',
    description:
      'Meet & greet and Q&A for parents. Come discover our Hebrew School program for the upcoming year.',
    locationPrivate: true,
    tabName: 'Hebrew Adventure - Aug 4',
    rsvpLabel: 'Meet & Greet',
    flyer: '/flyers/hebrew-adventure.png',
  },
  {
    slug: 'achim',
    title: 'HaBayit Achim',
    program: 'Achim — 6th Grade Boys',
    month: 'Jul',
    day: '28',
    dateLabel: 'Monday, July 28th',
    time: '7:30 PM',
    description:
      'Open House and program for the boys. An exciting evening for 6th grade boys to experience what HaBayit Achim is all about.',
    locationPrivate: false,
    tabName: 'Open House - Jul 28',
    rsvpLabel: 'Open House',
    flyer: '/flyers/achim.png',
  },
  {
    slug: 'bloom',
    title: 'HaBayit Bloom',
    program: 'Bloom — Bat Mitzvah Program, 6th Grade Girls',
    month: 'Aug',
    day: '6',
    dateLabel: 'Wednesday, August 6th',
    time: '7:30 PM',
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
