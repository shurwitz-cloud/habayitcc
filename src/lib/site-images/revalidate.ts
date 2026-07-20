import { revalidatePath, revalidateTag } from 'next/cache';

export const SITE_IMAGES_TAG = 'site-images';

/** Every route that renders admin-managed photos. */
export const SITE_IMAGE_PATHS = [
  '/',
  '/about',
  '/synagogue',
  '/donate',
  '/contact',
  '/events',
  '/hebrew-adventure',
  '/chai-partner',
  '/bar-bat-mitzvah',
  '/admin/photos',
] as const;

/** Call after any admin photo save so the live site picks up changes immediately. */
export function revalidateSiteImages(): void {
  revalidateTag(SITE_IMAGES_TAG, 'max');
  revalidatePath('/', 'layout');
  for (const path of SITE_IMAGE_PATHS) {
    revalidatePath(path);
  }
}
