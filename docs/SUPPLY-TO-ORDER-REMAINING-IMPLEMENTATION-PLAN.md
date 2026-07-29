# AliStore: план завершения товаров под заказ и подготовки к релизу

Дата фиксации: 2026-07-29  
Статус: software implementation complete; external release gate blocked  
Публичный запуск: запрещён до прохождения Release Gate  
Основной feature flag: `TO_ORDER_CHECKOUT_ENABLED=false`

## Статус реализации на 29 июля 2026

Фазы A–J реализованы:

- A/B: cancellation snapshot и полный pre-PO refund;
- C: owner/admin TOTP resolution после `PO.sentAt`;
- D: частичная выдача и единый транзакционный handover для pickup/courier;
- E: quarantine и owner-controlled return/conversion;
- F/G: ERP operations queues, уведомления и no-show;
- H: StorePoint/location identity без production-дефолтов;
- I: Client/Staff/POS/Courier native parity;
- J: безопасный release-gate и evidence artifacts.

Дополнительно закрыта количественная поставка: `SupplyQuantityAllocation`
связывает receipt с клиентской строкой без свободного `InventoryBalance`, а
handover один раз признаёт valuation/COGS. Все шесть production-флагов остаются
выключенными до внешней сертификации и отдельного решения владельца.

Актуальное подтверждение и release-блокеры находятся в
`docs/acceptance/SUPPLY-TO-ORDER-EVIDENCE-2026-07-29.md`.

## 1. Цель

Завершить оставшиеся части supply-to-order процесса так, чтобы смешанный заказ
можно было безопасно провести от корзины до выдачи, отмены или возврата денег во
всех приложениях AliStore.

Итог должен обеспечивать:

- отсутствие двойных списаний, закупок, выдач и возвратов;
- неизменяемую клиентскую цену после задатка;
- построчную финансовую и складскую прослеживаемость;
- фактический refund через исходный платёжный канал;
- owner-controlled исключения после отправки PO;
- одинаковый контракт Web, iOS и Android;
- fail-closed поведение при неподтверждённых внешних интеграциях;
- доказуемую готовность через автоматизированный Release Gate.

## 2. Текущая подтверждённая база

Уже реализованы:

- supply snapshots в `OrderItem`;
- `SupplierOffer` с TTL, доступностью и margin gate;
- смешанный checkout и 20% задаток;
- `OrderReceivable` и `PaymentReceivableAllocation`;
- идемпотентное создание draft PO после задатка;
- серийная и количественная приёмка в клиентскую аллокацию;
- line-level procurement lifecycle;
- запрет свободного остатка для `to_order`;
- courier assignment gate;
- no-show reminders;
- cancellation/refund preview;
- публичные DTO без закупочной цены и поставщика;
- аддитивные native wire-модели.

Подтверждённые проверки:

- API: два независимых изолированных прогона по 247 suites / 1478 tests;
- Web: 24 files / 128 tests и production build;
- iOS: все десять targets и 150/150 unit tests;
- Android: полный `test lintDebug` и четыре debug-сборки;
- clean secret scan;
- clean dependency scan;
- 145 PostgreSQL migrations.

## 3. Неподвижные правила

1. Платёж, approval, refund, выдача и складское движение никогда не принимают
   `actor`, `customerId`, `paid`, `approved` или роль из тела запроса.
2. Любая денежная или складская команда требует `Idempotency-Key`.
3. Event Ledger остаётся источником аудита; PostgreSQL — источником бизнес-состояния.
4. Задаток остаётся обязательством на счёте 2400 до выдачи или возврата.
5. До `PO.sentAt` задаток возвращается полностью.
6. После `PO.sentAt` default refund остаётся полным; удержание требует owner
   resolution, причины и evidence.
7. Вина AliStore или поставщика всегда означает возврат 100%.
8. Отказной товар не становится доступным остатком автоматически.
9. Courier получает только полностью готовый заказ.
10. Публичный запуск и store release являются отдельными owner-командами.

