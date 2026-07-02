import Link from 'next/link';

interface ProgramCardProps {
  href: string;
  title: string;
  description: string;
  variant?: 'default' | 'featured';
  imagePlaceholder?: boolean;
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
  imagePlaceholder = true,
}: ProgramCardProps) {
  const isFeatured = variant === 'featured';

  return (
    <Link
      href={href}
      className={`relative flex flex-col justify-end min-h-[300px] p-9 rounded-[18px] overflow-hidden text-white transition-transform duration-200 hover:-translate-y-1 ${
        isFeatured ? 'bg-navy' : ''
      }`}
      style={
        !isFeatured
          ? {
              background:
                'linear-gradient(rgba(23,38,67,.4),rgba(23,38,67,.55)), linear-gradient(135deg,#b6bfc6,#d8c59a)',
            }
          : undefined
      }
    >
      {imagePlaceholder && !isFeatured && (
        <span className="absolute top-5 left-6 text-[0.66rem] tracking-[0.16em] uppercase text-white/70">
          Photography Coming Soon
        </span>
      )}
      <div>
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
}: {
  href: string;
  kicker: string;
  title: string;
  description: string;
  reverse?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`grid md:grid-cols-[1.2fr_.9fr] min-h-[380px] bg-soft rounded-[18px] overflow-hidden mb-6 transition-all hover:-translate-y-1 hover:shadow-2xl ${
        reverse ? 'md:grid-cols-[.9fr_1.2fr]' : ''
      }`}
    >
      <div
        className={`relative min-h-[220px] md:min-h-full ${reverse ? 'md:order-2' : ''}`}
        style={{
          background: 'linear-gradient(135deg,#d8c9a8,#8aa0b0)',
        }}
      >
        <span className="absolute inset-0 grid place-items-center text-white/85 text-[0.72rem] tracking-[0.18em] uppercase font-bold">
          Photography Coming Soon
        </span>
      </div>
      <div className="p-8 md:p-[50px] flex flex-col justify-center">
        <p className="text-[0.74rem] tracking-[0.16em] uppercase text-gold font-bold mb-3.5">
          {kicker}
        </p>
        <h3 className="text-[clamp(1.9rem,3vw,2.7rem)] leading-tight text-navy font-bold mb-4">
          {title}
        </h3>
        <p className="text-muted max-w-[420px]">{description}</p>
        <div className="mt-5.5 text-gold text-[1.6rem]">&rarr;</div>
      </div>
    </Link>
  );
}
