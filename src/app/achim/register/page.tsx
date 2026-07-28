import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section } from '@/components/sections/Section';
import { HERO_HEIGHT } from '@/lib/hero-heights';
import { RegistrationForm } from './RegistrationForm';
import { ACHIM_NAME } from '@/lib/programs/names';

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
            <RegistrationForm />
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
