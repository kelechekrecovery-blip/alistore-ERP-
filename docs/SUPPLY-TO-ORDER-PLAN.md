# План: товар «под заказ» + получение вне Бишкека

## Контекст

Магазин физически в Манасе, товарный запас маленький. Ассортимент расширяется за
счёт закупки под конкретный заказ у поставщиков в Бишкеке. Ценность для клиента —
местный самовывоз, местная гарантия и отсутствие предоплаты незнакомому магазину;
за это платят наценкой 10–20%.

Что уже есть (проверено разведкой, не переделывать):

- Самовывоз построен целиком: `Order.fulfillmentType` (`pickup | courier | express | store`,
  `schema.prisma:937`), `StorePoint` (`schema.prisma:763`), `pickupCode`, статус
  `ready_for_pickup` (`order-state-machine.ts:26`), публичный
  `GET /logistics/checkout-options` (`logistics.controller.ts:17`). `pickup` — дефолт
  (`orders.service.ts:47`).
- Витрина уже пишет «Под заказ» при `availableUnits === 0` (`ProductCard.tsx:78`), но
  без срока и с выключенной кнопкой (`disabled={!inStock}`).
- `Supplier` (`schema.prisma:1822`) и `PurchaseOrder` (`schema.prisma:2248`) есть,
  но не связаны ни с товаром, ни с клиентским заказом.

Чего нет вообще: политики доступности на уровне товара. `leadTime`, `preorder`,
`backorder`, `dropship` не находятся ни в схеме, ни в `src/`.

## Инвариант, который защищает весь план

**Товар «под заказ» никогда не участвует в списании и резервировании стока.**
Сток остаётся вычисляемым из `DeviceUnit.status='in_stock'` и
`InventoryBalance.onHand - reserved`. Витрине разрешено продавать то, чего нет на
складе, только через отдельную ветку, которая не трогает
`finalizeOrderInventorySaleOnTx` (`order-inventory-sale.ts:65`) и
`reserveQuantityOnTx` (`orders.service.ts:1239`).

---

## Срез 1 (этот) — политика поставки на товаре и честный срок на витрине

Задача среза: перестать врать покупателю. Сегодня «Под заказ» — это надпись без
срока на мёртвой кнопке. После среза товар «под заказ» показывает реальный срок
поставки, а товар своего стока ведёт себя ровно как сейчас. Покупаемость
«под заказ» — следующий срез, здесь она намеренно не включается.

### Задача 1.1 — миграция и инвариант

RED: `apps/api/test/product-supply-mode.e2e-spec.ts` →
`отклоняет to_order без срока поставки` ожидает отказ БД при
`supplyMode='to_order', supplyLeadDays=null`.

- `apps/api/prisma/schema.prisma`: `enum SupplyMode { own_stock to_order }` рядом с
  `StockTrackingMode` (:167); в `model Product` (:614) добавить
  `supplyMode SupplyMode @default(own_stock)`, `supplyLeadDays Int?`,
  `supplierId String?` + `supplier Supplier? @relation(...)`; обратное поле
  `products Product[]` в `model Supplier` (:1822); `@@index([supplyMode])`.
- Миграция `apps/api/prisma/migrations/<ts>_product_supply_mode/migration.sql`:
  ALTER TABLE + CHECK
  `"supplyMode" <> 'to_order' OR "supplyLeadDays" IS NOT NULL` и
  `"supplyLeadDays" IS NULL OR "supplyLeadDays" BETWEEN 1 AND 180`.
  Имя constraint: `Product_supply_lead_days_check` — по образцу
  `Order_cod_fulfillment_check` (`20260721090000_cod_allows_pickup/migration.sql:18`).

### Задача 1.2 — проекция в публичный каталог

RED: тот же спек → `отдаёт supplyMode и supplyLeadDays и не отдаёт cost и supplierId`.

- `apps/api/src/catalog/catalog.dto.ts:64` — два поля в `CatalogProductDto`.
- `apps/api/src/catalog/catalog.service.ts:363` — `toCatalogProduct` перечисляет поля
  руками, добавить туда же. **Не заменять на spread** — защита от утечки `cost`
  держится именно на ручном перечислении.
- Регрессия на утечку: спек фиксирует точный набор ключей DTO через
  `Object.keys(dto).sort()`, падает при появлении любого нового поля.

### Задача 1.3 — редактирование политики персоналом

RED: `apps/api/test/product-supply-mode.e2e-spec.ts` →
`PATCH /products/:id меняет supplyMode только с правом products:update`.

- `apps/api/src/products/products.dto.ts` — `supplyMode`, `supplyLeadDays`,
  `supplierId` в update-DTO с `@IsIn`/`@IsInt`/`@Min(1)`/`@Max(180)`.
- `apps/api/src/products/products.service.ts` — писать через существующий
  `audit.transaction`, событие типа `product.supply_mode_changed`.
  RBAC уже есть: `@RequirePermission('products','update')` (`products.controller.ts:117`).

### Задача 1.4 — витрина показывает срок

RED: `e2e/storefront-supply-mode.spec.ts` → карточка товара «под заказ» содержит
срок в днях; товар своего стока по-прежнему даёт `В наличии · N шт.`.

