# AliStore ERP — Фазовый план (крупные фазы)

Весь проект разбит на **крупные фазы**. Выполняем **по одной фазе за раз**, каждую —
**обязательно проверяя** (см. «Гейт проверки»). Источник правды по продукту —
[`../design_handoff_alistore/`](../design_handoff_alistore/); порядок — из
[`Roadmap запуска`](../design_handoff_alistore/docs/Roadmap%20запуска.md).

## Соответствие прототипам (обязательно)
Все экраны — **строго по `.dc.html` прототипам** (пиксель-в-пиксель, токены хендоффа).
Статус выравнивания: `/pos` → POS 2.0 ✅ · `/erp` → ERP 2.0 ✅ (тёмный сайдбар-кокпит,
+ вкладка **CRM · Инбокс**: Support Inbox + Customer 360) · `/staff` → Сотрудник App 2.0 ✅
(мобильное прил. сотрудника) · **вся витрина+кабинет → Клиент App 2.0 ✅** (тёмное мобильное
прил.: home/каталог/карточка/корзина/checkout-4-шага/кабинет+уровень/деталь заказа/login).
Консоли `/warehouse /warranty /approvals` — рабочие инструменты, их мобильную точку входа
даёт `/staff`.
Прототип-мелочи ЗАКРЫТЫ: избранное ✅ · **сравнение ✅** (`/compare` + `lib/compare.tsx`, макс 4,
⇄-переключатель, бейдж «ЛУЧШАЯ ЦЕНА») · «Мои устройства» ✅ · **гарантийный талон ✅**
(`/account/warranty/[imei]`, warrantyUntil/daysLeft = покупка + 12 мес) · **статус-заказа
timeline ✅** (`/account/orders/[id]/status` + `lib/order-status.ts`, шаги из Event Ledger с
реальными временами: пройдено/текущий/будущее, кнопка «Отследить заказ» из деталей).

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
- ✅ Online Payment Intents: card/MBank/O!Деньги/installment → reserve/awaiting_payment
  → sandbox/provider webhook → `payments.pay` (idempotent).
