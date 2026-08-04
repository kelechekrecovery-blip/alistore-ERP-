import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** dark surfaces use a lighter shimmer. */
  tone?: 'light' | 'dark';
}

/** Loading placeholder shimmer (canon §4 — Loading state). */
export function Skeleton({ tone = 'light', className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-md',
        tone === 'light' ? 'bg-ink/[0.08]' : 'bg-white/10',
        className,
      )}
      {...props}
    />
  );
}
