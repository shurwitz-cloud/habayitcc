import { FocalImageLayer } from '@/components/site-images/FocalImageLayer';
import type { SiteImage } from '@/lib/site-images/types';

interface SiteBackgroundProps {
  image: SiteImage;
  className?: string;
  overlay?: string;
}

/** Background image with admin-controlled crop/zoom — always covers the container. */
export function SiteBackground({ image, className = '', overlay }: SiteBackgroundProps) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <FocalImageLayer {...image} />
      {overlay && <div className="absolute inset-0" style={{ background: overlay }} />}
    </div>
  );
}
