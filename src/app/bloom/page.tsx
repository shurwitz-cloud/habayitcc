import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { HERO_HEIGHT } from '@/lib/hero-heights';
import { Section, SectionTitle } from '@/components/sections/Section';
import { BLOOM_FLYER, BLOOM_NAME, BLOOM_REGISTER_PATH } from '@/lib/programs/names';
import {
  BLOOM_CHAI_DISCOUNT,
  BLOOM_EARLY_BIRD_DEADLINE_LABEL,
  BLOOM_EARLY_BIRD_DISCOUNT,
  BLOOM_MONTHLY_TUITION,
  BLOOM_PAY_IN_FULL_DISCOUNT,
  BLOOM_SESSION_MONTHS,
  isBloomEarlyBirdActive,
} from '@/lib/programs/bloom-tuition';

export const metadata = {
  title: `${BLOOM_NAME} – Bat Mitzvah Club | HaBayit Jewish Center`,
  description: `${BLOOM_NAME} — a Bat Mitzvah club for 6th grade girls built on meaningful conversations, creativity, and mitzvah projects. Meeting every other Wednesday, September through May.`,
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

        <Section background="soft">
          <div className="grid md:grid-cols-[minmax(0,320px)_1fr] gap-10 md:gap-14 items-center max-w-[900px] mx-auto">
            <div className="rounded-[18px] overflow-hidden border border-line shadow-sm bg-black">
              <img
                src={BLOOM_FLYER}
                alt={`${BLOOM_NAME} flyer`}
                className="w-full h-auto block"
              />
            </div>
            <div>
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
              <div className="mt-6 inline-flex items-center gap-2.5 font-semibold text-navy">
                Classes meet every other Wednesday, September through May.
              </div>
              <Link
                href={BLOOM_REGISTER_PATH}
                className="inline-block mt-8 px-9 py-3.5 rounded-full text-[0.78rem] font-bold uppercase tracking-wider bg-gold text-white hover:bg-[#a37e24]"
              >
                Begin Registration
              </Link>
            </div>
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

        <Section background="white">
          <SectionTitle eyebrow="Tuition">Investing in Jewish Growth</SectionTitle>
          <div className="grid md:grid-cols-2 gap-6.5">
            <div className="bg-soft border border-line rounded-[18px] p-8.5">
              <h3 className="text-[1.25rem] text-navy font-bold">Standard Tuition</h3>
              <div className="flex items-baseline gap-2.5 mt-3.5 mb-1">
                <span className="text-[2.6rem] font-extrabold text-navy leading-none">
                  ${BLOOM_MONTHLY_TUITION}
                </span>
                <span className="text-[1.15rem] font-bold text-gold uppercase tracking-[0.12em] leading-none">
                  / month
                </span>
              </div>
              <p className="text-muted text-[0.88rem] mb-4">
                {BLOOM_SESSION_MONTHS}-month program (Sep–May) per student
              </p>
              <ul className="mt-4 space-y-2">
                <li className="text-[0.88rem] text-muted pl-5 relative before:content-['✓'] before:absolute before:left-0 before:text-gold before:font-bold">
                  Full school year of the Bat Mitzvah club
                </li>
                <li className="text-[0.88rem] text-muted pl-5 relative before:content-['✓'] before:absolute before:left-0 before:text-gold before:font-bold">
                  Materials &amp; supplies included
                </li>
              </ul>
            </div>
            <div className="bg-soft border border-gold rounded-[18px] p-8.5 relative">
              <span className="absolute -top-3 left-7 bg-gold text-white text-[0.62rem] font-bold tracking-wider px-3.5 py-1 rounded-full">
                CHAI PARTNER BENEFIT
              </span>
              <h3 className="text-[1.25rem] text-navy font-bold">HaBayit Chai Partners</h3>
              <div className="text-[2.6rem] font-extrabold text-navy mt-3.5 mb-1">
                1 month off
              </div>
              <p className="text-muted text-[0.88rem] mb-4">
                ${BLOOM_CHAI_DISCOUNT} with a valid HaBayit Chai Partner code
              </p>
              <ul className="mt-4 space-y-2">
                <li className="text-[0.88rem] text-muted pl-5 relative before:content-['✓'] before:absolute before:left-0 before:text-gold before:font-bold">
                  Full school year of the Bat Mitzvah club
                </li>
                <li className="text-[0.88rem] text-muted pl-5 relative before:content-['✓'] before:absolute before:left-0 before:text-gold before:font-bold">
                  Materials &amp; supplies included
                </li>
              </ul>
            </div>
          </div>
          <div className="bg-cream border-l-[3px] border-gold rounded-r-[12px] p-4.5 mt-6 text-[0.88rem] text-muted">
            {isBloomEarlyBirdActive() && (
              <>
                Register by {BLOOM_EARLY_BIRD_DEADLINE_LABEL} and save $
                {BLOOM_EARLY_BIRD_DISCOUNT}.{' '}
              </>
            )}
            Pay in full and save ${BLOOM_PAY_IN_FULL_DISCOUNT}. Or choose two payments (upon
            acceptance and by November 1).
          </div>
        </Section>

        <Section background="navy">
          <div className="text-center">
            <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-bold">Ready to bloom?</h2>
            <p className="mt-2.5 text-white/70">
              {BLOOM_NAME} meets every other Wednesday, September through May. Registration is
              open now.
            </p>
            <Link
              href={BLOOM_REGISTER_PATH}
              className="inline-block mt-7 px-9 py-3.5 rounded-full text-[0.78rem] font-bold uppercase tracking-wider bg-gold text-white hover:bg-[#a37e24]"
            >
              Begin Bloom Registration
            </Link>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
