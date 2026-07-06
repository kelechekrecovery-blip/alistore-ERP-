import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { CartProvider } from '@/lib/cart';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'AliStore — электроника с гарантией в Кыргызстане',
  description:
    'Новое и Б/У привозное с гарантией. Смартфоны, ноутбуки, аудио, часы — с проверкой по IMEI и честной ценой.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Golos+Text:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-sand bg-grain">
        <AuthProvider>
          <CartProvider>
            <SiteHeader />
            <main className="mx-auto w-full max-w-content px-4 sm:px-6">{children}</main>
            <SiteFooter />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
