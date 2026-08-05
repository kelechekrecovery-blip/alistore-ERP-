/**
 * Собирает безопасный `next` для перехода на /login из мобильного шелла.
 *
 * Тот же критерий, что уже применяет app/login/page.tsx к query-параметру
 * `next` (`startsWith('/') && !startsWith('//')`): один ведущий слэш —
 * относительный путь, два — protocol-relative URL на чужой хост (open
 * redirect). Здесь та же проверка нужна на противоположном конце: значение
 * идёт не из query, а из `usePathname()`, но входные данные всё равно
 * нельзя считать доверенными без явной проверки формы.
 */
export function safeLoginNext(path: string | null | undefined, fallback = '/'): string {
  if (typeof path !== 'string' || path.length === 0) return fallback;
  if (path.includes('\\')) return fallback;
  try {
    // URL parsing applies the same slash/backslash/control-character
    // normalization as browser navigation. Comparing origins is safer than a
    // growing deny-list of spellings for protocol-relative URLs.
    const base = new URL('https://alistore.invalid/');
    const resolved = new URL(path, base);
    return resolved.origin === base.origin && path.startsWith('/') ? path : fallback;
  } catch {
    return fallback;
  }
}

/** Готовая href на /login с безопасным next, для ссылки-кнопки «Войти». */
export function loginHref(path: string | null | undefined, fallback = '/'): string {
  return `/login?next=${encodeURIComponent(safeLoginNext(path, fallback))}`;
}
