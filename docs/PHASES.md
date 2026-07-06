# AliStore ERP — Фазовый план (крупные фазы)

Весь проект разбит на **крупные фазы**. Выполняем **по одной фазе за раз**, каждую —
**обязательно проверяя** (см. «Гейт проверки»). Источник правды по продукту —
[`../design_handoff_alistore/`](../design_handoff_alistore/); порядок — из
[`Roadmap запуска`](../design_handoff_alistore/docs/Roadmap%20запуска.md).

## Сквозные правила (для КАЖДОЙ фазы)

1. **Дробить, держать малым** (ECC): файл 200–400 строк типично, **≤800 макс**; много
   маленьких файлов > мало больших; извлекать утилиты/подкомпоненты. Перед закрытием
   фазы — проверить, что новые/тронутые файлы не разрослись, и разбить крупные
   (см. «Реестр дробления» ниже). **Проекты/модули уменьшаем, а не раздуваем.**
2. **Гейт проверки** (не закрывать фазу без этого):
   - `npm run api:test` — все тесты зелёные (+ новые приёмочные тесты фазы);
   - `nest build` и `next build` — оба компилируются;
   - живой прогон ключевого потока фазы (браузер/HTTP) + сверка в БД;
   - где применимо — QA P0-сценарии (🔴) из «AliStore QA Test Scenarios».
