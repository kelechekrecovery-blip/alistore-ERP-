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
