# Промпт: устранение дефектов, найденных аудитом 29.07.2026

> Скопируй всё, что ниже разделителя, в новую сессию как задачу.
> Снимок сделан 29.07.2026 ~19:00. Дерево правится параллельно — начни с `git status`.

---

## Контекст

Репозиторий `/Users/alistore/Desktop/alistore-erp`, ветка `fix/audit-wave2`.
В рабочем дереве большой незакоммиченный объём работы (supply/to-order коммерция,
отмены заказов, предоплатные возвраты, карантин, количественные аллокации, новый
модуль `telegram-agent`) и ~147 миграций, часть untracked. **Дерево правится другим
инструментом параллельно** — перед любым выводом делай `git status`, а перед правкой
файла проверяй, не изменился ли он.

Проведён полный аудит. Гейты на момент снимка:

| Гейт | Результат |
|---|---|
| `tsc` API, `tsc` web, `prisma validate` | зелёные |
| `npm run api:test:isolated` | **248 сьютов / 1489 тестов, 0 падений** |
| Playwright (146 тестов) | **17 настоящих падений** |
| iOS build 4 таргетов, iOS unit (150) | зелёные |
| deeplink-preflight, android data-safety | зелёные |

Ключевой вывод: **зелёный jest не означает работающий продукт**. Обе критические
регрессии живут на стыке HTTP-контроллеров и UI, куда новые сьюты не заглядывают —
они инстанцируют сервисы напрямую (`new XxxService(prisma, audit, …)`) и не поднимают
Nest, контроллеры и гварды.

## Как работать

Соблюдай проектные скиллы: **test-driven-development** (тест до реализации),
**writing-plans** (план перед нетривиальным срезом), **verification-before-completion**
(реальные гейты перед «готово»). Один вертикальный срез = один коммит.

Для каждого дефекта ниже: сначала падающий тест, потом фикс. Задача 1 и 2 уже имеют
падающие e2e — используй их как RED, не пиши новые.

Полезные сабагенты: `nestjs-ledger-engineer`, `storefront-web-developer`,
`ledger-security-reviewer`, `e2e-acceptance-engineer`.

**Про гейты:** прогоны в этом репозитории нельзя запускать параллельно — сьюты чистят
фикстуры голым `deleteMany`, а `pg_advisory_xact_lock` database-scoped. Playwright
гоняй на своей БД и портах:
```
E2E_DATABASE_URL="postgresql://alistore@localhost:5432/<имя>_test?schema=public" \
E2E_API_PORT=4310 E2E_WEB_PORT=3310 npx playwright test <спеки>
```
Тесты, падающие ровно на 45.x с — это таймаут; на нагруженной машине он ничего не
доказывает, перепроверяй в тишине.

---

# ЧАСТЬ 1. Подтверждено лично, проверено по коду — чинить обязательно

## 1. 🔴 КРИТИЧНО: курьерский чекаут сломан полностью

**Где:** `apps/api/src/logistics/logistics.service.ts:77-83`

Условие инвертировано относительно прежнего поведения:

```ts
// БЫЛО: точка не указана и выбор НЕ требуется → взять первую активную
requireSelection ? null : await findFirst({ active: true, orderBy: [{sortOrder:'asc'}] })

// СТАЛО: точка не указана и выбор НЕ требуется → бросить
if (!reference && !requireSelection) {
  throw new ValidationError('store_point_required', 'Выберите точку выполнения заказа');
}
return resolveActiveStorePoint(this.prisma, reference);
```

Обе ветки теперь бросают: вторая — внутри `resolveActiveStorePoint`
(`apps/api/src/common/store-point-identity.ts:39`). То есть `if` эквивалентен
провалу вниз, и любой заказ без явной точки отклоняется.

**Сквозная цепочка:**
1. `apps/web/app/checkout/page.tsx:297` — `storePointId: delivery === 'pickup' ? pickupPoint : undefined`.
   При курьере точка не шлётся, и это правильно: покупателю незачем выбирать пункт выдачи.
2. `apps/api/src/orders/orders.service.ts:438` — `requiresPointSelection = fulfillmentType === 'pickup'`, для курьера `false`.
3. → `resolveStorePoint(undefined, undefined, false)` → **throw**.

**Эффект:** ни один заказ с курьерской доставкой не оформляется. Это основной путь
продаж витрины. Самовывоз работает, потому что `pickupPoint` передаётся.