## 4. Целевая архитектура отмены и refund

### 4.1 Новая сущность `OrderCancellation`

Добавить forward-only миграцией:

- `id`;
- `orderId`;
- `customerIdSnapshot`;
- `status`;
- `policySnapshot`: `automatic_full | owner_resolution`;
- `purchaseOrderSentSnapshot`;
- `depositPaidSnapshot`;
- `requestedRefundAmount`;
- `approvedRefundAmount`;
- `supplierExpenseAmount`;
- `faultParty`: `customer | supplier | alistore | unknown`;
- `customerReason`;
- `ownerReason`;
- `evidence` JSON;
- `idempotencyKey` unique;
- `requestHash`;
- `requestedBy`;
- `resolvedBy`;
- `refundId`;
- `createdAt`, `resolvedAt`, `completedAt`.

Статусы:

`requested → awaiting_owner → approved → refund_queued → refund_processing →
refunded`

Исключения:

`rejected | refund_failed | cancelled`.

Ограничения:

- один активный cancellation на заказ;
- суммы неотрицательны;
- `approvedRefundAmount <= depositPaidSnapshot`;
- удержание возможно только при `policySnapshot=owner_resolution`;
- `faultParty in (supplier, alistore)` требует полного возврата;
- resolved-запись требует `resolvedBy`, `ownerReason`, `resolvedAt`;
- owner deduction требует непустой evidence.

### 4.2 Расширение Refund

Не создавать вторую платёжную систему. Расширить существующий Refund aggregate:

- добавить `purpose`: `return_sale | order_cancellation | customer_prepayment`;
- сделать `returnId` nullable;
- добавить nullable `cancellationId` unique;
- для возврата задатка не создавать revenue/tax reversal;
- вместо этого дебетовать обязательство 2400;
- credit определять по исходному tender/payment gateway;
- сохранить существующие `RefundAllocation`, retry, webhook и stale recovery.

`RefundProcessor` должен выбирать бухгалтерскую стратегию по `purpose`, а не по
наличию отрицательного платежа.

### 4.3 Конкурентность

Для cancellation/refund транзакции блокировать в порядке:

1. advisory lock по idempotency key;
2. `Order`;
3. активный `OrderCancellation`;
4. связанные `PurchaseOrder`, по `id`;
5. `OrderReceivable`, по `id`;
6. исходные `Payment`, по `id`;
7. `Refund`, если создан.

Порядок должен быть одинаковым в customer, staff, owner и webhook маршрутах.

## 5. Фазы реализации

## Фаза A. Cancellation domain и preview contract

### Backend

- Добавить `OrderCancellation` и связи.
- Перенести существующий preview на общий cancellation calculator.
- Calculator возвращает:
  - возможность отмены;
  - policy;
  - подтверждённый задаток;
  - ожидаемый refund;
  - отправлен ли PO;
  - owner review requirement;
  - недоступные причины.
- Исключить выданные строки.
- Не учитывать открытые, но не оплаченные receivables.
- Не раскрывать поставщика, закупочную цену и расходы.

### API

- `GET /orders/mine/:id/cancellation-preview`;
- `POST /orders/mine/:id/cancellations`;
- `GET /orders/mine/:id/cancellations/current`;
- guest cancellation не поддерживать в v1;
- staff read endpoint — только с RBAC.

### Tests

- чужой заказ возвращает 404;
- повторный key возвращает тот же cancellation;
- другой payload с тем же key возвращает 409;
- после handover отмена запрещена;
- preview и create используют один snapshot;
- изменение Product/Offer после запроса ничего не пересчитывает.

### Gate A

Cancellation можно создать, но деньги ещё не меняются. Feature flag остаётся
выключенным.

## Фаза B. Автоматический refund до `PO.sent`

### Транзакция запроса

