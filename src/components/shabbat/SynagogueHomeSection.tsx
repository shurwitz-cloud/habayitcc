import { ProgramTile } from '@/components/sections/ProgramCard';
import { ShabbatHomeCard } from '@/components/shabbat/ShabbatHomeCard';
import type { ShabbatInfo } from '@/lib/shabbat/hebcal';
import type { SiteImage } from '@/lib/site-images/types';

interface SynagogueHomeSectionProps {
  shabbat: ShabbatInfo | null;
  photo?: SiteImage;
}

export function SynagogueHomeSection({ shabbat, photo }: SynagogueHomeSectionProps) {
  if (!shabbat) {
    return (
      <ProgramTile
        href="/synagogue"
        kicker="Shabbat • Holidays • Events"
        title="Synagogue & Community"
        description="Join us for meaningful Jewish life, family programs, holiday celebrations, learning, and community connection."
        reverse
        photo={photo}
      />
    );
  }

  return (
    <div className="grid md:grid-cols-[minmax(240px,280px)_1fr] gap-5.5 mb-6 items-stretch">
      <ShabbatHomeCard shabbat={shabbat} className="md:min-h-[220px]" />
      <ProgramTile
        href="/synagogue"
        kicker="Shabbat • Holidays • Events"
        title="Synagogue & Community"
        description="Join us for meaningful Jewish life, family programs, holiday celebrations, learning, and community connection."
        reverse
        compact
        className="mb-0 h-full"
        photo={photo}
      />
    </div>
  );
}
