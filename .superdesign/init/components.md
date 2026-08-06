# Shared UI components

## Stack detection

- Framework: React 18 with Next.js 16 App Router and TypeScript.
- Component system: custom AliStore primitives (no shadcn/MUI/Chakra/Ant Design); Lucide icons are used by consuming components.
- Styling: Tailwind CSS 3 plus global CSS layers and canonical CSS variables.
- Shared primitive roots: `apps/web/components/ui/` and the cross-module ERP surface in `apps/web/components/erp/Card.tsx`.

## cn

- Path: `apps/web/components/ui/cn.ts`
- Description: Shared class-name merger used by every UI primitive.
- Key props: `inputs: ClassValue[]`

```ts
export type ClassValue = string | number | false | null | undefined;

/** Minimal className joiner (no external clsx dependency). */
export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ');
}
```

## Button

- Path: `apps/web/components/ui/Button.tsx`
- Description: Canonical action button with coral, lime, ghost, outline, and danger variants.
- Key props: `variant`, `size`, plus native button props

```tsx
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
```

## Input

- Path: `apps/web/components/ui/Input.tsx`
- Description: Canonical styled native input with focus and disabled states.
- Key props: Native input props plus `className`

```tsx
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

// Wraps the canonical `.input` class (app/globals.css) so field styling lives in one place.
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn('input', className)} {...props} />
  ),
);
Input.displayName = 'Input';
```

## StatusPill, Chip, Badge

- Path: `apps/web/components/ui/Badge.tsx`
- Description: Status, filter/tag, and brand badge primitives.
- Key props: `status` for StatusPill; native span props

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type Status = 'success' | 'warn' | 'danger' | 'info' | 'neutral';

const dotTone: Record<Status, string> = {
  success: 'bg-success',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-faint',
};
const textTone: Record<Status, string> = {
  success: 'text-success',
  warn: 'text-warn',
  danger: 'text-danger',
  info: 'text-info',
  neutral: 'text-faint',
};
const bgTone: Record<Status, string> = {
  success: 'bg-success/10',
  warn: 'bg-warn/12',
  danger: 'bg-danger/10',
  info: 'bg-info/12',
  neutral: 'bg-ink/5',
};

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  status?: Status;
}

/** Status indicator with a colored dot — success/warn/danger/info (canon §4 states). */
export function StatusPill({
  status = 'neutral',
  className,
  children,
  ...props
}: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-xs font-semibold',
        bgTone[status],
        textTone[status],
        className,
      )}
      {...props}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotTone[status])} />
      {children}
    </span>
  );
}

/** Neutral pill for filters/tags. */
export function Chip({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-chip bg-sand px-2.5 py-1 text-[13px] text-ink/70',
        className,
      )}
      {...props}
    />
  );
}

/** Loud brand badge — grade / −% / НОВИНКА. */
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md bg-coral px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white',
        className,
      )}
      {...props}
    />
  );
}
```

## Surface / Card

- Path: `apps/web/components/ui/Surface.tsx`
- Description: Canonical light or dark card surface.
- Key props: `tone`, `inset`, plus native div props

```tsx
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
```

## Skeleton, SkeletonText

- Path: `apps/web/components/ui/Skeleton.tsx`
- Description: Loading placeholders with reduced-motion support.
- Key props: Native div props; `lines` for SkeletonText

```tsx
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
```

## UI barrel exports

- Path: `apps/web/components/ui/index.ts`
- Description: Public export surface for the shared primitive library.
- Key props: N/A

```ts
// Canonical UI primitive library — design_handoff_alistore/docs/Native Design System.md §3.
// Token-driven, with designed hover/focus/active/disabled states. Import from '@/components/ui'.
export { cn } from './cn';
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { Surface, Card } from './Surface';
export type { SurfaceProps, SurfaceTone } from './Surface';
export { Input } from './Input';
export type { InputProps } from './Input';
export { StatusPill, Chip, Badge } from './Badge';
export type { StatusPillProps, Status } from './Badge';
export { Skeleton } from './Skeleton';
export type { SkeletonProps } from './Skeleton';
```

## ERP Card

- Path: `apps/web/components/erp/Card.tsx`
- Description: Shared ERP 3.0 glass surface used across ERP modules.
- Key props: `children`, `className`

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps {
  children: ReactNode;
  className?: string;
}

/** Shared ERP 3.0 glass surface used by every module view. */
export function Card({ children, className }: CardProps) {
  return <div className={cn('erp3-glass rounded-[18px] p-5', className)}>{children}</div>;
}
```
