import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section } from '@/components/sections/Section';
import { HERO_HEIGHT } from '@/lib/hero-heights';
import { RegistrationForm } from './RegistrationForm';
import { ACHIM_FLYER, ACHIM_NAME } from '@/lib/programs/names';

export const metadata = {
  title: `${ACHIM_NAME} Registration – HaBayit Jewish Center`,
};

export default function AchimRegisterPage() {
  return (
    <>
      <Header />

      <main className="flex-1">
        <Hero
          kicker="Registration"
          minHeight={HERO_HEIGHT.page}
          subtitle="We're excited to welcome your family. Registration takes just a few minutes."
        >
          {ACHIM_NAME}
        </Hero>

        <Section background="cream">
          <div className="max-w-[900px] mx-auto">
            <div className="mb-8 max-w-[420px] mx-auto rounded-[18px] overflow-hidden border border-line shadow-sm bg-black">
              <img
                src={ACHIM_FLYER}
                alt={`${ACHIM_NAME} flyer`}
                className="w-full h-auto block"
              />
            </div>
            <RegistrationForm />
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