- Повторно проверить `sentAt` всех PO под блокировкой.
- Отменить открытые supply receivables.
- Строки перевести в `customer_cancelled`.
- SupplyAllocation перевести в cancelled.
- Draft PO отменить, если в нём не осталось активных строк.
- Вернуть неиспользованное `SupplierOffer.availableQty`.
- Создать `Refund(purpose=customer_prepayment)`.
- Создать `RefundAllocation` по исходным оплатам задатка.
- Пометить cancellation как `refund_queued`.

### Refund execution

- cash: только через открытую смену и подтверждение сотрудника;
- card/QR: через provider-neutral gateway;
- online: только при сертифицированном refund webhook;
- gift card/installment для задатка остаются запрещёнными;
- gateway unavailable → `refund_failed`, но cancellation не теряется;
- повторный webhook не создаёт второй отрицательный Payment.

### Accounting

- debit 2400 customer prepayment;
- credit cash/bank/provider clearing account;
- revenue, tax и COGS не затрагивать;
- создать audit и accounting event.

### Gate B

- два параллельных запроса дают один cancellation и один Refund;
- два webhook дают один compensating Payment;
- сумма 100%;
- PO не был отправлен;
- клиент видит фактический refund status.

## Фаза C. Owner resolution после `PO.sent`

### Owner queue

- Автоматически создать owner task.
- Показать:
  - задаток;
  - текущий PO status;
  - документированные supplier expenses;
  - fault party;
  - рекомендуемый refund 100%.

### Owner command

- `POST /order-cancellations/:id/resolve`;
- обязательный `Idempotency-Key`;
- step-up authentication;
- four-eyes: requester не может быть единственным approver;
- поля: action, refundAmount, faultParty, reason, evidenceIds.

### Правила

- supplier/AliStore fault → refundAmount равен полному задатку;
- customer fault без evidence → полный refund;
- deduction не может превышать подтверждённые расходы;
- отрицательный refund запрещён;
- решение после уже исполненного refund запрещено;
- все изменения фиксировать в Event Ledger.

### Gate C

- без evidence удержание невозможно;
- requester не одобряет собственное удержание;
- повторная owner-команда идемпотентна;
- клиент получает только итоговую сумму и объяснение, без supplier cost.

## Фаза D. Частичная выдача смешанного заказа

### Own-stock pickup

- Оплатить конкретный `stock_sale` receivable.
- Выдать только выбранные готовые складские строки.
- Применить резерв, COGS, revenue и tax только к выданным строкам.
- Установить `handedOverAt` и начало гарантии по строке.
- Общий заказ не завершать, пока остаются активные строки.

### Supply pickup

- Перед выдачей требовать settlement `supply_balance`.
- Не допускать выдачу до quality check.
- Количественную аллокацию уменьшать только на выданное количество.
- Серийную единицу переводить `reserved → sold`.

### Reservation expiry

- 72 часа считать от уведомления ready.
- Освобождать только own-stock reservation.
- SupplyAllocation не отменять.
- Повторный sweep не создаёт повторных событий.

### Courier

- Проверять готовность:
  - при создании run;
  - при старте доставки;
  - перед completeDelivery.
- При изменении строк после назначения снять заказ с run или заблокировать старт.
- COD вычислять по открытым разрешённым receivables.

### Gate D

- смешанный pickup выдаётся частями;
- courier не получает частичный заказ;
- повторный handover не списывает товар и деньги;
- гарантия каждой строки начинается с её handover.

## Фаза E. Quarantine и отказ клиента

### Intake

- Отказную серийную единицу переводить в `quarantined`.
- Количественный товар учитывать в отдельной quarantine allocation.
- Запретить каталог, POS, reserve, transfer и sale.

### Owner dispositions

1. `return_to_supplier`
   - supplier RMA;
   - складское движение;
   - supplier credit note;
   - закрытие аллокации.

2. `convert_to_own_stock`
   - owner approval;
   - valuation snapshot;
   - отдельное inventory movement;
   - создание свободного остатка только после approval;
   - обязательный audit.

### Gate E

- до owner decision товар нигде не продаётся;
- одна единица не получает два disposition;
- conversion и return race завершается ровно одним результатом.

