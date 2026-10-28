import { SiteRotatingHero } from '@/components/site-images/SiteRotatingHero';
import { HERO_HEIGHT } from '@/lib/hero-heights';

export async function ChaiPartnerHero() {
  return (
    <SiteRotatingHero
      slotId="chai-partner.hero"
      kicker="Monthly Partnership"
      minHeight={HERO_HEIGHT.page}
      subtitle="Help build a warm Jewish home for our community through ongoing monthly partnership."
    >
      Become a HaBayit Chai Partner
    </SiteRotatingHero>
  );
}
