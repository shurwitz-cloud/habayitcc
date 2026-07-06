import type { ShabbatInfo } from '@/lib/shabbat/hebcal';

interface ShabbatHomeCardProps {
  shabbat: ShabbatInfo | null;
  className?: string;
}

export function ShabbatHomeCard({ shabbat, className = '' }: ShabbatHomeCardProps) {
  if (!shabbat) {
    return null;
  }

  return (
    <div
      className={`bg-cream border border-line rounded-[18px] p-4 md:p-5 flex flex-col justify-center ${className}`}
    >
      <p className="text-[0.62rem] tracking-[0.12em] uppercase text-gold font-bold mb-2 md:text-[0.68rem] md:tracking-[0.14em]">
        This week&apos;s parsha is
      </p>

      <div className="flex flex-row gap-3 items-start md:flex-col-reverse md:gap-0.5">
        <p className="flex-1 min-w-0 text-left text-[clamp(0.95rem,3.2vw,1.18rem)] text-navy font-bold leading-tight">
          {shabbat.parsha.englishName}
        </p>
        <p className="heb flex-1 min-w-0 text-right text-[clamp(0.95rem,3.2vw,1.18rem)] text-navy font-bold leading-snug">
          {shabbat.parsha.hebrew}
        </p>
      </div>

      {shabbat.mevarchim && (
        <div className="mt-2 flex flex-row gap-3 items-start md:flex-col-reverse md:gap-0.5">
          <p className="flex-1 min-w-0 text-left text-muted text-[0.74rem] leading-snug">
            We bless the month {shabbat.mevarchim.englishMonth}
          </p>
          <p className="heb flex-1 min-w-0 text-right text-[0.8rem] text-navy/80 font-medium leading-snug">
            {shabbat.mevarchim.hebrew}
          </p>
        </div>
      )}

      <div className="mt-3.5 pt-3.5 border-t border-line grid grid-cols-2 gap-x-4 gap-y-0 md:grid-cols-1 md:gap-y-2.5">
        <div>
          <p className="text-[0.65rem] text-muted leading-tight mb-0.5">{shabbat.fridayLabel}</p>
          <p className="text-navy font-bold text-[0.8rem] md:text-[0.88rem] leading-tight">
            Candle lighting {shabbat.candleLighting}
          </p>
        </div>
        <div>
          <p className="text-[0.65rem] text-muted leading-tight mb-0.5">{shabbat.shabbatLabel}</p>
          <p className="text-navy font-bold text-[0.8rem] md:text-[0.88rem] leading-tight">
            Shabbos ends {shabbat.shabbosEnds}
          </p>
        </div>
      </div>
    </div>
  );
}
