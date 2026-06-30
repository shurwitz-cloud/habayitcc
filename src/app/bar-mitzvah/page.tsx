import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section, SectionTitle } from '@/components/sections/Section';

export const metadata = {
  title: 'HaBayit BMX – Bar Mitzvah Experience',
  description:
    'HaBayit BMX \u2014 a Bar Mitzvah experience for 7th grade boys built on Jewish pride, mitzvah projects, and meaningful discussion.',
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
          minHeight="min-h-[50vh]"
          subtitle="For 7th grade boys — Jewish pride, mitzvah projects, and meaningful discussion."
        >
          Bar Mitzvah Experience
        </Hero>

        <Section background="white" narrow>
          <p className="text-[0.72rem] tracking-[0.2em] uppercase text-gold font-bold mb-4.5">
            Full Program Details Coming Soon
          </p>
          <h2 className="text-[clamp(2rem,3.5vw,2.8rem)] text-navy font-bold mb-4.5">
            Building Jewish men, one conversation at a time.
          </h2>
          <p className="font-display text-[clamp(1.35rem,2.4vw,1.9rem)] text-navy mb-9">
            HaBayit BMX gives 7th grade boys a space to explore what it means to become a Jewish
            adult — through real conversation, hands-on mitzvah projects, and genuine pride in who
            they are.
          </p>
          <div className="grid md:grid-cols-3 gap-6.5 text-left">
            {PILLARS.map((pillar) => (
              <div key={pillar.title} className="bg-soft border border-line rounded-[18px] p-8">
                <h3 className="text-[1.3rem] text-navy font-bold mb-2.5">{pillar.title}</h3>
                <p className="text-muted text-[0.9rem]">{pillar.description}</p>
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
