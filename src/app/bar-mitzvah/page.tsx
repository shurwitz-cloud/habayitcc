import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ProgramOpenHouse } from '@/components/events/ProgramOpenHouse';
import { Hero } from '@/components/sections/Hero';
import { HERO_HEIGHT } from '@/lib/hero-heights';
import { Section, SectionTitle } from '@/components/sections/Section';
import { BMX_FLYER, BMX_NAME, BMX_REGISTER_PATH } from '@/lib/programs/names';
import {
  BMX_CHAI_DISCOUNT,
  BMX_EARLY_BIRD_DEADLINE_LABEL,
  BMX_EARLY_BIRD_DISCOUNT,
  BMX_MONTHLY_TUITION,
  BMX_PAY_IN_FULL_DISCOUNT,
  BMX_SESSION_MONTHS,
  isBmxEarlyBirdActive,
} from '@/lib/programs/bmx-tuition';

export const metadata = {
  title: 'HaBayit BMX – Bar Mitzvah Experience',
  description:
    'HaBayit BMX \u2014 a Bar Mitzvah experience for 7th grade boys built on Jewish pride, mitzvah projects, and meaningful discussion. Meeting every other Thursday, 7:00–8:30 PM, September through May.',
};

const PILLARS = [
  { title: 'Jewish Pride', description: 'Building confidence and identity as young Jewish men.' },
  { title: 'Mitzvah Projects', description: 'Hands-on action that connects values to the real world.' },
  { title: 'Meaningful Discussion', description: 'Honest conversation about life, faith, and growing up.' },
];

