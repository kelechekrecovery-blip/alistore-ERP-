# AliStore ERP — Чек-лист готовности прототипа

Снимок MVP launch-контура. Витрина, клиент-апп, POS, склад, ERP и AI-слой собраны и
тестируются совместно. Расширенные модули 95-экранной экосистемы отслеживаются отдельно
и не должны смешиваться с готовностью первого магазина к запуску.

- **47 backend-модулей** (NestJS) · **37 веб-роутов** (Next.js) · **34 миграции**
- **110 API test suites / 428 тестов — зелёные** (`jest`)
- **23 Playwright smoke-flow — зелёные**, включая Purchase Order, Finance expense lifecycle, customer account synchronization, server-authoritative loyalty checkout и exact desktop customer routes (`npm run e2e`)
- Прод-сборки: `npm run api:build` ✓ · `next build` ✓
- Native foundations: **4 SwiftUI targets + AliStoreCore** and **4 Kotlin/Jetpack Compose APKs + Android core** build successfully. iOS API tests pass **17/17** on iPhone 17 Pro Simulator; Android unit test/Lint and the Client/Staff/Courier/POS Compose UI suite pass on API 36. Android Staff has real staff-JWT orders, shifts, scanner/Evidence, Customer 360, support/warranty, tasks and FCM routing. Android Courier has owner-bound assignments, route actions, order Evidence, scoped FCM routing, idempotent offline replay and COD handover. Android POS has server-bound shifts, SKU/IMEI scanner input, approval recovery, split tender, server receipts, refunds/exchanges and idempotent offline replay. Live push and physical camera/maps/scanner/printer/payment-terminal certification remain open. Expo is retained only as a legacy behavior reference.
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
| **8** ERP владельца | Дашборд, Risk Center, Event Ledger, **Маржа/KPI**, KPI продавцов, Command Center, период-фильтр, **Finance 2.0 расходы и выплаты** | ✅ |
| **9** Мультисклад/гарантия | WarrantyCase+SLA, перемещения/инвентаризация, **Supplier RMA+scorecard**, Purchase Orders и race-safe IMEI-приёмка, долги/рассрочка, trade-in, импорт | ✅ |
| **10** Уведомления+CRM | Support Inbox, Customer 360, consent, CRM-UI, **outbox/Novu/SMTP/Telegram/WhatsApp delivery** | ✅ |
| **11** AI-слой | **AI-ассистент владельца** (`/ai/insights`) + **оценка Б/У** (`/ai/assess`, `/assess`) — бесключевые правила за портом | 🟡 |
| **12** Каналы и рост | Подарочные карты, Telegram shell, click&collect, B2B/опт и защита устройств — готовы; франшиза/реклама — каркас | 🟡 |
| **13** Инфраструктура | Caddy edge, бэкапы PG, health, observability (Sentry), realtime (socket.io), **Offline POS**, hardware-печать | ✅ |

## Работает вживую сейчас (прод-режим)
`/` витрина · `/erp` кокпит (+ AI-ассистент, Маржа/KPI, Command Center, Готовность запуска) · `/pos` касса
(+ offline) · `/assess` оценка Б/У · `/warehouse` · `/warranty` · `/exchange` · `/staff` ·
`/support` · `/trade-in` · `/b2b` · `/account/protection` · click&collect checkout с pickup-кодом · API: `/pos/sale` … Owner API `/reports/*` и `/ai/*` работают
под staff-session token (admin/owner).

## До запуска первого магазина — внешние доступы ⛔
Machine-readable статус внешних блокеров: `GET /health/integrations` (показывает только
configured/missing env-имена и ручные проверки, без значений секретов). В ERP это видно во
вкладке **Готовность запуска**: blocking, optional, ручная POS-сертификация и strict gate.
Production env-шаблон: `apps/api/.env.production.example`; запусковой runbook:
[`PRODUCTION-ACTIVATION.md`](./PRODUCTION-ACTIVATION.md).
Перед внешним readiness запускается core preflight: `npm run launch:preflight` проверяет
`NODE_ENV=production`, `DATABASE_URL`, сильный `JWT_SECRET`, отключённый dev OTP echo и фоновые jobs.

| Что | Нужен доступ |
|---|---|
| **Боевой платёжный шлюз** | `PAYMENT_PROVIDER`, API URL, merchant ID, API key и webhook secret. `PAYMENT_PROVIDER_CERTIFIED=true` ставится только после live intent, raw-body подписи, replay и refund reconciliation. Provider-neutral port и sandbox готовы. |
| **Боевой SMS/OTP** | `SMS_PROVIDER`, API URL/key и утверждённый sender ID. `SMS_PROVIDER_CERTIFIED=true` ставится после реальной доставки login/recovery OTP и проверки cleanup при отказе провайдера. |
| **AI vision/LLM** — оценка Б/У по фото, разведка рыночных цен, обогащение карточек | `AI_PROVIDER_KEY` (сервер). `POST /ai/grade-photos` и `POST /ai/price-scout` уже работают как бесключевые staff-only rules/fallback endpoints; production quality требует ключ, reference dataset и offline eval. |
| **Apple/Telegram social login** | `APPLE_CLIENT_ID`, `TELEGRAM_BOT_TOKEN`, Apple/Telegram callback/client SDK QA. Backend endpoints and identity linking are ready. |
| **Telegram Mini App / WhatsApp-магазин** | бизнес-аккаунты, токены каналов и webhook/callback QA. Campaign delivery уже включается через `NOTIFICATION_TRANSPORT=channels` + Novu/SMTP/Telegram/WhatsApp env. |
| **Native iOS/Android release** | Swift iOS and Kotlin/Compose Android foundations are real and independently buildable; full role-flow parity remains required. Store release also needs Apple/Google signing, APNs/FCM credentials and physical-device QA. |
| **Боевое железо кассы** — сканер, принтер чеков, платёжный терминал | физические устройства (софт-каркас offline+print готов) |

## Опциональная полировка v2 (без блокеров)
Finance 2.0 бюджеты/план-факт · варианты/наборы/предзаказы · quantity/consignment warehouse · HR-графики ·
платный сервис и подменный фонд · зоны/слоты/маршруты · store checklists · CMS · расширенная
аналитика · consent retention · франшиза · рекламный кабинет. Эти блоки нужны для полной
95-экранной экосистемы, но не подменяют launch-gates первого магазина.

## Проверка (гейт готовности)
```bash
npm run mvp:verify                    # полный release gate
npm run launch:preflight              # core production env
npm run launch:readiness              # отчёт по apps/api/.env.production
npm run launch:check                  # strict preflight + strict external gate
npm run launch:readiness:strict       # strict external gate
cd apps/api && npx jest                 # 110 suites / 428 тестов ✓
npm run api:build                     # ✓
cd apps/web && npx next build         # ✓ (37 роутов)
npm run e2e                           # 23/23 ✓
npm run mobile:store-preflight        # 0 failures; production env warnings only
cd apps/mobile && npx expo-doctor     # 20/20 ✓
npm run ios:generate                  # regenerates AliStoreNative.xcodeproj
npm run ios:build                     # all four SwiftUI apps + shared core
npm run ios:test                      # AliStoreCore tests on iPhone Simulator
npm run android:build                 # four Kotlin/Compose debug APKs
npm run android:test                  # JVM tests + Android Lint for all modules
```
