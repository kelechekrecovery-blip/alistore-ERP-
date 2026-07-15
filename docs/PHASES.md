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
   - `npm run api:build` и `next build` — оба компилируются;
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
- ✅ Похожие товары на карточке: same-category рекомендации, in-stock/price-near ранжирование.
- ✅ Отзывы: live summary/list на карточке товара + customer JWT create после paid/completed покупки,
  duplicate guard на product/customer/order.
**Проверка:** ✅ in-browser add→cart→checkout→order (channel=web) + сверка в БД.

## Phase 3 — Аккаунт + Auth ✅
- ✅ Вход телефон+OTP (auth — Codex), «Мои заказы» (`/orders/mine`, JWT-guarded),
  деталь заказа + таймлайн + повтор заказа.
- ✅ Бонусы/уровень (`/account/bonuses`), адреса (`/account/addresses`), настройки,
  уведомления + consent-переключатель (`/account/notifications`).
- ✅ Восстановление доступа: отдельный OTP recovery-flow отзывает старые refresh-сессии и
  выдаёт новую пару токенов; `/login` имеет режим «Восстановить».
- ✅ Provider-ready social login: `CustomerIdentity` связывает customer с внешним subject;
  `POST /auth/social/telegram` проверяет Mini App/Login Widget signed initData, `POST
  /auth/social/apple` проверяет Sign in with Apple identityToken через JWKS/RS256; `/login`
  умеет Telegram-вход внутри Mini App.
- ☐ Осталось: production credentials/callback QA и Apple JS/OAuth-клиент после выдачи доступов.
**Проверка:** ✅ in-browser OTP-вход → кабинет → список заказов; guard 401 без токена.

## Phase 4 — POS 2.0 ✅
- ✅ `/pos` тёмный терминал; `POST /pos/sale` (клиент→смена→IMEI→заказ→резерв→оплата).
- ✅ Скидка>лимита→approval; `clientSaleId` идемпотентность для offline retry; scanner
  keyboard-wedge/manual SKU; печать локального/серверного чека через browser print; очередь
  синхронизации с конфликтами/approval-required статусами.
- ✅ Сплит-оплата: POS принимает `payments[]`, проверяет точное равенство tender-сумм итогу,
  пишет отдельные Payment/ledger lines и переводит заказ в `paid` только после полной оплаты.
  UI checkout поддерживает режим Split; offline queue/receipt и серверный чек по заказу
  сохраняют разбивку по tender-суммам.
- ✅ Печатная накладная по заказу: `GET /documents/order/:id/invoice` отдаёт A4 PDF с
  клиентом, каналом/статусом, SKU, IMEI/SN, итогом и оплатами.
- ☐ Осталось: сертификация конкретного физического железа в точке.
**Проверка:** ✅ in-browser продажа со скидкой→оплата; ✅ browser QA split 30000 cash + 70000 card
→ `POST /api/pos/sale` 201, order paid, unit sold, две tender lines; в БД платёж в смене.

## Phase 5 — Склад / Fulfillment ✅
- ✅ `/warehouse` консоль; `POST /orders/:id/fulfill` (назначение IMEI web-заказам,
  нормализация qty>1), движение статусов, очередь `GET /orders?status=`.
- ✅ Evidence Vault: фото к перемещениям/инвентаризации → WebP storage + `evidence.attached`.
- ✅ Приёмка партий: `POST /inventory/receive` (warehouse/admin/owner RBAC) создаёт IMEI units,
  пишет `InventoryMovement(received)`, `stock.received` и `unit.received`; `/warehouse`
  даёт форму batch receive с многострочным IMEI/SN вводом.
- ✅ Инвентаризация со сканером: `/warehouse` принимает многострочный/keyboard-wedge ввод
  IMEI/SN, считает уникальные сканы и отправляет `POST /inventory/count` с рассчитанным фактом.
**Проверка:** ✅ in-browser fulfill web-заказа → reserved+IMEI; ✅ browser QA `/warehouse`
batch receive → `POST /api/inventory/receive` 201, 2 IMEI in_stock, movement+ledger; ✅ scanner
count → `POST /api/inventory/count` 201, expected=2 counted=2 diff=0; сверка в БД.

