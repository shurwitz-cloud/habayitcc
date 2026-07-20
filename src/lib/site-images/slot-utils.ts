import type { SiteImage, SiteImageSlot } from './types';

/** Intentional empty slot — admin cleared photos; do not fall back to defaults. */
export function isSlotCleared(slot: SiteImageSlot | undefined): boolean {
  if (!slot) return false;
  return Array.isArray(slot.images) && slot.images.length === 0 && !slot.image?.src?.trim();
}

export function imagesFromSlot(slot: SiteImageSlot | undefined): SiteImage[] {
  if (!slot || isSlotCleared(slot)) return [];
  if (slot.images?.length) {
    return slot.images.filter((img) => Boolean(img.src?.trim()));
  }
  if (slot.image?.src?.trim()) return [slot.image];
  return [];
}

export function primaryImageFromSlot(slot: SiteImageSlot | undefined): SiteImage | undefined {
  return imagesFromSlot(slot)[0];
}

/** Persistable shape for a cleared slot. */
export function clearedSlot(): SiteImageSlot {
  return { images: [] };
}
