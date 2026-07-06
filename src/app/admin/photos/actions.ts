'use server';

import { revalidatePath } from 'next/cache';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { DEFAULT_SITE_IMAGES, getSiteImages, saveSiteImageSlot, uploadSitePhoto } from '@/lib/site-images/store';
import type { SiteImageSlot, SiteImageSlotId } from '@/lib/site-images/types';

async function requireAdmin() {
  if (!(await isAdminAuthenticated())) {
    throw new Error('Unauthorized');
  }
}

export async function getAdminSiteImages() {
  await requireAdmin();
  const config = await getSiteImages();
  return { config, defaults: DEFAULT_SITE_IMAGES };
}

export async function saveSiteImageSlotAction(
  slotId: SiteImageSlotId,
  slot: SiteImageSlot
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const result = await saveSiteImageSlot(slotId, slot);
    if (result.success) {
      revalidatePath('/', 'layout');
      revalidatePath('/donate');
      revalidatePath('/contact');
      revalidatePath('/events');
      revalidatePath('/hebrew-adventure');
      revalidatePath('/chai-partner');
      revalidatePath('/about');
      revalidatePath('/bar-bat-mitzvah');
    }
    return result;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Save failed.' };
  }
}

export async function resetSiteImageSlotAction(
  slotId: SiteImageSlotId
): Promise<{ success: boolean; error?: string }> {
  return saveSiteImageSlotAction(slotId, DEFAULT_SITE_IMAGES[slotId]);
}

export async function uploadSitePhotoAction(
  formData: FormData
): Promise<{ url?: string; error?: string }> {
  try {
    await requireAdmin();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { error: 'Choose an image file first.' };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { error: 'Image must be under 10 MB.' };
    }

    const result = await uploadSitePhoto(file);
    if (result.url) {
      revalidatePath('/', 'layout');
    }
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Upload failed.' };
  }
}
