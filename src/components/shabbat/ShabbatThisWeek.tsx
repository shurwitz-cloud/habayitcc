import type { ShabbatInfo } from '@/lib/shabbat/hebcal';

interface ShabbatThisWeekProps {
  shabbat: ShabbatInfo | null;
  className?: string;
}

function ShabbatContent({ shabbat }: { shabbat: ShabbatInfo }) {
  return (
    <>
      <div>
        <p className="heb text-[0.95rem] text-navy font-semibold leading-snug">
          {shabbat.parsha.hebrew}
        </p>
        <p className="text-navy text-[0.92rem] font-semibold mt-0.5">
          {shabbat.parsha.englishName}
        </p>
        {shabbat.mevarchim && (
          <>
            <p className="heb text-[0.9rem] text-navy/85 font-medium leading-snug mt-2">
              {shabbat.mevarchim.hebrew}
            </p>
            <p className="text-muted text-[0.9rem] mt-0.5">{shabbat.mevarchim.englishMonth}</p>
          </>
        )}
      </div>

      <div className="mt-4 space-y-2.5">
        <div className="border-l-[3px] border-gold pl-4">
          <strong className="block text-navy text-[1.02rem] mb-0.5">
            Candle lighting {shabbat.candleLighting}
          </strong>
          <span className="text-muted text-[0.9rem]">{shabbat.fridayLabel}</span>
        </div>
        <div className="border-l-[3px] border-gold pl-4">
          <strong className="block text-navy text-[1.02rem] mb-0.5">
            Shabbos ends {shabbat.shabbosEnds}
          </strong>
          <span className="text-muted text-[0.9rem]">{shabbat.shabbatLabel}</span>
        </div>
      </div>
    </>
  );
}

export function ShabbatThisWeek({ shabbat, className = '' }: ShabbatThisWeekProps) {
  if (!shabbat) {
    return null;
  }

  return (
    <aside
      className={`mt-5 border border-line rounded-[12px] px-5 py-4 bg-soft/60 ${className}`}
    >
      <ShabbatContent shabbat={shabbat} />
    </aside>
  );
}
