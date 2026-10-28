import Link from 'next/link';
import { Section } from '@/components/sections/Section';
import { getOpenHouseEvent } from '@/lib/events/config';
import { registrationLocationHint } from '@/lib/events/location';

interface ProgramOpenHouseProps {
  eventSlug: string;
  /** Section background; defaults to soft to stand out on white program pages. */
  background?: 'cream' | 'white' | 'soft' | 'navy';
}

/**
 * RSVP flyer + link for an open house / meet & greet, meant for program pages
 * (not only /events).
 */
export function ProgramOpenHouse({ eventSlug, background = 'soft' }: ProgramOpenHouseProps) {
  const event = getOpenHouseEvent(eventSlug);
  if (!event) return null;

  const rsvpHref = `/rsvp/${event.slug}`;

  const locationHint = registrationLocationHint(event);

  return (
    <Section background={background}>
      <div className="grid md:grid-cols-[minmax(0,280px)_1fr] gap-10 md:gap-14 items-center max-w-[880px] mx-auto">
        {event.flyer ? (
          <Link
            href={rsvpHref}
            className="block rounded-[18px] overflow-hidden border border-line shadow-sm bg-black hover:opacity-95 transition-opacity"
          >
            <img
              src={event.flyer}
              alt={`${event.title} ${event.rsvpLabel} flyer`}
              className="w-full h-auto block"
            />
          </Link>
        ) : null}

        <div>
          <p className="text-[0.72rem] tracking-[0.2em] uppercase text-gold font-bold mb-3">
            {event.rsvpLabel}
          </p>
          <h2 className="text-[clamp(1.75rem,3vw,2.4rem)] leading-tight text-navy font-bold">
            {event.title}
          </h2>
          <p className="mt-3 text-gold font-semibold text-[0.95rem]">
            {event.dateLabel} · {event.time}
          </p>
          <p className="mt-3 text-muted text-[1.02rem] max-w-[36rem] whitespace-pre-line">{event.description}</p>
          {locationHint && (
            <p className="mt-2 text-muted text-[0.85rem]">{locationHint}</p>
          )}
          <Link
            href={rsvpHref}
            className="inline-block mt-7 px-9 py-3.5 rounded-full text-[0.78rem] font-bold uppercase tracking-wider bg-gold text-white hover:bg-[#a37e24]"
          >
            RSVP for {event.rsvpLabel}
          </Link>
        </div>
      </div>
    </Section>
  );
}