**Падающие тесты (RED уже есть):**
- `e2e/web-checkout.spec.ts:146` — «uses ERP delivery zone fee and reserves an available slot»
- `e2e/ecosystem-courier-cod.spec.ts:10`

**Решение принимаешь ты — это развилка, а не механическая правка.** Комментарий в
соседнем `orders.service.ts:1707` гласит «Keep their setup deterministic without
restoring a production fallback», то есть отказ от неявного дефолта был намеренным.
Значит нужен явный контракт, один из двух:
- **(A)** сервер сам выбирает точку выполнения, когда покупатель её не выбирает
  (курьер/экспресс) — восстановить детерминированный выбор при `!requireSelection`;
- **(B)** точку определяет клиент/зона доставки, и тогда веб обязан её слать —
  но тогда чинить надо `apps/web/app/checkout/page.tsx` и контракт API, а не только сервис.

Выбери (A) или (B) осознанно и запиши обоснование в коммит. Не «возвращай как было»
не подумав — прежний неявный дефолт убрали намеренно.

**Отдельно почини:** `apps/api/src/orders/orders.service.ts:1706-1717` — там
production-логика завязана на `process.env.NODE_ENV === 'test'`. Это ровно тот
механизм, из-за которого дефект не поймали тесты: в тестах ветка одна, в проде другая.
Убери развилку по `NODE_ENV`; фикстурам передавай точку явным аргументом.
Тот же антипаттерн — `apps/api/src/staff-auth/staff-auth.service.ts:64-65`.

## 2. 🔴 КРИТИЧНО: владелец видит вечный спиннер на пяти экранах ERP

**Где:** `apps/web/lib/use-operational-store-point.tsx:32`

```ts
setPoint(manager ? '' : assigned.inventoryLocation);   // manager = owner|admin
```

Владельцу и админу точка намеренно не выбирается — предполагается ручной выбор из
`OperationalStorePointSelect`. Но все потребители делают ранний выход:

```ts
const reload = useCallback(async () => {
  if (!point) return;      // ← ни запроса, ни ошибки, ни подсказки
  …
}, [point]);
```

`AsyncPanel` при `data === null && error === ''` рисует спиннер. Экран висит вечно,
кнопки «повторить» нет, причина не показана.

**Потребители хука (все пять):**
- `apps/web/components/erp/HrView.tsx:48`
- `apps/web/components/erp/StoreOperationsView.tsx:30`
- `apps/web/components/erp/ProcurementView.tsx:38`
- `apps/web/components/ConsignmentOps.tsx:24`
- `apps/web/components/WarehouseOps.tsx:10`

Последние два разбирают `error`/`loading`, первые три — выбрасывают их вовсе.

**Эффект:** владелец открывает HR, Операции точки, Склад, Консигнацию, Закупки и
видит бесконечную загрузку. Ничто не сообщает, что нужно выбрать точку в неприметном
селекте.

**Падающие тесты (RED уже есть), 10 штук:**
```
e2e/hr-ui.spec.ts:6, :69, :96
e2e/store-operations-ui.spec.ts:7
e2e/warehouse-consignment-ui.spec.ts:8
e2e/warehouse-quantity-ui.spec.ts:8
e2e/procurement-ui.spec.ts:8
e2e/print-ui.spec.ts:76
e2e/erp-no-fixtures.spec.ts:57 — «HR · Смены» и «Операции точки»
```
Четыре из них висят до таймаута 45 с и на тихой машине — это зависание, не флак.

**Что сделать:** выбери одно и примени ко всем пяти потребителям единообразно —
либо автовыбор разумного дефолта (первая точка из `points`), либо явное состояние
«выберите точку» с подсказкой вместо молчаливого `return`. Второе честнее: оно не
угадывает за владельца. В любом случае **экран не должен молча висеть** — в этом
репозитории есть тесты с названием «показывает ошибку, а не выдуманные данные»,
и вечный спиннер нарушает ровно этот принцип.

**Оговорка о доказательности:** связь «хук → 10 падений» установлена по совпадению
списка потребителей со списком падающих спеков и по характеру падения (зависание,
а не ассерт). Улика сильная, но поштучного вскрытия каждого теста я не делал —
после фикса прогони эти 10 и убедись, что закрылись все.

## 3. 🟠 NUL-байт делает файл бинарным и прячет логику доступа от ревью

**Где:** `apps/api/src/inventory/inventory.service.ts:98`

Ровно один сырой байт `0x00` внутри шаблонной строки:

```ts
const keyOf = (productId: string, location: string) => `${productId}\x00${location}`;
```