3. **Event Ledger** — единственный источник правды; исправления — компенсирующими
   событиями; мутации денег/склада/статуса атомарны с записью события (инвариант #10).
4. **Серверная проверка** прав/лимитов/инвариантов; клиенту не доверяем.
5. **Атомарные коммиты** явными путями (параллельно правит Codex — не `git add -A`).

Легенда: ✅ готово · 🟡 частично · ☐ не начато.

---

## Phase 0 — Ядро данных ✅
**Цель:** фундамент, на котором держатся деньги.
- ✅ Монорепо (apps/api NestJS, apps/web Next.js), Prisma-схема (18 сущностей), миграции, сиды.
- ✅ **AuditEvent** append-only + транзакционная обёртка мутаций (инв #10).
- ✅ Order state-machine (полная таблица переходов), DeviceUnit/IMEI, Reservation.
**Проверка:** ✅ pure state-machine тесты + P0 «двойная продажа IMEI»→409, «оплата без резерва»→409.

## Phase 1 — Денежный контур MVP ✅
**Цель:** «продавать и не терять деньги».
- ✅ Payment + «нет paid без резерва» + идемпотентность webhook по txnId.
- ✅ **CashShift** сверка кассы (инв #3), **Courier COD** handover (инв #4).
- ✅ Reservation-expiry sweep (инв #7, pg-boss — Codex).
**Проверка:** ✅ приёмочные тесты shift/courier/invariants; HTTP-смоук потока created→reserved→paid.

## Phase 2 — Витрина (storefront) ✅
- ✅ Каталог (на живом API), карточка товара, корзина (persist), checkout → заказ.
- ✅ Customers find-or-create (гость), дизайн-токены хендоффа.
- 🟡 Осталось: избранное (persist), промокоды, «похожие товары», отзывы.
**Проверка:** ✅ in-browser add→cart→checkout→order (channel=web) + сверка в БД.

## Phase 3 — Аккаунт + Auth ✅
- ✅ Вход телефон+OTP (auth — Codex), «Мои заказы» (`/orders/mine`, JWT-guarded),
  деталь заказа + таймлайн + повтор заказа.
- ☐ Осталось: восстановление/соцсети, бонусы/уровень, адреса, настройки, consent-переключатель.
**Проверка:** ✅ in-browser OTP-вход → кабинет → список заказов; guard 401 без токена.

## Phase 4 — POS 2.0 ✅
- ✅ `/pos` тёмный терминал; `POST /pos/sale` (клиент→смена→IMEI→заказ→резерв→оплата).
- ☐ Осталось: сплит-оплата, скидка>лимита→approval, скан штрихкода, печать чека (receipts — Codex).
**Проверка:** ✅ in-browser продажа со скидкой→оплата; в БД order paid, unit sold, платёж в смене.

## Phase 5 — Склад / Fulfillment ✅
- ✅ `/warehouse` консоль; `POST /orders/:id/fulfill` (назначение IMEI web-заказам,
  нормализация qty>1), движение статусов, очередь `GET /orders?status=`.
- ☐ Осталось: приёмка партий UI, инвентаризация со сканером, Evidence Vault (фото).
**Проверка:** ✅ in-browser fulfill web-заказа → reserved+IMEI; сверка в БД.

## Phase 6 — Approval-цикл + Возвраты + Обмены ✅
- ✅ **ApprovalsService** (park→202→decide исполняет действие), **Approval Inbox** UI.
- ✅ Approval-gated **refund** (инв #1) → компенсирующий платёж + order.refunded.
- ✅ **Returns** (return.requested + машина статусов).
- ✅ **Обмен** (`ExchangesService`): атомарно возврат старого + продажа нового + доплата
  (≥0) + original→exchanged; дешевле → отказ (через возврат+refund). POST /exchanges.
- ☐ Осталось (мелочи): Refund Money Flow / Dispute Center UI, новая гарантия при обмене,
  exchange-UI для кассира (сейчас — API).
**Проверка:** ✅ in-browser+БД рефанд (202→Inbox→одобрить→−платёж+order refunded); HTTP+БД
обмен (APP-2→AW-9-45, доплата 19000, old→returned, order→exchanged, ledger).

## Phase 7 — Опасные действия полностью (v1) 🟡
**Цель:** каждое опасное действие — через approval, с ролями и 2FA.
- ✅ Approval-gate: изменение цены>±15%, списание (write_off), изменение остатка
  (stock_adjust), удаление (soft-delete→archived) — исполнители в
  `approvals/action-executors.ts` (ACTION_EXECUTORS); Products + Inventory модули.
- ✅ Reduction: вынос исполнителей из approvals.service (183→136 строк).
- ☐ Осталось: скидка>10% в POS (park продажу до одобрения), продажа в долг>лимита,
  доступ к PII → 2FA.
- ☐ **Role Permission Matrix** (9 ролей) — серверная проверка прав/лимитов; 2FA на опасное
  (auth-связано, координировать с Codex).
- ☐ PII-маскирование младшим ролям; margin-контроль (инв #6).
**Проверка:** ✅ 5 тестов (в пороге→применено, сверх→202→approve→применено, reject→нет
эффекта); in-browser +30% цена → Approval Inbox → одобрить → применено + price.changed.
Осталось: тесты порогов скидки/долга; попытка без прав→403; 2FA-гейт.

## Phase 8 — ERP владельца + Risk/Command Center (v1) 🟡
**Цель:** владелец видит всё в одном окне; всё читается из Event Ledger.
- ✅ ERP-дашборд `/erp`: деньги (продажи/возвраты/net, по способам), заказы/склад по
  статусам, ops (смены, на одобрении). `reports/` модуль, `GET /reports/dashboard`.
- ✅ **Risk Center**: касса≠, COD не сдан >24ч, зависший резерв, ожидающие approval —
  ранжировано по severity (`reports/risk-signals.ts`, reduction). `GET /reports/risks`.
- ✅ **Event Ledger** просмотр (feed) в дашборде. `GET /reports/ledger`.
- ☐ Осталось: KPI сотрудников/маржа, периоды/фильтры, Command Center действия
  (переход из тревоги в действие), повтор IMEI (trade-in+продажа) как риск.
**Проверка:** ✅ 2 теста (net = продажи−возвраты; риски ловятся); in-browser /erp на
реальных данных (net 0 после тест-возвратов, риск «зависший резерв», live-лента событий).

## Phase 9 — Мультисклад, склад-операции, гарантия (v1) 🟡
- ✅ **WarrantyCase** с SLA (14 дней): open по IMEI + машина статусов + консоль
  сотрудника `/warranty` + запрос клиента из деталей заказа; SLA-breach → Risk Center.
- ☐ Мультифилиал + перемещения (stock.moved), инвентаризация со сканером.
- ☐ **Supplier RMA** + Scorecard.
- ☐ Долги/рассрочка + напоминания, KPI/зарплаты, смены с фотоотчётом (Evidence Vault).
- ☐ Импорт данных из Excel/тетради при запуске (Data Migration).
**Проверка:** ✅ гарантия created→received через консоль (БД + ledger); SLA-breach ловится
в Risk Center. Осталось: перемещение сходится по остаткам; импорт идемпотентен.

## Phase 10 — Уведомления + Support/CRM (v1→v2) 🟡
- 🟡 Transactional outbox + relay (Codex начал); Novu-доставка (Codex).
- ☐ Support Inbox (сайт/app/WhatsApp/Telegram), Notification Preferences (consent).
- ☐ Segment Builder + Campaign ROI (аудитория consent-filtered), Customer 360.
**Проверка:** событие→гарантированная доставка (retry); рассылка только по consent=true; отписка мгновенна и логируется.

## Phase 11 — AI-слой (v2) ☐
- ☐ Оценка Б/У по фото, динамические цены (разведка рынка), ассистент владельца,
  обогащение карточек, авто-категоризация. Через API-порты (ключи на сервере).
**Проверка:** оффлайн-eval на референс-датасете; фолбэк при недоступности API; никаких ключей в клиенте.

## Phase 12 — Каналы и рост (v2) ☐
- ☐ Telegram Mini App / WhatsApp-магазин; франшиза + аудит партнёрских точек;
  омниканальность (click&collect), подарочные карты, страховка, B2B/опт, рекламный кабинет.
**Проверка:** e2e заказа через каждый канал в общий бэкенд; аудит франшизы читает из ledger.

## Phase 13 — Инфраструктура и отказоустойчивость (сквозная) 🟡
- 🟡 Self-hosted infra scaffolding (Codex).
- ☐ **Offline POS** (очередь+синк+разрешение конфликтов), hardware (сканер/принтер/терминал),
  graceful degradation сети/оборудования, сжатие фото (WebP/AVIF), дельта-синк.
**Проверка:** продажа без сети → синк без потерь/дублей; ручной фолбэк при отсутствии железа.

---

## Реестр дробления (Reduction backlog) — сквозной, не отдельная фаза
Правило: при работе в фазе — если тронутый файл >~400 строк, разбить в рамках той же фазы.

Текущие цели (на момент составления):
- ☐ `apps/web/lib/api.ts` (292) → разнести по доменам: `lib/api/catalog.ts`, `orders.ts`,
  `auth.ts`, `pos.ts`, `warehouse.ts`, `approvals.ts` (+ общий `http.ts`).
- ☐ `apps/web/app/pos/page.tsx` (372) → извлечь `PosCatalog`, `PosReceipt`, `PosPayment`,
  `usePosSale` в `components/pos/*`.
- ☐ `apps/api/src/orders/orders.service.ts` (240) → выделить `order-fulfillment.ts`
  (fulfill/assign) из основного сервиса при следующем касании.
- ☐ `apps/web/app/checkout/page.tsx` (239) → вынести `CheckoutForm`/`OrderSummary`.
- (watch) `apps/api/src/catalog/catalog.service.ts` (323, Codex) — согласовать при касании.

Гейт дробления: после разбиения — те же тесты/сборки зелёные, поведение не изменилось.

---

## Статус-снимок (обновлён после Phase 7 ядра)
Готово: Phase 0–5 ✅, Phase 6 🟡, Phase 7 🟡 (product/inventory-действия через approval).
Backend-модулей: 20 (+products, inventory) · frontend-роутов: 10 · тест-сьютов: 20
(65 тестов зелёные). Параллельно Codex: catalog-поиск, OpenAPI, auth, outbox/Novu, media,
receipts, labels, infra.

**Следующая на выполнение:** дозакрыть Phase 7 (скидка>10% в POS + долг) ИЛИ Phase 8
(ERP-дашборд + Risk/Command Center из Event Ledger). RBAC/2FA — координировать с Codex.