- `apps/web/lib/api/catalog.ts:3` — два поля в `CatalogProduct` (типы руками, кодогена нет).
- Бейдж в четырёх зеркалах: `components/ProductCard.tsx:78`,
  `components/mobile/MobileProductCard.tsx:74`,
  `app/product/[id]/ProductClient.tsx:213`, `components/mobile/MobileProduct.tsx:210`.
  Переиспользовать `StatusPill` из `components/ui/Badge.tsx:33` (`status="info"`),
  не изобретать новый бейдж.
- **Не менять** строку `В наличии · ${n} шт.` — она зашита в
  `e2e/web-checkout.spec.ts:281` и `e2e/storefront-motion.spec.ts`.
- Кнопку не включать: `disabled={!inStock}` и клэмп корзины
  (`lib/cart.tsx:148`, `reconcileAvailability` :229) остаются как есть — это срез 2.

### Верификация среза 1

```
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
npm run api:test:isolated -- --testPathPattern 'product-supply-mode|catalog'
npm run mvp:verify -- --skip-e2e
```
Прогон повторить дважды: гейт недетерминирован, 1–2 красных в несвязанных сьютах
сначала перепроверяются повтором (`CLAUDE.md`).

### Файлы

Создаются: миграция, `apps/api/test/product-supply-mode.e2e-spec.ts`,
`e2e/storefront-supply-mode.spec.ts`.
Меняются: `schema.prisma`, `catalog.dto.ts`, `catalog.service.ts`,
`products.dto.ts`, `products.service.ts`, `apps/web/lib/api/catalog.ts`, четыре
компонента карточки.
**Не трогаются:** `orders.service.ts`, `order-inventory-sale.ts`,
`payments.service.ts`, `lib/cart.tsx`, `checkout/page.tsx` — весь денежно-стоковый
путь вне этого среза. Также не трогаются файлы, занятые Codex:
`apps/api/src/app.module.ts`, `production-preflight.ts`, `apps/web/app/login/page.tsx`.

---

## Следующие срезы (не выполняются здесь)

**Срез 2 — покупаемость «под заказ».** Обход жёсткого гейта
`insufficient_stock` (`orders.service.ts:250`) только для `to_order`; снятие клэмпа
корзины; новый статус линии заказа, не дающий попасть в
`finalizeOrderInventorySaleOnTx`.

*Решение по деньгам принято (28.07.2026): задаток 20% при оформлении, остаток при
получении после осмотра.* Холдирование не нужно и портом не поддерживается —
`payment-gateway-provider.ts` одноступенчатый (`requires_action` → вебхук
`succeeded|failed`), разделения authorize/capture в интерфейсе нет.

Частичная оплата — уже существующая механика, новой машинерии не требуется:
`payments.service.ts:489` не финализирует продажу, пока
`alreadyReceived + batchTotal < order.total`, а `:400` отбивает переплату.
Задаток ложится в неё как обычный платёж, заказ не переходит в `paid`, сток не
списывается. Нужны: доля задатка в настройках (не хардкод), правило «заказ
поставщику не размещается до получения задатка», сбор остатка на выдаче.

**Проверить до включения задатка картой:** возврат задатка при срыве поставки.
`verifyRefundWebhook` в `production-payment-gateway.provider.ts` по прошлым
наблюдениям бросает `NotImplementedError` — если это так, картой задаток брать
нельзя, пока путь возврата не достроен. Наличный задаток в магазине этой
зависимости не имеет.

**Срез 3 — заказ поставщику.**

*Найдено при ревью среза 2 (29.07.2026):* гвард `assertNoToOrderLine` ключуется на
`Product.supplyMode`, а после оприходования товара от поставщика это уже наш
реальный сток, и продавать его надо обычным путём. В срезе 3 проверку нужно
перевести с «товар заказной» на «заказ поставщику по этой строке ещё не исполнен»,
иначе гвард начнёт блокировать законную продажу. Четыре входа в списание склада,
которые придётся обновить синхронно: `orders.service.ts:628` (reserve),
`orders.service.ts:1008` (fulfill), `payments.service.ts:391` (pay),
`courier.service.ts:222` (COD при доставке).
 Связь `Order ↔ PurchaseOrder` (сегодня её нет ни на
`PurchaseOrder`, ни на `OrderItem`), автомат
`awaiting_supplier → ordered → in_transit → received → handover` через
`audit.transaction` + `pg_advisory_xact_lock` по ключу заказа (домашний паттерн:
`store-operations.service.ts:111`).

**Срез 4 — импорт прайс-листа.** Загрузка файла, маппинг колонок на SKU,
предпросмотр расхождений, применение. Основной путь поставки данных: у партнёров
в Бишкеке API нет.

**Срез 5 — мониторинг цен.** Нацелить существующий `price-scout`
(`src/ai/price-scout.service.ts`) на публичные цены и наличие по моделям, которые
мы уже возим. Только факты — модель, характеристики, цена, наличие. Фотографии и
тексты описаний конкурентов не переносятся.

**Срез 6 — развязать точки получения от Бишкека.** Сегодня захардкожено:
`checkout/page.tsx:37-41` (`'AliStore Центр · сегодня'`, `'по Бишкеку, 1–2 ч'`),
фикстуры `BISHKEK-1/2`, `OSH-1` (`test/setup-db.ts`). Нужна точка Манаса и
подстановка названий из `StorePoint`, а не из константы.
