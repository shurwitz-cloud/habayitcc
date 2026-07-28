import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section } from '@/components/sections/Section';
import { HERO_HEIGHT } from '@/lib/hero-heights';
import { getSiteImages } from '@/lib/site-images/store';
import { primaryImageFromSlot } from '@/lib/site-images/slot-utils';
import { ProgramPanel } from './ProgramPanel';

export const metadata = {
  title: 'Bar & Bat Mitzvah at HaBayit',
  description:
    'A meaningful journey toward Jewish adulthood. Explore HaBayit\u2019s Bar Mitzvah Experience and Bat Mitzvah Club.',
};

export default async function BarBatMitzvahPage() {
  const images = await getSiteImages();
  const barPhoto = primaryImageFromSlot(images['bar-bat-mitzvah.bar']);
  const batPhoto = primaryImageFromSlot(images['bar-bat-mitzvah.bat']);

  return (
    <>
      <Header />

      <main className="flex-1">
        <Hero
          kicker="Programs"
          minHeight={HERO_HEIGHT.page}
          subtitle="A meaningful journey toward Jewish adulthood."
        >
          Bar &amp; Bat Mitzvah at HaBayit
        </Hero>

        <Section background="white" narrow className="!pb-0">
          <p className="font-display text-[clamp(1.35rem,2.4vw,1.9rem)] text-navy">
            Two paths, each designed around what matters most at this age — pride, connection, and
            meaning.
          </p>
        </Section>

        <Section background="white">
          <div className="grid md:grid-cols-2 gap-6">
            <ProgramPanel
              href="/bar-mitzvah"
              gradient="linear-gradient(rgba(23,38,67,.55),rgba(23,38,67,.7)), linear-gradient(135deg,#5d7186,#b6a47c)"
              program="HaBayit BMX"
              title="Bar Mitzvah Experience"
              age="For 7th grade boys"
              focus="Jewish pride · Mitzvah projects · Meaningful discussion"
              photo={barPhoto}
            />
            <ProgramPanel
              href="/bloom"
              gradient="linear-gradient(rgba(23,38,67,.5),rgba(23,38,67,.68)), linear-gradient(135deg,#c79bab,#d9c08f)"
              program="HaBayit Bloom"
              title="Bat Mitzvah Club"
              age="For 6th grade girls"
              focus="Meaningful conversations · Creativity · Mitzvah projects"
              photo={batPhoto}
            />
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
