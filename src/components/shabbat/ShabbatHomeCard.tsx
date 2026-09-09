import type { ShabbatInfo } from '@/lib/shabbat/hebcal';

interface ShabbatHomeCardProps {
  shabbat: ShabbatInfo | null;
  className?: string;
  /** `default` — homepage sidebar card; `compact` — synagogue 3-col / strip layout */
  variant?: 'default' | 'compact';
}

function ShabbatTimes({
  shabbat,
  compact = false,
}: {
  shabbat: ShabbatInfo;
  compact?: boolean;
}) {
  const candlePrefix = compact ? 'Candles' : 'Candle lighting';
  const endPrefix = shabbat.kind === 'holiday' ? 'Yom Tov ends' : compact ? 'Ends' : 'Shabbos ends';
  const timeClass = compact
    ? 'text-navy font-bold text-[0.8rem] leading-tight'
    : 'text-navy font-bold text-[0.8rem] md:text-[0.88rem] leading-tight';
  const labelClass = compact
    ? 'text-[0.62rem] text-muted leading-tight mb-0.5'
    : 'text-[0.65rem] text-muted leading-tight mb-0.5';

  return (
    <>
      <div>
        <p className={labelClass}>{shabbat.fridayLabel}</p>
        <p className={timeClass}>
          {candlePrefix} {shabbat.candleLighting}
        </p>
      </div>
      {shabbat.secondCandleLabel && shabbat.secondCandleLighting && (
        <div>
          <p className={labelClass}>{shabbat.secondCandleLabel}</p>
          <p className={timeClass}>
            {candlePrefix} {shabbat.secondCandleLighting}
          </p>
        </div>
      )}
      <div>
        <p className={labelClass}>{shabbat.shabbatLabel}</p>
        <p className={timeClass}>
          {endPrefix} {shabbat.shabbosEnds}
        </p>
      </div>
    </>
  );
}

export function ShabbatHomeCard({
  shabbat,
  className = '',
  variant = 'default',
}: ShabbatHomeCardProps) {
  if (!shabbat) {
    return null;
  }

  if (variant === 'compact') {
    return (
      <div
        className={`bg-cream border border-line rounded-[18px] p-5 md:p-7 flex flex-col h-auto ${className}`}
      >
        <div className="flex flex-col md:flex-row lg:flex-col gap-4 md:gap-6 lg:gap-0">
          <div className="min-w-0">
            <p className="text-[0.62rem] tracking-[0.14em] uppercase text-gold font-bold mb-2">
              {shabbat.kicker}
            </p>
            <p className="heb text-[1.35rem] text-navy font-bold leading-tight">
              {shabbat.parsha.hebrew}
            </p>
            <p className="text-[0.98rem] text-navy font-bold leading-tight mt-0.5">
              {shabbat.parsha.englishName}
            </p>
            {shabbat.mevarchim && (
              <div className="mt-2.5 space-y-0.5">
                <p className="text-muted text-[0.74rem] leading-snug">
                  We bless the month {shabbat.mevarchim.englishMonth}
                </p>
                <p className="heb text-[0.78rem] text-navy/75 font-medium leading-snug">
                  {shabbat.mevarchim.hebrew}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5 pt-3.5 border-t border-line md:pt-0 md:border-t-0 md:border-l md:pl-6 md:shrink-0 md:grid md:grid-cols-2 md:gap-x-4 md:gap-y-2 lg:flex lg:flex-col lg:gap-2.5 lg:pt-3.5 lg:mt-3.5 lg:border-t lg:border-l-0 lg:pl-0">
            <ShabbatTimes shabbat={shabbat} compact />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-cream border border-line rounded-[18px] p-4 md:p-5 flex flex-col justify-center ${className}`}
    >
      <p className="text-[0.62rem] tracking-[0.12em] uppercase text-gold font-bold mb-2 md:text-[0.68rem] md:tracking-[0.14em]">
        {shabbat.kicker}
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

      <div className="mt-3.5 pt-3.5 border-t border-line grid grid-cols-1 gap-y-2.5">
        <ShabbatTimes shabbat={shabbat} />
      </div>
    </div>
  );
}
