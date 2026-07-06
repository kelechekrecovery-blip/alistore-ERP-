import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchProduct } from '@/lib/api';
import { conditionLabel, som } from '@/lib/format';
import { AddToCartButton } from '@/components/AddToCartButton';

export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await fetchProduct(params.id);
  if (!product) notFound();

  const condition = conditionLabel(product.attrs);
  const used = condition === 'Б/У';
  const inStock = product.availableUnits > 0;
  const specs = Object.entries(product.attrs ?? {}).filter(
    ([, v]) => typeof v === 'string' || typeof v === 'number',
  );

  return (
    <div className="py-8">
      <nav className="mb-6 text-sm text-ink/50" aria-label="Хлебные крошки">
        <Link href="/" className="transition hover:text-ink">
          Каталог
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink/70">{product.category}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-card border border-ink/10 bg-gradient-to-br from-tint to-sand">
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-display text-[9rem] font-extrabold text-coral/20">
              {product.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
          <span
            className={`absolute left-4 top-4 rounded-chip px-3 py-1 font-mono text-xs font-bold ${
              used ? 'bg-ink text-lime' : 'bg-lime text-lime-ink'
            }`}
          >
            {condition}
          </span>
        </div>

        <div className="flex flex-col">
          <p className="rounded-chip bg-tint px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-deep w-fit">
            {product.category}
          </p>
          <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight text-ink sm:text-4xl">
            {product.name}
          </h1>
          <p className="mt-2 font-mono text-sm text-ink/40">{product.sku}</p>

          <p className="mt-6 font-mono text-3xl font-bold tabular text-ink">
            {som(product.price)}
          </p>
          <p className={`mt-1 font-mono text-sm ${inStock ? 'text-success' : 'text-ink/40'}`}>
            {inStock ? `${product.availableUnits} шт. в наличии` : 'под заказ'}
          </p>

          <div className="mt-6 max-w-xs">
            <AddToCartButton
              product={{ id: product.id, sku: product.sku, name: product.name, price: product.price }}
              disabled={!inStock}
              full
            />
          </div>

          {specs.length > 0 && (
            <dl className="mt-8 divide-y divide-ink/10 border-t border-ink/10">
              {specs.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4 py-2.5 text-sm">
                  <dt className="text-ink/55">{key}</dt>
                  <dd className="font-medium text-ink">{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { t: 'Гарантия', b: 'на новое и Б/У' },
              { t: 'IMEI-чек', b: 'не краденое' },
              { t: 'Рассрочка', b: '0-0-12' },
            ].map((f) => (
              <div key={f.t} className="rounded-btn border border-ink/10 bg-white/60 px-3 py-2.5">
                <p className="font-display text-xs font-bold text-ink">{f.t}</p>
                <p className="text-xs text-ink/55">{f.b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
