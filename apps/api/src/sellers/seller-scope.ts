import type { AuthPrincipal } from '../auth/jwt.strategy';

/**
 * Область видимости запроса: чей ассортимент разрешено трогать.
 *
 * Одна функция на все seller-scoped запросы намеренно. Разбросанная по
 * сервисам проверка «а этот сотрудник от магазина?» — это место, где однажды
 * забудут фильтр и чужой ассортимент утечёт целиком. Здесь она одна и её видно.
 *
 * `null` означает «без ограничения»: владелец и админ AliStore ведут весь
 * каталог, включая партнёрский. Строка — жёсткая граница одного магазина.
 *
 * Клиентский токен области не получает вовсе: покупателю нечего «вести», а
 * выдать ему `null` значило бы дать те же права, что владельцу.
 */
export function sellerScopeFor(principal: AuthPrincipal): string | null {
  if (principal.typ !== 'staff') return null;
  const sellerId = (principal as { sellerId?: string | null }).sellerId;
  return sellerId ?? null;
}

/**
 * Условие Prisma для выборки товаров в этой области.
 *
 * Для AliStore — пустой объект (весь каталог). Для магазина — точное совпадение
 * по владельцу: `undefined` здесь был бы катастрофой, Prisma молча вернула бы
 * всё, поэтому значение всегда конкретное.
 */
export function sellerProductWhere(scope: string | null): { sellerId?: string } {
  return scope === null ? {} : { sellerId: scope };
}
