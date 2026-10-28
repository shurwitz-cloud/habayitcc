import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { SiteRotatingHero } from '@/components/site-images/SiteRotatingHero';
import { HERO_HEIGHT } from '@/lib/hero-heights';
import { Section } from '@/components/sections/Section';
import {
  upcomingPaidEvents,
  paidEventSharePath,
} from '@/lib/events/paid-events';
import { isPaidEventClosed } from '@/lib/events/paid-event-capacity';
import { SITE_URL } from '@/lib/site-metadata';

const upcomingForMeta = upcomingPaidEvents();
const featured = upcomingForMeta[0];
const featuredImage = featured?.flyer
  ? `${SITE_URL}${featured.flyer}`
  : undefined;

export const metadata = {
  title: 'Events – HaBayit Jewish Center',
  description:
    'Upcoming events at HaBayit Jewish Center — Shabbat dinners, holiday celebrations, classes, and community gatherings.',
  openGraph: {
    title: featured?.title ?? 'Upcoming Events',
    description: featured
      ? `${featured.dateLabel} · ${featured.time}${featured.location ? ` · ${featured.location}` : ''}`
      : 'Upcoming events at HaBayit Jewish Center.',
    url: '/events',
    images: featuredImage ? [{ url: featuredImage, alt: `${featured?.title} flyer` }] : undefined,
  },
  twitter: {
    card: featuredImage ? 'summary_large_image' : 'summary',
    images: featuredImage ? [featuredImage] : undefined,
  },
};

export default async function EventsPage() {
  const upcoming = upcomingPaidEvents();
  const closedBySlug = Object.fromEntries(
    await Promise.all(upcoming.map(async (event) => [event.slug, await isPaidEventClosed(event)])),
  ) as Record<string, boolean>;

  return (
    <>
      <Header />

      <main className="flex-1">
        <SiteRotatingHero
          slotId="events.hero"
          kicker="What's Happening"
          minHeight={HERO_HEIGHT.page}
          subtitle="Holiday celebrations, community dinners, and family programs."
        >
          Upcoming Events
        </SiteRotatingHero>

        <Section background="soft">
          <div className="max-w-[960px] mx-auto">
            {upcoming.length === 0 ? (
              <p className="text-center text-muted text-[1rem]">
                New events will be posted here. Check back soon.
              </p>
            ) : (
              <>
                <p className="text-gold text-[0.75rem] font-extrabold uppercase tracking-[0.14em] mb-6 text-center">
                  Coming Up
                </p>
                <div className={`grid gap-6 ${upcoming.length === 1 ? 'md:grid-cols-1 max-w-[420px] mx-auto' : 'md:grid-cols-3'}`}>
                  {upcoming.map((event) => (
                    <a
                      key={event.slug}
                      href={paidEventSharePath(event)}
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
                        {event.location && (
                          <p className="text-muted text-[0.78rem]">{event.location}</p>
                        )}
                        <span className="mt-2 inline-block text-[0.75rem] font-bold uppercase tracking-wider text-navy border-b border-gold pb-0.5 w-fit group-hover:text-gold transition-colors">
                          {closedBySlug[event.slug] ? 'Sold out' : 'Register →'}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
