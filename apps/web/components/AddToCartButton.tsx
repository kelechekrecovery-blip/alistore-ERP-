'use client';

import { useState } from 'react';
import { useCart } from '@/lib/cart';

interface AddToCartButtonProps {
  product: { id: string; sku: string; name: string; price: number; stockLimit: number };
  disabled?: boolean;
  full?: boolean;
}

export function AddToCartButton({ product, disabled, full }: AddToCartButtonProps) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  const onClick = () => {
    add(product);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`Добавить ${product.name} в корзину`}
      className={[
        full ? 'w-full py-3 text-base' : 'px-3.5 py-2 text-sm',
        'rounded-btn font-semibold transition disabled:cursor-not-allowed disabled:bg-ink/15 disabled:text-ink/40',
        added ? 'bg-success text-white' : 'bg-coral text-white hover:bg-deep',
      ].join(' ')}
    >
      {added ? 'Добавлено ✓' : 'В корзину'}
    </button>
  );
}
