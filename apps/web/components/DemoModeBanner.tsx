'use client';

import { useEffect, useState } from 'react';

export function DemoModeBanner() {
  const [visible, setVisible] = useState(process.env.NEXT_PUBLIC_DEMO_MODE === 'true');

  useEffect(() => {
    fetch('/api/runtime-config')
      .then((response) => response.ok ? response.json() : null)
      .then((config: { demoMode?: boolean } | null) => setVisible(config?.demoMode === true))
      .catch(() => undefined);
  }, []);

  if (!visible) return null;
  return (
    <aside
      aria-label="Демонстрационный режим"
      className="fixed inset-x-0 bottom-0 z-[200] border-t border-coral-light bg-ink px-4 py-2 text-center text-xs font-bold text-white shadow-[0_-8px_28px_rgba(0,0,0,.28)]"
    >
      Демо-режим: списание, резерв товара и фискализация не производятся
    </aside>
  );
}
