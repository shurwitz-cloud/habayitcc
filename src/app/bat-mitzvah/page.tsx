import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section } from '@/components/sections/Section';

export const metadata = {
  title: 'HaBayit Bloom – Bat Mitzvah Club',
  description:
    'HaBayit Bloom \u2014 a Bat Mitzvah club for 6th grade girls built on meaningful conversations, creativity, and mitzvah projects.',
};

const PILLARS = [
  { title: 'Meaningful Conversations', description: 'Honest discussion about identity, faith, and growing up.' },
  { title: 'Creativity', description: 'Hands-on, expressive projects that bring Jewish values to life.' },
  { title: 'Mitzvah Projects', description: 'Real action that connects values to the world around her.' },
];

export default function BatMitzvahPage() {
  return (
    <>
      <Header />

      <main className="flex-1">
        <Hero
          kicker="HaBayit Bloom"
          minHeight="min-h-[50vh]"
          subtitle="For 6th grade girls — meaningful conversations, creativity, and mitzvah projects."
        >
          Bat Mitzvah Club
        </Hero>

        <Section background="white" narrow>
          <p className="text-[0.72rem] tracking-[0.2em] uppercase text-gold font-bold mb-4.5">
            Full Program Details Coming Soon
          </p>
          <h2 className="text-[clamp(2rem,3.5vw,2.8rem)] text-navy font-bold mb-4.5">
            Growing into Jewish womanhood, together.
          </h2>
          <p className="font-display text-[clamp(1.35rem,2.4vw,1.9rem)] text-navy mb-9">
            HaBayit Bloom gives 6th grade girls a warm, creative space to explore Jewish identity,
            build real friendships, and discover what it means to step into this meaningful new
            chapter.
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
