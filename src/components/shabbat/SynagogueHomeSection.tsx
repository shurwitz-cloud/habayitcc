import { ProgramTile } from '@/components/sections/ProgramCard';

import { ShabbatHomeCard } from '@/components/shabbat/ShabbatHomeCard';

import { getUpcomingShabbat, type ShabbatInfo } from '@/lib/shabbat/hebcal';

import { FALLBACK_SHABBAT } from '@/lib/shabbat/fallback.generated';

import type { SiteImage } from '@/lib/site-images/types';



interface SynagogueHomeSectionProps {

  photo?: SiteImage;

}



/** Fetches Shabbat in isolation from the home page's noStore photo loader. */

export async function SynagogueHomeSection({ photo }: SynagogueHomeSectionProps) {

  let shabbat: ShabbatInfo = FALLBACK_SHABBAT;

  try {

    shabbat = await getUpcomingShabbat();

  } catch (error) {

    console.error('SynagogueHomeSection Shabbat fetch failed, using fallback:', error);

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

