import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Internal staff/ERP surfaces that must stay out of search indexes.
const PRIVATE_PREFIXES = ['/erp', '/pos', '/admin', '/staff', '/warehouse', '/account', '/api', '/order'];

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
