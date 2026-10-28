import { getSiteImageList } from '@/lib/site-images/store';
import type { SiteImageSlotId } from '@/lib/site-images/types';
import { RotatingHero } from '@/components/sections/RotatingHero';
import type { ComponentProps } from 'react';

type RotatingHeroProps = ComponentProps<typeof RotatingHero>;

interface SiteRotatingHeroProps extends Omit<RotatingHeroProps, 'heroImages'> {
  slotId: SiteImageSlotId;
}

/** Server component — loads hero images + crop settings from site image config. */
export async function SiteRotatingHero({ slotId, ...props }: SiteRotatingHeroProps) {
  const images = await getSiteImageList(slotId);

  return (
    <RotatingHero
      heroImages={images.map((img) => ({
        src: img.src,
        focalX: img.focalX,
        focalY: img.focalY,
        zoom: img.zoom,
      }))}
      {...props}
    />
  );
}
