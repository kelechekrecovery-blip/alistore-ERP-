'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart';

export function CartButton() {
  const { count, hydrated } = useCart();
  return (
    <Link
      href="/cart"
      className="inline-flex items-center gap-2 rounded-btn bg-ink px-4 py-2 text-sm font-semibold text-sand transition hover:bg-ink-dark"
    >
      Корзина
      <span className="min-w-[1.25rem] rounded-chip bg-lime px-1.5 py-0.5 text-center font-mono text-xs font-bold text-lime-ink">
        {hydrated ? count : 0}
      </span>
    </Link>
  );
}