## Phase 6 — Approval-цикл + Возвраты + Обмены ✅
- ✅ **ApprovalsService** (park→202→decide исполняет действие), **Approval Inbox** UI.
- ✅ Approval-gated **refund** (инв #1) → компенсирующий платёж + order.refunded.
- ✅ **Returns** (return.requested + машина статусов): клиентская заявка требует
  customer JWT и проверяет владение заказом; staff list/get/transition закрыты RBAC.
- ✅ **Обмен** (`ExchangesService`): атомарно возврат старого + продажа нового + доплата
  (≥0) + original→exchanged; дешевле → отказ (через возврат+refund). POST /exchanges.
- ✅ **Exchange-UI кассира** (`/exchange` + `GET /units/:imei` lookup): найти проданный IMEI →
  выбрать новый товар → доплата → способ → оформить. Тёмная консоль с shared staff session;
  unit lookup и `POST /exchanges` требуют active staff JWT, actor берётся из токена.
- ✅ Новая гарантия при обмене: новый IMEI продаётся через новый paid exchange-order того же
  клиента, поэтому `customers.devices()` показывает warrantyUntil/daysLeft от даты обмена.
- ✅ **Refund Money Flow / Dispute Center UI**: `/approvals` создаёт refund-заявку по
  paymentId/сумме/причине; деньги не двигаются до approval, заявка сразу видна в Inbox.
**Проверка:** ✅ browser QA `/approvals` staff login→refund form→`POST /api/payments/:id/refund`
202→Inbox row 25 000, без failed requests/4xx; ✅ in-browser+БД рефанд
(202→Inbox→одобрить→−платёж+order refunded); ✅ обмен-UI
end-to-end (AW-9-45→MacBook: old→returned, new→sold, доплата 148000; refunded-заказ→корректный
отказ «refunded→exchanged»); ✅ browser QA `/exchange` staff login→unit lookup→exchange
(`GET /api/units/:imei` 200, `POST /api/exchanges` 201, без failed requests/console errors/
overflow). units-lookup: 2 теста; exchange warranty coverage regression: новый IMEI имеет
warrantyUntil и daysLeft > 300.

## Phase 7 — Опасные действия полностью (v1) ✅
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
- ✅ **Role Permission Matrix** phase 1: casbin `PermissionGuard` включён на POS sale,
  shifts open/close/read, inventory movement/transfer/count, order queue/reserve/
  fulfill/transition. Проверены 403 для валидного staff JWT с неправильной ролью
  (warehouse→POS, cashier→inventory, seller→fulfillment) и 201/200 для правильных ролей.
- ✅ **Role Permission Matrix** phase 2: `ActiveStaffGuard` + casbin на courier COD/delivery
  (`/courier/runs`, `/courier/handover`, `/deliveries/:id/fail`) и print/export
  (`/documents`, `/labels`, `/receipts`). Actor берётся из staff JWT; customer/неверная
  staff role не проходит.
- ✅ Print/PDF polish: receipts print split tenders, order invoice/waybill includes item IMEI
  and payments, labels stay SVG/barcode-backed, trade-in contract prints optional IMEI plus
  ru-KG date and formatted сом.
- ✅ **Role Permission Matrix** phase 3: staff RBAC на опасные admin endpoints:
  `PATCH /products/:id/price`, `DELETE /products/:id`, `POST /payments/:id/refund`.
  `requester` игнорируется; Approval/Audit actor берётся из staff JWT. Public checkout
  intent/webhook flow не закрыт staff-auth'ом.
- ✅ **Role Permission Matrix** phase 4: warranty split. `POST /warranty` остаётся
  customer self-service, а console list/get/transition требуют active staff JWT +
  роль warehouse/admin/owner; `/warranty` UI использует общий staff session.
- ✅ **Role Permission Matrix** phase 5: support/CRM split. `POST /support/tickets`
  и `GET /support/tickets?customerId=…` остаются customer self-service; CRM inbox
  list/transition/escalate требуют active staff JWT + роль admin/owner; `ticket.created`
  и `ticket.*` actor берутся из customer/staff token path, body actor игнорируется.
  ERP CRM tab использует общий staff session.
- ✅ **Role Permission Matrix** phase 6: supplier/RMA split. `/suppliers` master data,
  `/suppliers/rma`, transitions and scorecard теперь требуют active staff JWT: admin/owner
  создают поставщиков и смотрят scorecard, warehouse/admin/owner ведут RMA. `rma.*`
  actor берётся из staff JWT, body actor игнорируется.
- ✅ **Role Permission Matrix** phase 7: debt/installment split. `POST /debts`,
  `GET /debts`, `POST /debts/:id/payments` требуют active staff JWT: seller/cashier/
  senior/franchise/admin/owner создают/читают, cashier/senior/admin/owner принимают
  платежи. `debt.*` actor и over-limit approval requester берутся из staff JWT.
- ✅ **Role Permission Matrix** phase 8: trade-in split. `POST /tradeins` остаётся
  customer self-service, но body actor игнорируется и ledger actor = customerId.
  Staff intake идёт через `POST /tradeins/intake` с active staff JWT + seller/cashier/
  senior/franchise/admin/owner; `GET /tradeins/:id` staff-read guarded. Staff app
  отправляет Bearer token.
- ✅ **Role Permission Matrix** phase 9: returns/exchanges split. `POST /returns` требует
  customer JWT и проверяет владение заказом; staff list/get/transition требуют active
  staff JWT + returns permission. `GET /units/:imei` и `POST /exchanges` требуют active
  staff JWT; exchange actor берётся из staff token. `/account/returns` отправляет customer
  token, `/exchange` использует shared staff session.
- ✅ **Margin-control** (инв #6): POS sale считает маржу по серверному `Product.cost`,
  `price - cost - discount >= minMarginSom` (сейчас 0 сом/ед.) и паркует `discount`
  approval, если хотя бы одна строка уходит ниже порога. Approval хранит fingerprint
  product/cost/price/qty, поэтому одобрение нельзя переиспользовать на изменённую продажу.
**Проверка:** ✅ 5 тестов (в пороге→применено, сверх→202→approve→применено, reject→нет
эффекта); in-browser +30% цена → Approval Inbox → одобрить → применено + price.changed.
Добавлено: targeted staff/approval 2FA tests; targeted staff-session ops/RBAC tests; courier/
print-export RBAC tests; dangerous endpoint RBAC tests; warranty RBAC tests; support/CRM
RBAC tests; supplier RBAC tests; debt RBAC tests; trade-in RBAC tests; returns/exchanges
RBAC tests; margin-control POS tests; revenue-trend tests; AI insights wiring tests; product-reviews
tests; полный committed-scope Jest 75 suites / 242 tests; browser QA `/approvals` login→2FA setup,
`/pos` staff login → `/warehouse`/`/staff` shared session, `/warranty` staff login,
`/erp` CRM staff login, `/staff` buyback intake, `/exchange` staff login→unit lookup→exchange
без overflow.

## Phase 8 — ERP владельца + Risk/Command Center (v1) ✅
**Цель:** владелец видит всё в одном окне; всё читается из Event Ledger.
- ✅ ERP-дашборд `/erp`: деньги (продажи/возвраты/net, по способам), заказы/склад по
  статусам, ops (смены, на одобрении). `reports/` модуль, `GET /reports/dashboard`.
- ✅ Owner reports hardening: `/reports/*` требует staff JWT + active staff + `reports.read`
  (admin/owner); ERP отправляет shared staff-session token. Customer order status читает
  scoped `GET /orders/:id/ledger`, а не owner ledger.
- ✅ **Risk Center**: касса≠, COD не сдан >24ч, зависший резерв, ожидающие approval,
  SLA-брейчи (гарантия/RMA/тикет), просроченный долг — ранжировано по severity
  (`reports/risk-signals.ts`). `GET /reports/risks`.
- ✅ **Loss-prevention сигналы** (`risk-signals.ts`): `margin_leak` (продажа позиции ниже
  себестоимости, worst-per-SKU), `stock_money_mismatch` (юнит `sold` без заказа = склад≠деньги,
  high, называет IMEI) и `imei_reuse` (тот же IMEI в скупке Б/У и среди проданных = подмена,
  high; поле `TradeInDevice.imei` + миграция `20260707173249_tradein_imei`). Всплывают в Risk
  Center + Command Center (margin_leak→Маржа·KPI, mismatch→Склад, imei_reuse→/warehouse).
  Проверено вживую: mismatch ловит реальную аномалию, imei_reuse — коллизию. Staff/customer
  trade-in capture now stores optional IMEI, so the detector is no longer a dead path.
- ✅ **Risk Center по актуальному Claude Design**: `repeat_returns` (>3 возвратов клиента за
  30 дней), `discount_frequency` (>30% POS-чеков сотрудника со скидкой) и
  `write_off_spike` (списания за 7 дней выше предыдущих 7 дней, минимум 3 единицы).
  Сигналы считаются из `Return→Order`, POS-заказов/смен и `InventoryMovement`, ведут
  соответственно в CRM, Маржа·KPI и Склад; отдельного теневого хранилища рисков нет.
- ✅ **Event Ledger** просмотр (feed) в дашборде. `GET /reports/ledger`.
- ✅ **Маржа/KPI** (`reports.kpi()` + `reports/kpi.ts`, `GET /reports/kpi`): валовая маржа
  = выручка(received-платежи) − себестоимость(cost проданных единиц), маржа %, средний чек,
  топ-товары по выручке. Вкладка «Маржа · KPI» в ERP с карточками + бары топ-товаров.
- ✅ **Command Center**: сигналы Risk-панели кликабельны → переход на экран-решение
  (pending_approval→/approvals, warranty→/warranty, rma→/warehouse, ticket/debt→CRM,
  касса/COD→Финансы, резерв→Склад) — `SIGNAL_ACTION` в `/erp`.
- ✅ **KPI продавцов**: выручка+кол-во продаж по staffId (через shift.staffId), карточка
  «KPI продавцов» в ERP (`reports/kpi.ts` sellers).
- ✅ **Период-фильтр выручки + тренд + произвольный диапазон**: `GET /reports/revenue?days=N`,
  `GET /reports/revenue-trend?days=N` и `GET /reports/revenue-range?from=&to=`
  (`revenue-buckets.ts`, clamp/валидация дат, 422 на кривой/инвертированный/>366 дн) + чипы
  «7 дн / 30 дн / Период» в ERP-дашборде; график перестраивается, бейдж — период vs
  предыдущий (скрыт в кастом-режиме). 16 pure-тестов бакетирования/тренда/диапазона.
  Reduction: DashboardView вынесен в `components/erp/DashboardView.tsx` (страница 376→272).
- ✅ Произвольное сравнение периодов: `revenue-range` возвращает `trend` (окно vs пред. равное),
  бейдж ▲/▼ в кастом-режиме дашборда (коммит `451635a`). Phase 8 revenue-аналитика закрыта.
**Проверка:** ✅ 2 теста дашборда + 3 теста buildKpi (маржа/средний чек/топ, деление на 0);
in-browser /erp: вкладка «Маржа·KPI» на реальных данных (маржа 16250/3.9%, средний чек 104063,
топ-товары), Command Center (клик по «зависший резерв» → вкладка Склад), revenue trend
badge на дашборде. HTTP+БД сверка.

## Phase 9 — Мультисклад, склад-операции, гарантия (v1) ✅
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
  Staff RBAC: admin/owner создают поставщиков и смотрят scorecard, warehouse/admin/owner
  ведут RMA; actor берётся из staff JWT.
- ✅ **Долги/рассрочка** (`debts/` модуль): продажа в долг/рассрочку по заказу, лимит
  50000 сом (сверх → approval action=debt, executor бронирует при одобрении), погашение
  платежами (method=installment) до settled, ledger debt.created→debt.payment→debt.settled;
  просрочка (open+dueDate<now) → Risk Center (`debt_overdue`); reminders за 3 дня и после
  срока → Outbox (`debt_due_soon`/`debt_overdue`) + ledger `debt.reminder_queued`, только
  для клиентов с `Customer.consent=true`.
  POST /debts, POST /debts/:id/payments, GET /debts. Staff RBAC: seller/cashier/senior/
  franchise/admin/owner создают/читают, cashier/senior/admin/owner принимают платежи;
  actor/requester из staff JWT.
- ✅ **Зарплаты продавцов:** `GET /reports/payroll` сохранён как advisory KPI, а канонический
  HR-контур использует периодный `GET /hr/payroll/preview`, replay-safe
  `POST /hr/payroll/runs` и `POST /hr/payroll/runs/:id/pay`. Начисление выводится из
  графика, attendance, оплачиваемых отсутствий, опозданий, переработок и received/reconciled
  продаж кассовой смены; проведение создаёт неизменяемые строки и Ledger-события.
- ✅ **Смены с фотоотчётом** (`/staff` + Evidence Vault): фото открытия/закрытия
  прикрепляются к `entityType=shift`, ledger labels `shift_open_photo`/`shift_close_photo`.
- ✅ **Импорт данных из Excel/тетради** (`import/`): product workbook маппит колонки по
  header, создаёт новые SKU, обновляет изменённые и возвращает `unchanged` при повторе
  того же файла без дублей.
**Проверка:** ✅ гарантия created→received через консоль (БД + ledger); SLA-breach ловится
в Risk Center. ✅ Supplier RMA: 6 тестов зелёные + HTTP-смоук created→…→closed (unit
in_stock→in_repair→in_stock; scorecard resolved=1/rate=1; ledger rma.opened→…→rma.closed).
✅ Supplier RBAC: no-token/seller denied, admin/warehouse allowed by permission, actor spoof ignored.
✅ Долги: 6 тестов + HTTP-смоук (book→pay→pay→settled: 30000→18000→0; долг>лимита→202
approvalId→approve→booked; ledger debt.created→debt.payment×2→debt.settled). ✅ Debt RBAC:
no-token/warehouse denied, seller create/read, cashier pay, actor/requester spoof ignored.
✅ Debt reminders: due-soon/overdue open debts enqueue SMS outbox + `debt.reminder_queued`,
повтор sweep идемпотентен, opt-out клиенты не получают outbox. ✅ Shift photo QA:
`/staff` open→photo 201→close→photo 201,
ledger `evidence.attached` x2. ✅ Import idempotency: repeat workbook → created 0 / updated 0 /
unchanged 1, Product count stays 1.

## Phase 10 — Уведомления + Support/CRM (v1→v2) ✅
- ✅ Transactional outbox + relay: producers write outbox rows in the same transaction as
  ledger changes; relay retries and parks failed messages; transport can be `log`, `novu`,
  `email`, or `realtime`.
- ✅ Transactional customer templates: order confirmation / ready-for-pickup, warranty open /
  closed, reservation expired, and debt due-soon/overdue are enqueued through the outbox only
  for customers with `Customer.consent=true`.
- ✅ **Support Inbox** (`support/` модуль): тикеты из любого канала (web/app/whatsapp/
  telegram/call/store), SLA по приоритету (normal 72ч / high 24ч / urgent 4ч), машина
  статусов new→in_progress→waiting→resolved→closed (`ticket-state.ts`), эскалация на шаг
  вверх по лестнице приоритетов (ужимает SLA), просрочка открытых → Risk Center
  (`ticket_sla_breach`). POST /support/tickets, PATCH …/transition, PATCH …/escalate,
  GET /support/tickets. Public open/list-by-customer остаётся customer self-service;
  CRM inbox list/transition/escalate закрыты active staff JWT + admin/owner.
- ✅ **Customer 360** (`customers/overview`): один read-агрегатор по customerId —
  профиль+consent+LTV, заказы (кол-во + spent из received-платежей, Event-Ledger-first),
  долги DebtPlan (open-баланс), гарантии WarrantyCase (open), тикеты SupportTicket (open).
  Чистый билдер `customer-overview.ts`. GET /customers/:id/overview.
- ✅ **Notification Preferences** (consent): PATCH /customers/:id/consent переключает
  Customer.consent, пишет customer.consent_changed в ledger только при реальном флипе
  (идемпотентно). Отзыв согласия = стоп всех рассылок (фильтр — лана Codex).
- ✅ **CRM UI** (ERP 2.0 вкладка «CRM · Инбокс», `components/erp/`): Support Inbox (лента
  тикетов с фильтрами по статусу + переходы + эскалация) и Customer 360 карточка (потрачено/
  заказы/долг/гарантии/обращения + consent-переключатель). Вкладка использует общий staff
  session; API-клиенты в `lib/crm.ts`.
- ✅ Segment Builder + paid Campaign ROI: `/campaigns/preview` строит аудиторию по level/city/
  tags/spend/ltv и всегда фильтрует `Customer.consent`; `POST /campaigns` создаёт серверный
  tracking code, фиксирует consenting recipients и ставит outbox только для них. Витрина
  сохраняет ограниченные first/last UTM, заказ принимает их как недоверенный input, а API
  канонизирует campaign/source/medium. Полностью полученная оплата один раз пишет
  `campaign.converted` и обновляет paid revenue, server-cost gross profit и ROAS. ERP даёт
  preview, запуск, tracking URL и экономику; ручная привязка убрана из UI и оставлена только
  как permissioned locked backfill.
**Проверка:** ✅ Support: 6 тестов зелёные + HTTP-смоук (open→escalate normal→high→urgent→
transition new→in_progress→resolved→closed; ledger ticket.created→escalated×2→…→closed;
SLA-breach ловится в Risk Center). ✅ Support/CRM RBAC: public open/list-by-customer,
403 для no-token/seller CRM inbox, admin list/transition/escalate, actor spoof ignored.
✅ Customer 360: 3 теста + HTTP-смоук (реальный клиент: 3 заказа, spent 109900,
1 гарантия; неизвестный → 422). ✅ Campaigns: targeted e2e на RBAC, consent-filter,
first/last attribution, partial/full payment и replay-safe conversion; browser QA проходит
campaign → storefront UTM → checkout → sandbox payment → ERP Campaigns (tracking URL, paid
revenue, gross profit and ROAS, no overflow) с БД-сверкой attribution/Ledger. Outbox recipients
include consenting customer and exclude opted-out customer. Refund-adjusted net ROAS и
visit/click funnel вынесены в MKT-006. ✅ Transactional
notifications: targeted e2e verifies order/warranty templates, consent filtering, debt opt-out
reminders, and reservation expiry without an opted-out notice.

## Phase 11 — AI-слой (v2) 🟡
Бесключевое ядро AI-мерчандайзинга — все фичи за единым **паттерном порта**: правила сейчас
(работают офлайн, детерминированные, покрыты тестами), LLM/vision подключаются при `AI_PROVIDER_KEY`
без переписывания, с откатом на правила при сбое провайдера; **ключей в клиенте нет**.
- ✅ **AI endpoint hardening:** `/ai/*` требует staff JWT + active staff + `ai.read`
  (admin/owner); ERP, `/assess`, `/ai-tools` и `/admin/products` отправляют shared staff token.
- ✅ **AI-ассистент владельца** (`GET /ai/insights`): инсайты из Event Ledger + rule engines
  мерчандайзинга (маржа/лидер-товар/лучший продавец/возвраты/тревоги/дефицит/затоварка)
  через порт `InsightProvider` + `RuleInsightProvider`. Вкладка «🧠 Ассистент». 8 тестов.
- ✅ **Оценка Б/У** (`POST /ai/assess`): депрециация по grade/возрасту/дефектам → перепродажа/выкуп.
  Консоль «/assess». Тесты на движок.
- ✅ **Авто-категоризация** (`POST /ai/categorize`): классификация товара по ключевым словам (RU/EN).
  4 теста.
- ✅ **Ценовые рекомендации** (`GET /ai/pricing`): правило спрос/остаток → поднять/держать/скидка
  (overstock-сторона). Вкладка «🏷️ Цены». 5 тестов.
- ✅ **Рекомендации по закупкам** (`GET /ai/reorder`): understock-зеркало цен → что дозаказать с
  срочностью и количеством под спрос. Вкладка «🛒 Закупки». 6 тестов.
- ✅ **LLM-провайдер инсайтов через OpenRouter** (`ai/openrouter-provider.ts`): реальный LLM за
  портом `InsightProvider` — один ключ, любая модель. Включается при `AI_PROVIDER_KEY`/
  `OPENROUTER_API_KEY` (модель — `AI_MODEL`, дефолт `openai/gpt-4o-mini`); при любой ошибке
  (сеть/не-200/непарсибельно) — откат на rule-движок. Ключ только на сервере, не логируется, не
  уходит в клиент. Промпт/парсинг чистые, 6 тестов. Проверено: без ключа → `rules`; липовый ключ →
  провайдер выбран → `rules (fallback)`. **Активация:** задать env-ключ на API и перезапустить.
- ✅ **Обогащение карточек** (`POST /ai/describe`): продающее описание товара — keyless-шаблон
  (name+category+топ-атрибуты+обещание магазина) или LLM через OpenRouter при ключе, с откатом
  на шаблон. По sku или inline; 422 на unknown sku. Общий транспорт `openRouterChat()`. 6 тестов.
- ✅ **UI-дом для обогащения товара** (`/admin/products`): staff-only product CRUD обычных полей,
  кнопки «Авто-категория» и «Сгенерировать описание» заполняют `category`/`attrs.description`,
  а цена и архивирование уходят через Approval Inbox.
- ✅ **AI vision/market-scout scaffold:** `POST /ai/grade-photos` и `POST /ai/price-scout`
  работают как staff-only endpoints: без ключа дают детерминированные rule-ответы, при
  `AI_PROVIDER_KEY`/`OPENROUTER_API_KEY` пробуют OpenRouter и безопасно откатываются на правила.
  Production-качество vision/scout всё ещё требует реальный provider key, reference photo/listing
  dataset и offline-eval пороги.
**Проверка:** ✅ все 5 бесключевых фич работают end-to-end (браузер + curl на реальных данных);
✅ юнит-тесты rule-движков зелёные; AI-assistant service wiring проверяет, что pricing/reorder
сигналы попадают в `/ai/insights`; targeted tests покрывают `grade-photos`, `price-scout`
и `/ai/*` RBAC. Осталось только production activation с внешним ключом/датасетом.

## Phase 12 — Каналы и рост (v2) 🟡
- ✅ Подарочные карты / стор-кредит: `GiftCard` + `PaymentMethod.gift_card`, выпуск через staff
  endpoint, проверка баланса, атомарное списание в checkout/POS, idempotent retry по
  `giftcard:<code>:<orderId>`, ledger `giftcard.issued` / `giftcard.redeemed`. Checkout
  показывает поле подарочной карты, списывает баланс как отдельный tender и создает sandbox
  intent только на остаток.
- ✅ Telegram Mini App shell: `/tg` даёт mobile storefront + checkout поверх общего
  catalog/orders/payments API, создаёт заказы с `channel=telegram`; `/tg/webhook` — безопасная
  stub-точка до выдачи bot token.
- ✅ Campaign delivery transports: `NOTIFICATION_TRANSPORT=channels`/`providers` маршрутизирует
  `sms`/`push`/`webhook` через Novu, `telegram` через Bot API, `whatsapp` через WhatsApp Cloud API,
  `email` через SMTP/jsonTransport. Campaign API принимает `whatsapp`; Telegram-recipient берётся
  из `Customer.segments` (`telegram:<chat_id>`/`tg:<chat_id>`) с fallback на телефон.
- ✅ Омниканальность / click&collect: `Order.fulfillmentType`, `pickupPoint`, `deliveryAddress`,
  `deliverySlot`, `pickupCode`; web/native/Telegram checkout создают pickup-заказы, а кабинет,
  staff app и warehouse queue показывают точку/код выдачи.
- ✅ B2B/опт: `BusinessBuyerProfile` + `B2BQuote/B2BQuoteItem`, customer-owned `/b2b`
  кабинет с реквизитами и заявкой на счёт/банковский перевод по серверным ценам каталога,
  staff RBAC очередь с выпуском КП, customer acceptance и ledger `b2b.quote_*`.
- ✅ Страхование/защита: `DeviceProtectionPolicy` только для купленного customer-owned IMEI,
  планы accident/extended/full на 12/24 месяца, server suggested premium, staff RBAC
  review/offer/reject, customer activation с датами покрытия и ledger `protection.*`.
- ☐ WhatsApp-магазин; франшиза + аудит партнёрских точек;
  рекламный кабинет.
**Проверка:** ✅ gift-card e2e: выпуск → split tender gift_card+cash, web-flow gift-card→online
остаток, retry без двойного списания, over-balance rejection; browser/CDP smoke checkout:
gift card 25 000 + card 75 000 → order paid, карта redeemed, ledger `giftcard.redeemed`.
✅ Telegram Mini App e2e: `/tg` add-to-cart → checkout → Order(channel=telegram) в БД.
✅ Campaign delivery: provider routing unit tests + campaigns e2e queue WhatsApp and Telegram chat-id recipients.
✅ Click&collect: API tests сохраняют fulfilment metadata + ledger payload; Playwright checkout
создаёт paid pickup-order с `pickupPoint=alistore-center` и `pickupCode`.
✅ B2B: API ownership/RBAC/transition tests + browser flow OTP→реквизиты→каталог→invoice quote;
заявка и `b2b.quote_requested` сверены в PostgreSQL.
✅ Protection: API owner/RBAC/lifecycle tests + browser flow OTP→купленный IMEI→full protection;
premium и `protection.requested` сверены в PostgreSQL.
Остальное: e2e заказа через будущие каналы в общий бэкенд; аудит франшизы читает из ledger.

## Phase 13 — Инфраструктура и отказоустойчивость (сквозная) 🟡
- ✅ Playwright E2E + CI: root `npm run e2e`, `playwright.config.ts`, 11 smoke flows
  (web checkout, POS discount→approval, return→refund request, exchange, trade-in intake,
  admin product management, protected ERP reports/AI, Telegram Mini App) and
  `.github/workflows/ci.yml` with Postgres service, install, Prisma migrate, API build/test,
  web build, browser install and E2E artifacts on failure.
- ✅ Self-hosted infra scaffolding + production runbook (Caddy, backups, restore drill,
  release smoke, rollback).
- ✅ Public write endpoint rate limits: OTP, checkout chain (`/customers`, `/orders`,
  `/payments/intents`), support ticket creation and sandbox/provider payment webhooks
  return 429 after per-route caps.
- ✅ External integration readiness report: `GET /health/integrations` shows blocking
  provider/account/hardware gates, configured/missing env names, manual POS certification
  checks, and never returns secret values.
- ✅ **Offline POS software layer**: local queue, sync/retry, duplicate-safe `clientSaleId`,
  manual conflict state, approval-required state, network degradation fallback.
- ✅ POS catalog delta-sync: `GET /catalog/products/delta` returns changed active products and
  archived removals; `/pos` keeps a local catalog cache and refreshes stock via delta after sync/reload.
- ✅ Hardware browser fallback: scanner as keyboard-wedge/SKU input, receipt print dialog,
  terminal readiness check before sale/queue.
- ☐ Осталось: physical hardware certification (silent ESC/POS/QZ, bank terminal SDKs,
  real scanner QA).
**Проверка:** продажа без сети → синк без потерь/дублей; POS UI browser smoke проверяет
catalog delta-sync; ручной фолбэк при отсутствии железа.

---

## Реестр дробления (Reduction backlog) — сквозной, не отдельная фаза
Правило: при работе в фазе — если тронутый файл >~400 строк, разбить в рамках той же фазы.

Текущие цели (на момент составления):
- ✅ `apps/web/lib/api.ts` (366→9, баррель) → разнесён по доменам `lib/api/*`: `http.ts`
  (API_BASE+postJson+getJson), `catalog.ts`, `orders.ts`, `auth.ts`, `pos.ts`, `warehouse.ts`,
  `exchanges.ts`, `approvals.ts`; `lib/api.ts` ре-экспортирует всё — импортёры без изменений.
- ✅ `apps/web/app/pos/page.tsx` (589→391) → `components/pos/{PosCatalog,PosTicket,PosCheckout}` (`5c34195`).
- ✅ `apps/web/app/erp/page.tsx` (533→332) → `components/erp/{ReadinessView,Card}` + прежние *View (`f0a926d`).
- ✅ `apps/web/app/admin/products/page.tsx` (608→315) → `components/admin/{ProductList,ProductEditor}`
  + `lib/admin-product-form.ts` (`3766376`).
- ✅ `apps/web/app/approvals/page.tsx` (422→365) → `components/approvals/ApprovalList.tsx` (`7a9e15c`).
- 🔜 `apps/web/app/staff/page.tsx` (618) и `apps/web/app/tg/page.tsx` (444) — в лейне Codex (см. `CODEX-NOW.md` C-4).
- (под лимитом, по касанию) `apps/web/app/checkout/page.tsx` (309), `apps/api/src/orders/orders.service.ts` (296),
  `apps/api/src/catalog/catalog.service.ts` (371, Codex).

Гейт дробления: после разбиения — те же тесты/сборки зелёные, поведение не изменилось.

---

## Статус-снимок (обновлён: моя-лана MVP закрыта)
**Функциональное ядро прототипа готово end-to-end.** Готово в моей лане:
- Phase 0–6 ✅ (ядро/деньги/витрина/аккаунт/POS/склад/approval-цикл+возвраты+обмены).
- Phase 7 ✅: опасные действия через approval (цена/write_off/adjust/
  delete/**долг**/**скидка>10% в POS backend+UI**), staff JWT для Approval Inbox,
  PII masking/read policy, step-up 2FA для approve, staff-session rollout на
  POS/warehouse/staff ops, Role Permission Matrix phase 1 на POS/shifts/inventory/
  fulfillment, phase 2 на courier COD/delivery и print/export, phase 3 на products/refunds,
  phase 4 на warranty split, phase 5 на support/CRM split, phase 6 на supplier/RMA split.
  phase 7 на debt/installment split, phase 8 на trade-in split, phase 9 на returns/exchanges
  split, плюс margin-control по себестоимости.
- Phase 6 ✅: возвраты/обмены + **exchange-UI кассира** (`/exchange` + `GET /units/:imei`).
- Phase 8 ✅: ERP-дашборд + Risk Center + Event Ledger + **Маржа/KPI** + **KPI продавцов** +
  **Command Center** (кликабельные тревоги) + **период-фильтр выручки (7/30 дн)** ✅.
- Phase 9 ✅: WarrantyCase, мультисклад (перемещения+инвентаризация+UI), **Supplier RMA+scorecard**,
  **долги/рассрочка**, **зарплаты продавцов**, debt reminders через outbox, Evidence Vault
  фотоотчёт смены, Excel import idempotency.
- Phase 10 ✅: **Support Inbox**, **Customer 360**, **Notification Preferences (consent)**, **CRM UI**,
  transactional outbox transports and customer templates, **Campaign Segment Builder + ROI**.
- Cross-cutting security ✅: public write endpoint rate limits for OTP, checkout chain,
  support tickets and payment webhooks; owner `/reports/*` and `/ai/*` are staff-RBAC
  protected with admin/owner read permissions.
- Cross-cutting quality ✅: Playwright E2E smoke pack + GitHub Actions CI for core customer,
  POS approval, return/refund, exchange, trade-in, admin product-management, and Telegram Mini
  App paths.
- **Скупка Б/У backend** ✅: `tradeins/` модуль — `POST /tradeins` создаёт TradeInDevice,
  присваивает `contractId`, маскирует паспорт в response и пишет `tradein.assessed` +
  `tradein.contracted` в Event Ledger; actor для customer self-service = customerId.
  Staff intake: `POST /tradeins/intake` + staff JWT, Staff app `/staff` отправляет Bearer
  token и optional IMEI; `GET /tradeins/:id` staff-read guarded. PDF-договор уже доступен через
  `documents/`. Клиентский экран оценки `/trade-in` ✅; evidence-фото →
  `evidence.attached` ✅.
- Прототип-экраны (Клиент App 2.0): все ✅ (витрина/кабинет/устройства/избранное/**сравнение**/
  **гарантийный талон**/**статус-заказа timeline**/**поиск**/**возвраты**/**support**/**trade-in**/
  **бонусы**/**адреса**/**уведомления**). POS 2.0/ERP 2.0/Сотрудник App 2.0 ✅.
- Качество кода: `lib/api.ts` разнесён по доменам (баррель), `pos/page.tsx` разбит (PosCheckout).

Backend-модулей 45 · API тест-сьютов 98 (350 тестов зелёные, `jest`; при
конкурентной работе Codex на общей test-БД возможен флейк — лечится перезапуском).

**Осталось:**
- **Unblocked Phase 12:** аудит франшизных точек, WhatsApp storefront shell и рекламный кабинет.
- **P0 security:** закрыт. `/reports/*` и `/ai/*` требуют staff-RBAC; ERP/AI web-клиенты
  отправляют shared staff token; customer order timeline имеет scoped order-ledger endpoint.
- **Внешние блокеры** (нужны ключи/аккаунты/железо/деньги): Phase 11 AI-слой (ключи AI-провайдера),
  Phase 12 каналы (Telegram/WhatsApp-аккаунты), social provider production credentials/client QA,
  Phase 13 physical hardware certification. Текущий machine-readable статус: `GET /health/integrations`.
