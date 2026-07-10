import type { ReactNode } from 'react';

/** Shared ERP surface card: the dark rounded panel every ERP view sits on. */
export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5">{children}</div>;
}
