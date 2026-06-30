import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section, SectionTitle } from '@/components/sections/Section';

export const metadata = {
  title: 'About HaBayit – Jewish Center, Cooper City',
  description:
    'HaBayit was founded by Rabbi Shmuly and Devora Hurwitz to create a warm Jewish home where every individual and family feels welcome.',
};

const VALUES = [
  { title: 'Belonging', description: 'Every Jew is welcomed with warmth and respect.' },
  { title: 'Joy', description: 'Jewish life should be meaningful, alive, and full of joy.' },
  { title: 'Family', description: 'Children, parents, and grandparents all have a place here.' },
  { title: 'Connection', description: 'Community is built through real relationships.' },
];

export default function AboutPage() {
  return (
    <>
      <Header />

      <main className="flex-1">
        <Hero kicker="About HaBayit" minHeight="min-h-[50vh]" subtitle="HaBayit was created to help every Jew feel welcome, connected, and at home.">
          A Jewish home built with heart.
        </Hero>

        <Section background="white">
          <div className="grid md:grid-cols-[.85fr_1.15fr] gap-16 items-center">
            <div>
              <p className="text-[0.72rem] tracking-[0.2em] uppercase text-gold font-bold mb-4.5">
                Our Mission
              </p>
              <h2 className="text-[clamp(2.1rem,3.6vw,3rem)] leading-tight text-navy font-bold">
                Every Jew deserves a place to feel at home.
              </h2>
              <p className="mt-4.5 text-muted text-[1.05rem]">
                At HaBayit, Jewish life is celebrated with warmth, meaningful learning, genuine
                friendships, and a deep sense of belonging.
              </p>
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

        <Section background="cream" narrow>
          <p className="font-display text-[clamp(1.4rem,2.6vw,2.1rem)] leading-relaxed text-navy max-w-[860px] mx-auto">
            Inspired by the Lubavitcher Rebbe&apos;s call to reach every Jew with{' '}
            <span className="text-gold italic">love, warmth, and meaningful Jewish life</span>,
            HaBayit welcomes Jews of every background and level of observance while embracing the
            unique spirit of the Israeli community.
          </p>
        </Section>

        <Section background="white">
          <div className="grid md:grid-cols-[1fr_1.05fr] gap-16 items-start">
            <div>
              <div
                className="relative min-h-[400px] md:min-h-[520px] rounded-[18px] overflow-hidden"
                style={{ background: 'linear-gradient(135deg,#d8c9a8,#8aa0b0)' }}
              >
                <span className="absolute inset-0 grid place-items-center text-white/85 text-[0.72rem] tracking-[0.2em] uppercase font-bold">
                  Photography Coming Soon
                </span>
              </div>
              <p className="text-center mt-3.5 text-[0.82rem] text-muted">
                Family photo coming soon
              </p>
            </div>
            <div className="bg-soft border-l-4 border-gold rounded-r-[18px] p-9 md:p-11">
              <p className="text-[0.72rem] tracking-[0.2em] uppercase text-gold font-bold mb-4.5">
                The Founders
              </p>
              <h2 className="text-[clamp(1.8rem,3vw,2.4rem)] text-navy font-bold mb-4.5">
                Rabbi Shmuly &amp; Devora Hurwitz
              </h2>
              <div className="space-y-4.5 text-muted">
                <p>
                  HaBayit was founded by Rabbi Shmuly and Devora Hurwitz with a simple vision: to
                  create a warm Jewish home where every individual and family feels welcome,
                  connected, and inspired.
                </p>
                <p>
                  Rabbi Shmuly grew up in Brooklyn, New York, and studied in leading yeshivot in
                  Brooklyn before serving in outreach yeshivot in Frankfurt, Germany, and Sydney,
                  Australia. He later continued his studies at the Central Lubavitch Yeshiva (770)
                  in Crown Heights, where he received his rabbinic ordination.
                </p>
                <p>
                  In addition to his community work, Rabbi Shmuly is the Senior Editor of JEM&apos;s
                  weekly Living Torah film series, bringing the Rebbe&apos;s teachings and
                  inspiration to audiences around the world.
                </p>
                <p>
                  Devora grew up in Melbourne, Australia, and is a Board Certified Behavior
                  Analyst (BCBA). She combines her professional expertise with a passion for Jewish
                  education, helping create meaningful programs and personal connections for
                  children, teens, women, and families.
                </p>
                <p>
                  Together with their children, Rabbi Shmuly and Devora have opened their home and
                  hearts to the community through Shabbat meals, holiday celebrations, educational
                  programs, youth activities, and genuine personal relationships.
                </p>
              </div>
            </div>
          </div>
        </Section>

        <Section background="soft">
          <SectionTitle eyebrow="">What HaBayit Stands For</SectionTitle>
          <div className="grid md:grid-cols-4 gap-px bg-line border border-line rounded-[18px] overflow-hidden">
            {VALUES.map((value) => (
              <div key={value.title} className="bg-white p-8 min-h-[175px]">
                <h3 className="text-[1.45rem] text-navy font-bold mb-2">{value.title}</h3>
                <p className="text-muted text-[0.92rem]">{value.description}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section background="navy">
          <div className="text-center">
            <h2 className="text-[clamp(2.1rem,4vw,3.6rem)] font-bold">
              We&apos;d love to welcome you.
            </h2>
            <p className="mt-2.5 text-white/70">
              Join us for Shabbat, explore a program, or reach out to learn more.
            </p>
            <div className="flex justify-center gap-3.5 flex-wrap mt-7">
              <Link
                href="/hebrew-school"
                className="px-9 py-3.5 rounded-full text-[0.78rem] font-bold uppercase tracking-wider bg-gold text-white hover:bg-[#a37e24]"
              >
                Explore Programs
              </Link>
              <Link
                href="/contact"
                className="px-9 py-3.5 rounded-full text-[0.78rem] font-bold uppercase tracking-wider border-[1.5px] border-white/50 text-white hover:bg-white hover:text-navy"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
