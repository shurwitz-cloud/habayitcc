import Link from 'next/link';
import { FocalImageLayer } from '@/components/site-images/FocalImageLayer';
import { DEFAULT_CROP, normalizeImage } from '@/lib/site-images/crop';
import type { SiteImage } from '@/lib/site-images/types';

interface ProgramPanelProps {
  href: string;
  gradient: string;
  program: string;
  title: string;
  age: string;
  focus: string;
  image?: string;
  photo?: SiteImage;
}

/**
 * ProgramPanel — the large clickable panel pattern used on the
 * Bar & Bat Mitzvah landing page. The whole panel is the link
 * (no separate "Learn More" button), per the design direction
 * to avoid redundant CTAs.
 */
export function ProgramPanel({ href, gradient, program, title, age, focus, image, photo }: ProgramPanelProps) {
  const src = photo?.src ?? image;
  const crop = photo ?? (src ? normalizeImage(src, DEFAULT_CROP) : undefined);

  return (
    <Link
      href={href}
      className="relative min-h-[480px] rounded-[18px] overflow-hidden flex items-end p-9 md:p-11 text-white transition-transform hover:-translate-y-1 group"
      style={!src ? { background: gradient } : undefined}
    >
      {src && crop && (
        <>
          <FocalImageLayer {...crop} src={src} />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(rgba(23,38,67,.5),rgba(23,38,67,.72))' }}
          />
        </>
      )}
      {!src && (
        <div
          className="absolute inset-0 opacity-90"
          style={{ background: gradient }}
          aria-hidden
        />
      )}
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
