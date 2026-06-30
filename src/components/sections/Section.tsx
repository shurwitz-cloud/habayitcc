import { ReactNode } from 'react';

interface SectionProps {
  children: ReactNode;
  className?: string;
  background?: 'cream' | 'white' | 'soft' | 'navy';
  narrow?: boolean;
}

const backgroundClasses = {
  cream: 'bg-cream',
  white: 'bg-white',
  soft: 'bg-soft',
  navy: 'bg-navy text-white',
};

/**
 * Section — wraps page content with the site's consistent vertical
 * rhythm (py-22 desktop / py-16 mobile) and horizontal max-width.
 * Use `narrow` for text-heavy sections (About copy, policy text)
 * that read better at a constrained line length.
 */
export function Section({
  children,
  className = '',
  background = 'cream',
  narrow = false,
}: SectionProps) {
  return (
    <section className={`py-16 md:py-[88px] px-[5.5vw] ${backgroundClasses[background]} ${className}`}>
      <div className={narrow ? 'max-w-[780px] mx-auto text-center' : 'max-w-[1180px] mx-auto'}>
        {children}
      </div>
    </section>
  );
}

interface SectionTitleProps {
  eyebrow?: string;
  children: ReactNode;
  description?: string;
  center?: boolean;
}

/**
 * SectionTitle — the eyebrow + heading + optional description pattern
 * repeated at the top of nearly every section across the site.
 */
export function SectionTitle({ eyebrow, children, description, center = true }: SectionTitleProps) {
  return (
    <div className={`mb-12 ${center ? 'text-center' : ''}`}>
      {eyebrow && (
        <p className="text-[0.72rem] tracking-[0.2em] uppercase text-gold font-bold mb-4">
          {eyebrow}
        </p>
      )}
      <h2 className="text-[clamp(2.2rem,4vw,3.4rem)] leading-tight text-navy font-bold">
        {children}
      </h2>
      {description && (
        <p className="max-w-[680px] mx-auto mt-4.5 text-muted text-[1.02rem]">{description}</p>
      )}
    </div>
  );
}
