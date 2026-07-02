import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section, SectionTitle } from '@/components/sections/Section';
import { HEBREW_ADVENTURE_NAME, HEBREW_ADVENTURE_REGISTER_PATH } from '@/lib/programs/names';

export const metadata = {
  title: `${HEBREW_ADVENTURE_NAME} – HaBayit Jewish Center`,
  description:
    `Joyful Jewish education for children. ${HEBREW_ADVENTURE_NAME} builds Hebrew literacy, holiday knowledge, and lifelong Jewish identity.`,
};

const PILLARS = [
  { title: 'Hebrew Reading', description: "Step-by-step Hebrew literacy at every child's own pace." },
  { title: 'Holidays & Values', description: 'Hands-on learning about the Jewish calendar and its meaning.' },
  { title: 'Community & Friendship', description: 'A nurturing space where every child feels they belong.' },
];

export default function HebrewSchoolPage() {
  return (
    <>
      <Header />

      <main className="flex-1">
        <Hero kicker="Programs" minHeight="min-h-[56vh]" subtitle="Joyful Jewish learning where children build skills, confidence, and identity.">
          {HEBREW_ADVENTURE_NAME}
        </Hero>

        <Section background="white">
          <div className="grid md:grid-cols-[.9fr_1.1fr] gap-15 items-center">
            <div>
              <p className="text-[0.72rem] tracking-[0.2em] uppercase text-gold font-bold mb-4.5">
                About the Program
              </p>
              <h2 className="text-[clamp(2rem,3.5vw,2.8rem)] leading-tight text-navy font-bold">
                A place to learn, belong, and grow.
              </h2>
              <p className="mt-4 text-muted text-[1.02rem]">
                {HEBREW_ADVENTURE_NAME} offers children a meaningful, age-appropriate Jewish
                education in a warm and supportive environment — Hebrew reading, holidays and
                values, and genuine friendship, taught by caring, experienced educators.
              </p>
              <div className="mt-6 inline-flex items-center gap-2.5 font-semibold text-navy">
                📅 Classes meet every Sunday, 10:00 AM – 12:00 PM.
              </div>
            </div>
            <div
              className="relative min-h-[340px] rounded-[18px] overflow-hidden"
              style={{ background: 'linear-gradient(135deg,#d8c9a8,#8aa0b0)' }}
            >
              <span className="absolute inset-0 grid place-items-center text-white/85 text-[0.72rem] tracking-[0.2em] uppercase font-bold">
                Photography Coming Soon
              </span>
            </div>
          </div>
        </Section>

        <Section background="cream">
          <SectionTitle eyebrow="What Children Experience">Three Pillars of Our Program</SectionTitle>
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
          <SectionTitle eyebrow="Tuition">Investing in Jewish Education</SectionTitle>
          <div className="grid md:grid-cols-2 gap-6.5">
            <div className="bg-soft border border-line rounded-[18px] p-8.5">
              <h3 className="text-[1.25rem] text-navy font-bold">Standard Tuition</h3>
              <div className="text-[2.6rem] font-extrabold text-navy mt-3.5 mb-1">
                $1,100<span className="text-[0.95rem] text-muted font-medium"> / year</span>
              </div>
              <ul className="mt-4 space-y-2">
                <li className="text-[0.88rem] text-muted pl-5 relative before:content-['✓'] before:absolute before:left-0 before:text-gold before:font-bold">
                  Full school year of classes
                </li>
                <li className="text-[0.88rem] text-muted pl-5 relative before:content-['✓'] before:absolute before:left-0 before:text-gold before:font-bold">
                  Materials &amp; supplies included
                </li>
              </ul>
            </div>
            <div className="bg-soft border border-gold rounded-[18px] p-8.5 relative">
              <span className="absolute -top-3 left-7 bg-gold text-white text-[0.62rem] font-bold tracking-wider px-3.5 py-1 rounded-full">
                CHAI PARTNER RATE
              </span>
              <h3 className="text-[1.25rem] text-navy font-bold">Chai Partner Tuition</h3>
              <div className="text-[2.6rem] font-extrabold text-navy mt-3.5 mb-1">
                $1,000<span className="text-[0.95rem] text-muted font-medium"> / year</span>
              </div>
              <ul className="mt-4 space-y-2">
                <li className="text-[0.88rem] text-muted pl-5 relative before:content-['✓'] before:absolute before:left-0 before:text-gold before:font-bold">
                  Full school year of classes
                </li>
                <li className="text-[0.88rem] text-muted pl-5 relative before:content-['✓'] before:absolute before:left-0 before:text-gold before:font-bold">
                  Materials &amp; supplies included
                </li>
              </ul>
            </div>
          </div>
          <div className="bg-cream border-l-[3px] border-gold rounded-r-[12px] p-4.5 mt-6 text-[0.88rem] text-muted">
            Sibling discount: 2nd child receives $50 off, 3rd and additional children receive $75
            off each.
          </div>
        </Section>

        <Section background="navy">
          <div className="text-center">
            <h2 className="text-[clamp(2.1rem,4vw,3.4rem)] font-bold">Ready to register?</h2>
            <p className="mt-2.5 text-white/70">Registration takes just a few minutes.</p>
            <Link
              href={HEBREW_ADVENTURE_REGISTER_PATH}
              className="inline-block mt-7 px-9 py-3.5 rounded-full text-[0.78rem] font-bold uppercase tracking-wider bg-gold text-white hover:bg-[#a37e24]"
            >
              Begin Registration
            </Link>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
