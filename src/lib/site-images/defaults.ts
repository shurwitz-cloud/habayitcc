import type { SiteImagesConfig } from './types';

/** Default image assignments — used when Supabase has no override for a slot. */
export const DEFAULT_SITE_IMAGES: SiteImagesConfig = {
  'home.hero': {
    images: [{ src: '/photos/hero-3.jpg', focalX: 50, focalY: 75, zoom: 100 }],
  },
  'home.hebrew-adventure': {
    image: { src: '/photos/home-hebrew-adventure.jpg', focalX: 50, focalY: 50, zoom: 100 },
  },
  'home.bar-mitzvah': {
    image: { src: '/photos/bbm-boys.jpg', focalX: 50, focalY: 50, zoom: 100 },
  },
  'home.bat-mitzvah': {
    image: { src: '/photos/card-bat-mitzvah.jpg', focalX: 50, focalY: 50, zoom: 100 },
  },
  'home.chai-partner': {
    image: { src: '/photos/community.png', focalX: 50, focalY: 50, zoom: 100 },
  },
  'home.synagogue': {
    image: { src: '/photos/home-synagogue.jpg', focalX: 50, focalY: 50, zoom: 100 },
  },
  'about.intro': {
    image: { src: '/photos/about-study.jpg', focalX: 50, focalY: 28, zoom: 100 },
  },
  'about.founders': {
    image: { src: '/photos/about-family.jpg', focalX: 50, focalY: 38, zoom: 108 },
  },
  'synagogue.hero': {
    images: [{ src: '/photos/synagogue-hero.jpg', focalX: 50, focalY: 50, zoom: 100 }],
  },
  'hebrew-adventure.hero': {
    images: [{ src: '/photos/hebrew-adventure-hero.jpg', focalX: 50, focalY: 50, zoom: 100 }],
  },
  'contact.hero': {
    images: [{ src: '/photos/contact-hero.jpg', focalX: 50, focalY: 50, zoom: 100 }],
  },
  'donate.hero': {
    images: [{ src: '/photos/donate-hero.jpg', focalX: 50, focalY: 50, zoom: 100 }],
  },
  'chai-partner.hero': {
    images: [
      { src: '/photos/chai-men.png', focalX: 50, focalY: 50, zoom: 100 },
      { src: '/photos/chai-women.png', focalX: 50, focalY: 50, zoom: 100 },
      { src: '/photos/chai-kids.png', focalX: 50, focalY: 50, zoom: 100 },
    ],
  },
  'events.hero': {
    images: [
      { src: '/photos/events-lagbaomer.png', focalX: 50, focalY: 50, zoom: 100 },
      { src: '/photos/community.png', focalX: 50, focalY: 50, zoom: 100 },
      { src: '/photos/synagogue-hero.jpg', focalX: 50, focalY: 50, zoom: 100 },
    ],
  },
  'bar-bat-mitzvah.bar': {
    image: { src: '/photos/bbm-boys.jpg', focalX: 50, focalY: 50, zoom: 100 },
  },
  'bar-bat-mitzvah.bat': {
    image: { src: '/photos/bloom-girls.jpg', focalX: 50, focalY: 50, zoom: 100 },
  },
};
