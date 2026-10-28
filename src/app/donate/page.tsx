import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { DonateCheckout } from './DonateCheckout';
import { DonateHero } from './DonateHero';

export default function DonatePage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <DonateHero />
        <Section background="white">
          <DonateCheckout />
        </Section>
      </main>
      <Footer />
    </>
  );
}
