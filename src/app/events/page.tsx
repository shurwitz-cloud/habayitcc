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

        {/* Open House / Featured events — card grid with flyers */}
        <Section background="soft">
          <div className="max-w-[960px] mx-auto">
            <p className="text-gold text-[0.75rem] font-extrabold uppercase tracking-[0.14em] mb-6 text-center">
              Open Houses &amp; Special Events
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              {OPEN_HOUSE_EVENTS.map((event) => (
                <a
                  key={event.slug}
                  href={`/rsvp/${event.slug}`}
                  className="group bg-white border border-line rounded-[20px] overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
                >
                  {event.flyer ? (
                    <img
                      src={event.flyer}
                      alt={`${event.title} flyer`}
                      className="w-full object-cover group-hover:opacity-95 transition-opacity"
                      style={{ aspectRatio: '3/4' }}
                    />
                  ) : (
                    <div className="bg-navy flex-1 min-h-[200px] flex items-center justify-center">
                      <span className="text-white/40 text-[0.85rem]">No flyer</span>
                    </div>
                  )}
                  <div className="p-5 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gold text-[0.72rem] font-extrabold uppercase tracking-wider">
                        {event.month} {event.day}
                      </span>
                      <span className="text-muted text-[0.72rem]">· {event.time}</span>
                    </div>
                    <h3 className="text-navy font-bold text-[1.1rem] leading-snug">{event.title}</h3>
                    {event.locationPrivate && (
                      <p className="text-muted text-[0.78rem]">Location provided upon registration</p>
                    )}
                    <span className="mt-2 inline-block text-[0.75rem] font-bold uppercase tracking-wider text-navy border-b border-gold pb-0.5 w-fit group-hover:text-gold transition-colors">
                      RSVP →
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </Section>

        {/* Regular recurring events — list */}
        <Section background="white">
          <div className="max-w-[840px] mx-auto">
            <p className="text-gold text-[0.75rem] font-extrabold uppercase tracking-[0.14em] mb-6 text-center">
              Ongoing &amp; Recurring Events
            </p>
            {GENERAL_EVENTS.map((event, i) => (
              <div
                key={event.title}
                className={`grid grid-cols-[80px_1fr] md:grid-cols-[120px_1fr_auto] gap-5 md:gap-7 items-center py-7 border-b border-line ${
                  i === 0 ? 'border-t' : ''
                }`}
              >
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
                  RSVP →
                </a>
              </div>
            ))}
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
