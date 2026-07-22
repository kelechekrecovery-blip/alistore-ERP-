import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { withSentryConfig } from '@sentry/nextjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same staff-only/ops path registry consumed by app/robots.ts (disallow) and
// app/sitemap.ts (never-index guard). Plain `fs.readFileSync` + `JSON.parse`
// instead of a JSON import assertion, so this keeps working across Node
// versions regardless of `with`/`assert` import-attribute support — this file
// is loaded directly by the Next CLI as ESM, not bundled by tsc/webpack.
const internalRoutes = JSON.parse(
  readFileSync(path.join(__dirname, 'config', 'internal-routes.json'), 'utf8'),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'ali.kg', 'www.ali.kg', 'admin.ali.kg'],
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  reactStrictMode: true,
  images: {
    // Каталог — это фотографии товаров, и весь исходный материал лежит как
    // PNG/JPEG. Без этой строки оптимизатор отдаёт исходный формат: AVIF режет
    // карточку товара в разы, WebP остаётся запасным для старых браузеров.
    // Порядок значим — Next выбирает первый поддерживаемый клиентом.
    formats: ['image/avif', 'image/webp'],
    // `remotePatterns` намеренно пуст: сегодня все картинки локальные
    // (`/products/...`), а разрешать произвольные хосты значит открыть
    // оптимизатор как прокси. Внешние URL из CMS рендерятся `unoptimized`
    // (см. `MediaImage` в app/page.tsx) — так же, как до этой правки.
  },
  async headers() {
    const noIndexHeaders = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
            : []),
        ],
      },
      // Belt-and-suspenders on top of robots.txt disallow: these are all
      // 'use client' staff/ops pages that cannot export their own per-route
      // `robots` metadata, so a direct/backlinked hit still ships noindex.
      ...internalRoutes.prefixes.flatMap((prefix) => [
        { source: prefix, headers: noIndexHeaders },
        { source: `${prefix}/:path*`, headers: noIndexHeaders },
      ]),
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
