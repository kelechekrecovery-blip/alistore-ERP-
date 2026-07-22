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
