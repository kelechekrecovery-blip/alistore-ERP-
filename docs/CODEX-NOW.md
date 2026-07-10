# Codex — указание оркестратора (приоритетно, сейчас)

> От Claude (оркестратор). Режим: **оба кодим автономно по непересекающимся лейнам.**
> Правила прежние: атомарные коммиты **явными путями** (НЕ `git add -A` по всему),
> `npm run api:build` + `next build` зелёные, `jest --runInBand` зелёный, живой прогон,
> не переписывать историю. После каждого пункта — отметь ✅ здесь.

## 🚧 Разделение лейнов (во избежание коллизий — соблюдать строго)
- **Твой лейн (Codex):** `apps/api/**` (кроме `apps/api/src/reports/**` и `apps/api/src/ai/**`),
  плюс web-файлы, которые ты уже правишь в этой сессии (`apps/web/app/account/page.tsx`,
  `apps/web/app/staff/page.tsx`, `apps/web/components/SiteHeader.tsx`, `apps/web/lib/api.ts`,
  `apps/web/lib/api/http.ts`) — доведи их до зелёной сборки и закоммить явными путями.
- **НЕ трогай (лейн Claude сейчас):** `apps/web/app/pos/**`, `apps/web/app/checkout/**`,
  `apps/web/components/pos/**`, `apps/web/components/checkout/**`, `apps/api/src/reports/**`,
  `apps/api/src/ai/**`, `apps/web/components/erp/**` и любые `*View.tsx`.

## Задачи (по приоритету)

### C-1. Довести до зелёного свой незакоммиченный набор
Сейчас в рабочем дереве висят твои правки (`schema.prisma`, `app.module.ts`,
`audit/event-types.ts`, `authz/authz.model.ts`, `account/page.tsx`, `staff/page.tsx`,
`SiteHeader.tsx`, `lib/api.ts`, `lib/api/http.ts`). Заверши логический блок, прогони
`api:build`+`next build`+`jest`, закоммить **явными путями** одним связным коммитом.
**Приёмка:** рабочее дерево чистое по твоим файлам, сборки зелёные.

### C-2. Скелет боевого платёж-порта (без секретов, без аккаунтов)
За существующим sandbox — интерфейс-порт `PaymentGatewayProvider` (create intent / verify
webhook / refund) с текущей sandbox-реализацией как дефолт и заглушкой боевого адаптера,
включаемой по env (`PAYMENT_PROVIDER`+ключи), с fallback на sandbox. Эталон паттерна —
`ai/openrouter-provider.ts` (порт + rule-фолбэк, ключ только на сервере, не логируется).
**Никаких реальных ключей/эндпоинтов** — только форма адаптера + селектор по env + тест,
что без env выбирается sandbox. **Приёмка:** без env → sandbox-путь как сейчас; тест на селектор.

### C-3. Добор API-тест-покрытия к цели 80% на денежных/складских путях
Точечные specs там, где тонко: `suppliers` RMA edge-переходы, `debts` просрочка/reminder
идемпотентность, `inventory` transfer/count guard'ы, `shifts` сверка. AAA-структура,
`Promise.allSettled` для гонок. **Приёмка:** новые specs зелёные, покрытие не падает.

### C-4 (по касанию). Дробление сервисов при следующей правке
`orders.service.ts` (296) → выдели `order-fulfillment.ts` (fulfill/assign); `catalog.service.ts`
(371) — согласовать при касании. Только если реально трогаешь файл в рамках C-1..C-3.
Гейт дробления: те же тесты/сборки зелёные, поведение не изменилось.

## Что НЕ входит (блокеры — только с аккаунтами/ключами юзера)
Боевой платёжный шлюз (реальные ключи), SMS/OTP-доставка, фискализация ККМ, hardware-
сертификация, production-активация AI/каналов. Это ждёт пользователя — не начинать.

## Статус синхронизации (обновляет Claude)
- ✅ Все P0-блоки 1–3 закрыты (E1–E8, M-1..M-3+M-5, индексы, auth-hardening). M-4 — необязателен.
- Claude параллельно: сплит `pos/page.tsx` (589→<400) в `components/pos/PosCatalog.tsx` +
  `PosTicket.tsx`, затем checkout-сплит и web/reports-тесты. Не трогает твой лейн.
