# AliStore ERP — Чек-лист готовности прототипа

Снимок на момент финализации. Прототип экосистемы (витрина + клиент-апп + POS + склад +
ERP + AI-слой) собран, протестирован и запускается в прод-режиме.

- **40 backend-модулей** (NestJS) · **32 веб-роута** (Next.js) · **14 миграций**
- **89 API тест-сьютов / 316 тестов — зелёные** (`jest`)
- **9 Playwright smoke-flow — зелёные** (`npm run e2e`)
- Прод-сборки: `nest build` ✓ · `next build` ✓
- Запуск: см. [`HANDOFF.md`](./HANDOFF.md). Детальный план фаз: [`PHASES.md`](./PHASES.md).

Легенда: ✅ готово · 🟡 частично · ⛔ ждёт внешних доступов (ключи/аккаунты/железо)

## Готовность по фазам

| Фаза | Что | Статус |
|---|---|---|
| **0** Ядро данных | Event Ledger (append-only), order state-machine, IMEI-инвариант, миграции | ✅ |
| **1** Деньги | Payment, «нет paid без резерва», CashShift, Courier COD, **онлайн Payment Intents** | ✅ |
| **2** Витрина | Каталог, карточка, корзина, checkout, поиск, избранное, сравнение, промо/бонусы | ✅ |
| **3** Аккаунт+Auth | OTP-вход, Apple/Telegram social-auth backend, «Мои заказы», адреса, настройки, уведомления+consent, бонусы | ✅ |
| **4** POS 2.0 | Тёмный терминал, полная продажа, скидка-approval, **offline-очередь**, catalog delta-sync, печать | ✅ |
| **5** Склад | Fulfillment, назначение IMEI, движение статусов, **Evidence Vault (фото)** | ✅ |
| **6** Approval+Возвраты+Обмены | Approval Inbox, refund/return/exchange, **UI обмена кассира** | ✅ |
| **7** Опасные действия | Approval-матрица (цена/write-off/долг/скидка), **RBAC 9 ролей + 2FA + staff-сессии** | ✅ |
| **8** ERP владельца | Дашборд, Risk Center, Event Ledger, **Маржа/KPI**, KPI продавцов, Command Center, период-фильтр | ✅ |
| **9** Мультисклад/гарантия | WarrantyCase+SLA, перемещения/инвентаризация, **Supplier RMA+scorecard**, долги/рассрочка, trade-in, импорт | ✅ |
| **10** Уведомления+CRM | Support Inbox, Customer 360, consent, CRM-UI, **outbox/Novu/SMTP/Telegram/WhatsApp delivery** | ✅ |
| **11** AI-слой | **AI-ассистент владельца** (`/ai/insights`) + **оценка Б/У** (`/ai/assess`, `/assess`) — бесключевые правила за портом | 🟡 |
| **12** Каналы и рост | Франшиза-аудит, click&collect, подарочные карты, B2B — каркас | 🟡 |
| **13** Инфраструктура | Caddy edge, бэкапы PG, health, observability (Sentry), realtime (socket.io), **Offline POS**, hardware-печать | ✅ |

## Работает вживую сейчас (прод-режим)
`/` витрина · `/erp` кокпит (+ AI-ассистент, Маржа/KPI, Command Center) · `/pos` касса
(+ offline) · `/assess` оценка Б/У · `/warehouse` · `/warranty` · `/exchange` · `/staff` ·
`/support` · `/trade-in` · API: `/pos/sale` … Owner API `/reports/*` и `/ai/*` работают
под staff-session token (admin/owner).

## Осталось — только внешние доступы (архитектура готова, порты на месте) ⛔
Machine-readable статус внешних блокеров: `GET /health/integrations` (показывает только
configured/missing env-имена и ручные проверки, без значений секретов).

| Что | Нужен доступ |
|---|---|
| **AI vision/LLM** — оценка Б/У по фото, разведка рыночных цен, обогащение карточек | `AI_PROVIDER_KEY` (сервер). Бесключевые правила уже работают как фолбэк. |
| **Apple/Telegram social login** | `APPLE_CLIENT_ID`, `TELEGRAM_BOT_TOKEN`, Apple/Telegram callback/client SDK QA. Backend endpoints and identity linking are ready. |
| **Telegram Mini App / WhatsApp-магазин** | бизнес-аккаунты, токены каналов и webhook/callback QA. Campaign delivery уже включается через `NOTIFICATION_TRANSPORT=channels` + Novu/SMTP/Telegram/WhatsApp env. |
| **Боевое железо кассы** — сканер, принтер чеков, платёжный терминал | физические устройства (софт-каркас offline+print готов) |

## Опциональная полировка v2 (без блокеров)
Похожие товары/отзывы · Apple JS polish · Dispute Center UI · произвольные
периоды в KPI · приёмка партий UI · зарплаты · долг-напоминания · подарочные карты · B2B/опт.

## Проверка (гейт готовности)
```bash
cd apps/api && npx jest                # 89 сьютов / 316 тестов ✓
cd apps/api && npx nest build         # ✓
cd apps/web && npx next build         # ✓ (32 роута)
npm run e2e                           # 9/9 ✓
```
