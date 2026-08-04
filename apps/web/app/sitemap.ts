import type { MetadataRoute } from 'next';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';
import { SITE_URL } from '@/lib/site';
import internalRoutes from '@/config/internal-routes.json';

export const dynamic = 'force-dynamic';

type ChangeFrequency = MetadataRoute.Sitemap[number]['changeFrequency'];

// `/assess` used to live here — it is a staff-only trade-in valuation tool
// (`app/assess/page.tsx`, gated by StaffSessionLogin), not a storefront page,
// and got published to search engines with priority 0.6 by mistake. The
// `isInternalPath` guard below now makes that class of mistake self-correcting:
// any path matching `config/internal-routes.json` (the same list `robots.ts`
// disallows) is dropped here rather than trusted by hand.
//
// Public storefront pages only — never emit internal staff/ERP/ops surfaces.
const STATIC_ROUTES: Array<{ path: string; changeFrequency: ChangeFrequency; priority: number }> = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/catalog', changeFrequency: 'daily', priority: 0.9 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/delivery', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/login', changeFrequency: 'monthly', priority: 0.3 },
  { path: '/trade-in', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/b2b', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/support', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/compare', changeFrequency: 'weekly', priority: 0.4 },
  { path: '/favorites', changeFrequency: 'weekly', priority: 0.4 },
  { path: '/cart', changeFrequency: 'weekly', priority: 0.4 },
];

const CATALOG_PAGE_SIZE = 100; // the catalog API caps `limit` at 100
const MAX_CATALOG_PAGES = 50; // safety stop at 5000 products

/** True when `path` is (or is nested under) a staff-only/ops prefix that must never be indexed. */
function isInternalPath(path: string): boolean {
  return internalRoutes.prefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = STATIC_ROUTES.filter((route) => !isInternalPath(route.path)).map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    const products = await fetchAllCatalogProducts();
    return [
      ...staticRoutes,
      ...products.map((product) => ({
        url: `${SITE_URL}/product/${product.id}`,
        lastModified: product.updatedAt ? new Date(product.updatedAt) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    ];
    // fixtures-allowed: sitemap для поисковиков, не экран пользователя; при недоступном API отдаём статические маршруты, а не выдумываем товары
  } catch {
    // API unreachable — degrade to the static routes only.
    return staticRoutes;
  }
}

async function fetchAllCatalogProducts(): Promise<CatalogProduct[]> {
  const items: CatalogProduct[] = [];
  for (let page = 0; page < MAX_CATALOG_PAGES; page += 1) {
    const response = await fetchCatalog({ limit: CATALOG_PAGE_SIZE, offset: page * CATALOG_PAGE_SIZE, sort: 'name' });
    items.push(...response.items);
    if (response.items.length < CATALOG_PAGE_SIZE || items.length >= response.total) break;
  }
  return items;
}
