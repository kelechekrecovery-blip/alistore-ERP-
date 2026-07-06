import Link from 'next/link';
import type { CatalogProduct } from '@/lib/api';
import { conditionLabel, som } from '@/lib/format';
import { AddToCartButton } from './AddToCartButton';

export function ProductCard({ product }: { product: CatalogProduct }) {
  const condition = conditionLabel(product.attrs);
  const inStock = product.availableUnits > 0;
  const used = condition === 'Б/У';
  const href = `/product/${product.id}`;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-ink/10 bg-white shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-lift">
      <Link href={href} className="block" aria-label={product.name}>
        <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-tint to-sand">
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-display text-5xl font-extrabold text-coral/25 transition-transform duration-300 group-hover:scale-110">
              {product.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
          <span
            className={`absolute left-3 top-3 rounded-chip px-2.5 py-1 font-mono text-[11px] font-bold ${
              used ? 'bg-ink text-lime' : 'bg-lime text-lime-ink'
            }`}
          >
            {condition}
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="rounded-chip bg-tint px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-deep">
            {product.category}
          </p>
          <p className={`font-mono text-[11px] ${inStock ? 'text-success' : 'text-ink/40'}`}>
            {inStock ? `${product.availableUnits} в наличии` : 'под заказ'}
          </p>
        </div>

        <h3 className="text-base font-semibold leading-snug text-ink">
          <Link href={href} className="outline-none transition hover:text-deep focus-visible:text-deep">
            {product.name}
          </Link>
        </h3>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div>
            <p className="font-mono text-lg font-bold tabular text-ink">{som(product.price)}</p>
            <p className="font-mono text-[11px] text-ink/40">{product.sku}</p>
          </div>
          <AddToCartButton
            product={{
              id: product.id,
              sku: product.sku,
              name: product.name,
              price: product.price,
            }}
            disabled={!inStock}
          />
        </div>
      </div>
    </article>
  );
}
