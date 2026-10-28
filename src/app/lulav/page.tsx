import type { Metadata } from 'next';
import Image from 'next/image';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
import { LulavOrderForm } from './LulavOrderForm';
import { LULAV_SET_PRICE } from '@/lib/lulav/pricing';
import { getLulavRemainingInventory } from '@/lib/lulav/inventory';

export const dynamic = 'force-dynamic';

const title = 'Lulav & Etrog Sets for Sukkot';
const description = `Order an Arba Minim set for Sukkot. $${LULAV_SET_PRICE} per set.`;
const socialImage = '/lulav-etrog-social.png';
const pageImage = '/lulav-etrog-reference.png';

export const metadata: Metadata = {
  title: `${title} – HaBayit`,
  description,
  alternates: { canonical: '/lulav' },
  openGraph: {
    title,
    description,
    url: '/lulav',
    type: 'website',
    images: [{ url: socialImage, width: 1024, height: 576, alt: 'Lulav and Etrog' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [socialImage],
  },
};

export default async function LulavOrderPage() {
  const remaining = await getLulavRemainingInventory();

  return (
    <>
      <Header />

      <main className="flex-1">
        <Section background="soft">
          <div className="mx-auto max-w-[900px]">
            <div className="mb-8 text-center">
              <p className="mb-3 text-[0.72rem] font-bold uppercase tracking-[0.2em] text-gold">
                Sukkot
              </p>
              <h1 className="font-display text-[clamp(2.4rem,5vw,3.6rem)] font-bold leading-tight text-navy">
                Lulav &amp; Etrog
              </h1>
            </div>
            <div className="grid items-start gap-8 md:grid-cols-[260px_minmax(0,560px)] lg:gap-12">
              <div className="flex justify-center">
                <Image
                  src={pageImage}
                  alt="Traditional Lulav, hadassim, aravot, and Etrog"
                  width={344}
                  height={512}
                  priority
                  className="h-[260px] w-auto object-contain md:h-[460px]"
                />
              </div>
              <div className="rounded-[22px] border border-line bg-white p-8 shadow-sm md:p-10">
                <h2 className="font-display text-[1.75rem] text-navy">
                  Order Your Arba Minim Set
                </h2>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">$50 per set</p>
                <div className="mt-6">
                  <LulavOrderForm initialRemaining={remaining} />
                </div>
              </div>
            </div>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
