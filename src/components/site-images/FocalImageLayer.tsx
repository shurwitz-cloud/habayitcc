import type { CSSProperties } from 'react';
import type { SiteImageCrop } from '@/lib/site-images/types';

interface FocalImageLayerProps extends SiteImageCrop {
  src: string;
  className?: string;
  style?: CSSProperties;
}

/** Image layer that always covers its parent — works on narrow and wide viewports. */
export function FocalImageLayer({ src, focalX, focalY, zoom, className = '', style }: FocalImageLayerProps) {
  if (!src) return null;

  const scale = zoom / 100;

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} style={style}>
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        className="h-full w-full object-cover"
        style={{
          objectPosition: `${focalX}% ${focalY}%`,
          transform: `scale(${scale})`,
          transformOrigin: `${focalX}% ${focalY}%`,
        }}
      />
    </div>
  );
}
