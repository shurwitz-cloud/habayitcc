import { ReactNode } from 'react';

interface HeroProps {
  kicker?: string;
  hebrewKicker?: string;
  children: ReactNode;
  subtitle?: string;
  minHeight?: string;
  actions?: ReactNode;
}

/**
 * Hero — full-width banner used at the top of every page.
 * `children` is the <h1>; pass JSX directly so pages can italicize
 * a word (e.g. "Welcome to <em>HaBayit</em>") without prop gymnastics.
 */
export function Hero({
  kicker,
  hebrewKicker,
  children,
  subtitle,
  minHeight = 'min-h-[62vh]',
  actions,
}: HeroProps) {
  return (
    <section
      className={`${minHeight} grid place-items-center text-center relative overflow-hidden px-[6vw] py-[130px_6vw_90px]`}
      style={{
        background:
          'linear-gradient(rgba(13,41,73,.4),rgba(13,41,73,.5)), linear-gradient(135deg,#6f7f93 0%,#cdb98b 55%,#7e8d76 100%)',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 22% 28%,rgba(255,255,255,.28),transparent 34%), radial-gradient(circle at 78% 70%,rgba(255,255,255,.16),transparent 36%)',
        }}
      />
      <div className="relative z-10 max-w-[820px] text-white" style={{ textShadow: '0 2px 18px rgba(0,0,0,.22)' }}>
        {hebrewKicker && (
          <p className="heb text-[1.1rem] text-gold-light mb-3">{hebrewKicker}</p>
        )}
        {kicker && (
          <p className="text-[0.76rem] tracking-[0.2em] uppercase text-[#f1d697] font-bold mb-4.5">
            {kicker}
          </p>
        )}
        <h1 className="text-[clamp(2.8rem,6.5vw,5.4rem)] font-bold leading-none mb-4.5">
          {children}
        </h1>
        {subtitle && (
          <p className="font-display text-[clamp(1.3rem,2.4vw,2rem)] font-medium leading-tight max-w-[680px] mx-auto">
            {subtitle}
          </p>
        )}
        {actions && <div className="mt-8 flex gap-4 justify-center flex-wrap">{actions}</div>}
      </div>
    </section>
  );
}
