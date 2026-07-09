# Глубокий аудит перед запуском — сводка находок (G4)

> 4 параллельных code-grounded аудита (деньги/транзакции · данные/масштаб · тесты · безопасность).
> Ниже — приоритизировано, с владельцем и file:line. Владелец: 🟩 Codex (payments/orders/debts/
> auth/schema) · 🟦 Claude (reports/ai + этот трекинг). **Ключевой вывод:** правильный паттерн
> конкурентности (`updateMany` с условием / `FOR UPDATE`) в коде ЕСТЬ (units, giftcards, refund),
> но применён НЕ везде — те же TOCTOU-баги класса, что уже чинились в P0-аудите (`2ec7a66`),
> просочились в payMany/fulfill/debt.pay. Фиксы малы и понятны — «скопировать существующий верный паттерн».

## 🔴 CRITICAL (блокируют боевой приём денег)

1. **Платёжные эндпоинты без auth.** 🟩 `payments/payments.controller.ts:40,51,62` — `GET /payments`,
   `POST /payments` (пометить оплаченным, actor=system), `POST /payments/intents` — без guard'ов
   (только rate-limit); защищён лишь `refund`. Любой с `orderId` метит заказ оплаченным / сливает
   платежи / грифит сток. **Проверено чтением.** Фикс: JwtAuthGuard + owner-check (customer==order.customerId
   или staff-permission) на все три; обновить web/mobile-вызовы слать токен + тесты.
2. **Дубль-платёж на аксессуарных заказах (без IMEI).** 🟩 `payments/payments.service.ts:152-243` —
   `order.update(status:paid)` безусловный, без CAS; `sellOnTx` (единственная защита) вызывается
   только `if(item.imei)`. Две гонки → 2 Payment + удвоение выручки в отчётах. Фикс: условный
   `updateMany({where:{id,status:'reserved'},...})` как в `units.service.ts:68-91`.
3. **Двойная резервация на `orders.fulfill()`.** 🟩 `orders/orders.service.ts:242-274` — безусловный
   `deviceUnit.update` без `status:'in_stock'` в WHERE (ровно тот TOCTOU, о котором предупреждает
   комментарий в units.service). Гонка складского fulfill → одно устройство двум клиентам. Фикс:
   условный `updateMany` gated на `status:'in_stock'`.
4. **Lost-update баланса долга.** 🟩 `debts/debts.service.ts:82-124` — `balance = debt.balance - amount`
   читается-считается-пишется безусловно, без `{decrement}`/`gte`. Две оплаты → неверный остаток
   (расхождение AR). Фикс: атомарный `updateMany({data:{balance:{decrement}},where:{balance:{gte:amount}}})`
   как в giftcards.
5. **GIN-индекс на `AuditEvent.refs` отсутствует.** 🟩/🟦 schema `@@index([refs])` — это B-tree, не
   обслуживает `has`/`hasEvery` → seq-scan самой быстрорастущей таблицы (order-timeline, debt-reminder,
   campaign-dedupe). Фикс (1 строка): `@@index([refs], type: Gin)` + миграция.
6. **`CashShift` без индексов.** 🟩/🟦 запрашивается `staffId+closedAt IS NULL` на КАЖДОЙ POS-продаже
   (`shifts.service.ts:35`). Фикс: `@@index([staffId, closedAt])`, `@@index([diff, closedAt])`.

### 🔴 CRITICAL от security-аудита — ещё неаутентифицированные эндпоинты (drive-by через открытый CORS)
7. **Утечка Customer 360 (PII+финансы) без токена.** 🟩 `customers.controller.ts:49` — `overview()` под
   `OptionalJwtAuthGuard` пускает **аноним**; маскируется только телефон → любой по `customerId` читает
   имя/LTV/сегменты/consent/историю заказов/**остатки долгов**/гарантии/тикеты. Массовый слив CRM.
   Фикс: обязательный JwtAuthGuard + owner/role-check.
8. **Скупка Б/У без токена + паспорт.** 🟩 `tradeins.controller.ts:33` — `POST /tradeins` без guard,
   принимает `customerId` и `sellerPassport` (нац. ID) от кого угодно, без owner-проверки → сбор
   паспортов + подделка договора на чужой аккаунт (KYC-эндпоинт!). Фикс: guard + `user.customerId===dto.customerId`.
9. **Evidence-загрузка без токена + подделка actor.** 🟩 `evidence.controller.ts:37` — `POST /evidence/images`
   (8MB) без guard, `actor` берётся из тела → форжинг аудит-следа в append-only ledger + storage-DoS.
   Фикс: guard + actor из JWT.
10. **CORS нараспашку + нет helmet.** 🟩 `main.ts:16` `enableCors()` без origin → всё выше эксплуатируется
    drive-by с любой веб-страницы (без XSS/токена). Фикс: allowlist из env + helmet (HSTS/CSP/nosniff/frameguard).

## 🟠 HIGH

7. **Webhook без верификации подписи.** 🟩 `payment-intents.service.ts:87-95` — доверяет телу as-is.
   Для боевого шлюза: HMAC-проверка + сверка с сохранённым intent (amount/order). (см. G1)
