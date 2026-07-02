import type { Metadata } from 'next';
import { HEBREW_ADVENTURE_NAME } from '@/lib/programs/names';

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://habayitcc.org';

export const SITE_NAME = 'HaBayit Israeli Jewish Center';

export const SITE_DESCRIPTION =
  `A warm Jewish home with an Israeli spirit. ${HEBREW_ADVENTURE_NAME}, Bar & Bat Mitzvah programs, Shabbat services, and a community where everyone belongs.`;

/** Default link-preview image unless a page sets its own openGraph.images */
export const DEFAULT_OG_IMAGE = '/logos/habayit-logo-blue.png';

export const defaultOpenGraph = {
  type: 'website' as const,
  siteName: SITE_NAME,
  images: [
    {
      url: DEFAULT_OG_IMAGE,
      alt: SITE_NAME,
    },
  ],
};

/** Merge page metadata with site defaults; pass openGraph.images to override the logo. */
export function createPageMetadata(overrides: Metadata = {}): Metadata {
  return {
    ...overrides,
    openGraph: {
      ...defaultOpenGraph,
      ...overrides.openGraph,
      images: overrides.openGraph?.images ?? defaultOpenGraph.images,
    },
    twitter: {
      card: 'summary',
      ...overrides.twitter,
      images: overrides.twitter?.images ?? [DEFAULT_OG_IMAGE],
    },
  };
}
