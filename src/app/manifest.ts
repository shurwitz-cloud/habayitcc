import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HaBayit',
    short_name: 'HaBayit',
    description: 'Hebrew Adventure attendance',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f3ea',
    theme_color: '#172643',
    icons: [
      {
        src: '/logos/habayit-emblem.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
