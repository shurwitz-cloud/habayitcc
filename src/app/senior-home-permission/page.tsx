import type { Metadata } from 'next';
import Image from 'next/image';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/sections/Section';
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

      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-br from-[#e8f4fb] via-[#f7f3ea] to-[#fff6d8]">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-16 top-10 h-40 w-40 rounded-full bg-[#ffe566]/50 blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 bottom-0 h-48 w-48 rounded-full bg-[#9fd0ea]/40 blur-2xl"
          />

          <div className="relative mx-auto grid max-w-6xl gap-10 px-[5.5vw] py-12 md:grid-cols-[1.05fr_0.95fr] md:items-center md:py-16">
            <div>
              <p className="heb text-[0.95rem] text-navy/70">בס״ד</p>
              <p className="mt-3 text-[0.78rem] font-bold uppercase tracking-[0.18em] text-gold">
                Permission Form
              </p>
              <h1 className="mt-3 font-display text-[2.6rem] leading-[1.05] text-navy md:text-[3.4rem]">
                Visit to Senior Home
              </h1>
              <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-ink/80">
                We are planning a special visit to a local senior home, where the boys
                will have the opportunity to visit and bring joy to the elderly.
              </p>
              <p className="mt-4 max-w-xl text-[1.02rem] leading-relaxed text-ink/75">
                Transportation to and from the senior home will be provided by designated
                adult driver(s). Please complete the form below to allow your child to
                participate.
              </p>
              <p className="mt-6 text-[0.95rem] font-semibold text-navy">
                Small actions make a big difference.
              </p>
            </div>

            <div className="justify-self-center md:justify-self-end">
              <div className="overflow-hidden rounded-[28px] border border-[#9ec9e8] bg-white shadow-[0_18px_40px_rgba(23,38,67,0.12)]">
                <Image
                  src="/flyers/senior-home-permission.jpg"
                  alt="Permission form flyer for the senior home visit"
                  width={900}
                  height={1200}
                  className="h-auto w-full max-w-[420px] object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        <Section background="soft">
          <div className="mx-auto max-w-[560px]">
            <div className="rounded-[22px] border border-[#9ec9e8] bg-white p-8 shadow-[0_10px_30px_rgba(23,38,67,0.06)] md:p-10">
              <h2 className="font-display text-[1.85rem] text-navy">Give Permission</h2>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">
                Enter your child’s name, your name and email, and confirm permission
                below.
              </p>
              <div className="mt-7">
                <SeniorHomePermissionForm />
              </div>
            </div>

            <p className="mt-8 text-center font-display text-[1.45rem] text-navy">
              Thank you for your support!
            </p>
            <p className="mt-1 text-center text-[0.78rem] font-bold uppercase tracking-[0.16em] text-gold">
              Together we can bring joy
            </p>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
