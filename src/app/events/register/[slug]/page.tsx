import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import {
  getPaidEvent,
  paidEventSharePath,
} from '@/lib/events/paid-events';
import { isPaidEventClosed } from '@/lib/events/paid-event-capacity';
import { SITE_URL } from '@/lib/site-metadata';
import { PaidEventForm } from './PaidEventForm';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = getPaidEvent(slug);
  if (!event) return {};

  const title = event.title;
  const description = `Register for ${event.title} on ${event.dateLabel} at ${event.time}${
    event.location ? ` · ${event.location}` : ''
  }.`;
  const url = paidEventSharePath(event);
  const imageUrl = event.flyer
    ? `${SITE_URL}${event.flyer.startsWith('/') ? event.flyer : `/${event.flyer}`}`
    : undefined;

  return {
    title: `Register — ${title} | HaBayit Jewish Center`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      images: imageUrl
        ? [{ url: imageUrl, alt: `${event.title} flyer` }]
        : undefined,
    },
    twitter: {
      card: imageUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function PaidEventRegisterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = getPaidEvent(slug);
  if (!event) notFound();
  const closed = await isPaidEventClosed(event);

  return (
    <>
      <Header />

      <main className="flex-1">
        <div className="bg-navy text-white pt-16 pb-14 px-6 text-center">
          <p className="text-gold text-[0.78rem] font-extrabold uppercase tracking-[0.14em] mb-3">
            {event.program}
          </p>
          <h1 className="font-display text-[2.6rem] md:text-[3.2rem] font-bold leading-tight mb-4">
            {event.title}
          </h1>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-[1rem] text-white/80 mb-5">
            <span>{event.dateLabel}</span>
            <span>·</span>
            <span>{event.time}</span>
            {event.location && (
              <>
                <span>·</span>
                <span>{event.location}</span>
              </>
            )}
          </div>
          <p className="text-white/80 text-[1rem] max-w-[560px] mx-auto leading-relaxed">
            {event.description}
          </p>
        </div>

        <Section background="soft">
          <div
            className={
              event.flyer
                ? 'max-w-[1040px] mx-auto grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-8 lg:gap-10 items-start'
                : 'max-w-[560px] mx-auto'
            }
          >
            {event.flyer && (
              <div className="rounded-[18px] overflow-hidden border border-line shadow-sm bg-black lg:sticky lg:top-24">
                <img
                  src={event.flyer}
                  alt={`${event.title} flyer`}
                  className="w-full h-auto block"
                />
              </div>
            )}
            <div className="bg-white border border-line rounded-[22px] p-8 md:p-10 shadow-sm">
              {closed ? (
                <div className="text-center py-4">
                  <p className="text-gold text-[0.75rem] font-extrabold uppercase tracking-[0.14em] mb-3">
                    Registration closed
                  </p>
                  <h2 className="text-[1.8rem] text-navy font-bold mb-3">Sold out</h2>
                  <p className="text-muted text-[1rem] leading-relaxed max-w-[420px] mx-auto">
                    This event is at capacity. If you have a question, please{' '}
                    <a href="mailto:info@habayitcc.org" className="text-navy font-semibold border-b border-gold pb-0.5">
                      email us
                    </a>
                    .
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="text-[1.6rem] text-navy font-bold mb-6 text-center leading-snug">
                    Register
                  </h2>
                  <PaidEventForm event={event} />
                </>
              )}
            </div>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
