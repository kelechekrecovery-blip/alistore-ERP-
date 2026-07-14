# AliStore ERP — Чек-лист готовности прототипа

Снимок MVP launch-контура. Витрина, клиент-апп, POS, склад, ERP и AI-слой собраны и
тестируются совместно. Расширенные модули 95-экранной экосистемы отслеживаются отдельно
и не должны смешиваться с готовностью первого магазина к запуску.

- **50 backend-модулей** (NestJS) · **37 веб-роутов** (Next.js) · **58 миграций**
- **120 API test suites / 478 тестов — зелёные** (`jest`)
- **35/35 Playwright flow — зелёные**, включая Service Center intake/diagnostics/approval/POS settlement/parts/repair/closure и loaner issue/customer visibility/return
- Прод-сборки: `npm run api:build` ✓ · `next build` ✓
- Native foundations: **4 SwiftUI targets + AliStoreCore** and **4 Kotlin/Jetpack Compose APKs + Android core** build successfully. iOS API contracts pass **31/31** on iPhone 17 Pro Simulator. Staff now loads its JWT-owned HR schedule and opens/closes attendance with a durable SwiftData queue and attendance deep links; Courier/POS retain persistent offline recovery. Android four-APK build, unit tests and Lint pass, and **25/25** connected Compose tests pass on API 36, including Staff attendance with SQLite/WorkManager replay. Live push and physical camera/maps/scanner/printer/payment-terminal certification remain open. Expo is retained only as a legacy behavior reference.
- Запуск: см. [`HANDOFF.md`](./HANDOFF.md). Детальный план фаз: [`PHASES.md`](./PHASES.md).

Легенда: ✅ готово · 🟡 частично · ⛔ ждёт внешних доступов (ключи/аккаунты/железо)

## Готовность по фазам

| Фаза | Что | Статус |
|---|---|---|
| **0** Ядро данных | Event Ledger (append-only), order state-machine, IMEI-инвариант, миграции | ✅ |
| **1** Деньги | Payment поддерживает retail-order и paid ServiceWorkOrder, CashShift, Courier COD и provider-neutral intents; live provider/fiscal reconciliation ещё внешние | 🟡 |
| **2** Витрина | Каталог, карточка, корзина, checkout, поиск, избранное, сравнение, промо/бонусы; checkout ещё требует ERP-owned pickup point и явный гостевой адрес | 🟡 |
| **3** Аккаунт+Auth | OTP-вход, Apple/Telegram social-auth backend, «Мои заказы», адреса, настройки, уведомления+consent, бонусы | ✅ |
| **4** POS 2.0 | Тёмный терминал, продажа, service estimate payment, split tender, approval, offline replay, catalog delta-sync и print abstraction; packaged-app E2E и железо не сертифицированы | 🟡 |
| **5** Склад | Fulfillment, серийный и количественный учёт, атомарный резерв/продажа/POS, движение статусов, **Evidence Vault (фото)** | ✅ |
| **6** Approval+Возвраты+Обмены | Approval Inbox, refund/return/exchange, **UI обмена кассира** | ✅ |
| **7** Опасные действия | Approval-матрица (цена/write-off/долг/скидка), **RBAC 9 ролей + 2FA + staff-сессии** | ✅ |
| **8** ERP владельца | Дашборд, Risk, Ledger, KPI, Finance/HR/logistics/procurement/service verticals работают; все handoff-модули и состояния ещё не приняты | 🟡 |
| **9** Мультисклад/гарантия | WarrantyCase+SLA, перемещения/инвентаризация, **Supplier RMA+scorecard**, Purchase Orders и race-safe IMEI-приёмка, долги/рассрочка, trade-in, импорт | ✅ |
| **10** Уведомления+CRM | Support Inbox, Customer 360, consent, CRM/outbox adapters готовы; live channel delivery требует credentials/certification | 🟡 |
| **10A** Сервис-центр | Warranty и внешний платный intake, диагностика/смета, клиентское подтверждение, POS split payment/open-shift reconciliation, запчасти, lifecycle, 30-дневная гарантия ремонта и DeviceUnit-backed подменный фонд с Evidence/overdue готовы; exact detail handoff и физический UAT остаются | 🟡 |
| **11** AI-слой | **AI-ассистент владельца** (`/ai/insights`) + **оценка Б/У** (`/ai/assess`, `/assess`) — бесключевые правила за портом | 🟡 |
| **12** Каналы и рост | Подарочные карты, Telegram shell, B2B/опт и защита устройств работают; click&collect требует authoritative point/location, франшиза/реклама — каркас | 🟡 |
| **13** Инфраструктура | Docker/Render blueprint, health, backup tooling, Sentry ports, realtime и offline software готовы; staging/restore/rollback/soak ещё не сертифицированы | 🟡 |

