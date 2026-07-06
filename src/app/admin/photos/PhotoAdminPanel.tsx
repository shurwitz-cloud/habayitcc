'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { AdminNav } from '@/components/admin/AdminNav';
import { FocalImageLayer } from '@/components/site-images/FocalImageLayer';
import type { SiteImage, SiteImageSlot, SiteImageSlotId, SiteImagesConfig } from '@/lib/site-images/types';
import { IMAGE_SLOT_META } from '@/lib/site-images/slots';
import { DEFAULT_CROP, normalizeCrop, normalizeImage } from '@/lib/site-images/crop';
import {
  resetSiteImageSlotAction,
  saveSiteImageSlotAction,
  uploadSitePhotoAction,
} from './actions';

function slotToImages(slot: SiteImageSlot): SiteImage[] {
  if (slot.images?.length) return slot.images;
  if (slot.image) return [slot.image];
  return [];
}

function imagesToSlot(images: SiteImage[], multi: boolean): SiteImageSlot {
  if (multi) return { images };
  return { image: images[0] };
}

export function PhotoAdminPanel({
  initialConfig,
  defaults,
}: {
  initialConfig: SiteImagesConfig;
  defaults: SiteImagesConfig;
}) {
  const [selectedId, setSelectedId] = useState<SiteImageSlotId>('home.hero');
  const [config, setConfig] = useState(initialConfig);
  const [imageIndex, setImageIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const meta = useMemo(() => IMAGE_SLOT_META.find((s) => s.id === selectedId)!, [selectedId]);
  const slot = config[selectedId] ?? defaults[selectedId];
  const images = slotToImages(slot);
  const activeImage = images[imageIndex] ?? normalizeImage('', DEFAULT_CROP);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof IMAGE_SLOT_META>();
    for (const item of IMAGE_SLOT_META) {
      const list = map.get(item.page) ?? [];
      list.push(item);
      map.set(item.page, list);
    }
    return [...map.entries()];
  }, []);

  function updateActiveImage(patch: Partial<SiteImage>) {
    const nextImages = [...images];
    nextImages[imageIndex] = normalizeImage(patch.src ?? activeImage.src, {
      ...activeImage,
      ...patch,
    });
    setConfig((prev) => ({
      ...prev,
      [selectedId]: imagesToSlot(nextImages, meta.multi),
    }));
  }

  function handlePan(deltaX: number, deltaY: number, rect: DOMRect) {
    const focalX = activeImage.focalX - (deltaX / rect.width) * 40;
    const focalY = activeImage.focalY - (deltaY / rect.height) * 40;
    updateActiveImage({
      focalX: Math.min(100, Math.max(0, focalX)),
      focalY: Math.min(100, Math.max(0, focalY)),
    });
  }

  function handleSave() {
    setMessage('');
    setError('');
    startTransition(async () => {
      const result = await saveSiteImageSlotAction(selectedId, config[selectedId]);
      if (result.success) setMessage('Saved — live site updated.');
      else setError(result.error ?? 'Save failed.');
    });
  }

  function handleReset() {
    setMessage('');
    setError('');
    startTransition(async () => {
      const result = await resetSiteImageSlotAction(selectedId);
      if (result.success) {
        setConfig((prev) => ({ ...prev, [selectedId]: defaults[selectedId] }));
        setImageIndex(0);
        setMessage('Reset to default.');
      } else {
        setError(result.error ?? 'Reset failed.');
      }
    });
  }

  function handleUpload(file: File) {
    setMessage('');
    setError('');
    const fd = new FormData();
    fd.set('file', file);
    startTransition(async () => {
      const result = await uploadSitePhotoAction(fd);
      if (result.url) {
        updateActiveImage({ src: result.url });
        setMessage('Uploaded — adjust crop and click Save.');
      } else {
        setError(result.error ?? 'Upload failed. Try a /photos/... path instead.');
      }
    });
  }

  return (
    <div>
      <AdminNav />
      <div className="grid lg:grid-cols-[280px_1fr] gap-8">
      <aside className="bg-white border border-line rounded-2xl p-4 h-fit lg:sticky lg:top-24">
        <div className="mb-4">
          <h2 className="font-bold text-navy">Photo slots</h2>
        </div>
        {grouped.map(([page, slots]) => (
          <div key={page} className="mb-4">
            <p className="text-[0.65rem] uppercase tracking-wider text-gold font-bold mb-2">{page}</p>
            <ul className="space-y-1">
              {slots.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(s.id);
                      setImageIndex(0);
                      setMessage('');
                      setError('');
                    }}
                    className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                      selectedId === s.id ? 'bg-navy text-white' : 'hover:bg-soft text-navy'
                    }`}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      <div className="bg-white border border-line rounded-2xl p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-[0.65rem] uppercase tracking-wider text-gold font-bold">{meta.page}</p>
            <h1 className="text-2xl font-bold text-navy">{meta.label}</h1>
            <p className="text-sm text-muted mt-1">
              Drag the preview to reposition. Use zoom to crop tighter. Save when it looks right.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleReset}
              disabled={isPending}
              className="px-4 py-2 rounded-full border border-line text-sm font-semibold text-navy"
            >
              Reset default
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="px-5 py-2 rounded-full bg-gold text-white text-sm font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {isPending ? 'Saving…' : 'Save slot'}
            </button>
          </div>
        </div>

        {meta.multi && images.length > 1 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {images.map((img, i) => (
              <button
                key={`${img.src}-${i}`}
                type="button"
                onClick={() => setImageIndex(i)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                  imageIndex === i ? 'bg-navy text-white' : 'bg-soft text-navy'
                }`}
              >
                Slide {i + 1}
              </button>
            ))}
          </div>
        )}

        <CropPreview
          image={activeImage}
          aspectRatio={meta.aspectRatio}
          onPan={handlePan}
        />

        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <label className="flex flex-col gap-2">
            <span className="text-[0.72rem] font-bold uppercase tracking-wide text-navy">Zoom</span>
            <input
              type="range"
              min={100}
              max={220}
              value={activeImage.zoom}
              onChange={(e) => updateActiveImage({ zoom: Number(e.target.value) })}
              className="w-full"
            />
            <span className="text-xs text-muted">{activeImage.zoom}%</span>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[0.72rem] font-bold uppercase tracking-wide text-navy">
              Image URL or path
            </span>
            <input
              value={activeImage.src}
              onChange={(e) => updateActiveImage({ src: e.target.value })}
              placeholder="/photos/example.jpg"
              className="w-full"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 items-center">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isPending}
            className="px-5 py-2.5 rounded-full border border-navy text-navy text-sm font-semibold"
          >
            Upload new photo
          </button>
          <p className="text-xs text-muted">
            Uploads go to Supabase storage when configured; otherwise paste a path under /photos/.
          </p>
        </div>

        {(message || error) && (
          <div
            className={`mt-6 rounded-xl px-4 py-3 text-sm ${
              error ? 'bg-[#fdecea] text-danger border border-[#f3c4c0]' : 'bg-soft border border-line text-navy'
            }`}
          >
            {error || message}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

function CropPreview({
  image,
  aspectRatio,
  onPan,
}: {
  image: SiteImage;
  aspectRatio: string;
  onPan: (dx: number, dy: number, rect: DOMRect) => void;
}) {
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  return (
    <div
      className="relative w-full max-w-3xl mx-auto rounded-[18px] overflow-hidden border border-line cursor-grab active:cursor-grabbing select-none touch-none bg-[#d8c9a8]"
      style={{ aspectRatio }}
      onPointerDown={(e) => {
        dragging.current = true;
        last.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onPan(e.clientX - last.current.x, e.clientY - last.current.y, rect);
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <FocalImageLayer {...image} />
      {!image.src && (
        <div className="absolute inset-0 grid place-items-center text-muted text-sm">
          No image — upload or paste a URL
        </div>
      )}
      <div className="absolute inset-0 ring-2 ring-inset ring-white/30 pointer-events-none" />
      <p className="absolute bottom-3 left-3 right-3 text-center text-[0.65rem] uppercase tracking-wider text-white/90 drop-shadow">
        Drag to reposition · {image.focalX.toFixed(0)}% · {image.focalY.toFixed(0)}%
      </p>
    </div>
  );
}
