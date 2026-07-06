import { fetchCatalog } from '@/lib/api';
import { CatalogControls } from '@/components/CatalogControls';
import { ProductCard } from '@/components/ProductCard';

export const dynamic = 'force-dynamic';

interface HomeSearchParams {
  q?: string;
  category?: string;
  stockOnly?: string;
}

const VALUE_PROPS = [
  { title: 'Гарантия', body: 'На новое и Б/У' },
  { title: 'IMEI-проверка', body: 'Не краденое, не залок' },
  { title: 'Скупка · trade-in', body: 'Оценим и выкупим' },
];

export default async function Home({
  searchParams,
}: {
  searchParams: HomeSearchParams;
}) {
  const query = {
    q: searchParams.q,
    category: searchParams.category,
    stockOnly: searchParams.stockOnly === 'true',
    limit: 48,
  };

  // Parallel: the filtered grid + a broad pull to derive category chips.
  const [catalog, all] = await Promise.all([
    fetchCatalog(query),
    fetchCatalog({ limit: 100 }),
  ]);

  const categories = Array.from(new Set(all.items.map((p) => p.category))).sort();
  const offline = catalog.source === 'unavailable';

  return (
    <>
      <section aria-labelledby="hero-heading" className="pt-8 sm:pt-12">
        <div className="relative overflow-hidden rounded-card border border-ink/10 bg-tint px-6 py-10 shadow-soft sm:px-10 sm:py-14">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-coral/15 blur-2xl" />
          <div className="relative max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-chip bg-white/70 px-3 py-1 font-mono text-xs font-semibold text-deep">
              Бишкек · доставка по КР
            </p>
            <h1
              id="hero-heading"
              className="font-display text-4xl font-extrabold leading-[1.05] text-ink sm:text-6xl"
            >
              Электроника с гарантией —{' '}
              <span className="whitespace-nowrap text-coral">новое и Б/У</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-ink/70">
              Смартфоны, ноутбуки, аудио и часы. Каждое устройство проверено по IMEI.
              Честная цена, скупка и рассрочка 0-0-12.
            </p>
            <dl className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {VALUE_PROPS.map((v) => (
                <div
                  key={v.title}
                  className="rounded-btn border border-ink/10 bg-white/60 px-4 py-3"
                >
                  <dt className="font-display text-sm font-bold text-ink">{v.title}</dt>
                  <dd className="text-sm text-ink/60">{v.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section aria-labelledby="catalog-heading" className="mt-10">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 id="catalog-heading" className="font-display text-2xl font-bold text-ink">
            Каталог
          </h2>
          <p className="font-mono text-sm text-ink/45">
            {offline ? '—' : `${catalog.total} товаров`}
          </p>
        </div>

        <CatalogControls categories={categories} />

        {offline ? (
          <EmptyState
            title="Каталог временно недоступен"
            body="Не удалось связаться с API. Проверьте, что бэкенд запущен на :4000."
          />
        ) : catalog.items.length === 0 ? (
          <EmptyState
            title="Ничего не найдено"
            body="Попробуйте изменить запрос или снять фильтры."
          />
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {catalog.items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-8 rounded-card border border-dashed border-ink/15 bg-white/50 px-6 py-14 text-center">
      <p className="font-display text-lg font-bold text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink/55">{body}</p>
    </div>
  );
}
