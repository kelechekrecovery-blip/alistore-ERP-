'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MobileSearch from '@/components/mobile/MobileSearch';

/**
 * Dedicated search screen on mobile (Клиент App 2.0). On desktop there's no separate
 * search route — the catalog has an inline search box — so we forward there, carrying
 * any q param.
 */
export default function SearchPage() {
  const router = useRouter();

  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      const q = new URLSearchParams(window.location.search).get('q');
      const target = q ? `/catalog?q=${encodeURIComponent(q)}` : '/catalog';
      router.replace(target);
      const fallback = window.setTimeout(() => {
        if (window.location.pathname === '/search') {
          window.location.assign(target);
        }
      }, 250);
      return () => window.clearTimeout(fallback);
    }
    return undefined;
  }, [router]);

  return (
    <div className="md:hidden">
      <MobileSearch />
    </div>
  );
}
