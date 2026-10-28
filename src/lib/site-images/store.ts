import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { connection } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { DEFAULT_SITE_IMAGES } from './defaults';
import { normalizeCrop, normalizeImage, withImageCacheBust } from './crop';
import { imagesFromSlot, isSlotCleared } from './slot-utils';
import type { SiteImage, SiteImageSlot, SiteImageSlotId, SiteImagesConfig } from './types';

interface DbRow {
  slot_id: string;
  src: string | null;
  images: SiteImage[] | null;
  focal_x: number;
  focal_y: number;
  zoom: number;
  updated_at?: string;
}

function cacheVersion(row: DbRow): string {
  if (row.updated_at) return String(Date.parse(row.updated_at) || row.updated_at);
  if (row.images?.length) {
    return row.images
      .map((img) => `${img.focalX}-${img.focalY}-${img.zoom}`)
      .join('_');
  }
  return `${row.focal_x}-${row.focal_y}-${row.zoom}`;
}

function rowToSlot(row: DbRow): SiteImageSlot {
  const version = cacheVersion(row);
  // Empty array is an intentional clear (do not treat as missing).
  if (Array.isArray(row.images)) {
    return {
      images: row.images.map((img) =>
        normalizeImage(withImageCacheBust(img.src, version), {
          focalX: img.focalX,
          focalY: img.focalY,
          zoom: img.zoom,
        })
      ),
    };
  }
  if (row.src) {
    return {
      image: normalizeImage(withImageCacheBust(row.src, version), {
        focalX: row.focal_x,
        focalY: row.focal_y,
        zoom: row.zoom,
      }),
    };
  }
  return { images: [] };
}

function mergeConfig(overrides: Partial<SiteImagesConfig>): SiteImagesConfig {
  const merged = { ...DEFAULT_SITE_IMAGES };
  for (const id of Object.keys(overrides) as SiteImageSlotId[]) {
    if (overrides[id]) merged[id] = overrides[id]!;
  }
  return merged;
}

export async function getSiteImages(): Promise<SiteImagesConfig> {
  await connection();
  noStore();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('site_image_slots').select('*');
    if (error || !data?.length) return DEFAULT_SITE_IMAGES;

    const overrides: Partial<SiteImagesConfig> = {};
    for (const row of data as DbRow[]) {
      const id = row.slot_id as SiteImageSlotId;
      if (!(id in DEFAULT_SITE_IMAGES)) continue;
      overrides[id] = rowToSlot(row);
    }
    return mergeConfig(overrides);
  } catch {
    return DEFAULT_SITE_IMAGES;
  }
}

export async function getSiteImageSlot(id: SiteImageSlotId): Promise<SiteImageSlot> {
  const config = await getSiteImages();
  return config[id] ?? DEFAULT_SITE_IMAGES[id];
}

export async function getSiteImage(id: SiteImageSlotId): Promise<SiteImage | undefined> {
  const list = await getSiteImageList(id);
  return list[0];
}

export async function getSiteImageList(id: SiteImageSlotId): Promise<SiteImage[]> {
  const slot = await getSiteImageSlot(id);
  if (isSlotCleared(slot)) return [];
  const fromSlot = imagesFromSlot(slot);
  if (fromSlot.length) return fromSlot;
  const fallback = DEFAULT_SITE_IMAGES[id];
  if (isSlotCleared(fallback)) return [];
  return imagesFromSlot(fallback);
}

export async function saveSiteImageSlot(
  id: SiteImageSlotId,
  slot: SiteImageSlot
): Promise<{ success: boolean; error?: string }> {
  if (!getServiceRoleKey()) {
    return {
      success: false,
      error:
        'Save is not configured on the server (missing SUPABASE_SERVICE_ROLE_KEY in Vercel). Contact support to fix env vars.',
    };
  }

  const cleared = isSlotCleared(slot);
  if (!cleared) {
    if (!slot.images?.length && !slot.image?.src?.trim()) {
      return { success: false, error: 'Add an image URL or upload a photo before saving.' };
    }
    if (slot.images?.length) {
      const blank = slot.images.findIndex((img) => !img.src?.trim());
      if (blank !== -1) {
        return {
          success: false,
          error: `Slide ${blank + 1} has no photo yet — upload or paste a URL, or remove that slide before saving.`,
        };
      }
    }
  }

  try {
    const supabase = createAdminClient();
    const payload = slotToRow(id, slot);
    const { error } = await supabase.from('site_image_slots').upsert(payload as never, { onConflict: 'slot_id' });
    if (error) {
      const msg = error.message;
      if (msg.includes('site_image_slots') || msg.includes('does not exist')) {
        return {
          success: false,
          error:
            'Database table missing. Open Supabase → SQL editor, run supabase/migrations/0006_site_images.sql, then save again.',
        };
      }
      if (msg.includes('row-level security') || msg.includes('permission denied')) {
        return {
          success: false,
          error: 'Database rejected the save. SUPABASE_SERVICE_ROLE_KEY may be wrong in Vercel settings.',
        };
      }
      return { success: false, error: msg };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not save image slot.',
    };
  }
}