export default function BarMitzvahPage() {
  return (
    <>
      <Header />

      <main className="flex-1">
        <Hero
          kicker="HaBayit BMX"
          minHeight={HERO_HEIGHT.page}
          subtitle={
            <>
              For 7th grade boys — Jewish pride, mitzvah projects, and meaningful discussion.
              <br />
              Every other Thursday, 7:00–8:30 PM.
            </>
          }
        >
          Bar Mitzvah Experience
        </Hero>

        <Section background="soft">
          <div className="grid md:grid-cols-[minmax(0,320px)_1fr] gap-10 md:gap-14 items-center max-w-[900px] mx-auto">
            <div className="rounded-[18px] overflow-hidden border border-line shadow-sm bg-black">
              <img
                src={BMX_FLYER}
                alt={`${BMX_NAME} flyer`}
                className="w-full h-auto block"
              />
            </div>
            <div>
              <p className="text-[0.72rem] tracking-[0.2em] uppercase text-gold font-bold mb-4.5">
                About the Program
              </p>
              <h2 className="text-[clamp(2rem,3.5vw,2.8rem)] leading-tight text-navy font-bold">
                Level up. Connect, grow, and lead.
              </h2>
              <p className="mt-4 text-muted text-[1.02rem]">
                {BMX_NAME} gives 7th grade boys a space to explore what it means to become a Jewish
                adult — through real conversation, hands-on mitzvah projects, and genuine pride in
                who they are.
              </p>
              <div className="mt-6 inline-flex items-center gap-2.5 font-semibold text-navy">
                Classes meet every other Thursday, 7:00–8:30 PM, September through May.
              </div>
              <div className="mt-8 flex flex-wrap gap-3.5">
                <Link
                  href="/rsvp/bmx"
                  className="inline-block px-9 py-3.5 rounded-full text-[0.78rem] font-bold uppercase tracking-wider bg-navy text-white hover:bg-[#0f1a30]"
                >
                  RSVP for Aug 13
                </Link>
                <Link
                  href={BMX_REGISTER_PATH}
                  className="inline-block px-9 py-3.5 rounded-full text-[0.78rem] font-bold uppercase tracking-wider bg-gold text-white hover:bg-[#a37e24]"
                >
                  Begin Registration
                </Link>
              </div>
            </div>
          </div>
        </Section>

        <Section background="cream">
          <SectionTitle eyebrow="What Boys Experience">Three Pillars of Our Program</SectionTitle>
          <div className="grid md:grid-cols-3 gap-6.5">
            {PILLARS.map((pillar) => (
              <div key={pillar.title} className="bg-white border border-line rounded-[18px] p-8">
                <h3 className="text-[1.4rem] text-navy font-bold mb-2.5">{pillar.title}</h3>
                <p className="text-muted text-[0.92rem]">{pillar.description}</p>
              </div>
            ))}
          </div>
        </Section>

        <ProgramOpenHouse eventSlug="bmx" background="white" />

        <Section background="soft">
          <SectionTitle eyebrow="Tuition">Investing in Jewish Growth</SectionTitle>
          <div className="grid md:grid-cols-2 gap-6.5">
            <div className="bg-white border border-line rounded-[18px] p-8.5">
              <h3 className="text-[1.25rem] text-navy font-bold">Standard Tuition</h3>
              <div className="flex items-baseline gap-2.5 mt-3.5 mb-1">
                <span className="text-[2.6rem] font-extrabold text-navy leading-none">
                  ${BMX_MONTHLY_TUITION}
                </span>
                <span className="text-[1.15rem] font-bold text-gold uppercase tracking-[0.12em] leading-none">
                  / month
                </span>
              </div>
              <p className="text-muted text-[0.88rem] mb-4">
                {BMX_SESSION_MONTHS}-month program (Sep–May) per student
              </p>
              <ul className="mt-4 space-y-2">
                <li className="text-[0.88rem] text-muted pl-5 relative before:content-['✓'] before:absolute before:left-0 before:text-gold before:font-bold">
                  Full school year of the Bar Mitzvah Experience
                </li>
                <li className="text-[0.88rem] text-muted pl-5 relative before:content-['✓'] before:absolute before:left-0 before:text-gold before:font-bold">
                  Materials &amp; supplies included
                </li>
              </ul>
            </div>
            <div className="bg-white border border-gold rounded-[18px] p-8.5 relative">
              <span className="absolute -top-3 left-7 bg-gold text-white text-[0.62rem] font-bold tracking-wider px-3.5 py-1 rounded-full">
                CHAI PARTNER BENEFIT
              </span>
              <h3 className="text-[1.25rem] text-navy font-bold">HaBayit Chai Partners</h3>
              <div className="text-[2.6rem] font-extrabold text-navy mt-3.5 mb-1">
                1 month off
              </div>
              <p className="text-muted text-[0.88rem] mb-4">
                ${BMX_CHAI_DISCOUNT} with a valid HaBayit Chai Partner code
              </p>
              <ul className="mt-4 space-y-2">
                <li className="text-[0.88rem] text-muted pl-5 relative before:content-['✓'] before:absolute before:left-0 before:text-gold before:font-bold">
                  Full school year of the Bar Mitzvah Experience
                </li>
                <li className="text-[0.88rem] text-muted pl-5 relative before:content-['✓'] before:absolute before:left-0 before:text-gold before:font-bold">
                  Materials &amp; supplies included
                </li>
              </ul>
            </div>
          </div>
          <div className="bg-cream border-l-[3px] border-gold rounded-r-[12px] p-4.5 mt-6 text-[0.88rem] text-muted">
            {isBmxEarlyBirdActive() && (
              <>
                Register by {BMX_EARLY_BIRD_DEADLINE_LABEL} and save $
                {BMX_EARLY_BIRD_DISCOUNT}.{' '}
              </>
            )}
            Pay in full and save ${BMX_PAY_IN_FULL_DISCOUNT}. Or choose two payments (upon
            acceptance and by November 1).
          </div>
        </Section>

        <Section background="navy">
          <div className="text-center">
            <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-bold">Ready to level up?</h2>
            <p className="mt-2.5 text-white/70">
              {BMX_NAME} meets every other Thursday, 7:00–8:30 PM, from September through May.
              Registration is open now.
            </p>
            <Link
              href={BMX_REGISTER_PATH}
              className="inline-block mt-7 px-9 py-3.5 rounded-full text-[0.78rem] font-bold uppercase tracking-wider bg-gold text-white hover:bg-[#a37e24]"
            >
              Begin BMX Registration
            </Link>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
