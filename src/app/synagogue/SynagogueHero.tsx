import { SiteRotatingHero } from '@/components/site-images/SiteRotatingHero';
import { HERO_HEIGHT } from '@/lib/hero-heights';

export async function SynagogueHero() {
  return (
    <SiteRotatingHero
      slotId="synagogue.hero"
      kicker="Synagogue"
      minHeight={HERO_HEIGHT.page}
      subtitle="A welcoming place to pray, connect, celebrate, and grow together."
    >
      Shabbat & Community
    </SiteRotatingHero>
  );
}
