import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ProgramOpenHouse } from '@/components/events/ProgramOpenHouse';
import { Hero } from '@/components/sections/Hero';
import { HERO_HEIGHT } from '@/lib/hero-heights';
import { Section, SectionTitle } from '@/components/sections/Section';
import { BLOOM_NAME } from '@/lib/programs/names';

export const metadata = {
  title: `${BLOOM_NAME} – Bat Mitzvah Club | HaBayit Jewish Center`,
  description: `${BLOOM_NAME} — a Bat Mitzvah club for 6th grade girls built on meaningful conversations, creativity, and mitzvah projects.`,
};

const PILLARS = [
  {
    title: 'Meaningful Conversations',
    description: 'Honest discussion about identity, faith, and growing up.',
  },
  {
    title: 'Creativity',
    description: 'Hands-on, expressive projects that bring Jewish values to life.',
  },
  {
    title: 'Mitzvah Projects',
    description: 'Real action that connects values to the world around her.',
  },
];

export default function BloomPage() {
  return (
    <>
      <Header />

      <main className="flex-1">
        <Hero
          kicker="Programs"
          minHeight={HERO_HEIGHT.page}
          subtitle="For 6th grade girls — meaningful conversations, creativity, and mitzvah projects."
        >
          {BLOOM_NAME}
        </Hero>

        <ProgramOpenHouse eventSlug="bloom" background="soft" />

        <Section background="white">
          <div className="max-w-[720px]">
            <p className="text-[0.72rem] tracking-[0.2em] uppercase text-gold font-bold mb-4.5">
              About the Program
            </p>
            <h2 className="text-[clamp(2rem,3.5vw,2.8rem)] leading-tight text-navy font-bold">
              Growing into Jewish womanhood, together.
            </h2>
            <p className="mt-4 text-muted text-[1.02rem]">
              {BLOOM_NAME} gives 6th grade girls a warm, creative space to explore Jewish identity,
              build real friendships, and discover what it means to step into this meaningful new
              chapter.
            </p>
            <Link
              href="/contact"
              className="inline-block mt-8 px-9 py-3.5 rounded-full text-[0.78rem] font-bold uppercase tracking-wider bg-gold text-white hover:bg-[#a37e24]"
            >
              Contact Us to Learn More
            </Link>
          </div>
        </Section>

        <Section background="cream">
          <SectionTitle eyebrow="What Girls Experience">Three Pillars of Our Program</SectionTitle>
          <div className="grid md:grid-cols-3 gap-6.5">
            {PILLARS.map((pillar) => (
              <div key={pillar.title} className="bg-white border border-line rounded-[18px] p-8">
                <h3 className="text-[1.4rem] text-navy font-bold mb-2.5">{pillar.title}</h3>
                <p className="text-muted text-[0.92rem]">{pillar.description}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section background="navy">
          <div className="text-center">
            <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-bold">Want to learn more?</h2>
            <p className="mt-2.5 text-white/70">
              Full schedule and registration details will be available soon. Reach out with any
              questions.
            </p>
            <a
              href="/contact"
              className="inline-block mt-7 px-9 py-3.5 rounded-full text-[0.78rem] font-bold uppercase tracking-wider border-[1.5px] border-white/50 text-white hover:bg-white hover:text-navy"
            >
              Contact Us
            </a>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
