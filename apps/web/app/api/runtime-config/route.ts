import { NextResponse } from 'next/server';

/**
 * Значения, которые нельзя вшить в бандл на сборке: их задают при запуске
 * стенда. Единственный оставшийся потребитель — `instrumentation-client.ts`,
 * который выясняет Sentry DSN, когда его нет в `NEXT_PUBLIC_SENTRY_DSN`.
 *
 * Плашка демо-режима сюда больше не ходит: она стала серверным компонентом и
 * читает env напрямую (`components/DemoModeBanner.tsx`). До этого запрос летел
 * на КАЖДОЙ полной загрузке любой страницы витрины — корневой layout висел на
 * всех маршрутах, — и в проде неизменно получал `{"sentryDsn":null,
 * "demoMode":false}`, то есть полный круг до origin ради «ничего не изменилось».
 */
export function GET() {
  const demoMode = [process.env.PUBLIC_DEMO_MODE, process.env.NEXT_PUBLIC_DEMO_MODE]
    .some((value) => value?.trim().toLowerCase() === 'true');
  return NextResponse.json(
    {
      sentryDsn: process.env.SENTRY_DSN ?? null,
      sentryEnvironment: process.env.SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      demoMode,
    },
    {
      headers: {
        // Ответ одинаков для всех и меняется только при перезапуске с другим
        // env, поэтому кэшируется публично. Раньше заголовка не было вовсе —
        // ни браузер, ни Cloudflare не кэшировали (`cf-cache-status: DYNAMIC`).
        // Sentry DSN публичен по устройству: он и так уезжает в клиентский код.
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    },
  );
}
