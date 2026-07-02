import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section, SectionTitle } from '@/components/sections/Section';
import { ProgramCard, ProgramTile } from '@/components/sections/ProgramCard';
import { HEBREW_ADVENTURE_NAME, HEBREW_ADVENTURE_PATH } from '@/lib/programs/names';

export default function HomePage() {
  return (
    <>
      <Header />

      <main className="flex-1">
        <Hero minHeight="min-h-[78vh]">Welcome to HaBayit</Hero>

        <Section background="white">
          <SectionTitle
            eyebrow=""
            description={`Whether you're looking for ${HEBREW_ADVENTURE_NAME}, preparing for a Bar or Bat Mitzvah, joining us for Shabbat, or simply searching for community, there's a place for you here.`}
          >
            Explore HaBayit
          </SectionTitle>

          <ProgramTile
            href={HEBREW_ADVENTURE_PATH}
            kicker="For Children & Families"
            title={HEBREW_ADVENTURE_NAME}
            description="Joyful Jewish learning where children build skills, confidence, identity, and a love for being Jewish."
          />

          <div className="grid md:grid-cols-3 gap-5.5 mb-6">
            <ProgramCard
              href="/bar-mitzvah"
              title="Bar Mitzvah"
              description="Meaningful preparation for boys entering Jewish adulthood."
            />
            <ProgramCard
              href="/bat-mitzvah"
              title="Bat Mitzvah"
              description="A warm and inspiring experience for girls celebrating this milestone."
            />
            <ProgramCard
              href="/chai-partner"
              title="Chai Partner"
              description="Help sustain HaBayit through monthly partnership and become part of building our community."
              variant="featured"
            />
          </div>

          <ProgramTile
            href="/synagogue"
            kicker="Shabbat • Holidays • Events"
            title="Synagogue & Community"
            description="Join us for meaningful Jewish life, family programs, holiday celebrations, learning, and community connection."
            reverse
          />
        </Section>

        <Section background="cream" narrow>
          <h2 className="text-[clamp(2.3rem,4.5vw,4rem)] text-navy font-bold leading-tight">
            More than a community.
            <span className="block text-gold italic">A home.</span>
          </h2>
          <Link
            href="/about"
            className="inline-block mt-7 text-[0.78rem] font-bold uppercase tracking-wider text-navy border-b border-gold pb-1 hover:text-gold"
          >
            Learn About HaBayit
          </Link>
        </Section>

        <Section background="white">
          <SectionTitle eyebrow="">Upcoming at HaBayit</SectionTitle>
          <div className="grid md:grid-cols-3 border-t border-b border-line">
            <EventPreview
              date="Aug 4"
              title={`${HEBREW_ADVENTURE_NAME} Meet & Greet`}
              description="Meet the team and learn about the year ahead."
              href="/rsvp/hebrew-adventure"
            />
            <EventPreview
              date="Weekly"
              title="Shabbat at HaBayit"
              description="Join us for tefillah, kiddush, learning, and community."
              href="/synagogue"
            />
            <EventPreview
              date="Community"
              title="Holiday Programs"
              description="Warm, family-friendly celebrations throughout the year."
              href="/events"
            />
          </div>
          <div className="text-center mt-8">
            <Link
              href="/events"
              className="text-[0.78rem] font-bold uppercase tracking-wider text-navy border-b border-gold pb-1 hover:text-gold"
            >
              View All Events
            </Link>
          </div>
        </Section>

        <Section background="navy">
          <div className="text-center">
            <h2 className="text-[clamp(2rem,3.6vw,3.2rem)] font-bold">
              We&apos;d love to welcome you.
            </h2>
            <p className="mt-2.5 text-white/70">
              Have a question, want to visit, or looking for the right program for your family?
            </p>
            <div className="flex gap-5.5 justify-center flex-wrap mt-6.5 text-[0.92rem]">
              <Link href="/contact" className="border-b border-gold/80 pb-0.5">
                Visit
              </Link>
              <a href="tel:6464621138" className="border-b border-gold/80 pb-0.5">
                Call
              </a>
              <a href="mailto:info@habayitcc.org" className="border-b border-gold/80 pb-0.5">
                Email
              </a>
            </div>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}

function EventPreview({
  date,
  title,
  description,
  href = '/events',
}: {
  date: string;
  title: string;
  description: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className="p-8 border-r border-line last:border-r-0 hover:bg-soft transition-colors"
    >
      <p className="text-[0.74rem] uppercase tracking-[0.14em] text-gold font-bold mb-4">
        {date}
      </p>
      <h3 className="text-[1.65rem] text-navy font-bold">{title}</h3>
      <p className="mt-2.5 text-muted text-[0.92rem]">{description}</p>
    </Link>
  );
}
