import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section } from '@/components/sections/Section';
import { OPEN_HOUSE_EVENTS } from '@/lib/events/config';

export const metadata = {
  title: 'Events – HaBayit Jewish Center',
  description:
    'Upcoming events at HaBayit Jewish Center — Shabbat dinners, holiday celebrations, classes, and community gatherings.',
};

const GENERAL_EVENTS = [
  {
    month: 'Jul',
    day: '18',
    title: 'Shabbat Dinner',
    meta: 'Friday · 6:30 PM · HaBayit Center',
    description:
      'A warm, home-style Shabbat dinner. Beautiful blessings, delicious food, great company. All are welcome.',
    rsvpHref: '/contact',
  },
  {
    month: 'Jul',
    day: '25',
    title: 'Torah & Coffee',
    meta: 'Sunday · 10:00 AM · HaBayit Center',
    description:
      'A relaxed weekly class exploring timeless Torah wisdom with real-life relevance. Great coffee included.',
    rsvpHref: '/contact',
  },
  {
    month: 'Aug',
    day: '1',
    title: 'Family Shabbat',
    meta: 'Friday · 6:30 PM · HaBayit Center',
    description:
      'A special Shabbat experience designed for families with young children. Songs, stories, candle lighting together.',
    rsvpHref: '/contact',
  },
];

// Merge open-house events into the same list for display
const ALL_EVENTS = [
  ...OPEN_HOUSE_EVENTS.map((e) => ({
    month: e.month,
    day: e.day,
    title: e.title,
    meta: `${e.dateLabel} · ${e.time}${e.locationPrivate ? ' · Location provided upon registration' : ''}`,
    description: e.description,
    rsvpHref: `/rsvp/${e.slug}`,
    highlight: true,
    flyer: e.flyer,
  })),
  ...GENERAL_EVENTS.map((e) => ({ ...e, highlight: false, flyer: undefined })),
].sort((a, b) => {
  const monthOrder: Record<string, number> = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };
  const ma = monthOrder[a.month] ?? 0;
  const mb = monthOrder[b.month] ?? 0;
  return ma !== mb ? ma - mb : Number(a.day) - Number(b.day);
});

export default function EventsPage() {
  return (
    <>
      <Header />

      <main className="flex-1">
        <Hero
          kicker="What's Happening"
          minHeight="min-h-[42vh]"
          subtitle="Shabbat dinners, holiday celebrations, classes, and community gatherings."
        >
          Upcoming Events
        </Hero>

        <Section background="white">
          <div className="max-w-[840px] mx-auto">
            {ALL_EVENTS.map((event, i) => (
              <div
                key={`${event.title}-${i}`}
                className={`py-7 border-b border-line ${i === 0 ? 'border-t' : ''} ${
                  event.highlight ? 'bg-[#fffbf2] -mx-4 px-4 rounded-xl' : ''
                }`}
              >
                <div className="grid grid-cols-[80px_1fr] md:grid-cols-[120px_1fr_auto] gap-5 md:gap-7 items-center">
                  <div className="text-center">
                    <div className="text-[0.7rem] tracking-[0.12em] uppercase text-gold font-bold">
                      {event.month}
                    </div>
                    <div className="text-[2.2rem] text-navy font-bold leading-none">{event.day}</div>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <h3 className="text-[1.4rem] text-navy font-bold mb-1.5">{event.title}</h3>
                    <div className="text-[0.85rem] text-gold font-semibold mb-2">{event.meta}</div>
                    <p className="text-muted text-[0.92rem]">{event.description}</p>
                  </div>
                  <a
                    href={event.rsvpHref}
                    className="col-span-2 md:col-span-1 justify-self-start md:justify-self-auto text-[0.78rem] font-bold uppercase tracking-wider text-navy border-b border-gold pb-1 hover:text-gold mt-2 md:mt-0"
                  >
                    RSVP &rarr;
                  </a>
                </div>
                {event.flyer && (
                  <div className="mt-5 ml-[100px] md:ml-[148px]">
                    <a href={event.rsvpHref}>
                      <img
                        src={event.flyer}
                        alt={`${event.title} flyer`}
                        className="rounded-xl shadow-sm max-w-[220px] w-full hover:opacity-90 transition-opacity"
                      />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