function slotToRow(id: SiteImageSlotId, slot: SiteImageSlot): DbRow & { updated_at: string } {
  const updated_at = new Date().toISOString();
  if (Array.isArray(slot.images)) {
    return {
      slot_id: id,
      src: null,
      images: slot.images.map((img) => normalizeImage(img.src, img)),
      focal_x: 50,
      focal_y: 50,
      zoom: 100,
      updated_at,
    };
  }
  if (slot.image?.src?.trim()) {
    const img = slot.image;
    const crop = normalizeCrop(img);
    return {
      slot_id: id,
      src: stripImageSrcForSave(img.src),
      images: null,
      focal_x: crop.focalX,
      focal_y: crop.focalY,
      zoom: crop.zoom,
      updated_at,
    };
  }
  return {
    slot_id: id,
    src: null,
    images: [],
    focal_x: 50,
    focal_y: 50,
    zoom: 100,
    updated_at,
  };
}

function stripImageSrcForSave(src: string): string {
  return normalizeImage(src).src;
}

const BUCKET = 'site-photos';
const ALLOWED_MIME = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];

function getServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
}

async function ensureSitePhotosBucket(supabase: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) {
    await supabase.storage.updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: 10485760,
      allowedMimeTypes: ALLOWED_MIME,
    });
    return;
  }

  await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 10485760,
    allowedMimeTypes: ALLOWED_MIME,
  });
}

function normalizeContentType(file: File, safeExt: string): string {
  if (file.type && ALLOWED_MIME.includes(file.type)) return file.type;
  if (safeExt === 'jpg' || safeExt === 'jpeg') return 'image/jpeg';
  if (safeExt === 'png') return 'image/png';
  if (safeExt === 'webp') return 'image/webp';
  if (safeExt === 'gif') return 'image/gif';
  if (safeExt === 'heic' || safeExt === 'heif') return 'image/heic';
  return 'image/jpeg';
}

export async function uploadSitePhoto(file: File): Promise<{ url?: string; error?: string }> {
  const serviceRoleKey = getServiceRoleKey();
  if (!serviceRoleKey) {
    return {
      error:
        'Photo upload is not configured on the server (missing SUPABASE_SERVICE_ROLE_KEY in Vercel). Paste a /photos/... path instead, or ask us to fix env vars.',
    };
  }

  try {
    const supabase = createAdminClient();
    await ensureSitePhotosBucket(supabase);

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext) ? ext : 'jpg';
    const storagePath = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${safeExt === 'jpeg' ? 'jpg' : safeExt}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = normalizeContentType(file, safeExt);
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        const local = await saveLocalPhoto(buffer, safeExt);
        if (local) return { url: local };
      }
      return {
        error:
          error.message.includes('site_image') || error.message.includes('relation')
            ? 'Photo storage is not set up yet. Run supabase/migrations/0006_site_images.sql in the Supabase SQL editor, then try again.'
            : error.message,
      };
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    return { url: data.publicUrl };
  } catch (err) {
    if (process.env.NODE_ENV === 'development' && file) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
        const local = await saveLocalPhoto(buffer, safeExt);
        if (local) return { url: local };
      } catch {
        /* fall through */
      }
    }
    return { error: err instanceof Error ? err.message : 'Upload failed.' };
  }
}

async function saveLocalPhoto(buffer: Buffer, ext: string): Promise<string | null> {
  const dir = path.join(process.cwd(), 'public', 'photos');
  await mkdir(dir, { recursive: true });
  const filename = `upload-${Date.now()}.${ext}`;
  await writeFile(path.join(dir, filename), buffer);
  return `/photos/${filename}`;
}

export { DEFAULT_SITE_IMAGES };
