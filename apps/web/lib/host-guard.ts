/**
 Решение проверки Host на границе витрины — чистая функция, без `next/server`,
 поэтому тестируется обычным vitest.

 Контроль «отвечать лишь на свои хосты» жил в `proxy.ts` с сигнатурой
 Next-middleware, но Next запускает middleware только из `middleware.ts` —
 `proxy.ts` не вызывал никто, и защита от Host-header injection / отдачи
 приложения на постороннем домене **никогда не работала**.

 Семантика отказоустойчива намеренно: это первая активация. Пустой список хостов
 НЕ роняет сайт (контроль бездействует, как и было де-факто); ограничение
 включается, только когда список задан. `/healthz` исключён всегда — Render
 дёргает его по `*.onrender.com`, которого нет среди доменов.
 */
export function hostDecision(
  pathname: string,
  host: string,
  allowedHostsEnv: string | undefined,
  isProduction: boolean,
): 'allow' | 'reject' {
  if (!isProduction) return 'allow';
  if (pathname === '/healthz') return 'allow';
  const allowed = (allowedHostsEnv ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return 'allow';
  const normalized = host.split(':', 1)[0].toLowerCase();
  return allowed.includes(normalized) ? 'allow' : 'reject';
}
