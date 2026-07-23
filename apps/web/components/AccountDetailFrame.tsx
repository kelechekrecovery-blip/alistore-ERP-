import type { ReactNode } from 'react';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

export function AccountDetailFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="account-detail-shell fixed inset-0 z-40 flex justify-center bg-night font-sans"
      // Keep the first committed frame visually stable while Next loads the
      // responsive stylesheet after a cold account-detail navigation. Mobile
      // overrides this constant through the media rule in globals.css.
      style={{ backgroundColor: '#0b0a08' }}
    >
      <div className="account-detail-header">
        <SiteHeader variant="design3" />
      </div>
      <main className="account-detail-panel flex h-full w-full max-w-[440px] flex-col bg-ink-dark text-white">
        {children}
      </main>
      <div className="account-detail-footer">
        <SiteFooter />
      </div>
    </div>
  );
}
