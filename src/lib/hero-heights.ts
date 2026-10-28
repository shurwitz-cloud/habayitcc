/** Shared banner height — interpolates 50svh (phone) → viewport fill (desktop). */
export const HERO_BANNER = 'hero-banner';

export const HERO_HEIGHT = {
  home: HERO_BANNER,
  page: HERO_BANNER,
  compact: HERO_BANNER,
} as const;

/** Header sits above the banner; modest vertical padding for overlaid text. */
export const HERO_PADDING = 'py-10 px-[5vw] md:py-14 md:px-[6vw] lg:py-16';