`file` определяет файл как `data`, `git diff` показывает `Bin 57240 -> 61699 bytes`.

**Эффект:** в этом же файле ~100 новых строк контроля доступа (`actorStorePoint`,
`activeLocation`, `mutationLocation` — привязка не-владельца к своей точке при
`receive`/`count`/`transfer`). Они **не видны ни в одном диффе** — ни в `git diff`,
ни в PR-вью, ни ревьюверу. Для изменения прав доступа это наихудший исход.

**Что сделать:** заменить сырой байт на escape-последовательность `\0`. Поведение в
рантайме идентично, файл снова становится текстом. **Сам разделитель менять не надо** —
NUL как разделитель ключа выбран правильно: пробел дал бы коллизию
(`"a b"+"c"` и `"a"+"b c"` схлопываются в один ключ). Проблема только в форме записи.

После правки убедись: `file apps/api/src/inventory/inventory.service.ts` → `text`,
и `git diff` показывает эти ~100 строк. **Прочитай их — они ещё никем не проверены.**

## 4. 🔴 КРИТИЧНО: гонка оставляет депозиты без активации закупки

**Где:** `apps/api/src/payments/payments.service.ts:85` (лок) и `:214-222` (условие)

```ts
await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'receivable-payment:' + receivableId}))…`;
…
await tx.orderReceivable.update({ where: { id: receivableId }, data: { settledAmount, status } });
…
const openDeposits = await tx.orderReceivable.count({
  where: { orderId: receivable.orderId, kind: 'supply_deposit', status: { not: 'settled' } },
});
if (receivable.kind === 'supply_deposit' && openDeposits === 0) {
  await this.activateSupplyProcurementOnTx(tx, receivable.orderId, actor, events);
}
```

Лок берётся **по начислению**, а решение принимается **по всему заказу**.
`apps/api/src/orders/orders.service.ts:838-853` создаёт по депозиту **на каждую
`to_order` строку**, поэтому у заказа из двух строк есть `R_A` и `R_B`.

**Сценарий:** две кассы одновременно оплачивают `R_A` и `R_B`. Локи **разные**,
взаимного исключения нет. При READ COMMITTED транзакция A не видит незакоммиченное
обновление B → `count = 1` → активацию пропускает. Симметрично B. Обе коммитятся.
Итог: депозит собран полностью, проводка на 2400 сделана, а `PurchaseOrder` нет,
`SupplierOffer.availableQty` не заявлен, `OrderLineSupply.status` застрял на
`awaiting_deposit`, заказ висит в `awaiting_payment`.

**Выхода нет:** повтор `settle` даёт `receivable_not_open`
(`payments.service.ts:118-121`), а возврат требует `SUPPLY_CANCELLATION_ENABLED`
и `SUPPLY_AUTO_REFUND_ENABLED` — оба `"false"` в `apps/api/.env.example:97-98`.
С дефолтными флагами состояние неразрешимо изнутри приложения.

**Что сделать:** брать `pg_advisory_xact_lock` по **заказу**
(`'order-supply:' + receivable.orderId`) **до** чтения и обновления начисления,
чтобы все депозиты одного заказа сериализовались.

**Теста нет — напиши первым.** Существующие гонки в
`apps/api/test/order-to-order-request.e2e-spec.ts` проверяют только повтор одного
ключа идемпотентности; сценарий «две разные строки одного заказа одновременно»
не покрыт вообще, и все тесты используют заказ с одной `to_order` строкой.

## 5. 🟡 Незаконченный WIP: спек не сидит оффер поставщика

**Где:** `e2e/checkout-to-order.spec.ts:13-27` (файл untracked)

`seedToOrderProduct()` создаёт только `Product` с `supplyMode: 'to_order'`, но не
создаёт `SupplierOffer`. Сервер требует активный оффер для `orderable`:
`apps/api/src/catalog/catalog.service.ts:376-382` — нужен `Boolean(offer)`,
`validUntil > now`, `availableQty > 0`, маржа ≥ 1000 bps. Без оффера PDP честно
рисует «В корзину» disabled, а тест ждёт «Заказать» и `toBeEnabled()`.
Заказ упал бы и на сервере: `orders.service.ts:487-491` → `supplier_offer_missing`.

Эталон уже есть: jest-спек `apps/api/test/order-to-order-request.e2e-spec.ts:183`
создаёт `supplierOffer` для своей to-order фикстуры.

**Это не регрессия продукта, а недоделанная фикстура твоей же работы в полёте.**
Добавь создание `supplierOffer` в `seedToOrderProduct` и прогони три теста.

## 6. ✅ Уже исправлено мной — не переделывай

Миграция `20260729240000_staff_point_no_default` сняла `@default("BISHKEK-1")` с
`StaffUser.point`, а сидеры e2e продолжали создавать сотрудника без `point`. Падало
63 теста из 146 за ~450 мс каждый, ещё до единого клика. Починено добавлением
`point: 'BISHKEK-1'` в семи местах:

```
e2e/helpers.ts:159, :172        (bootstrapStaff, seedStaffCredentials)
e2e/finance-ui.spec.ts:12, :102, :153
e2e/store-operations-ui.spec.ts:14
e2e/visual-acceptance.spec.ts:31
```

Сама миграция безопасна: колонка и так была `NOT NULL`, менялся только дефолт,
единственный прод-путь `staff-auth.service.ts:72` передаёт `point` явно, а
`CreateStaffDto.point` обязателен. Снятие дефолта — правильное решение, оно
превращает тихую привязку к легаси-складу в честный отказ.

---

# ЧАСТЬ 2. Найдено агентами, лично мной НЕ проверено — сначала подтверди

Ниже — заявления сабагентов. Каждое звучит правдоподобно и содержит адрес, но один
агент в этом аудите уже ошибся с адресом причины (указал `orders.service.ts:1705`
и `NODE_ENV` вместо настоящего `logistics.service.ts:77`). **Проверяй по коду,
прежде чем чинить. Если не воспроизводится — закрывай как ложное срабатывание,
а не «чини на всякий случай».**

## Деньги и леджер (приоритет)

1. **`return_to_supplier` не делает проводку в GL.**
   `apps/api/src/procurement/supply-quarantine.service.ts:491-511`. Приёмка дебетует
   1200 на всю стоимость, а возврат поставщику якобы не создаёт ни
   `AccountingJournalEntry`, ни `InventoryMovement`, ни дебет-ноту — только меняет
   `DeviceUnit.status` на `returned_supplier`. Если так, счёт 1200 навсегда завышен
   и сверка склад↔GL расходится на каждый возврат.

2. **`settleReceivable` без `isDemo`-гарда.**
   `apps/api/src/payments/payments.service.ts:60-230`. Утверждается, что все соседние
   денежные пути демо-заказы отклоняют (`pay()` на `:537`, handover, reservation,
   cancellations), а этот — нет. При `PUBLIC_DEMO_MODE=true` демо-заказ писал бы
   реальный `Payment` и реальную проводку.

3. **Активация падает на последнем депозите, замораживая уже собранные.**
   `apps/api/src/payments/payments.service.ts:746-830`. `activateSupplyProcurementOnTx`
   бросает `supplier_quote_expired` / `supplier_offer_unavailable` и откатывает только
   свою транзакцию — предыдущие депозиты уже закоммичены. `SupplierOffer.availableQty`
   уменьшается только при активации, поэтому N корзин проходят проверку на чекауте.

4. **Две разные модели ёмкости возврата.** `order-cancellations.service.ts:393-417`
   считает по исполненным `Payment`, `order-cancellation-resolution.service.ts:401-461` —
   по `RefundAllocation`. Первая не видит одобренный, но не исполненный возврат.
   Денежной утечки нет (ловит триггер БД), но вместо чистого отказа получается
   сырой Postgres `23514`.

5. **`convert_to_own_stock` меняет товар целиком.**
   `supply-quarantine.service.ts:480-487` переводит весь `Product` в `own_stock` и
   гасит все активные офферы из-за одного карантинного инцидента — ломая остальные
   заказы на этот товар и переключая витрину для всех покупателей.

6. **Отмена `customer_prepayment`-возврата — тупик.** `refunds.service.ts:219-226` и
   `refunds.processor.ts:531-537` ставят `refund_failed`, не очищая `refundId`.
   `refund_failed` входит в `ACTIVE_STATUSES`, поэтому новая отмена невозможна,
   а `resolve()` отказывает из-за заполненного `refundId`.

7. **Смешанная корзина запрещена в комментарии, но не в коде.**
   `orders.service.ts:517-534`. Если так, товар в наличии уходит в заказ без резерва
   и может быть продан на кассе другому покупателю.

8. **Курьерская доставка обходит kill-switch.** `courier.service.ts:219-237` вызывает
   `handOverReadyOrderItemOnTx` без проверки `SUPPLY_PARTIAL_HANDOVER_ENABLED`,
   хотя оба HTTP-входа её проверяют.

9. **Два маршрута выдачи с разными гардами.** `orders.controller.ts:79-95` требует
   `Idempotency-Key`, флаг, отказ демо-заказам и тип доставки;
   `order-line-supply.controller.ts:54-58` — только флаг. Оба приводят к признанию
   выручки и НДС.

10. **Денежный эндпоинт под правом чтения.** `orders.controller.ts:184-186` —
    `@RequirePermission('approvals', 'read')`, а это право есть у маркетолога и
    старшего продавца (`authz.model.ts:34-37`). Спасает только `assertOwnerRole`
    внутри сервиса, то есть инвариант больше не выражен на уровне контроллера.

11. **Загрузка прайс-листа без лимита размера.**
    `supplier-price-import.controller.ts:31` — `FileInterceptor` без `limits`, при
    том что в доме принято их ставить (`evidence.controller.ts:83`). Парсер грузит
    книгу целиком в память.

12. **Нет индекса под горячий запрос.** `OrderReceivable` имеет
    `@@index([orderId, status])` и `@@index([orderItemId, kind])`, а
    `supply-operations.service.ts:74-93` фильтрует по `kind` + `status` без обоих —
    последовательное сканирование на каждом опросе очереди. Нужен `@@index([kind, status])`.

## Покрытие тестами

Агент проверил три обвинения предыдущего агента и **два из трёх опроверг** —
учти это как урок о доверии к отчётам.

- **Подтвердилось и хуже, чем заявлено:** `order-line-supply`, `supply-quarantine`,
  `supplier-offers`, `order-item-handover`, `order-to-order-request` не просто не имеют
  `.expect(403)` — они **вообще не поднимают Nest, контроллеры и гварды**, а
  инстанцируют сервисы напрямую. Весь новый HTTP-слой не покрыт ничем. Рабочий образец
  есть рядом: `apps/api/test/procurement.e2e-spec.ts` и `supplier-price-import.e2e-spec.ts`
  делают настоящие `.expect(401)`/`.expect(403)` через `app.getHttpServer()`.
- **Опровергнуто:** спеки на отмены и `settleReceivable` есть —
  `order-to-order-request.e2e-spec.ts` на 1301 строку, с настоящими гонками.
- **Опровергнуто:** тесты на конкурентность есть, но только на повтор одного ключа
  идемпотентности, не на двух покупателей за последний товар.

Дыры, где падение кода не поймает ни один тест:
- возврат количественного `to_order`-товара — `returns.service.ts` (~198-268), CAS-ветка, ноль покрытия;
- CAS-резервирование количества — `order-item-reservation.service.ts:65-110`, ноль покрытия;
- все четыре отказа проверки котировки на чекауте — `orders.service.ts:492-520`:
  `supplier_offer_missing`, `_expired`, `_insufficient_quantity`, `_margin_approval_required`;
- негативные пути `settleReceivable`: переплата, конфликт ключа с другой суммой,
  запрещённый метод, частичная оплата, заказ с двумя депозитами;
- провал провайдера при `customer_prepayment`-возврате.

## AI-слой и telegram-agent

Проверено агентом, что модуль **соблюдает** нейтральный порт, keyless-fallback,
редактирует коды привязки до записи, оборачивает данные в `<untrusted_customer_context>`,
а мутации делает только через slash-команды с RBAC — вывод модели ничего не запускает.
Это хорошо, не переделывай.

Замечания:
- `answerStaff` (`telegram-agent.service.ts:477-485`) без try/catch, в отличие от
  `answerCustomer` (`:397-414`) — при сбое провайдера нет мягкой деградации;
- **не применяется `AI_FAST_MODEL`** — каждое сообщение идёт на дефолтную модель
  (`claude-opus-4-8`), если оператор не выставил `TELEGRAM_AGENT_MODEL` вручную,
  а он закомментирован в `.env.example:89`. Вебхук на каждое сообщение — это ровно
  тот высокочастотный путь, для которого предназначен fast-model;
- `resolveLlmClient()` кэшируется в конструкторе (`:79`), а в остальных сервисах
  резолвится на каждый вызов;
- у новых AI-путей нет покрытия в `ai:eval` (`apps/api/test/ai-evals/run.ts:126`);
- `SUPPLY_PARTIAL_HANDOVER_ENABLED` и `SUPPLY_QUARANTINE_CONVERSION_ENABLED`
  отсутствуют в `.env.example`, `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET` —
  без проверки в `production-preflight.ts`.

## Доступность витрины

`e2e/accessibility-smoke.spec.ts` зелёный, но структурно слеп: сканирует 5 маршрутов
на десктопном вьюпорте в начальном состоянии. Вне охвата навсегда: весь
`components/mobile/*` (за `md:hidden` → вне дерева доступности), шаги 2-4 чекаута,
PDP, `/compare`, `/b2b`. Плюс axe засчитывает `placeholder` за метку.

Барьеры по убыванию влияния:
1. Переходы шагов чекаута теряют фокус в `<body>` и ничего не объявляют
   (`app/checkout/page.tsx:577, 586, 626, 676`); названия шагов из `STEPS` (`:53`)
   не рендерятся нигде, прогресс передан только цветом.
2. Ошибка и успех заказа молчат — ни `role="alert"`, ни `aria-live`
   (`:585, 675, 466`); в экране подтверждения нет ни одного заголовка.
3. `autocomplete` отсутствует на всех шести полях денежного пути (телефон, имя,
   адрес, email, OTP) — SC 1.3.5 AA.
4. Плейсхолдер вместо метки на полях чекаута и логина; нет `required`,
   `aria-invalid`, `aria-describedby`; кнопка «Далее» имеет шесть причин быть
   выключенной и не сообщает ни одной.
5. Мобильная витрина: ноль заголовков и лендмарок на всех экранах, таббар без
   `<nav>` и `aria-current`, иконки-глифы без `aria-hidden`.
6. Мобильное меню без `aria-expanded`, без ловушки фокуса и без Escape — при том
   что правильная реализация уже есть в `app/erp/page.tsx:252-279`.
7. `aria-label` на элементах шапки подавляет счётчик корзины —
   `components/SiteHeader.tsx:116-120`.
8. `setQty(item.qty - 1)` при qty=1 удаляет строку — `lib/cart.tsx:188-194`,
   вызовы в `app/cart/page.tsx:121` и `components/mobile/MobileCart.tsx:95`.

`prefers-reduced-motion` реализован по-настоящему (`MotionConfig reducedMotion="user"`
плюс поимённое гашение всех `@keyframes` в `globals.css:349-358`) — не трогай.
Единственный пробел: `animate-pulse`-скелетоны не покрыты.

**Самое ценное здесь — не отдельные правки, а расширение
`e2e/accessibility-smoke.spec.ts`:** добавить вьюпорт 390 px, маршруты
`/product/:id`, `/compare`, `/b2b` и проход чекаута по всем четырём шагам.
Иначе всё вышеперечисленное вернётся.

## Не атрибутировано — разберись сам

Два падения не привязаны к причине: `e2e/logistics-ui.spec.ts:6` (11.9 с) и
`e2e/pos-customer-binding.spec.ts:8` (12.9 с). Оба падают быстро, по ассерту,
не по таймауту. Возможно, следствие задачи 1 или 2 — проверь после их починки.

## Ложное срабатывание — не чини

`e2e/web-email-login.spec.ts:11` падал в прогонах под нагрузкой (45.8 с), а на тихой
машине прошёл за 18.6 с. Это флак от нагрузки, дефекта нет.

---

# Проверка перед «готово»

По скиллу **verification-before-completion**, в порядке от дешёвого к полному:

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
npm run api:test:isolated
npm run api:build
npm run build -w @alistore/web
```

Playwright — на своей БД и портах, целиком:
```bash
E2E_DATABASE_URL="postgresql://alistore@localhost:5432/fixverify_test?schema=public" \
E2E_API_PORT=4310 E2E_WEB_PORT=3310 npx playwright test
```

Ориентир: до починки было **128 passed / 18 failed**, из них 17 настоящих и 1 флак.
Целевое состояние — 145 passed, а `checkout-to-order` закрывается вместе с фикстурой.

Помни про свойство этого репозитория: **один зелёный прогон ничего не доказывает** —
примерно 40 % изолированных прогонов показывают 1-2 флака. Красное в несвязанных
сьютах сначала перепроверяй повтором, и только при повторе диагностируй как дефект.
И наоборот: 1489 зелёных jest-тестов не помешали сломанному курьерскому чекауту
доехать до рабочего дерева — не считай зелёный бэкенд доказательством работающего
продукта. Закрывай дыру HTTP-слоя тестами, а не надеждой.

Итоги записывай в существующие журналы `PROGRESS.md` / `BACKLOG.md` /
`docs/READINESS.md` — новый changelog не заводи.
