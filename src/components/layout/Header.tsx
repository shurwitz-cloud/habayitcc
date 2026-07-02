'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { HEBREW_ADVENTURE_NAME, HEBREW_ADVENTURE_PATH } from '@/lib/programs/names';

const PROGRAMS_LINKS = [
  { href: HEBREW_ADVENTURE_PATH, label: HEBREW_ADVENTURE_NAME },
  { href: '/bar-bat-mitzvah', label: 'Bar & Bat Mitzvah' },
];

const DONATE_LINKS = [
  { href: '/donate', label: 'Make a Donation' },
  { href: '/chai-partner', label: 'Become a Chai Partner' },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileProgramsOpen, setMobileProgramsOpen] = useState(false);
  const [mobileDonateOpen, setMobileDonateOpen] = useState(false);

  return (
    <>
      <header className="h-[88px] bg-[#f7f3ea]/95 backdrop-blur-md border-b border-line sticky top-0 z-50 flex items-center justify-between px-[5.5vw]">
        <Link href="/" className="flex items-center gap-3.5">
          <Image
            src="/logos/habayit-logo-blue.png"
            alt="HaBayit logo"
            width={58}
            height={58}
            className="h-[58px] w-auto"
          />
          <div className="flex flex-col leading-tight">
            <span className="heb text-[1.45rem] font-bold text-navy">הבית</span>
            <span className="text-[0.68rem] tracking-[0.2em] uppercase text-gold font-bold">
              Jewish Center
            </span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-[30px] text-[0.78rem] uppercase tracking-wider text-navy font-semibold">
          <Link href="/" className="hover:text-gold">
            Home
          </Link>
          <Link href="/about" className="hover:text-gold">
            About
          </Link>
          <NavDropdown label="Programs" links={PROGRAMS_LINKS} />
          <Link href="/synagogue" className="hover:text-gold">
            Synagogue
          </Link>
          <Link href="/events" className="hover:text-gold">
            Events
          </Link>
          <Link href="/contact" className="hover:text-gold">
            Contact
          </Link>
          <NavDropdown label="Donate" links={DONATE_LINKS} href="/donate" />
        </nav>

        <button
          className="md:hidden flex flex-col gap-1.5 p-1.5"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          <span className="block w-6 h-0.5 bg-navy" />
          <span className="block w-6 h-0.5 bg-navy" />
          <span className="block w-6 h-0.5 bg-navy" />
        </button>
      </header>

      {mobileOpen && (
        <div className="md:hidden fixed top-[88px] left-0 right-0 bottom-0 bg-[#f7f3ea] z-40 flex flex-col px-[6%] py-2 overflow-y-auto">
          <Link href="/" className="py-4 border-b border-line font-semibold text-navy">
            Home
          </Link>
          <Link href="/about" className="py-4 border-b border-line font-semibold text-navy">
            About
          </Link>
          <button
            className="py-4 border-b border-line font-semibold text-navy text-left"
            onClick={() => setMobileProgramsOpen(!mobileProgramsOpen)}
          >
            Programs &#9662;
          </button>
          {mobileProgramsOpen && (
            <div className="pl-4">
              {PROGRAMS_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="block py-3 text-muted">
                  {link.label}
                </Link>
              ))}
            </div>
          )}
          <Link href="/synagogue" className="py-4 border-b border-line font-semibold text-navy">
            Synagogue
          </Link>
          <Link href="/events" className="py-4 border-b border-line font-semibold text-navy">
            Events
          </Link>
          <Link href="/contact" className="py-4 border-b border-line font-semibold text-navy">
            Contact
          </Link>
          <button
            className="py-4 border-b border-line font-semibold text-navy text-left"
            onClick={() => setMobileDonateOpen(!mobileDonateOpen)}
          >
            Donate &#9662;
          </button>
          {mobileDonateOpen && (
            <div className="pl-4">
              {DONATE_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="block py-3 text-muted">
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function NavDropdown({
  label,
  links,
  href,
}: {
  label: string;
  links: { href: string; label: string }[];
  href?: string;
}) {
  return (
    <div className="relative group">
      {href ? (
        <Link href={href} className="flex items-center gap-1.5 hover:text-gold">
          {label}
          <DropdownArrow />
        </Link>
      ) : (
        <button className="flex items-center gap-1.5 hover:text-gold bg-transparent uppercase tracking-wider">
          {label}
          <DropdownArrow />
        </button>
      )}
      <div className="absolute top-full left-1/2 -translate-x-1/2 translate-y-1.5 bg-white border border-line rounded-xl p-2 min-w-[200px] shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all mt-3.5 z-50">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block px-4 py-2.5 text-[0.76rem] font-semibold normal-case tracking-normal text-navy rounded-lg hover:bg-soft hover:text-gold whitespace-nowrap"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function DropdownArrow() {
  return (
    <svg viewBox="0 0 12 8" fill="none" className="w-2.5 h-2.5 transition-transform group-hover:rotate-180">
      <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
