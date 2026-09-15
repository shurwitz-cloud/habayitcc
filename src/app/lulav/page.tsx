import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { LulavOrderForm } from './LulavOrderForm';
import { LULAV_SET_PRICE } from '@/lib/lulav/pricing';

export const metadata: Metadata = {
  title: 'Lulav & Etrog Orders – HaBayit',
  description: `Order Lulav & Etrog sets from HaBayit — $${LULAV_SET_PRICE} per set.`,
};

export default function LulavOrderPage() {
  return (
    <>
      <Header />

      <main className="flex-1">
        <div className="bg-navy text-white pt-16 pb-14 px-6 text-center">
          <p className="text-[0.72rem] tracking-[0.2em] uppercase text-gold font-bold mb-3">
            Sukkot
          </p>
          <h1 className="font-display text-[clamp(2.4rem,5vw,3.6rem)] font-bold leading-tight">
            Lulav &amp; Etrog Sets
          </h1>
          <p className="mt-4 text-white/75 text-[1.05rem] max-w-xl mx-auto leading-relaxed">
            Order your set for Sukkot — ${LULAV_SET_PRICE} each. Pay by card or Zelle.
          </p>
        </div>

        <Section background="soft">
          <div className="mx-auto max-w-[560px]">
            <div className="rounded-[22px] border border-line bg-white p-8 shadow-sm md:p-10">
              <h2 className="font-display text-[1.75rem] text-navy">Place your order</h2>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">
                Choose how many sets you need. Credit card includes a 3% processing fee; Zelle has
                no fee (order confirmed after payment is received).
              </p>
              <div className="mt-7">
                <LulavOrderForm />
              </div>
            </div>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
