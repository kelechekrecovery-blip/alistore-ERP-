# 🚨 EMERGENCY P0 (перед любым запуском/деплоем)

> ✅✅ **CLAUDE ЗАКРЫЛ ВСЕ Блоки 1–3.** Коммиты: M-3 `b49dc63`, M-2 `f599137`,
> M-1 `cc7d880`, индексы `6c745bd`, E1/E-a/E2 `e321fc5`, E3-E7 `e65dd1b`,
> E8 `91aecb4`, M-5 `dd71bd1`. Все с тестами/проверкой.
> **Остаток — ничего блокирующего:**
> - **E8** ✅ — trade-in контракт (raw паспорт) сужен до PII-ролей через method-level
>   `@RequirePermission('pii','approve')` поверх class-level `documents:read`. seller→403.
> - **M-5** ✅ — POS-идемпотентность: `clientSaleId` остаётся optional (web/mobile всегда шлют),
>   а при отсутствии сервер деривит `pos:auto:<hash>` из cart-fingerprint в 60-сек окне →
>   ретрай не создаёт 2-й заказ. e2e есть.
> - **M-4** ⚪ — необязателен: конкурентный webhook уже graceful через `FOR UPDATE` из M-1
>   (доказано `payment-intents` webhook-race тестом — оба 200, один Payment). Отдельный
>   catch P2002 → belt-and-suspenders, не блокер. Можно добавить позже.
> - **Auth-hardening тесты:** ✅ TOTP-replay (включая concurrent single-use),
>   ✅ refresh-reuse-detection с отзывом всей семьи и row lock, ✅ OTP-lockout.
> - **Race-тесты:** ✅ giftcard double-redeem, ✅ webhook idempotency.

## Сделано Claude (детали ниже помечены ✅)



> От Claude (оркестратор), по 4-агентному глубокому аудиту (см. `AUDIT-FINDINGS.md`).
> **Это выше всех остальных задач** (features/polish/backlog — потом). Каждый пункт: точное
> место, фикс (эталонный паттерн уже есть в коде — копируй), приёмка + ОБЯЗАТЕЛЬНЫЙ тест.
> Все — в lane Codex. Правила прежние: атомарные коммиты явными путями, не переписывать историю,
> Claude-lane (`reports/`, `ai/`, `*View.tsx`) не трогать. После каждого блока — `api:test` зелёный.

## БЛОК 1 — Забытые guard'ы (утечка денег/PII, drive-by через открытый CORS) — САМОЕ СРОЧНОЕ

- **E1. `POST /payments`, `GET /payments`.** `payments/payments.controller.ts:40,51`
  Сейчас без guard → любой метит чужой заказ оплаченным / сливает платежи. Навесить
  `@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)` + `@RequirePermission('payments','...')`
  (как на `refund()` в том же файле :90). Для customer-checkout пути (если `POST /payments` зовёт клиент) —
  customer JWT + `order.customerId === user.customerId`. Обновить web/mobile-вызовы слать токен.
  **Приёмка/тест:** без токена → 401; чужой заказ → 403; свой/staff → 201. (нельзя сломать guest-checkout —
  проверь, кто реально зовёт этот эндпоинт).

- **E2. `GET /customers/:id/overview` и `GET /customers/:id`.** `customers/customers.controller.ts:49,59`
  `OptionalJwtAuthGuard` пускает анонима → слив Customer 360 (долги/гарантии/тикеты). Заменить на
  **обязательный** `JwtAuthGuard` + owner-check (`user.customerId===id`) ИЛИ staff-permission.
  **Тест:** аноним → 401; чужой customer → 403; сам/staff → 200.

- **E3. `POST /tradeins`.** `tradeins/tradeins.controller.ts:33`
  Без guard, принимает `customerId`+`sellerPassport` от кого угодно (KYC!). Добавить `JwtAuthGuard` +
  `user.customerId===dto.customerId` — эталон уже есть в `returns.controller.ts`/`support.controller.ts`/
  `warranty.controller.ts`. Плюс throttle. **Тест:** аноним/чужой → 401/403; свой → 201.

- **E4. `POST /evidence/images`.** `evidence/evidence.controller.ts:37`
  Без guard + `actor` из тела (форжинг ledger). Добавить `JwtAuthGuard` (+ permission/owner на целевую
  сущность) и брать `actor` из JWT, не из `dto.actor`. **Тест:** аноним → 401; actor в ledger = из токена.

- **E5. Аналогичный owner-gap: `POST /warranty`.** `warranty/warranty.controller.ts` (M1) —
  при отсутствии JWT `customerId` берётся из тела. Тот же owner-check.

