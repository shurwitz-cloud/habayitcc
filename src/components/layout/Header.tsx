'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { ACHIM_NAME, ACHIM_PATH, BLOOM_NAME, BLOOM_PATH, BMX_NAME, BMX_PATH, HEBREW_ADVENTURE_NAME, HEBREW_ADVENTURE_PATH } from '@/lib/programs/names';

const PROGRAMS_LINKS = [
  { href: HEBREW_ADVENTURE_PATH, label: HEBREW_ADVENTURE_NAME },
  { href: ACHIM_PATH, label: ACHIM_NAME },
  { href: BMX_PATH, label: BMX_NAME },
  { href: BLOOM_PATH, label: BLOOM_NAME },
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
            width={66}
            height={58}
            className="h-[58px] w-auto"
          />
          <div className="flex flex-col items-center text-center leading-[1.1]">
            <span className="heb text-[1.36rem] font-bold text-navy">הבית</span>
            <span className="text-[0.64rem] tracking-[0.16em] uppercase text-gold font-bold">
              Israeli
            </span>
            <span className="text-[0.64rem] tracking-[0.16em] uppercase text-navy font-bold whitespace-nowrap">
              Jewish Center
            </span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-[30px] pt-1.5 text-[0.78rem] uppercase tracking-wider text-navy font-semibold">
          <Link href="/" className="hover:text-gold">
            Home
          </Link>
          <Link href="/about" className="hover:text-gold">
            About
          </Link>
          <NavDropdown label="Programs" links={PROGRAMS_LINKS} href="/#programs" />
          <Link href="/synagogue" className="hover:text-gold">
            Synagogue
          </Link>
          <Link href="/events" className="hover:text-gold">
            Events
          </Link>
          <Link href="/contact" className="hover:text-gold">
            Contact
          </Link>
          <div className="relative">
            <span
              className="heb absolute -top-4 right-0 text-[0.92rem] font-bold text-gold leading-none normal-case tracking-normal"
              aria-hidden="true"
            >
              ב״ה
            </span>
            <NavDropdown label="Donate" links={DONATE_LINKS} href="/donate" />
          </div>
        </nav>

        <div className="md:hidden inline-flex flex-col items-center gap-0.5 pt-1.5">
          <span
            className="heb text-[0.92rem] font-bold text-gold leading-none text-center"
            aria-hidden="true"
          >
            ב״ה
          </span>
          <button
            className="flex flex-col items-center gap-1.5 p-1.5"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
          >
            <span className="block w-6 h-0.5 bg-navy" />
            <span className="block w-6 h-0.5 bg-navy" />
            <span className="block w-6 h-0.5 bg-navy" />
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="md:hidden fixed top-[88px] left-0 right-0 bottom-0 bg-[#f7f3ea] z-40 flex flex-col px-[6%] py-2 overflow-y-auto">
          <Link href="/" className="py-4 border-b border-line font-semibold text-navy">
            Home
          </Link>
          <Link href="/about" className="py-4 border-b border-line font-semibold text-navy">
            About
          </Link>
          <div className="flex items-center border-b border-line">
            <Link
              href="/#programs"
              className="flex-1 py-4 font-semibold text-navy"
              onClick={() => setMobileOpen(false)}
            >
              Programs
            </Link>
            <button
              type="button"
              className="px-4 py-4 text-navy"
              onClick={() => setMobileProgramsOpen(!mobileProgramsOpen)}
              aria-label="Toggle programs menu"
              aria-expanded={mobileProgramsOpen}
            >
              &#9662;
            </button>
          </div>
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
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {href ? (
        <Link href={href} className="flex items-center gap-1.5 hover:text-gold">
          {label}
          <DropdownArrow open={open} />
        </Link>
      ) : (
        <button
          type="button"
          className="flex items-center gap-1.5 hover:text-gold bg-transparent uppercase tracking-wider text-[0.78rem] font-semibold text-navy"
        >
          {label}
          <DropdownArrow open={open} />
        </button>
      )}
      <div
        className={`absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50 transition-opacity duration-150 ${
          open ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
        }`}
      >
        <div className="bg-white border border-line rounded-xl p-2 min-w-[220px] shadow-xl">
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
    </div>
  );
}

function DropdownArrow({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 8"
      fill="none"
      className={`w-2.5 h-2.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
    >
      <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
