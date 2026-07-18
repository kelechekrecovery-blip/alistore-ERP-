'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="ru">
      <body className="grid min-h-screen place-items-center bg-night px-6 text-center text-white">
        <main><h1 className="text-2xl font-bold">AliStore временно недоступен</h1><p className="mt-3 text-sm text-muted">Ошибка уже отправлена команде. Обновите страницу через несколько минут.</p></main>
      </body>
    </html>
  );
}
