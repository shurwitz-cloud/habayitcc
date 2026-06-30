import Link from 'next/link';
import { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'gold' | 'outline-navy' | 'outline-light';

interface BaseButtonProps {
  variant?: ButtonVariant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  gold: 'bg-gold text-white border border-gold hover:bg-[#a37e24] hover:border-[#a37e24]',
  'outline-navy':
    'bg-transparent text-navy border-[1.5px] border-navy hover:bg-navy hover:text-white',
  'outline-light':
    'bg-transparent text-white border-[1.5px] border-white/50 hover:bg-white hover:text-navy',
};

const baseClasses =
  'inline-block px-9 py-3.5 rounded-full text-[0.8rem] font-bold uppercase tracking-wider transition-all duration-200';

/**
 * Button — for in-page actions (form submits, toggles).
 * Use LinkButton for navigation to another page/anchor.
 */
export function Button({
  variant = 'gold',
  children,
  className = '',
  ...props
}: BaseButtonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

interface LinkButtonProps extends BaseButtonProps {
  href: string;
}

/**
 * LinkButton — for navigation. Renders as Next.js <Link> so client-side
 * routing is used instead of a full page reload.
 */
export function LinkButton({
  href,
  variant = 'gold',
  children,
  className = '',
}: LinkButtonProps) {
  return (
    <Link href={href} className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {children}
    </Link>
  );
}