- **E6. CORS + helmet.** `main.ts:16`
  `enableCors()` → `enableCors({ origin: (env CORS_ORIGINS split ','), credentials: true })`; добавить
  `helmet()` (HSTS/CSP/nosniff/frameguard/referrer). **Приёмка:** запрос с чужого origin отбит; заголовки есть.

- **E7 (HIGH). Rate-limit на staff-auth.** `staff-auth/staff-auth.controller.ts:16,24,48` —
  login/bootstrap/2FA без throttle (брутфорс пароля/TOTP). Навесить `@Throttle` (лучше — глобальный
  `APP_GUARD` ThrottlerGuard). **Тест:** N+1 попытка → 429.

- **E8 (HIGH). Паспорт в PDF.** `documents/documents.service.ts:80` использует raw `sellerPassport`,
  а `documents:read` дан seller/cashier/… Сузить грант до admin/owner ЛИБО маскировать + требовать `pii`-approve.

## БЛОК 2 — Concurrency-money баги (тот же TOCTOU-класс, что чинили в `2ec7a66`)

- **M-1. `payMany` дубль-платёж на аксессуарах.** `payments/payments.service.ts:152-243`
  Финальный `order.update({status:'paid'})` безусловный; `sellOnTx` (единственная защита) только `if(item.imei)`.
  Сделать перевод в `paid` **условным**: `updateMany({where:{id,status:{in:PAYABLE}}, data:{status:'paid'}})`
  и если `count===0` — откат/идемпотентный ответ. Эталон: `units/units.service.ts:68-91`.
  **Тест:** `Promise.allSettled([payMany, payMany])` на аксессуарном заказе (без IMEI, без общего txnId) →
  ровно один Payment, order.paid один раз (по образцу `refund-limit.spec.ts:59-91`).

- **M-2. `orders.fulfill()` двойная резервация.** `orders/orders.service.ts:242-274`
  Два безусловных `deviceUnit.update`. Заменить на условный `updateMany({where:{imei,status:'in_stock'},...})`
  (и `{productId,status:'in_stock'}` для non-serialized), проверять `count`. Эталон: `reserveOnTx`.
  **Тест:** гонка двух `fulfill()` на один SKU/юнит → один выигрывает, второй 409, без двойной резервации.

- **M-3. `debts.pay()` lost-update.** `debts/debts.service.ts:82-124`
  Заменить read-modify-write на атомарный `updateMany({where:{id,balance:{gte:amount}}, data:{balance:{decrement:amount}}})`.
  Эталон: `giftcards/giftcards.service.ts:88-99`. Добавить idempotency-ключ в `DebtPaymentDto`.
  **Тест:** гонка двух оплат одного долга → баланс верный, не двойное списание.

- **M-4. ⚪ P2002 → идемпотентный 200 (не 500).** `payments/payments.service.ts:70-82,128-143`
  Не блокер: M-1 `FOR UPDATE` уже делает конкурентный webhook graceful (доказано webhook-race
  тестом — оба 200, один Payment). Отдельный catch P2002 — опциональная перестраховка на потом.

- **M-5. ✅ POS-идемпотентность.** `pos/pos.service.ts` + `pos/pos.dto.ts` (коммит `dd71bd1`).
  `clientSaleId` остаётся optional (web/mobile всегда шлют), при отсутствии сервер деривит
  `pos:auto:<sha256(staff+point+lines+tenders+discount+60s-bucket)>` → ретрай не создаёт 2-й заказ.
  **Тест:** `pos-sale.e2e-spec.ts` — no-key ретрай продаёт 1 юнит, не 2. ✅

## БЛОК 3 — Индексы (тривиальные аддитивные миграции; можно отдать Claude — скажи)
- **I-1.** `AuditEvent`: `@@index([refs], type: Gin)` (сейчас B-tree — не обслуживает `has`).
- **I-2.** `CashShift`: `@@index([staffId, closedAt])`, `@@index([diff, closedAt])` (сейчас 0 индексов; горячий POS-путь).
- **I-3.** `Payment`: `@@index([status, createdAt])` (все дашборды фильтруют по ним).
- По одной аддитивной миграции, применить на dev+test, коммит сразу.

## Гейт для КАЖДОГО пункта
`npm run api:test` зелёный (+ новый тест из приёмки) · `api:build` + `next build` · живой curl-прогон
(401/403/200 как в приёмке) · атомарный коммит явными путями. По готовности — отметь ✅ здесь.

## Что НЕ входит (отдельные фазы — не блок P0-безопасности)
Боевой платёжный шлюз (G1), SMS/OTP (G2), фискализация (G3) — нужны договоры/аккаунты (см. `GO-LIVE-PHASES.md`).
Reports-окна (#11) и string-ref FK-стратегия (#13) — не блокеры первого клиента, но в бэклоге. Claude берёт #11.