## Фаза F. ERP и операционные очереди

### SupplierOffer editor

- список предложений;
- create/update/deactivate;
- supplier SKU;
- цена и валюта;
- available quantity;
- lead days;
- checked/valid until;
- margin preview;
- old/new value audit.

### Queues

- awaiting deposit;
- draft PO;
- PO to send;
- late;
- in transit;
- received;
- quality check;
- ready;
- no-show;
- owner cancellation;
- refund failed;
- quarantine decision.

### Staff commands

Каждая команда:

- RBAC;
- idempotency key;
- actor из JWT;
- point scope;
- audit event;
- optimistic/concurrent state guard.

### Gate F

Сотрудник может провести полный happy path без Prisma Studio, SQL и ручного
изменения статусов.

## Фаза G. Notifications и outbox

Добавить шаблоны:

- deposit received;
- PO sent/confirmed;
- supplier rejected;
- shipment delayed;
- received;
- quality check failed;
- ready;
- balance due;
- cancellation requested;
- owner resolution;
- refund queued/completed/failed;
- quarantine disposition.

Требования:

- шаблоны не содержат supplier cost;
- согласие клиента проверяется централизованно;
- transactional сообщения не зависят от marketing consent;
- durable retries;
- dead-letter/owner alert;
- локальный outbox gate до live-каналов.

### Gate G

На одно событие создаётся одно логическое уведомление независимо от повторного
worker запуска.

## Фаза H. StorePoint и Манас

### Backend

- `StorePoint` и `inventoryLocation` — единственный источник точки;
- удалить default `BISHKEK-1` из production staff creation;
- point брать из staff principal/JWT и проверять по БД;
- alias mapping оставить только на boundary;
- неизвестная или inactive точка → fail-closed.

### Web/native

- удалить `AliStore Центр`, `BISHKEK-1`, «по Бишкеку» из production UI;
- checkout получает точки и зоны из API;
- Staff/POS/Warehouse/HR/Procurement используют текущую точку сотрудника;
- добавить StorePoint Манас и его delivery configuration.

### Gate H

- production-код не содержит жёсткой operational location;
- исторические записи продолжают открываться через aliases;
- сотрудник одной точки не меняет склад другой без разрешения.

## Фаза I. Native parity

### Client

- availability kind и ETA;
- deposit now / stock at pickup / supply balance;
- line timeline;
- payment schedule;
- cancellation preview/request;
- refund status;
- late and quarantine-safe messages.

### Staff/POS

- receivable-specific payment;
- PO lifecycle;
- IMEI/qty receipt;
- quality check;
- partial handover;
- no-show;
- cancellation/refund owner queue.

### Courier

- только полностью готовые заказы;
- server-calculated COD;
- блокировка устаревшего offline command;
- стабильные idempotency keys.

### Gate I

Одинаковый fixture даёт одинаковые суммы, ETA, статусы и действия в Web, iOS и
Android.

## Фаза J. Release hardening

### Database/API

- isolated DB создаётся с нуля;
- применяются все миграции;
- полный API suite запускается дважды подряд;
- migration upgrade test с предыдущего production schema snapshot;
- concurrency tests для deposit, PO, cancellation, refund, handover, quarantine.

### Web

- Playwright happy path own-stock;
- supply-only;
- mixed pickup;
- mixed courier;
- cancel before PO;
- cancel after PO;
- refund failed/retry;
- cross-browser Chromium/WebKit/Firefox;
- accessibility smoke.

### Native

- iOS build/unit/UI/lint;
- Android build/unit/UI/lint;
- offline replay;
- deep links;
- contract fixtures.

### Security

- gitleaks;
- OSV dependency scan;
- auth/RBAC regression;
- public DTO leak tests;
- PII/evidence retention;
- production env preflight.

### External certification

- payment/refund gateway;
- SMTP;
- SMS;
- FCM/APNs;
- S3/R2;
- fiscal/OFD;
- monitoring/alerts;
- POS hardware.

### Gate J

