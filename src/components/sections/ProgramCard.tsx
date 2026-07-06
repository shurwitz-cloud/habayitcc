import Link from 'next/link';
import { FocalImageLayer } from '@/components/site-images/FocalImageLayer';
import { DEFAULT_CROP, normalizeImage } from '@/lib/site-images/crop';
import type { SiteImage } from '@/lib/site-images/types';

interface ProgramCardProps {
  href: string;
  title: string;
  description: string;
  variant?: 'default' | 'featured';
  image?: string;
  photo?: SiteImage;
}

/**
 * ProgramCard — the clickable tile pattern used for "ways to get
 * involved" (HaBayit Hebrew Adventure, Bar/Bat Mitzvah, Chai Partner). The
 * entire card is the link — no separate "Learn More" button, per
 * the site's design direction of minimizing redundant CTAs.
 */
export function ProgramCard({
  href,
  title,
  description,
  variant = 'default',
  image,
  photo,
}: ProgramCardProps) {
  const isFeatured = variant === 'featured';
  const src = photo?.src ?? image;
  const crop = photo ?? (src ? normalizeImage(src, DEFAULT_CROP) : undefined);

  const overlay = isFeatured
    ? 'linear-gradient(rgba(13,25,45,.66),rgba(13,25,45,.8))'
    : 'linear-gradient(rgba(23,38,67,.25),rgba(23,38,67,.72))';

  return (
    <Link
      href={href}
      className={`relative flex flex-col justify-end min-h-[300px] p-9 rounded-[18px] overflow-hidden text-white transition-transform duration-200 hover:-translate-y-1 ${
        isFeatured ? 'bg-navy' : ''
      }`}
      style={
        !src && !isFeatured
          ? {
              background:
                'linear-gradient(rgba(23,38,67,.4),rgba(23,38,67,.55)), linear-gradient(135deg,#b6bfc6,#d8c59a)',
            }
          : undefined
      }
    >
      {src && crop && (
        <>
          <FocalImageLayer {...crop} src={src} />
          <div className="absolute inset-0" style={{ background: overlay }} />
        </>
      )}
      <div className="relative z-10">
        <h3 className="text-[2.3rem] leading-tight font-bold">{title}</h3>
        <p className="mt-2 text-white/85 text-[0.92rem]">{description}</p>
      </div>
    </Link>
  );
}

/**
 * ProgramTile — the larger, two-column "tile" pattern used for
 * HaBayit Hebrew Adventure and Synagogue & Community on the homepage. Includes
 * an explicit arrow affordance since these tiles read more like
 * feature sections than simple cards.
 */
export function ProgramTile({
  href,
  kicker,
  title,
  description,
  reverse = false,
  compact = false,
  image,
  photo,
  className = '',
}: {
  href: string;
  kicker: string;
  title: string;
  description: string;
  reverse?: boolean;
  compact?: boolean;
  image?: string;
  photo?: SiteImage;
  className?: string;
}) {
  const src = photo?.src ?? image;
  const crop = photo ?? (src ? normalizeImage(src, DEFAULT_CROP) : undefined);

  const gridCols = compact
    ? 'md:grid-cols-2'
    : reverse
      ? 'md:grid-cols-[.9fr_1.2fr]'
      : 'md:grid-cols-[1.2fr_.9fr]';

  return (
    <Link
      href={href}
      className={`grid bg-soft rounded-[18px] overflow-hidden mb-6 transition-all hover:-translate-y-1 hover:shadow-2xl ${gridCols} ${
        compact ? 'min-h-[300px]' : 'min-h-[380px]'
      } ${className}`}
    >
      <div
        className={`relative min-h-[200px] md:min-h-full overflow-hidden ${reverse ? 'md:order-2' : ''} ${
          compact ? 'min-h-[180px]' : 'min-h-[220px]'
        }`}
      >
        {src && crop ? (
          <FocalImageLayer {...crop} src={src} />
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#d8c9a8,#8aa0b0)' }} />
            <span className="absolute inset-0 grid place-items-center text-white/85 text-[0.72rem] tracking-[0.18em] uppercase font-bold">
              Photography Coming Soon
            </span>
          </>
        )}
      </div>
      <div className={`flex flex-col justify-center ${compact ? 'p-6 md:p-8' : 'p-8 md:p-[50px]'}`}>
        <p className="text-[0.74rem] tracking-[0.16em] uppercase text-gold font-bold mb-3.5">
          {kicker}
        </p>
        <h3
          className={`leading-tight text-navy font-bold mb-4 ${
            compact
              ? 'text-[clamp(1.45rem,2.2vw,2rem)]'
              : 'text-[clamp(1.9rem,3vw,2.7rem)]'
          }`}
        >
          {title}
        </h3>
        <p className={`text-muted max-w-[420px] ${compact ? 'text-[0.88rem]' : ''}`}>{description}</p>
        <div className={`text-gold text-[1.6rem] ${compact ? 'mt-4' : 'mt-5.5'}`}>&rarr;</div>
      </div>
    </Link>
  );
}
