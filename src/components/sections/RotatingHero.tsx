'use client';

import { ReactNode, useEffect, useState } from 'react';
import { FocalImageLayer } from '@/components/site-images/FocalImageLayer';
import { HERO_HEIGHT, HERO_PADDING } from '@/lib/hero-heights';
import type { SiteImageCrop } from '@/lib/site-images/types';

export interface HeroSlide extends SiteImageCrop {
  src: string;
}

interface RotatingHeroProps {
  heroImages: HeroSlide[];
  children: ReactNode;
  kicker?: string;
  hebrewKicker?: string;
  subtitle?: string;
  minHeight?: string;
  actions?: ReactNode;
  intervalMs?: number;
}

/**
 * RotatingHero — cross-fading hero photos with admin-controlled crop/zoom.
 * Uses object-fit cover so images fill narrow phone viewports (no navy gaps).
 */
export function RotatingHero({
  heroImages,
  children,
  kicker,
  hebrewKicker,
  subtitle,
  minHeight = HERO_HEIGHT.home,
  actions,
  intervalMs = 6000,
}: RotatingHeroProps) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (heroImages.length <= 1) return;
    const id = setInterval(() => {
      setActive((i) => (i + 1) % heroImages.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [heroImages.length, intervalMs]);

  return (
    <section
      className={`${minHeight} grid place-items-center text-center relative overflow-hidden ${HERO_PADDING}`}
      style={{ background: 'linear-gradient(135deg,#0d2949,#172643)' }}
    >
      {heroImages.map((slide, i) => (
        <FocalImageLayer
          key={`${slide.src}-${i}`}
          {...slide}
          className="transition-opacity duration-[1600ms] ease-in-out"
          style={{ opacity: i === active ? 1 : 0 }}
        />
      ))}

      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(rgba(13,41,73,.55),rgba(13,41,73,.62)), radial-gradient(circle at 22% 28%,rgba(0,0,0,.15),transparent 40%)',
        }}
      />

      <div
        className="relative z-10 max-w-[820px] text-white"
        style={{ textShadow: '0 2px 18px rgba(0,0,0,.4)' }}
      >
        {hebrewKicker && <p className="heb text-[1.1rem] text-gold-light mb-3">{hebrewKicker}</p>}
        {kicker && (
          <p className="text-[0.76rem] tracking-[0.2em] uppercase text-[#f1d697] font-bold mb-4.5">
            {kicker}
          </p>
        )}
        <h1 className="text-[clamp(2.8rem,6.5vw,5.4rem)] font-bold leading-none mb-4.5">
          {children}
        </h1>
        {subtitle && (
          <p className="font-display text-[clamp(1.1rem,2.2vw,1.75rem)] font-medium leading-tight mx-auto whitespace-nowrap max-[520px]:whitespace-normal max-[520px]:text-[1.05rem]">
            {subtitle}
          </p>
        )}
        {actions && <div className="mt-8 flex gap-4 justify-center flex-wrap">{actions}</div>}
      </div>

      {heroImages.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-2.5">
          {heroImages.map((slide, i) => (
            <span
              key={slide.src}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === active ? 'w-7 bg-gold' : 'w-1.5 bg-white/50'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
