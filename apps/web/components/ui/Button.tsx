import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'coral' | 'lime' | 'ghost' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-btn font-semibold ' +
  'transition focus-visible:outline-none focus-visible:ring-4 active:translate-y-px ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0';

// Canonical component spec — design_handoff_alistore/docs/Native Design System.md §3.
const variants: Record<ButtonVariant, string> = {
  coral: 'bg-coral text-white hover:bg-deep focus-visible:ring-coral/25',
  lime: 'bg-lime text-lime-ink hover:bg-lime-dark focus-visible:ring-lime/30',
  ghost: 'bg-transparent text-ink hover:bg-ink/5 focus-visible:ring-ink/15',
  outline:
    'border border-ink/15 bg-white text-ink hover:border-coral hover:text-coral focus-visible:ring-coral/20',
  danger: 'bg-danger text-white hover:brightness-95 focus-visible:ring-danger/25',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-[15px]',
  lg: 'h-12 px-6 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'coral', size = 'md', className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
