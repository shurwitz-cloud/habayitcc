import type { CSSProperties } from 'react';
import type { SiteImage, SiteImageCrop } from './types';

export const DEFAULT_CROP: SiteImageCrop = {
  focalX: 50,
  focalY: 50,
  zoom: 100,
};

export function cropToBackgroundStyle(crop: SiteImageCrop): CSSProperties {
  return {
    backgroundSize: 'cover',
    backgroundPosition: `${crop.focalX}% ${crop.focalY}%`,
  };
}

export function imageToBackgroundStyle(image: SiteImage): CSSProperties {
  return {
    backgroundImage: `url(${encodeURI(image.src)})`,
    ...cropToBackgroundStyle(image),
  };
}

export function normalizeCrop(partial?: Partial<SiteImageCrop>): SiteImageCrop {
  return {
    focalX: clamp(Number(partial?.focalX ?? DEFAULT_CROP.focalX), 0, 100),
    focalY: clamp(Number(partial?.focalY ?? DEFAULT_CROP.focalY), 0, 100),
    zoom: clamp(Number(partial?.zoom ?? DEFAULT_CROP.zoom), 100, 250),
  };
}

/** Strip our cache-bust query param before persisting or comparing URLs. */
export function stripImageCacheBust(src: string): string {
  const q = src.indexOf('?');
  if (q === -1) return src;
  const base = src.slice(0, q);
  const params = new URLSearchParams(src.slice(q + 1));
  if (!params.has('v')) return src;
  params.delete('v');
  const rest = params.toString();
  return rest ? `${base}?${rest}` : base;
}

/** Append ?v= so phones and CDNs fetch fresh images after admin saves. */
export function withImageCacheBust(src: string, version: string | number): string {
  const clean = stripImageCacheBust(src);
  if (!clean) return clean;
  const sep = clean.includes('?') ? '&' : '?';
  return `${clean}${sep}v=${encodeURIComponent(String(version))}`;
}

export function normalizeImage(src: string, partial?: Partial<SiteImage>): SiteImage {
  return {
    src: stripImageCacheBust(src),
    ...normalizeCrop(partial),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
