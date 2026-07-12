import type { ReactNode } from 'react';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

export function AccountDetailFrame({ children }: { children: ReactNode }) {
  return (
    <div className="account-detail-shell fixed inset-0 z-40 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="account-detail-header">
        <SiteHeader />
      </div>
      <main className="account-detail-panel flex h-full w-full max-w-[440px] flex-col bg-[#16130F] text-white">
        {children}
      </main>
      <div className="account-detail-footer">
        <SiteFooter />
      </div>
    </div>
  );
}
