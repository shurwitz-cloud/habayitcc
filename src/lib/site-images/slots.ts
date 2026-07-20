import type { ImageSlotMeta, SiteImageSlotId } from './types';

export const IMAGE_SLOT_META: ImageSlotMeta[] = [
  { id: 'home.hero', label: 'Homepage hero', page: 'Home', aspectRatio: '1903/809', multi: true, responsiveBanner: true },
  { id: 'home.hebrew-adventure', label: 'Hebrew Adventure tile', page: 'Home', aspectRatio: '4/3', multi: false },
  { id: 'home.bar-mitzvah', label: 'Bar Mitzvah card', page: 'Home', aspectRatio: '3/4', multi: false },
  { id: 'home.bat-mitzvah', label: 'Bat Mitzvah card', page: 'Home', aspectRatio: '3/4', multi: false },
  { id: 'home.chai-partner', label: 'Chai Partner card', page: 'Home', aspectRatio: '3/4', multi: false },
  { id: 'home.synagogue', label: 'Synagogue tile', page: 'Home', aspectRatio: '4/3', multi: false },
  { id: 'about.intro', label: 'About intro photo', page: 'About', aspectRatio: '4/5', multi: false },
  { id: 'about.founders', label: 'Founders family photo', page: 'About', aspectRatio: '4/5', multi: false },
  { id: 'synagogue.hero', label: 'Synagogue banner', page: 'Synagogue', aspectRatio: '1903/809', multi: true, responsiveBanner: true },
  { id: 'hebrew-adventure.hero', label: 'Hebrew Adventure banner', page: 'Hebrew Adventure', aspectRatio: '1903/809', multi: true, responsiveBanner: true },
  { id: 'contact.hero', label: 'Contact banner', page: 'Contact', aspectRatio: '1903/809', multi: true, responsiveBanner: true },
  { id: 'donate.hero', label: 'Donate banner', page: 'Donate', aspectRatio: '1903/809', multi: true, responsiveBanner: true },
  { id: 'chai-partner.hero', label: 'Chai Partner banner', page: 'Chai Partner', aspectRatio: '1903/809', multi: true, responsiveBanner: true },
  { id: 'events.hero', label: 'Events banner', page: 'Events', aspectRatio: '1903/809', multi: true, responsiveBanner: true },
  { id: 'bar-bat-mitzvah.bar', label: 'Bar Mitzvah panel', page: 'Bar & Bat Mitzvah', aspectRatio: '3/4', multi: false },
  { id: 'bar-bat-mitzvah.bat', label: 'Bat Mitzvah / Bloom panel', page: 'Bar & Bat Mitzvah', aspectRatio: '3/4', multi: false },
];

export function getSlotMeta(id: SiteImageSlotId): ImageSlotMeta {
  const meta = IMAGE_SLOT_META.find((s) => s.id === id);
  if (!meta) throw new Error(`Unknown image slot: ${id}`);
  return meta;
}
