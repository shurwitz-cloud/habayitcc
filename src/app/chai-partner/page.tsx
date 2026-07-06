import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { ChaiPartnerHero } from './ChaiPartnerHero';
import { ChaiPartnerCheckout } from './ChaiPartnerForm';

export default function ChaiPartnerPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <ChaiPartnerHero />
        <Section background="white">
          <ChaiPartnerCheckout />
        </Section>
      </main>
      <Footer />
    </>
  );
}
