import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import internalRoutes from '@/config/internal-routes.json';

// Internal staff/ERP/ops surfaces that must stay out of search indexes. The
// prefix list itself lives in one place (`config/internal-routes.json`) shared
// with `sitemap.ts` and `next.config.mjs`, so it cannot silently drift out of
// sync the way it did when a staff-only tool leaked into the sitemap.
const PRIVATE_PREFIXES: string[] = internalRoutes.prefixes;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: PRIVATE_PREFIXES,
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
