import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { getOpenHouseEvent } from '@/lib/events/config';
import { RsvpForm } from './RsvpForm';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = getOpenHouseEvent(slug);
  if (!event) return {};
  return {
    title: `RSVP — ${event.title} | HaBayit Jewish Center`,
    description: `RSVP for ${event.title} on ${event.dateLabel} at ${event.time}.`,
  };
}

export default async function RsvpPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = getOpenHouseEvent(slug);
  if (!event) notFound();

  return (
    <>
      <Header />

      <main className="flex-1">
        {/* Event header */}
        <div className="bg-navy text-white pt-16 pb-14 px-6 text-center">
          <p className="text-gold text-[0.78rem] font-extrabold uppercase tracking-[0.14em] mb-3">
            {event.program}
          </p>
          <h1 className="font-display text-[2.6rem] md:text-[3.2rem] font-bold leading-tight mb-4">
            {event.title}
          </h1>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-[1rem] text-white/80">
            <span>{event.dateLabel}</span>
            <span>·</span>
            <span>{event.time}</span>
            {event.locationPrivate && (
              <>
                <span>·</span>
                <span className="text-gold font-semibold">Location provided upon registration</span>
              </>
            )}
          </div>
        </div>

        <Section background="soft">
          <p className="text-center text-muted text-[1rem] max-w-[520px] mx-auto mb-10 leading-relaxed">
            {event.description}
          </p>

          <div className="bg-white border border-line rounded-[22px] p-8 md:p-10 max-w-[560px] mx-auto shadow-sm">
            <h2 className="text-[1.6rem] text-navy font-bold mb-6 text-center">Reserve Your Spot</h2>
            <RsvpForm event={event} />
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
