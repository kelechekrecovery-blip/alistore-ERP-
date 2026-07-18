import type { ReactNode } from 'react';

/** Shared ERP surface card: the dark rounded panel every ERP view sits on. */
export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-[16px] border border-surface-3 bg-surface p-5">{children}</div>;
}
