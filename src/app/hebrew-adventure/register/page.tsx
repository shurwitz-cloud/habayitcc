import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section } from '@/components/sections/Section';
import { RegistrationForm } from './RegistrationForm';
import { HEBREW_ADVENTURE_NAME } from '@/lib/programs/names';

export const metadata = {
  title: `${HEBREW_ADVENTURE_NAME} Registration – HaBayit Jewish Center`,
};

export default function HebrewSchoolRegisterPage() {
  return (
    <>
      <Header />

      <main className="flex-1">
        <Hero
          kicker="Registration"
          minHeight="min-h-[40vh]"
          subtitle="We're excited to welcome your family. Registration takes just a few minutes."
        >
          {HEBREW_ADVENTURE_NAME}
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
