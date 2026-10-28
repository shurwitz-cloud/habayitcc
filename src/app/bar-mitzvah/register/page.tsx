import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section } from '@/components/sections/Section';
import { HERO_HEIGHT } from '@/lib/hero-heights';
import { RegistrationForm } from './RegistrationForm';
import { BMX_FLYER, BMX_NAME } from '@/lib/programs/names';

export const metadata = {
  title: `${BMX_NAME} Registration – HaBayit Jewish Center`,
};

export default function BmxRegisterPage() {
  return (
    <>
      <Header />

      <main className="flex-1">
        <Hero
          kicker="Registration"
          minHeight={HERO_HEIGHT.page}
          subtitle="We're excited to welcome your son to the Bar Mitzvah Experience. Registration takes just a few minutes."
        >
          {BMX_NAME}
        </Hero>

        <Section background="cream">
          <div className="max-w-[900px] mx-auto">
            <div className="mb-8 max-w-[420px] mx-auto rounded-[18px] overflow-hidden border border-line shadow-sm bg-black">
              <img
                src={BMX_FLYER}
                alt={`${BMX_NAME} flyer`}
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
