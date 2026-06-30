import Link from 'next/link';

interface ProgramPanelProps {
  href: string;
  gradient: string;
  program: string;
  title: string;
  age: string;
  focus: string;
}

/**
 * ProgramPanel — the large clickable panel pattern used on the
 * Bar & Bat Mitzvah landing page. The whole panel is the link
 * (no separate "Learn More" button), per the design direction
 * to avoid redundant CTAs.
 */
export function ProgramPanel({ href, gradient, program, title, age, focus }: ProgramPanelProps) {
  return (
    <Link
      href={href}
      className="relative min-h-[480px] rounded-[18px] overflow-hidden flex items-end p-9 md:p-11 text-white transition-transform hover:-translate-y-1 group"
      style={{ background: gradient }}
    >
      <span className="absolute top-6 left-7 text-[0.66rem] tracking-[0.16em] uppercase text-white/70">
        Photo Coming Soon
      </span>
      <div className="relative z-10">
        <p className="text-[0.74rem] tracking-[0.16em] uppercase text-[#f1d697] font-bold mb-2.5">
          {program}
        </p>
        <h2 className="text-[clamp(2rem,3.4vw,2.7rem)] font-bold leading-tight mb-2">{title}</h2>
        <p className="text-[0.95rem] text-white/82 mb-4">{age}</p>
        <p className="text-[0.88rem] text-white/78">{focus}</p>
        <div className="mt-5.5 text-[1.5rem] text-[#f1d697] transition-transform group-hover:translate-x-2">
          &rarr;
        </div>
      </div>
    </Link>
  );
}
