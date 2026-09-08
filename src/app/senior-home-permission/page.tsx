import type { Metadata } from 'next';
import Image from 'next/image';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { SeniorHomePermissionForm } from './PermissionForm';

export const metadata: Metadata = {
  title: 'Senior Home Visit Permission – HaBayit',
  description:
    'Permission form for the HaBayit boys’ visit to a local senior home.',
  robots: { index: false, follow: false },
};

export default function SeniorHomePermissionPage() {
  return (
    <>
      <Header />

      <main className="flex-1 bg-[#f3f0e8]">
        <div className="mx-auto max-w-[560px] px-4 py-8 md:py-12">
          <article className="overflow-hidden rounded-[28px] border-[3px] border-[#2f5f9a] bg-[#faf7f0] shadow-[0_16px_40px_rgba(23,38,67,0.12)]">
            {/* Top of flyer only — illustrations + intro, cropped before the paper form */}
            <div className="relative w-full overflow-hidden bg-[#faf7f0] aspect-[4/3.15] sm:aspect-[4/3.05]">
              <Image
                src="/flyers/senior-home-permission.jpg"
                alt="Permission form — Visit to Senior Home"
                fill
                priority
                sizes="(max-width: 560px) 100vw, 560px"
                className="object-cover object-top"
              />
            </div>

            {/* Continues as the fill-in section */}
            <div className="border-t border-[#c5d9eb] bg-white px-5 py-7 sm:px-8 sm:py-8">
              <SeniorHomePermissionForm />
            </div>

            <div className="border-t border-[#c5d9eb] bg-[#faf7f0] px-6 py-7 text-center">
              <p className="font-display text-[1.55rem] text-[#1f4f8a]">
                Thank you for your support!
              </p>
              <div className="mx-auto mt-3 flex max-w-[220px] items-center gap-3">
                <span className="h-px flex-1 bg-[#9ec9e8]" />
                <span className="text-[#2f5f9a]" aria-hidden>
                  ♥
                </span>
                <span className="h-px flex-1 bg-[#9ec9e8]" />
              </div>
              <p className="mt-3 text-[0.78rem] font-bold uppercase tracking-[0.14em] text-[#1f4f8a]">
                Together we can bring joy!
              </p>
            </div>
          </article>
        </div>
      </main>

      <Footer />
    </>
  );
}
