import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { fontDisplay, fontSans, fontMono } from './fonts';
import { CartProvider } from '@/lib/cart';
import { AuthProvider } from '@/lib/auth';
import { FavoritesProvider } from '@/lib/favorites';
import { CompareProvider } from '@/lib/compare';
import { DemoModeBanner } from '@/components/DemoModeBanner';
import { AttributionCapture } from '@/components/AttributionCapture';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  // Resolves relative openGraph/twitter image URLs (e.g. product photos stored as
  // root-relative `/uploads/...` paths) against the public origin instead of Next's
  // "http://localhost:3000" fallback, which would break link previews in production.
  metadataBase: new URL(SITE_URL),
  title: 'AliStore — электроника с гарантией в Кыргызстане',
  description:
    'Новое и Б/У привозное с гарантией. Смартфоны, ноутбуки, аудио, часы — с проверкой по IMEI и честной ценой.',
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ru"
      className={`${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`}
    >
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        {/*
          Шрифты первого экрана. Браузер находит @font-face только разобрав CSS,
          то есть узнаёт о них позже, чем мог бы; preload убирает эту задержку.
          Здесь ровно два файла основного семейства — кириллица и латиница
          Golos Text: остальные начертания нарезаны по unicode-range и грузятся
          сами, только если такие символы реально встретились на странице.
        */}
        <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/fonts/cfdfbee4d6cf0a93-s.p.1jwcpm6w583_v.woff2" />
        <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/fonts/b4a06a523f527a0e-s.p.3psl0_mnhzy2y.woff2" />
      </head>
      <body className="min-h-screen bg-night">
        <AttributionCapture />
        <AuthProvider>
          <CartProvider>
            <FavoritesProvider>
              <CompareProvider>
                <MotionConfig reducedMotion="user">{children}</MotionConfig>
                <DemoModeBanner />
              </CompareProvider>
            </FavoritesProvider>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
