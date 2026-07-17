/**
 * Canonical public origin of the storefront. Used for sitemap, robots and
 * JSON-LD URLs; trailing slashes are stripped so callers can append paths.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://alistore.kg').replace(/\/+$/, '');
