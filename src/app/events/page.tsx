import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { SiteRotatingHero } from '@/components/site-images/SiteRotatingHero';
import { HERO_HEIGHT } from '@/lib/hero-heights';
import { Section } from '@/components/sections/Section';
import { PAID_EVENTS, paidEventRegisterPath } from '@/lib/events/paid-events';

export const metadata = {
  title: 'Events – HaBayit Jewish Center',
  description:
    'Upcoming events at HaBayit Jewish Center — Shabbat dinners, holiday celebrations, classes, and community gatherings.',
};

export default function EventsPage() {
  return (
    <>
      <Header />

      <main className="flex-1">
        <SiteRotatingHero
          slotId="events.hero"
          kicker="What's Happening"
          minHeight={HERO_HEIGHT.page}
          subtitle="Rosh Hashana gatherings, community dinners, and family programs."
        >
          Upcoming Events
        </SiteRotatingHero>

        <Section background="soft">
          <div className="max-w-[960px] mx-auto">
            <p className="text-gold text-[0.75rem] font-extrabold uppercase tracking-[0.14em] mb-6 text-center">
              Rosh Hashana
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              {PAID_EVENTS.map((event) => (
                <a
                  key={event.slug}
                  href={paidEventRegisterPath(event.slug)}
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
                      Register →
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
