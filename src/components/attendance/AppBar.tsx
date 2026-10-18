import Link from 'next/link';

export function AppBar({
  backHref,
  backLabel,
  title,
  subtitle,
}: {
  backHref?: string;
  backLabel?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="sticky top-0 z-10 bg-navy text-white px-4 pt-[max(0.85rem,env(safe-area-inset-top))] pb-4">
      {backHref && (
        <Link href={backHref} className="inline-block text-sm font-semibold text-gold-light mb-1">
          {backLabel ?? 'Back'}
        </Link>
      )}
      <p className="text-[0.68rem] uppercase tracking-[0.18em] text-gold-light font-bold">HaBayit</p>
      <h1 className="font-display text-[1.85rem] leading-none font-bold mt-1">{title}</h1>
      {subtitle && <p className="text-sm text-white/80 mt-1">{subtitle}</p>}
    </header>
  );
}
