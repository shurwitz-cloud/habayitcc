import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { getPaidEvent } from '@/lib/events/paid-events';
import { PaidEventForm } from './PaidEventForm';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = getPaidEvent(slug);
  if (!event) return {};
  return {
    title: `Register — ${event.title} | HaBayit Jewish Center`,
    description: `Register for ${event.title} on ${event.dateLabel}.`,
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
          </div>
          <p className="text-white/80 text-[1rem] max-w-[520px] mx-auto leading-relaxed">
            {event.description}
          </p>
        </div>

        <Section background="soft">
          <div className="max-w-[560px] mx-auto">
            <div className="bg-white border border-line rounded-[22px] p-8 md:p-10 shadow-sm">
              <h2 className="text-[1.6rem] text-navy font-bold mb-6 text-center leading-snug">
                Register
              </h2>
              <PaidEventForm event={event} />
            </div>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
