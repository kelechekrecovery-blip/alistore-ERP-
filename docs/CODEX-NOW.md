# Codex — указание оркестратора (приоритетно, сейчас)

> От Claude (оркестратор). Порядок строгий: P0 сверху. Каждый пункт — атомарный коммит
> явными путями, тесты зелёные, `nest build`+`next build`, живой прогон. Не переписывать
> историю. P0-2 закрыт единым финальным проходом: reports/AI backend guards и web-token
> handoff уже влиты, поэтому эти пути больше не ждут отдельную Claude-часть.

## P0 — исправить по ревью (реальные дефекты, блокируют доверие к данным)

### P0-1. ✅ Активировать `imei_reuse`
Схема `TradeInDevice.imei` и детектор `imei_reuse` уже готовы (Claude, `f58344c`/`d658025`),
Codex закрыл запись `imei`: DTO/service/intake пишут `TradeInDevice.imei`, ledger refs включают
номер, staff/customer trade-in UI передают optional IMEI.
- Приёмка: intake с `imei` → колонка заполнена; тот же `imei` в скупке и среди проданных
  `DeviceUnit(status=sold)` → high-сигнал `imei_reuse` в `GET /reports/risks`. Тест добавлен.

### P0-2. ✅ Закрыть `/reports/*` и `/ai/*` авторизацией
Ревью: owner-финансы (выручка/маржа/зарплаты/касса-расхождения) и AI-инсайты доступны
без токена — единственные незащищённые контроллеры против конвенции всего кода.
- Закрыто: `reports.controller.ts` и все `ai/*.controller.ts` требуют staff JWT +
  `ActiveStaffGuard` + `PermissionGuard`; casbin разрешает `reports.read`/`ai.read` только
  admin/owner. Web-клиенты `lib/reports.ts`/`lib/ai.ts` отправляют shared staff-session token.
- Customer order timeline больше не зависит от owner `/reports/ledger`: добавлен scoped
  `GET /orders/:id/ledger`, доступный только владельцу заказа или staff queue-reader.
- Приёмка выполнена: без токена `/reports/*`+`/ai/*` → 401, seller → 403, admin/owner → 200;
  ERP-дашборд под staff-сессией работает.

## P1 — доделать полосу A (после P0)
- ✅ **A2. Notification-шаблоны** на все транзакционные события (заказ подтверждён/готов к выдаче/
  гарантия/долг-напоминание) через outbox + Novu/SMTP/channel transports, consent-filtered.
- ✅ **A3. Rate limiting** (`@nestjs/throttler`) на checkout-chain (`POST /customers`,
  `POST /orders`, `POST /payments/intents`), OTP-выдачу, `POST /support/tickets`,
  платёжные webhooks → 429 при превышении; тест.
- ✅ **A4. PDF/печать полировка**: receipts split-tenders, labels, order invoice and договор
  скупки с IMEI/ru-KG date/price formatting covered.
- ✅ **A5. Infra runbook** — Caddy + бэкапы + restore-check.

## P2 — полоса B, если mac mini недоступна (иначе оставить mac mini)
См. `PARALLEL-LANES.md` полоса B: ✅ E2E+CI, ✅ gift cards (новый модуль), ✅ Admin Product UI
(дом для `/ai/categorize`+`/ai/describe`), ✅ Telegram Mini App shell. Greenfield-полоса B закрыта.
Внешние/provider/hardware блокеры теперь диагностируются через `GET /health/integrations`
без раскрытия значений секретов.

## Статус синхронизации (обновляет Claude)
- P0 закрыт. Текущий локальный гейт: API Jest 89/89 (315 тестов), Playwright 8/8,
  `api:build` и `next build` зелёные.
- Campaign delivery и social-login backend закрыты; открытых unblocked задач нет. Остались
  provider/hardware доступы, production-активация каналов и live client SDK/callback QA.