## Работает вживую сейчас (прод-режим)
`/` витрина · `/erp` кокпит (+ AI-ассистент, Маржа/KPI, Command Center, Готовность запуска) · `/pos` касса
(+ offline) · `/assess` оценка Б/У · `/warehouse` · `/warranty` · `/exchange` · `/staff` ·
`/support` · `/trade-in` · `/b2b` · `/account/protection` · checkout с текущим строковым pickup-кодом (не принят до `FUL-001`) · API: `/pos/sale` … Owner API `/reports/*` и `/ai/*` работают
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
| **Native iOS/Android release** | Swift iOS and Kotlin/Compose Android foundations are real and independently buildable; Staff, Courier and POS software verticals are implemented on both platforms. Final Client provider checks, Apple/Google signing, APNs/FCM credentials and physical-device/hardware QA remain required. |
| **Боевое железо кассы** — сканер, принтер чеков, платёжный терминал | физические устройства (софт-каркас offline+print готов) |

## Опциональная полировка v2 (без блокеров)
Finance 2.0 cashflow/инкассация/валюта · предзаказы (варианты SKU и виртуальные наборы готовы; возврат компонентов выделен отдельно) · quantity-consignment и возврат комиссионного товара (серийная приёмка/начисление/выплата и quantity transfer/adjustment готовы) · first-store HR/device UAT (native Staff attendance, ERP payroll posting и cash handover готовы) ·
exact detail pixel-pass сервис-центра и физический UAT (полный web/API цикл, включая подменный фонд, уже готов) · оптимизация маршрутов/live tracking (зоны, слоты, capacity, checkout и dispatch готовы) · store checklists · CMS · расширенная
аналитика · consent retention · франшиза · рекламный кабинет. Эти блоки нужны для полной
95-экранной экосистемы, но не подменяют launch-gates первого магазина.

## Проверка (гейт готовности)
```bash
npm run mvp:verify                    # полный release gate
npm run launch:preflight              # core production env
npm run launch:readiness              # отчёт по apps/api/.env.production
npm run launch:check                  # strict preflight + strict external gate
npm run launch:readiness:strict       # strict external gate
cd apps/api && npx jest                 # 119 suites / 477 тестов ✓
npm run migration:test:service-payment # legacy refund/point migration regression ✓
npm run api:build                     # ✓
cd apps/web && npx next build         # ✓ (37 роутов)
npm run e2e                           # 35/35 ✓
npm run ecosystem:verify              # web/API + all iOS targets/XCTest + four Android APKs/JVM/Lint
npm run mobile:store-preflight        # 0 failures; production env warnings only
cd apps/mobile && npx expo-doctor     # 20/20 ✓
npm run ios:generate                  # regenerates AliStoreNative.xcodeproj
npm run ios:build                     # all four SwiftUI apps + shared core
npm run ios:test                      # AliStoreCore tests on iPhone Simulator
npm run android:build                 # four Kotlin/Compose debug APKs
npm run android:test                  # JVM tests + Android Lint for all modules
npm run android:ui                    # 25/25 Compose tests on API 36 emulator
```
