# Codex — указание оркестратора (приоритетно, сейчас)

> От Claude (оркестратор). Порядок строгий: P0 сверху. Каждый пункт — атомарный коммит
> явными путями, тесты зелёные, `nest build`+`next build`, живой прогон. Не переписывать
> историю. Claude-lane (`reports/`, `ai/`, `components/erp/*View.tsx`, `lib/reports.ts`,
> `lib/ai.ts`) — НЕ трогать, кроме явно указанного в п. P0-2 (там Claude делает web-часть сам).

## P0 — исправить по ревью (реальные дефекты, блокируют доверие к данным)

### P0-1. Активировать `imei_reuse` (сейчас мёртвый детектор)
Схема `TradeInDevice.imei` и детектор `imei_reuse` уже готовы (Claude, `f58344c`/`d658025`),
но НИЧТО не пишет `imei` → детектор всегда пуст (100% false-negative на IMEI-подмену).
- **Codex (owns tradeins):** добавить `imei?: string` в `CreateTradeInDto` и `POST /tradeins/intake`
  DTO; в `TradeInsService.create()`/intake писать `imei` в `tx.tradeInDevice.create({ data })`.
- Приёмка: intake с `imei` → колонка заполнена; тот же `imei` в скупке и среди проданных
  `DeviceUnit(status=sold)` → high-сигнал `imei_reuse` в `GET /reports/risks`. Добавить тест.

### P0-2. Закрыть `/reports/*` и `/ai/*` авторизацией (сейчас публичны)
Ревью: owner-финансы (выручка/маржа/зарплаты/касса-расхождения) и AI-инсайты доступны
без токена — единственные незащищённые контроллеры против конвенции всего кода.
- **Codex:** навесить `@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)` +
  `@RequirePermission('reports','read')` / `('ai','read')` на `reports.controller.ts` и все
  `ai/*.controller.ts`; добавить ресурсы `reports`/`ai` (read: owner/admin) в casbin-политику.
- **Claude сделает web-часть СНАЧАЛА** (чтобы не сломать ERP-дашборд): `lib/reports.ts`/`lib/ai.ts`
  начнут слать `Authorization: Bearer <staffToken>` из общей staff-сессии. **Порядок:** Claude
  вливает web-токен → пингует здесь (обновит этот файл: «web готов») → Codex включает guard'ы.
- Приёмка: без owner-токена `/reports/*`+`/ai/*` → 401/403; ERP-дашборд под staff-сессией работает.

## P1 — доделать полосу A (после P0)
- **A2. Notification-шаблоны** на все транзакционные события (заказ подтверждён/готов к выдаче/
  гарантия/долг-напоминание) через outbox/Novu, consent-filtered.
- **A3. Rate limiting** (`@nestjs/throttler`) на `POST /checkout`, OTP-выдачу, `POST /support/tickets`,
  платёжные webhooks → 429 при превышении; тест.
- **A4. PDF/печать полировка** (receipts вкл. split-tenders / labels / договор скупки), локаль ru-KG.
- **A5. Infra runbook** — Caddy + бэкапы + restore-check.

## P2 — полоса B, если mac mini недоступна (иначе оставить mac mini)
См. `PARALLEL-LANES.md` полоса B: E2E+CI, gift cards (новый модуль), Admin Product UI
(дом для `/ai/categorize`+`/ai/describe`), Telegram Mini App shell. Всё гринфилд, новые пути.

## Статус синхронизации (обновляет Claude)
- Claude-lane: закрыта, зелёная (81 сьют / 281 тест), ревью-фиксы влиты (`d658025`).
- web-токен для P0-2: ☐ ещё не влит (Claude сделает до включения guard'ов Codex).
