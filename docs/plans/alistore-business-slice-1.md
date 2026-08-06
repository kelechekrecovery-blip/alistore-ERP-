# AliStore Business — срез 1: продавец, владение товаром, изоляция

## Контекст

Сторонние магазины должны получить кабинет на ali.kg, где они сами ведут свой
ассортимент. Учёт AliStore остаётся прежним: чужие магазины просто видны в
отчётах как отдельные продавцы.

Строить кабинет раньше владения нельзя. Пока у товара нет хозяина, «свой
ассортимент» — пустые слова, а любой экран кабинета показывал бы всё подряд.
Поэтому первый срез — данные и изоляция, а не интерфейс.

**Главный инвариант среза:** продавец никогда не видит и не меняет чужую строку.
Он проверяется на уровне данных, а не вёрстки: экран можно обойти, запрос — нет.

**Что не меняется.** Товары AliStore имеют `sellerId = null` и ведут себя ровно
как сейчас — это проверяется тестом, а не надеждой. Ни касса, ни склад, ни
заказы в этом срезе не трогаются.

## Задачи

### 1. Схема и миграция

- `apps/api/prisma/schema.prisma`: модель `Seller` (`id`, `name`, `slug @unique`,
  `active`, `createdAt`, `updatedAt`); `Product.sellerId String?` + связь;
  `StaffUser.sellerId String?` + связь.
- Миграция строго аддитивна: только `CREATE TABLE` и `ADD COLUMN` с `NULL`.
  Существующие товары остаются AliStore-овыми без единого `UPDATE`.
- Индексы: `Product(sellerId, archived)`, `StaffUser(sellerId)`.

**Тест до кода** — `apps/api/test/seller-ownership.e2e-spec.ts`:
- товар, созданный как раньше, имеет `sellerId = null`;
- каталог отдаёт его без пометки продавца.

### 2. Резолвер продавца и изоляция

- `apps/api/src/sellers/seller-scope.ts` — чистая функция
  `sellerScopeFor(principal, staffSellerId)`: возвращает `null` для владельца и
  админа AliStore (видят всё) либо `sellerId` для сотрудника магазина.
- `apps/api/src/sellers/sellers.service.ts` — `assertOwns(sellerId, productId)`.

**Тест до кода** — тот же спек:
- продавец A не читает товар продавца B → `NotFoundException` (не `Forbidden`:
  чужой товар для него не «запрещён», а не существует — иначе перебор id
  подтверждает наличие);
- продавец A не меняет товар продавца B;
- владелец AliStore видит оба.

### 3. Каталог отдаёт продавца

- `apps/api/src/catalog/catalog.dto.ts` — `seller?: { id, name }`.
- `apps/api/src/catalog/catalog.service.ts` — `enrichSellers()` рядом с
  `enrichOffers()`, одним запросом на страницу, без N+1.

**Тест:** товар с продавцом отдаёт `seller`, товар AliStore — не отдаёт поля вовсе.

### 4. Витрина помечает чужой товар

- `apps/web/lib/api/catalog.ts` — тип `seller`.
- `apps/web/components/ProductCard.tsx` и `app/product/[id]/ProductClient.tsx` —
  строка «Продавец: N». Нет продавца — нет строки (это товар AliStore, и
  подписывать его «AliStore» значит навязывать шум на каждой карточке).

**Тест:** vitest на формат строки; e2e не трогаем в этом срезе.

## Верификация

Гейты из `verification-before-completion`:
`npm run api:test:isolated`, `npx tsc --noEmit` на api и web, `npx vitest run`,
и `npx prisma migrate status` против прод-базы перед выкаткой.

## Файлы

**Создаются:** `apps/api/src/sellers/{seller-scope.ts,sellers.service.ts,sellers.module.ts}`,
`apps/api/test/seller-ownership.e2e-spec.ts`, миграция.

**Меняются:** `schema.prisma`, `catalog.dto.ts`, `catalog.service.ts`,
`apps/web/lib/api/catalog.ts`, `ProductCard.tsx`, `ProductClient.tsx`.

**Не трогаются:** заказы, касса, склад, POS, курьер, отчёты. Разрез по продавцам
в отчётах — следующий срез, после того как владение существует и проверено.
