export interface SiteImageCrop {
  /** Horizontal focal point 0–100 (maps to background-position X). */
  focalX: number;
  /** Vertical focal point 0–100 (maps to background-position Y). */
  focalY: number;
  /** Zoom level 100 = cover; higher = zoom in. */
  zoom: number;
}

export interface SiteImage extends SiteImageCrop {
  src: string;
}

export interface SiteImageSlot {
  /** Single image slot. */
  image?: SiteImage;
  /** Multi-image slot (rotating heroes). */
  images?: SiteImage[];
}

export type SiteImageSlotId =
  | 'home.hero'
  | 'home.hebrew-adventure'
  | 'home.bar-mitzvah'
  | 'home.bat-mitzvah'
  | 'home.chai-partner'
  | 'home.synagogue'
  | 'about.intro'
  | 'about.founders'
  | 'synagogue.hero'
  | 'hebrew-adventure.hero'
  | 'contact.hero'
  | 'donate.hero'
  | 'chai-partner.hero'
  | 'events.hero'
  | 'bar-bat-mitzvah.bar'
  | 'bar-bat-mitzvah.bat';

export type SiteImagesConfig = Record<SiteImageSlotId, SiteImageSlot>;

export interface ImageSlotMeta {
  id: SiteImageSlotId;
  label: string;
  page: string;
  /** CSS aspect-ratio value, e.g. "16/9". */
  aspectRatio: string;
  multi: boolean;
}
