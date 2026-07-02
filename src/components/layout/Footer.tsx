import Link from 'next/link';
import Image from 'next/image';
import { HEBREW_ADVENTURE_NAME, HEBREW_ADVENTURE_PATH } from '@/lib/programs/names';

const EXPLORE_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/synagogue', label: 'Synagogue' },
  { href: '/events', label: 'Events' },
  { href: '/gallery', label: 'Gallery' },
];

const PROGRAM_LINKS = [
  { href: HEBREW_ADVENTURE_PATH, label: HEBREW_ADVENTURE_NAME },
  { href: '/bar-mitzvah', label: 'Bar Mitzvah' },
  { href: '/bat-mitzvah', label: 'Bat Mitzvah' },
];

export function Footer() {
  return (
    <footer className="bg-navy-deep text-white/70 px-[5.5vw] py-14 mt-auto">
      <div className="max-w-[1180px] mx-auto grid grid-cols-1 md:grid-cols-[1.7fr_1fr_1fr_1.3fr] gap-11 pb-12 border-b border-white/10 mb-8">
        <div>
          <Image
            src="/logos/habayit-logo-white.png"
            alt="HaBayit"
            width={84}
            height={84}
            className="w-[84px] mb-4"
          />
          <p className="mt-4 max-w-[260px] text-[0.88rem]">
            A warm Jewish home in Cooper City with an Israeli spirit.
          </p>
        </div>

        <FooterColumn title="Explore" links={EXPLORE_LINKS} />
        <FooterColumn title="Programs" links={PROGRAM_LINKS} />

        <div>
          <h4 className="text-gold-light text-[0.7rem] uppercase tracking-[0.18em] mb-4 font-semibold">
            Contact
          </h4>
          <a href="tel:6464621138" className="block mb-2.5 text-[0.88rem] hover:text-gold-light">
            (646) 462-1138
          </a>
          <a
            href="mailto:info@habayitcc.org"
            className="block mb-2.5 text-[0.88rem] hover:text-gold-light"
          >
            info@habayitcc.org
          </a>
          <Link href="/contact" className="block mb-2.5 text-[0.88rem] hover:text-gold-light">
            Cooper City, FL
          </Link>
        </div>
      </div>

      <div className="max-w-[1180px] mx-auto flex flex-wrap justify-between gap-2.5 text-[0.78rem] text-white/40">
        <span>2026 HaBayit Jewish Center</span>
        <span>501(c)(3) Nonprofit Organization</span>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <h4 className="text-gold-light text-[0.7rem] uppercase tracking-[0.18em] mb-4 font-semibold">
        {title}
      </h4>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="block mb-2.5 text-[0.88rem] hover:text-gold-light"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
