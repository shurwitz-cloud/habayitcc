import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { ShabbatHomeCard } from '@/components/shabbat/ShabbatHomeCard';
import { HERO_HEIGHT } from '@/lib/hero-heights';
import { getUpcomingShabbat } from '@/lib/shabbat/hebcal';
import { Section, SectionTitle } from '@/components/sections/Section';

export const metadata = {
  title: 'Synagogue – Shabbat at HaBayit',
  description:
    "Join HaBayit for Shabbat — Friday evening L'chaim and Kabbalat Shabbat, Saturday morning Shacharit, and Mincha.",
};

export const revalidate = 3600;

const SCHEDULE = [
  {
    day: 'Friday Evenings',
    items: [
      {
        title: "L'chaim & Refreshments",
        description: 'A chance to unwind, connect, and welcome Shabbat together.',
      },
      {
        title: 'Kabbalat Shabbat',
        description: '6:30 PM — a warm and uplifting Friday night service, with a children\u2019s program.',
      },
    ],
  },
  {
    day: 'Shabbat Morning',
    items: [
      {
        title: 'Shacharit',
        description:
          '9:30 AM — traditional Shabbat morning prayer in a welcoming atmosphere, with a children\u2019s program.',
      },
      {
        title: 'Kiddush Lunch',
        description: 'Stay after services for food, friendship, and community.',
      },
      {
        title: 'Mincha & Pirkei Avot',
        description:
          '7:30 PM — afternoon service together with a study session in timeless ethical teachings.',
      },
    ],
  },
];

const EXPECTATIONS = [
  { title: 'Warm Community', description: 'Everyone is welcomed with care, respect, and genuine friendship.' },
  { title: 'Meaningful Prayer', description: 'Traditional services in an atmosphere that feels comfortable and personal.' },
  { title: 'Families', description: 'Children and families are a natural part of the HaBayit experience.' },
  { title: 'Shared Meals', description: 'Refreshments, Kiddush, and time together are part of what makes it feel like home.' },
];

export default async function SynagoguePage() {
  const shabbat = await getUpcomingShabbat();

  return (
    <>
      <Header />

      <main className="flex-1">
        <Hero
          kicker="Synagogue"
          minHeight={HERO_HEIGHT.page}
          subtitle="A welcoming place to pray, connect, celebrate, and grow together."
        >
          Shabbat &amp; Community
        </Hero>

        <Section background="white" narrow>
          <p className="text-[0.72rem] tracking-[0.2em] uppercase text-gold font-bold mb-4.5">
            Welcome Home
          </p>
          <h2 className="text-[clamp(2.1rem,3.6vw,3rem)] text-navy font-bold mb-5">
            Come as you are.
          </h2>
          <p className="font-display text-[clamp(1.35rem,2.4vw,1.9rem)] leading-snug text-navy">
            Whether you&apos;re joining us for the first time or looking for a place to pray each
            week, you&apos;ll find a warm, welcoming community where everyone feels at home.
          </p>
        </Section>

        <Section background="white">
          <SectionTitle eyebrow="Weekly Rhythm" center={false}>
            Shabbat at HaBayit
          </SectionTitle>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
            {SCHEDULE.map((block) => (
              <article key={block.day} className="bg-cream border border-line rounded-[18px] p-7">
                <h3 className="text-[1.55rem] text-navy font-bold mb-4">{block.day}</h3>
                <div className="space-y-3.5">
                  {block.items.map((item) => (
                    <div key={item.title} className="border-l-[3px] border-gold pl-4">
                      <strong className="block text-navy text-[0.98rem] mb-0.5">{item.title}</strong>
                      <span className="text-muted text-[0.88rem] leading-snug">{item.description}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
            <ShabbatHomeCard
              shabbat={shabbat}
              variant="compact"
              className="md:col-span-2 lg:col-span-1"
            />
          </div>
        </Section>

        <Section background="cream">
          <SectionTitle eyebrow="What to Expect" center={false}>
            Warm, meaningful, and easy to join.
          </SectionTitle>
          <div className="grid md:grid-cols-4 gap-6.5">
            {EXPECTATIONS.map((item) => (
              <div key={item.title} className="pt-5 border-t-2 border-gold">
                <h3 className="text-[1.55rem] text-navy font-bold mb-2">{item.title}</h3>
                <p className="text-muted text-[0.92rem]">{item.description}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section background="navy">
          <SectionTitle eyebrow="This Week" center={false}>
            <span className="text-white">Join us this Shabbat.</span>
          </SectionTitle>
          <div className="grid md:grid-cols-2 gap-5.5">
            <div className="bg-white/[0.08] border border-white/[0.18] rounded-[18px] p-7">
              <h3 className="text-[1.65rem] text-white font-bold mb-2">Friday Evening</h3>
              <p className="text-white/70">
                L&apos;chaim &amp; refreshments at 6:30 PM, followed by Kabbalat Shabbat.
              </p>
            </div>
            <div className="bg-white/[0.08] border border-white/[0.18] rounded-[18px] p-7">
              <h3 className="text-[1.65rem] text-white font-bold mb-2">Shabbat Morning</h3>
              <p className="text-white/70">Shacharit at 9:30 AM, children&apos;s program, and Kiddush lunch.</p>
            </div>
          </div>
        </Section>

        <Section background="white" narrow>
          <p className="text-[0.72rem] tracking-[0.2em] uppercase text-gold font-bold mb-4.5">
            Visit HaBayit
          </p>
          <h2 className="text-[clamp(2.1rem,3.6vw,3rem)] text-navy font-bold mb-5">
            We&apos;d love to welcome you.
          </h2>
          <p className="font-display text-[clamp(1.35rem,2.4vw,1.9rem)] text-navy mb-7">
            Have a question before you come? Reach out anytime.
          </p>
          <div className="flex justify-center gap-4 flex-wrap">
            <a
              href="tel:6464621138"
              className="bg-white border border-line rounded-full px-5.5 py-4 text-navy font-semibold hover:border-gold hover:text-gold"
            >
              Call
            </a>
            <a
              href="mailto:info@habayitcc.org"
              className="bg-white border border-line rounded-full px-5.5 py-4 text-navy font-semibold hover:border-gold hover:text-gold"
            >
              Email
            </a>
            <a
              href="/contact"
              className="bg-white border border-line rounded-full px-5.5 py-4 text-navy font-semibold hover:border-gold hover:text-gold"
            >
              Address
            </a>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
