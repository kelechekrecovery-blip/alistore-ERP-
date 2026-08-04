/**
 * Полезная нагрузка Telegram Login Widget → та же query-строка, что присылает
 * Mini App.
 *
 * Сервер разбирает оба источника одинаково (`URLSearchParams` в
 * `apps/api/src/auth/social-login.ts`) и различает их только способом счёта
 * подписи: Mini App — HMAC от `'WebAppData'`, виджет — SHA-256 от токена.
 * Поэтому переименовывать или отбрасывать поля нельзя: строка подписи строится
 * из тех же пар ключ-значение, и лишний или потерянный ключ сделает хеш
 * несходящимся.
 */
export function telegramWidgetInitData(user: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(user)) {
    // `null`/`undefined` Telegram не подписывал — отправив «null» строкой, мы
    // добавили бы в data-check-string пару, которой не было у отправителя.
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  return params.toString();
}