- ✅ **CashShift** сверка кассы (инв #3), **Courier COD** handover (инв #4).
- ✅ Reservation-expiry sweep (инв #7, pg-boss — Codex).
**Проверка:** ✅ приёмочные тесты shift/courier/invariants; HTTP-смоук потока created→reserved→paid.

## Phase 2 — Витрина (storefront) ✅
- ✅ Каталог (на живом API), карточка товара, корзина (persist), checkout → заказ.
- ✅ Customers find-or-create (гость), дизайн-токены хендоффа.
- ✅ Избранное/сравнение persist, поиск (`/search`), промокоды/бонусы в корзине → checkout total.
- 🟡 Осталось: «похожие товары», отзывы.
**Проверка:** ✅ in-browser add→cart→checkout→order (channel=web) + сверка в БД.

## Phase 3 — Аккаунт + Auth ✅
- ✅ Вход телефон+OTP (auth — Codex), «Мои заказы» (`/orders/mine`, JWT-guarded),
  деталь заказа + таймлайн + повтор заказа.
- ✅ Бонусы/уровень (`/account/bonuses`), адреса (`/account/addresses`), настройки,
  уведомления + consent-переключатель (`/account/notifications`).
- ☐ Осталось: восстановление/соцсети.
**Проверка:** ✅ in-browser OTP-вход → кабинет → список заказов; guard 401 без токена.

## Phase 4 — POS 2.0 ✅
- ✅ `/pos` тёмный терминал; `POST /pos/sale` (клиент→смена→IMEI→заказ→резерв→оплата).
- ✅ Скидка>лимита→approval; `clientSaleId` идемпотентность для offline retry; scanner
  keyboard-wedge/manual SKU; печать локального/серверного чека через browser print; очередь
  синхронизации с конфликтами/approval-required статусами.
- ☐ Осталось: сплит-оплата и сертификация конкретного физического железа в точке.
**Проверка:** ✅ in-browser продажа со скидкой→оплата; в БД order paid, unit sold, платёж в смене.

## Phase 5 — Склад / Fulfillment ✅
- ✅ `/warehouse` консоль; `POST /orders/:id/fulfill` (назначение IMEI web-заказам,
  нормализация qty>1), движение статусов, очередь `GET /orders?status=`.
- ✅ Evidence Vault: фото к перемещениям/инвентаризации → WebP storage + `evidence.attached`.
- ☐ Осталось: приёмка партий UI, инвентаризация со сканером.
**Проверка:** ✅ in-browser fulfill web-заказа → reserved+IMEI; сверка в БД.

## Phase 6 — Approval-цикл + Возвраты + Обмены ✅
- ✅ **ApprovalsService** (park→202→decide исполняет действие), **Approval Inbox** UI.
- ✅ Approval-gated **refund** (инв #1) → компенсирующий платёж + order.refunded.
- ✅ **Returns** (return.requested + машина статусов).
- ✅ **Обмен** (`ExchangesService`): атомарно возврат старого + продажа нового + доплата
  (≥0) + original→exchanged; дешевле → отказ (через возврат+refund). POST /exchanges.
- ✅ **Exchange-UI кассира** (`/exchange` + `GET /units/:imei` lookup): найти проданный IMEI →
  выбрать новый товар → доплата → способ → оформить. Тёмная консоль; guard'ы (не «продан»/
  дешевле/терминальный заказ).
- ☐ Осталось (мелочи): Refund Money Flow / Dispute Center UI, новая гарантия при обмене.
**Проверка:** ✅ in-browser+БД рефанд (202→Inbox→одобрить→−платёж+order refunded); ✅ обмен-UI
end-to-end (AW-9-45→MacBook: old→returned, new→sold, доплата 148000; refunded-заказ→корректный
отказ «refunded→exchanged»). units-lookup: 2 теста.

## Phase 7 — Опасные действия полностью (v1) 🟡
**Цель:** каждое опасное действие — через approval, с ролями и 2FA.
- ✅ Approval-gate: изменение цены>±15%, списание (write_off), изменение остатка
  (stock_adjust), удаление (soft-delete→archived) — исполнители в
  `approvals/action-executors.ts` (ACTION_EXECUTORS); Products + Inventory модули.
- ✅ Reduction: вынос исполнителей из approvals.service (183→136 строк).
- ✅ Продажа в долг>лимита → approval (action=debt): `debts/` модуль park'ит долг >50000
  сом до одобрения, исполнитель `debt` в ACTION_EXECUTORS бронирует его в той же
  транзакции (см. Phase 9).
- ✅ Скидка>10% в POS → approval (action=discount): `POST /pos/sale` со скидкой сверх
  порога (APPROVAL_THRESHOLDS.discountPct=10) park'ит approval и возвращает **202
  {approvalId}** без проведения продажи; кассир повторяет с `approvalId` после одобрения
  старшим (request→approve→retry); анти-подмена: одобренный % должен совпадать (discount_mismatch).
  **UI POS 2.0**: экран «Нужно одобрение» (approvalId) → «Провести после одобрения» → чек
  (браузер+БД проверено end-to-end: 15% → park → approve → продажа 161415, IMEI записан).
- ✅ Staff JWT hardening: Customer PII reads mask phone for anonymous/junior roles; full PII
  only for customer-self or staff admin/owner. Approval Inbox decision ignores body
  `approverRole`; approve/reject uses staff JWT role and service-side Role Permission Matrix.
- ✅ Step-up 2FA для опасного approve: StaffUser хранит TOTP enrollment (`totpSecret`,
  `totpEnabled`), staff API даёт setup/enable/disable, Approval Inbox approve требует
  валидный TOTP-код; reject остаётся быстрым без step-up.
- ✅ Staff-session rollout для POS/warehouse/staff ops: POS sale, shifts, inventory
  movement/transfer/count, order queue/reserve/fulfill/transition требуют активный
  staff JWT; `staffId`/actor берутся из токена, а не из body/query. `/pos`, `/warehouse`,
  `/staff` используют общий staff-login/session; offline POS sync отправляет текущий
  staff token.
- ☐ **Role Permission Matrix** (9 ролей) — расширить на все operational endpoints.
- ☐ Margin-контроль (инв #6).
**Проверка:** ✅ 5 тестов (в пороге→применено, сверх→202→approve→применено, reject→нет
эффекта); in-browser +30% цена → Approval Inbox → одобрить → применено + price.changed.
Добавлено: targeted staff/approval 2FA tests; targeted staff-session ops tests; полный Jest
60 suites / 191 tests; browser QA `/approvals` login→2FA setup и `/pos` staff login →
`/warehouse`/`/staff` shared session без overflow.

## Phase 8 — ERP владельца + Risk/Command Center (v1) 🟡
**Цель:** владелец видит всё в одном окне; всё читается из Event Ledger.
- ✅ ERP-дашборд `/erp`: деньги (продажи/возвраты/net, по способам), заказы/склад по
  статусам, ops (смены, на одобрении). `reports/` модуль, `GET /reports/dashboard`.
- ✅ **Risk Center**: касса≠, COD не сдан >24ч, зависший резерв, ожидающие approval —
  ранжировано по severity (`reports/risk-signals.ts`, reduction). `GET /reports/risks`.
- ✅ **Event Ledger** просмотр (feed) в дашборде. `GET /reports/ledger`.
- ✅ **Маржа/KPI** (`reports.kpi()` + `reports/kpi.ts`, `GET /reports/kpi`): валовая маржа
  = выручка(received-платежи) − себестоимость(cost проданных единиц), маржа %, средний чек,
  топ-товары по выручке. Вкладка «Маржа · KPI» в ERP с карточками + бары топ-товаров.
- ✅ **Command Center**: сигналы Risk-панели кликабельны → переход на экран-решение
  (pending_approval→/approvals, warranty→/warranty, rma→/warehouse, ticket/debt→CRM,
  касса/COD→Финансы, резерв→Склад) — `SIGNAL_ACTION` в `/erp`.
- ✅ **KPI продавцов**: выручка+кол-во продаж по staffId (через shift.staffId), карточка
  «KPI продавцов» в ERP (`reports/kpi.ts` sellers).
- ✅ **Период-фильтр выручки**: `GET /reports/revenue?days=N` (`reports.revenue(days)` +
  `revenue-buckets.ts`, clamp 1..90) + чипы «7 дн / 30 дн» в ERP-дашборде (график
  перестраивается). 4 теста бакетирования.
- ☐ Осталось (v2): произвольные периоды/сравнение, повтор IMEI (trade-in+продажа) как риск.
**Проверка:** ✅ 2 теста дашборда + 3 теста buildKpi (маржа/средний чек/топ, деление на 0);
in-browser /erp: вкладка «Маржа·KPI» на реальных данных (маржа 16250/3.9%, средний чек 104063,
топ-товары), Command Center (клик по «зависший резерв» → вкладка Склад). HTTP+БД сверка.

## Phase 9 — Мультисклад, склад-операции, гарантия (v1) 🟡
- ✅ **WarrantyCase** с SLA (14 дней): open по IMEI + машина статусов + консоль
  сотрудника `/warranty` + запрос клиента из деталей заказа; SLA-breach → Risk Center.
- ✅ Мультифилиал: перемещения (POST /inventory/transfer, stock.moved) + инвентаризация
  (POST /inventory/count, inventory.counted) + UI на складской консоли (WarehouseOps).
- ✅ **Supplier RMA + Scorecard** (`suppliers/` модуль): возврат брака поставщику по IMEI,
  машина статусов created→shipped→accepted→{repaired|replaced|refunded|rejected}→closed
  (`rma-state.ts`), unit-эффекты (open→in_repair; repaired/replaced→in_stock;
  refunded/rejected→written_off), SLA 30 дней → Risk Center (`rma_sla_breach`), scorecard
  по поставщику (volume/resolution rate/backlog, `scorecard.ts`). POST /suppliers,
  POST /suppliers/rma, PATCH /suppliers/rma/:id/transition, GET /suppliers/scorecard.
- ✅ **Долги/рассрочка** (`debts/` модуль): продажа в долг/рассрочку по заказу, лимит
  50000 сом (сверх → approval action=debt, executor бронирует при одобрении), погашение
  платежами (method=installment) до settled, ledger debt.created→debt.payment→debt.settled;
  просрочка (open+dueDate<now) → Risk Center (`debt_overdue`). POST /debts,
  POST /debts/:id/payments, GET /debts.
- ☐ Напоминания по долгам, KPI/зарплаты, смены с фотоотчётом (Evidence Vault).
- 🟡 Импорт данных из Excel/тетради при запуске (Data Migration) — Codex (`import/`, WIP).
**Проверка:** ✅ гарантия created→received через консоль (БД + ledger); SLA-breach ловится
в Risk Center. ✅ Supplier RMA: 6 тестов зелёные + HTTP-смоук created→…→closed (unit
in_stock→in_repair→in_stock; scorecard resolved=1/rate=1; ledger rma.opened→…→rma.closed).
✅ Долги: 6 тестов + HTTP-смоук (book→pay→pay→settled: 30000→18000→0; долг>лимита→202
approvalId→approve→booked; ledger debt.created→debt.payment×2→debt.settled). Осталось:
импорт идемпотентен.

## Phase 10 — Уведомления + Support/CRM (v1→v2) 🟡
- 🟡 Transactional outbox + relay (Codex начал); Novu-доставка (Codex).
- ✅ **Support Inbox** (`support/` модуль): тикеты из любого канала (web/app/whatsapp/
  telegram/call/store), SLA по приоритету (normal 72ч / high 24ч / urgent 4ч), машина
  статусов new→in_progress→waiting→resolved→closed (`ticket-state.ts`), эскалация на шаг
  вверх по лестнице приоритетов (ужимает SLA), просрочка открытых → Risk Center
  (`ticket_sla_breach`). POST /support/tickets, PATCH …/transition, PATCH …/escalate,
  GET /support/tickets. (UI-инбокс — следом.)
- ✅ **Customer 360** (`customers/overview`): один read-агрегатор по customerId —
  профиль+consent+LTV, заказы (кол-во + spent из received-платежей, Event-Ledger-first),
  долги DebtPlan (open-баланс), гарантии WarrantyCase (open), тикеты SupportTicket (open).
  Чистый билдер `customer-overview.ts`. GET /customers/:id/overview.
- ✅ **Notification Preferences** (consent): PATCH /customers/:id/consent переключает
  Customer.consent, пишет customer.consent_changed в ledger только при реальном флипе
  (идемпотентно). Отзыв согласия = стоп всех рассылок (фильтр — лана Codex).
- ✅ **CRM UI** (ERP 2.0 вкладка «CRM · Инбокс», `components/erp/`): Support Inbox (лента
  тикетов с фильтрами по статусу + переходы + эскалация) и Customer 360 карточка (потрачено/
  заказы/долг/гарантии/обращения + consent-переключатель). API-клиенты в `lib/crm.ts`.
- ☐ Segment Builder + Campaign ROI (аудитория consent-filtered — лана Codex).
**Проверка:** ✅ Support: 6 тестов зелёные + HTTP-смоук (open→escalate normal→high→urgent→
transition new→in_progress→resolved→closed; ledger ticket.created→escalated×2→…→closed;
SLA-breach ловится в Risk Center). ✅ Customer 360: 3 теста + HTTP-смоук (реальный клиент:
3 заказа, spent 109900, 1 гарантия; неизвестный → 422). Осталось (Codex-лана): доставка
с retry; consent-фильтр рассылок.

## Phase 11 — AI-слой (v2) 🟡
- ✅ **AI-ассистент владельца** (`ai/` модуль, `GET /ai/insights`): инсайты из Event Ledger
  (маржа/лидер-товар/лучший продавец/возвраты/тревоги) через **порт `InsightProvider`** с
  **бесключевым rule-фолбэком** (`RuleInsightProvider`) — работает офлайн; при `AI_PROVIDER_KEY`
  подключается LLM-провайдер, и при его недоступности откат на правила (никаких ключей в клиенте).
  Вкладка «🧠 Ассистент» в ERP. 4 теста на правила.
- ☐ Оценка Б/У по фото, динамические цены (разведка рынка), обогащение карточек,
  авто-категоризация — LLM/vision-провайдеры за тем же паттерном порта (нужен ключ).
**Проверка:** ✅ бесключевой фолбэк работает end-to-end (браузер: 5 инсайтов из реальных данных);
✅ 4 теста rule-генератора. Осталось: оффлайн-eval на референс-датасете (по появлении ключа/провайдера).

## Phase 12 — Каналы и рост (v2) ☐
- ☐ Telegram Mini App / WhatsApp-магазин; франшиза + аудит партнёрских точек;
  омниканальность (click&collect), подарочные карты, страховка, B2B/опт, рекламный кабинет.
**Проверка:** e2e заказа через каждый канал в общий бэкенд; аудит франшизы читает из ledger.

## Phase 13 — Инфраструктура и отказоустойчивость (сквозная) 🟡
- 🟡 Self-hosted infra scaffolding (Codex).
- ✅ **Offline POS software layer**: local queue, sync/retry, duplicate-safe `clientSaleId`,
  manual conflict state, approval-required state, network degradation fallback.
- ✅ Hardware browser fallback: scanner as keyboard-wedge/SKU input, receipt print dialog,
  terminal readiness check before sale/queue.
- ☐ Осталось: physical hardware certification (silent ESC/POS/QZ, bank terminal SDKs,
  real scanner QA), дельта-синк.
**Проверка:** продажа без сети → синк без потерь/дублей; ручной фолбэк при отсутствии железа.

---

## Реестр дробления (Reduction backlog) — сквозной, не отдельная фаза
Правило: при работе в фазе — если тронутый файл >~400 строк, разбить в рамках той же фазы.

Текущие цели (на момент составления):
- ✅ `apps/web/lib/api.ts` (366→9, баррель) → разнесён по доменам `lib/api/*`: `http.ts`
  (API_BASE+postJson+getJson), `catalog.ts`, `orders.ts`, `auth.ts`, `pos.ts`, `warehouse.ts`,
  `exchanges.ts`, `approvals.ts`; `lib/api.ts` ре-экспортирует всё — импортёры без изменений.
- 🟡 `apps/web/app/pos/page.tsx` (419→316) → извлечён `components/pos/PosCheckout.tsx`
  (pay/pending/done + METHODS); под лимитом. Остаток: PosCatalog/PosTicket при след. касании.
- ☐ `apps/api/src/orders/orders.service.ts` (240) → выделить `order-fulfillment.ts`
  (fulfill/assign) из основного сервиса при следующем касании.
- ☐ `apps/web/app/checkout/page.tsx` (239) → вынести `CheckoutForm`/`OrderSummary`.
- (watch) `apps/api/src/catalog/catalog.service.ts` (323, Codex) — согласовать при касании.

Гейт дробления: после разбиения — те же тесты/сборки зелёные, поведение не изменилось.

---

## Статус-снимок (обновлён: моя-лана MVP закрыта)
**Функциональное ядро прототипа готово end-to-end.** Готово в моей лане:
- Phase 0–6 ✅ (ядро/деньги/витрина/аккаунт/POS/склад/approval-цикл+возвраты+обмены).
- Phase 7 🟡→по существу закрыто: опасные действия через approval (цена/write_off/adjust/
  delete/**долг**/**скидка>10% в POS backend+UI**), staff JWT для Approval Inbox,
  PII masking/read policy, step-up 2FA для approve, staff-session rollout на
  POS/warehouse/staff ops. Остаток — расширить Role Permission Matrix на остальные
  operational endpoints и закрыть margin-control.
- Phase 6 ✅: возвраты/обмены + **exchange-UI кассира** (`/exchange` + `GET /units/:imei`).
- Phase 8 🟡: ERP-дашборд + Risk Center + Event Ledger + **Маржа/KPI** + **KPI продавцов** +
  **Command Center** (кликабельные тревоги) + **период-фильтр выручки (7/30 дн)** ✅.
- Phase 9 🟡: WarrantyCase, мультисклад (перемещения+инвентаризация+UI), **Supplier RMA+scorecard**,
  **долги/рассрочка**. Остаток — долг-напоминания (Codex-уведомления), KPI/зарплаты, Evidence Vault.
- Phase 10 🟡: **Support Inbox**, **Customer 360**, **Notification Preferences (consent)**, **CRM UI**.
  Остаток — Novu-доставка/Segment/Campaign = **лана Codex**.
- **Скупка Б/У backend** ✅: `tradeins/` модуль — `POST /tradeins` создаёт TradeInDevice,
  присваивает `contractId`, маскирует паспорт в response и пишет `tradein.assessed` +
  `tradein.contracted` в Event Ledger. PDF-договор уже доступен через `documents/`.
  Клиентский экран оценки `/trade-in` ✅; evidence-фото → `evidence.attached` ✅.
  Остаток для полного MVP-UX: приёмка в точке.
- Прототип-экраны (Клиент App 2.0): все ✅ (витрина/кабинет/устройства/избранное/**сравнение**/
  **гарантийный талон**/**статус-заказа timeline**/**поиск**/**возвраты**/**support**/**trade-in**/
  **бонусы**/**адреса**/**уведомления**). POS 2.0/ERP 2.0/Сотрудник App 2.0 ✅.
- Качество кода: `lib/api.ts` разнесён по доменам (баррель), `pos/page.tsx` разбит (PosCheckout).

Backend-модулей ~30 · тест-сьютов 60 (191 тест зелёный, `jest`; при
конкурентной работе Codex на общей test-БД возможен флейк — лечится перезапуском).

**Осталось (не в моей лане):**
- **Лана Codex** (не трогаю): Role Permission Matrix rollout, outbox/Novu-доставка,
  Segment/Campaign-рассылки, import (Excel), receipts/labels/documents-PDF,
  realtime (socket.io), observability (sentry), i18n, health, infra (Caddy/бэкапы).
- **Внешние блокеры** (нужны ключи/аккаунты/железо/деньги): Phase 11 AI-слой (ключи AI-провайдера),
  Phase 12 каналы (Telegram/WhatsApp-аккаунты), Phase 13 physical hardware certification.
