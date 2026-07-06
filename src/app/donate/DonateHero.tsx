import { SiteRotatingHero } from '@/components/site-images/SiteRotatingHero';
import { HERO_HEIGHT } from '@/lib/hero-heights';

export async function DonateHero() {
  return (
    <SiteRotatingHero
      slotId="donate.hero"
      kicker="Support HaBayit"
      minHeight={HERO_HEIGHT.compact}
      subtitle="Every gift helps strengthen Jewish life in our community."
    >
      Support HaBayit
    </SiteRotatingHero>
  );
}
