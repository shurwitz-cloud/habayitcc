import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section } from '@/components/sections/Section';
import { RegistrationForm } from './RegistrationForm';

export const metadata = {
  title: 'Hebrew School Registration – HaBayit Jewish Center',
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
          HaBayit Hebrew School
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
