import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type SurfaceTone = 'light' | 'dark';

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** light = white storefront card; dark = ERP/POS panel (canon §5). */
  tone?: SurfaceTone;
  /** tighter padding for nested surfaces. */
  inset?: boolean;
}

// Canonical surface — radius `card` (18px), shadow `soft`; dark uses surface tokens.
export function Surface({
  tone = 'light',
  inset = false,
  className,
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(
        'rounded-card',
        tone === 'light'
          ? 'border border-ink/[0.08] bg-white shadow-soft'
          : 'border border-surface-3 bg-surface',
        inset ? 'p-4' : 'p-5',
        className,
      )}
      {...props}
    />
  );
}

/** Alias — a Surface is the canonical card. */
export const Card = Surface;
