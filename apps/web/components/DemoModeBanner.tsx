/**
 * Плашка демо-стенда. Серверный компонент по расчёту: признак берётся из env,
 * а значит известен уже при рендере страницы.
 *
 * Раньше это был клиентский компонент, который на КАЖДОЙ загрузке страницы
 * дёргал `/api/runtime-config` — только чтобы узнать то, что сервер и так знал.
 * В проде ответ всегда `demoMode: false`, то есть запрос был чистой платой за
 * ничего, на всех страницах витрины сразу (компонент висит в корневом layout).
 */
export function DemoModeBanner() {
  if (!isDemoMode()) return null;
  return (
    <aside
      aria-label="Демонстрационный режим"
      className="fixed inset-x-0 bottom-0 z-[200] border-t border-coral-light bg-ink px-4 py-2 text-center text-xs font-bold text-white shadow-[0_-8px_28px_rgba(0,0,0,.28)]"
    >
      Демо-режим: списание, резерв товара и фискализация не производятся
    </aside>
  );
}

/**
 * Обе переменные читаются намеренно: `NEXT_PUBLIC_DEMO_MODE` инлайнится в бандл
 * на сборке, `PUBLIC_DEMO_MODE` задаётся на рантайме — стенд поднимают и так, и
 * так. Та же пара, что читает `app/api/runtime-config/route.ts`.
 */
export function isDemoMode(): boolean {
  return [process.env.PUBLIC_DEMO_MODE, process.env.NEXT_PUBLIC_DEMO_MODE].some(
    (value) => value?.trim().toLowerCase() === 'true',
  );
}