Создать подписанный evidence report с результатом:

- `READY`;
- `READY WITH FAIL-CLOSED CAPABILITIES`;
- `NOT READY`.

Только `READY` позволяет вынести owner decision о production cutover.

## 6. Feature flags

Сохранить и добавить:

- `TO_ORDER_CHECKOUT_ENABLED=false`;
- `SUPPLY_CANCELLATION_ENABLED=false`;
- `SUPPLY_AUTO_REFUND_ENABLED=false`;
- `SUPPLY_OWNER_RESOLUTION_ENABLED=false`;
- `SUPPLY_PARTIAL_HANDOVER_ENABLED=false`;
- `SUPPLY_QUARANTINE_CONVERSION_ENABLED=false`;
- `ORDER_NO_SHOW_REMINDERS_ENABLED=false`;
- `OUTBOX_RELAY_ENABLED=false`;
- `REFUND_RELAY_ENABLED=false`.

Порядок включения:

1. internal test;
2. staff-only pilot;
3. web pilot на одной точке;
4. наблюдение и reconciliation;
5. native parity;
6. owner approval;
7. публичное включение.

Выключение flag не откатывает схему и не уничтожает созданные данные.

## 7. Разбиение на тематические коммиты

1. `supply-cancellation-schema`
2. `supply-cancellation-preview-request`
3. `supply-pre-po-auto-refund`
4. `supply-owner-resolution`
5. `supply-partial-handover`
6. `supply-courier-readiness`
7. `supply-quarantine-disposition`
8. `supply-erp-operations`
9. `supply-notifications`
10. `storepoint-location-parity`
11. `native-supply-parity`
12. `supply-release-evidence`

Каждый commit:

- содержит миграцию либо код, но не несвязанные изменения;
- проходит build и целевые тесты;
- не включает credentials;
- не включает Cloudflare cutover;
- не включает store submission.

## 8. Приёмочные сценарии

1. Отмена до PO возвращает полный задаток ровно один раз.
2. Два customer cancellation запроса создают одну запись.
3. PO send и cancellation race дают атомарный policy snapshot.
4. После PO удержание без evidence невозможно.
5. Вина поставщика возвращает 100%.
6. Refund webhook replay не создаёт вторую выплату.
7. Refund failure остаётся видимым и повторяемым.
8. Частичная выдача склада не завершает supply-заказ.
9. Supply balance нельзя оплатить/выдать дважды.
10. Courier не получает незавершённый mixed order.
11. Изменение готовности после assignment блокирует start.
12. Отказной IMEI недоступен каталогу и POS.
13. Owner conversion создаёт ровно один свободный stock unit.
14. Reservation expiry не отменяет supply line.
15. Warranty начинается с фактического handover.
16. Public DTO не содержит supplier/cost/evidence internals.
17. Web/iOS/Android показывают одинаковые суммы.
18. Feature flag отключает новую покупаемость без rollback.
19. Два полных gate подряд проходят на чистой БД.
20. Никакой release/deploy не происходит без owner decision.

## 9. Порядок выполнения

Критический путь:

`A → B → C → D → E → F → G → H → I → J`

Разрешённая параллельность:

- H можно выполнять после фиксации API contracts;
- notification templates можно готовить параллельно B–E;
- native wire contracts можно обновлять параллельно, UI — только после
  стабилизации backend states;
- release automation можно готовить заранее, но финальный gate — только после I.

## 10. Definition of Done

Работа считается завершённой, когда:

- все 20 приёмочных сценариев автоматизированы;
- нет ручного SQL в операционном happy path;
- каждый денежный и складской mutation идемпотентен;
- cancellation/refund reconciliation сходится с accounting;
- нет свободного остатка от `to_order` без owner conversion;
- все клиенты имеют contract/UI parity;
- production defaults точек удалены;
- внешние возможности сертифицированы или явно fail-closed;
- два последовательных release gate зелёные;
- evidence report имеет статус READY;
- владелец отдельно подтвердил cutover и store release.
