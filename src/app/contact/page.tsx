import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Section } from '@/components/sections/Section';
import { ContactForm } from './ContactForm';

export const metadata = {
  title: 'Contact – HaBayit Jewish Center',
  description: 'Get in touch with HaBayit Jewish Center in Cooper City, FL.',
};

export default function ContactPage() {
  return (
    <>
      <Header />

      <main className="flex-1">
        <Hero
          kicker="Get In Touch"
          minHeight="min-h-[42vh]"
          subtitle="Questions, RSVPs, or just want to say hello — reach out anytime."
        >
          We&apos;d Love to Hear From You
        </Hero>

        <Section background="white">
          <div className="grid md:grid-cols-2 gap-15">
            <div className="space-y-6.5">
              <ContactItem label="Address">
                3007 Bogota Ave
                <br />
                Cooper City, FL 33026
              </ContactItem>
              <ContactItem label="Phone">
                <a href="tel:6464621138">(646) 462-1138</a>
              </ContactItem>
              <ContactItem label="Email">
                <a href="mailto:info@habayitcc.org">info@habayitcc.org</a>
              </ContactItem>
            </div>

            <ContactForm />
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}

function ContactItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="w-[42px] h-[42px] rounded-full bg-navy flex items-center justify-center flex-shrink-0 text-white">
        •
      </div>
      <div>
        <strong className="block text-[0.74rem] font-bold uppercase tracking-wider text-gold mb-1">
          {label}
        </strong>
        <span className="text-[0.98rem]">{children}</span>
      </div>
    </div>
  );
}
