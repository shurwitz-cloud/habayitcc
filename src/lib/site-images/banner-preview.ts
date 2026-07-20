/** Matches `.hero-banner` in globals.css — keep in sync. */
export const BANNER_PHONE_WIDTH = 390;
export const BANNER_DESKTOP_WIDTH = 1280;
export const BANNER_WIDTH_SPAN = BANNER_DESKTOP_WIDTH - BANNER_PHONE_WIDTH;
export const BANNER_NAV_HEIGHT = 88;

/** Reference viewport height for admin preview (simulates svh). */
export const BANNER_PREVIEW_VIEWPORT_HEIGHT = 844;

/** Banner height at a given viewport width, using the live site formula. */
export function bannerHeightAtWidth(
  width: number,
  viewportHeight = BANNER_PREVIEW_VIEWPORT_HEIGHT,
): number {
  const progress = Math.min(1, Math.max(0, (width - BANNER_PHONE_WIDTH) / BANNER_WIDTH_SPAN));
  const phoneHeight = viewportHeight * 0.5;
  const desktopHeight = viewportHeight - BANNER_NAV_HEIGHT;
  return phoneHeight + (desktopHeight - phoneHeight) * progress;
}

export function bannerPreviewLabel(width: number): 'Phone' | 'Tablet' | 'Desktop' {
  if (width <= BANNER_PHONE_WIDTH + 40) return 'Phone';
  if (width >= BANNER_DESKTOP_WIDTH - 40) return 'Desktop';
  return 'Tablet';
}
