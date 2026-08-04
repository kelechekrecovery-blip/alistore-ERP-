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