8. **TOTP-replay.** 🟩 `auth/totp.service.ts:19` — нет счётчика last-used; один 6-значный код может
   авторизовать несколько опасных approve в окне валидности. Фикс: трекинг использованного step.
9. **Refresh-reuse не отзывает потомка.** 🟩 `auth/auth.service.ts:173-192` — при переиспользовании
   отозванного refresh не гасится порождённая сессия (нет token-family). Фикс: revoke descendant chain.
10. **`Payment.status`/`createdAt` без индексов.** 🟩/🟦 каждый дашборд/KPI/payroll фильтрует по ним →
    seq-scan. Фикс: `@@index([status, createdAt])`.
11. **Отчёты считают по ВСЕЙ истории (unbounded).** 🟦 `reports/reports.service.ts:188,190,195,284` —
    `findMany` без `take`/окна, агрегация в Node на каждый запрос. Растёт линейно навсегда. Фикс
    (моя lane): окно по датам / инкрементальные агрегаты / кэш (нужно продуктовое решение по «all-time»).
12. **Резерв-expiry может «завесить» реальный платёж.** 🟩 sweep не трогает `Order.status`; webhook
    после 30-мин TTL → tx откатывается, заказ навечно в `awaiting_payment`. Фикс: order-level expiry/recon.
13. **String-ref модели без FK = сироты.** 🟩/🟦 `WarrantyCase/DebtPlan/Return/SupportTicket/TradeInDevice`
    ссылаются строкой (намеренно, `20260707051628_ticket_drop_customer_fk`). Любой будущий delete/merge
    клиента осиротит финзаписи без защиты БД. Фикс: deferred/partial FK ИЛИ орфан-check job.
14. **POS-идемпотентность опциональна.** 🟩 `pos.dto.ts clientSaleId?` — ретрай без него на аксессуарах
    создаёт 2-й заказ. Фикс: требовать/генерить серверный ключ.
15. **Staff-auth без rate-limit.** 🟩 `staff-auth.controller.ts:16,24,48` — login/bootstrap/2FA без throttle
    → брутфорс паролей и подбор 6-значного TOTP в окне. Фикс: ThrottlerGuard (глобально бы лучше — сейчас 7/41).
16. **Паспорт в PDF-договоре открыт всем staff-ролям.** 🟩 `documents.service.ts:80` использует raw
    `sellerPassport`, а `documents:read` в casbin дан seller/cashier/warehouse/admin/owner → любой кассир
    вытащит нац. ID. Фикс: сузить грант или маскировать + `pii:approve`.

## 🟡 MEDIUM (масштаб/устойчивость)
- Композитные индексы `(status, sla/dueDate)` на risk-center моделях; `(active, expiresAt)` на Reservation. 🟩/🟦
- Overpayment не капается (`payments.service.ts:210`). 🟩
- P2002-гонка → 500 вместо идемпотентного 200 (нет catch). 🟩
- `returns.transition()` без state-machine и без связи с реальным refund. 🟩
- CashShift.close / inventory.transfer — TOCTOU (last-writer-wins). 🟩
- Campaign audience: full-graph scan + per-row insert loop (не `createMany`). 🟩
- Reservation-sweep без batch-cap (бэклог → storm). 🟩

## 🧪 Недостающие критичные тесты (перед боевыми деньгами)
Конкурентный webhook-idempotency race · TOTP-replay · refresh-reuse-detection · OTP-lockout ·
reservation-expiry vs payment race · giftcard double-redeem race · split-tender OVER-payment ·
Risk-center DB-интеграция для warranty/rma/ticket сигналов. Кросс-браузер (только Chromium сейчас).
⚠️ Тест-флейк-вектор: ~93 спека вручную чистят общую БД в своём порядке (был инцидент `eeb616f`) —
нужен единый generated FK-safe reset-helper.

## ✅ Что подтверждённо крепко (не переделывать)
`AuditService.transaction` (инв #10 атомарен) · `units` reserve/sell (эталонный CAS) · giftcards
redeem · refund executor (`FOR UPDATE` + cap) · cash/COD сверка · деньги как `Int` · был реальный
P0-concurrency аудит с regression-тестами · тест-суита реально глубокая (adversarial/tamper/race).
**Auth-стек крепкий:** OTP argon2+throttle+lockout · refresh-ротация (SHA-256, revoke-and-reissue) ·
**прод-старт падает при дефолтном JWT_SECRET** (`auth/jwt-secret.ts`) · staff TOTP step-up, роль
из JWT (не из тела) · casbin RBAC на 35/41 контроллерах · social-login HMAC/JWKS constant-time ·
`npm audit` 0 vuln · нет raw SQL/exec/SSRF. Дыры — это ~6 забытых guard'ов, не гнилой фундамент.

---
**Вывод:** это НЕ «просто песочница платежей» — есть эксплуатируемая auth-дыра (#1) и реальные
concurrency-money-баги (#2–#4), но все фиксы малы (паттерн уже есть в коде). Индексы (#5,#6,#10) —
тривиальные аддитивные миграции. До боевых денег закрыть все 🔴 + тесты. Владелец большинства — 🟩 Codex
(payments/orders/debts/auth/schema); 🟦 Claude берёт #11 (reports-окна) и индексы-миграции по согласованию.
