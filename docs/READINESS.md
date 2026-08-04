# AliStore ERP — Чек-лист готовности прототипа

Снимок MVP launch-контура. Витрина, клиент-апп, POS, склад, ERP и AI-слой собраны и
тестируются совместно. Расширенные модули 95-экранной экосистемы отслеживаются отдельно
и не должны смешиваться с готовностью первого магазина к запуску.

- **53 backend-модуля** (NestJS) · **43 веб-роута** (Next.js, `find apps/web/app -name page.tsx`) · **100 миграций**
- Текущий полный gate (`npm run api:test:isolated`, снято 2026-07-26 на своей БД,
  клонированной из шаблона): **218/218 сьютов, 1299/1299 тестов**, ни одного падения.
  Прошлый замер (23.07, `npm run api:test` на общей `alistore_test`) дал «4 сьюта /
  7 тестов красные», а повторный прогон при работающем рядом втором агенте — 20+;
  на изолированной БД те падения не воспроизводятся, то есть это была контаминация
  общей базы, а не дефекты (`VERIFY-078` закрывается этим прогоном).
  Это **не** отменяет `FLAKE-001`: один зелёный прогон не доказывает отсутствие
  флаков, их ловят только повторы. Прежние цифры в этом файле (143/143 и 123/487)
  противоречили друг другу и были переписаны из старых шапок, а не сняты прогоном.
- **46/46 Playwright flows подтверждены**, включая multi-tender refund, exchange, campaign → storefront → checkout, Marketing CMS, Finance и Service Center.
- Прод-сборки: `npm run api:build` ✓ · `next build` ✓
- Критический checkout прогнан в Chromium, WebKit и Firefox: `npm run e2e:cross-browser` ✓ (`27/27`); staging/CI повтор остаётся release-hardening gate.
- Android Data Safety worksheet валидирует все четыре приложения: `npm run android:store-preflight` ✓; owner/legal review и фактическая Google Play submission остаются обязательными.
- Deep-link software slice готов: API/IOS/Android/Web поддерживают HTTPS payment return с exact-host validation; AASA/assetlinks требуют production signing variables и физической проверки домена.
- Structural deep-link gate: `npm run native:deeplink-preflight` ✓; CI should run it before native release builds.
- ERP/CMS contract gate: `npm run ecosystem:erp-cms:e2e` ✓ (`5/5`) for publication, responsive blocks, reviews and promo checkout.
- FIN-003E refund gate: Refund aggregate, mixed-tender allocation, provider saga/retry, stale reconciliation and `POST /payments/:id/void` are locally accepted; targeted API regression is `35/35`. Live payment-provider certification remains blocked on owner credentials and provider/UAT evidence.
- Inventory migration gate: `npm run inventory:valuation:migration-preflight` proves lock-timeout fail-closed behavior and drained-schema verification on a disposable test database; production-shaped lock-window and staging drain certification remain open.
- API публикует Prometheus-compatible `/api/metrics`: счётчики запросов, 5xx и histogram latency с нормализованными маршрутами; в production endpoint требует bearer `METRICS_TOKEN` и не содержит секретов.
- Native foundations: **4 SwiftUI targets + AliStoreCore** and **4 Kotlin/Jetpack Compose APKs + Android core** build successfully. iOS Client UI/XCTest passes on the iPhone 17 Pro Simulator. Staff now loads its JWT-owned HR schedule and opens/closes attendance with a durable SwiftData queue and attendance deep links; Courier/POS retain persistent offline recovery. Native quick unlock uses iOS Keychain v1 PIN storage and Android Keystore HMAC, checks biometric availability, throttles five failed PIN attempts for 30 seconds and clears local unlock state on logout. Android four-APK build, unit tests and Lint pass, and **31/31** connected tests pass on API 36, including Client trade-in evidence and all packaged app smoke tests. Live push and physical biometric/camera/maps/scanner/printer/payment-terminal certification remain open. Expo is retained only as a legacy behavior reference.
- Запуск: см. [`HANDOFF.md`](./HANDOFF.md). Детальный план фаз: [`PHASES.md`](./PHASES.md).

Легенда: ✅ готово · 🟡 частично · ⛔ ждёт внешних доступов (ключи/аккаунты/железо)

## Живая проверка интеграций — 2026-07-27 (вызовами к работающему API, не по конфигу)

Снято с процесса, который сейчас слушает `:4000` (`apps/api/dist/main.js`, БД `alistore_dev`,
uptime ~40 ч). Каждая строка — ответ реального вызова, а не чтение кода. **Платёжные сервисы
исключены по прямой просьбе владельца.** Машинный источник той же правды —
`GET /api/health/integrations` (owner-JWT): сейчас `blocked`, `ready 1 / missing 11 / manual 1`.

| Сервис | Где в коде | Что вернул живой вызов | Что нужно от владельца |
|---|---|---|---|
| **AI: текст** (описания карточек) | `apps/api/src/ai/describe` | ✅ `POST /ai/describe` → `source: openrouter:openai/gpt-4o-mini`, живой русский текст | **Работает.** Ключ OpenRouter активен в `apps/api/.env` |
| **AI: зрение** (оценка Б/У по фото) | `apps/api/src/ai/grading` | ✅ `POST /ai/grade-photos` → `grade: B`, `confidence: 0.7`, дефекты и чек-лист от `openrouter:openai/gpt-4o-mini` | **Работает.** Ничего не нужно |
| **AI: категоризация** | `apps/api/src/ai/categorize` | ✅ `Наушники Sony WH-1000XM5` → `Аудио`, `confidence 0.9` (keyless rule-engine, LLM не требуется) | Ничего |
| **Поиск каталога** | `apps/api/src/search` | ✅ `GET /catalog/products?q=iphone` → `source: postgres` (Meilisearch на `:7700` не поднят — честный fallback) | Опционально: поднять Meilisearch ради ранжирования. Postgres уже отвечает |
| **OTP / вход по телефону** | `apps/api/src/auth` | ✅ `POST /auth/otp/request` → `devCode` (dev-echo), `otp/verify` выдал реальный accessToken+refreshToken | Контракт SMS-провайдера **или** Meta Business (WhatsApp + одобренный шаблон). В проде без этого API намеренно не стартует |
| **Соц-вход Telegram** | `apps/api/src/auth` | ✅ `422 social_provider_not_configured` — честно закрыт, не притворяется | `TELEGRAM_BOT_TOKEN` (один токен даёт вход + бота + канал рассылок) |
| **Соц-вход Apple** | `apps/api/src/auth` | ✅ `422 social_provider_not_configured` | `APPLE_CLIENT_ID` + ключи Apple |
| **Медиа / евиденция** | `apps/api/src/media` | ✅ PNG 64×64 → `webp` 90 байт на диске; мусорный файл отклонён `422 not_an_image` | Cloudflare R2 / S3 (`S3_ENDPOINT`, `MINIO_*`) для прода: локальный диск раздаёт паспорта из скупки публично |
| **SMTP (почта)** | `apps/api/src/outbox/transports/email` | ✅ `nodemailer.verify()` к `smtp.gmail.com:587` → соединение и логин **приняты** | **Работает.** Для боевых объёмов — домен-отправитель вместо Gmail |
| **Redis** | инфра | ✅ `PONG` на `127.0.0.1:6379` | `REDIS_URL` в проде (блюпринт Render поднимает сам) |
| **Витрина (Next.js)** | `apps/web` | ✅ `:3000` → `200`, `<title>AliStore — электроника с гарантией в Кыргызстане</title>` | Ничего |
| **Outbox / рассылки** | `apps/api/src/outbox` | 🟡 транспорт = лог-заглушка (`NOTIFICATION_TRANSPORT` не задан — вне прода это штатно), **релей выключен**: `pending 57`, старейшее висит **28 ч**, `workers: []` | `NOTIFICATION_TRANSPORT=channels` + `OUTBOX_RELAY_ENABLED=true`. Иначе транзакционные уведомления копятся и не уходят |
| **Sentry / алерты** | `apps/api/src/observability` | 🟡 `sentry.enabled: false`, `alerting.enabled: false`; два необработанных `PrismaClientKnownRequestError` на `POST /hr/payroll/runs` лежат в памяти с `delivered: false` | `SENTRY_DSN` + `ALERT_TELEGRAM_BOT_TOKEN`/`ALERT_TELEGRAM_CHAT_ID` |
| **WhatsApp Business** | `apps/api/src/outbox/transports` | ⛔ не сконфигурирован | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |
| **Android FCM push** | `apps/api` | ⛔ не проверить без физического устройства | `FCM_SERVICE_ACCOUNT_JSON` + живой телефон |
| **Фискализация (ОФД/ККМ)** | `apps/api` | ⛔ чек пока информационный, не фискальный | Контракт ОФД + `FISCAL_*`. Розница в КГ по закону требует фискального чека |
| **POS-железо** | — | ⛔ ручная сертификация на месте | сканер, чек-принтер, терминал |

**Вывод.** Из того, что вообще можно проверить без внешних аккаунтов, **всё работает или
честно закрыто**: AI живой (текст и зрение), медиа-конвейер кладёт webp и отбивает мусор,
почта реально логинится на SMTP, поиск честно называет источник `postgres`, соц-входы
отвечают `422`, а не молчат. Единственная находка, которую стоит чинить сегодня, —
**outbox не разгружается**: 57 сообщений висят 28 часов, потому что `OUTBOX_RELAY_ENABLED`
не выставлен; это конфиг, не дефект кода.

> Отличие от среза 2026-07-18 (`alistore-erp-meta`, коммит `af80622`): там AI отвечал
> `kimi:kimi-for-coding`, здесь — `openrouter:openai/gpt-4o-mini`. Оба живые; расходятся
> `.env` двух деревьев, а не код.

### Полнота перечня: все исходящие адресаты в коде

Список сверен не на память, а `grep` по `https://` в `apps/api/src` и по SDK-зависимостям —
чтобы ни одна интеграция не осталась неупомянутой. Сверх таблицы выше есть ещё четыре
запасных пути; все они **не сконфигурированы и потому неактивны**, ни один не подменяет
собой работающий:

| Адресат | Роль | Состояние |
|---|---|---|
| `api.novu.co` | альтернативный транспорт уведомлений вместо `channels` | `NOVU_API_KEY` не задан → селектор в dev даёт лог-заглушку, в проде бросает |
| `exp.host` (Expo Push) | легаси-push, оставлен как справочное поведение | `EXPO_PUBLIC_EAS_PROJECT_ID` не задан |
| Anthropic SDK | второй AI-провайдер вместо OpenRouter | `ANTHROPIC_API_KEY` не задан; активен OpenRouter |
| `api.sms-gate.app` | мост OTP через Android-телефон (`SMS_PROVIDER=android_gateway`) | `SMS_GATEWAY_*` не заданы; не сертифицированный A2P-канал |

Также не заданы `JOB_BACKEND` (значит, задачи идут в процессе, а не через BullMQ/Redis),
`MEILI_HOST`, `SENTRY_DSN` и `S3_ENDPOINT` — это те же строки, что уже отмечены выше.
Собственные домены `ali.kg` / `cdn.ali.kg` / `media.ali.kg` внешними интеграциями не считаются.

## Готовность по фазам

| Фаза | Что | Статус |
|---|---|---|
| **0** Ядро данных | Event Ledger (append-only), order state-machine, IMEI-инвариант, миграции | ✅ |
| **1** Деньги | Payment поддерживает retail-order и paid ServiceWorkOrder; Refund aggregate серверно распределяет card/QR/gift-card/cash возвраты, хранит immutable tax lines, four-eyes approval, provider saga/retry и Ledger. CashShift, Courier COD и owner Finance settlement подключены; live refund/payment/fiscal certification ещё внешняя | 🟡 |
| **2** Витрина | Каталог, карточка, корзина, checkout, поиск, избранное, сравнение, промо/бонусы; ERP-owned точки, scoped guest recovery и Marketing CMS подключены: блоки, подборки, approved-only отзывы, промокоды, согласованный campaign lifecycle, consent-safe Outbox, actual spend, first/last UTM, privacy-safe funnel и refund-adjusted net ROAS | 🟡 |
| **3** Аккаунт+Auth | OTP-вход, Apple/Telegram social-auth backend, «Мои заказы», адреса, настройки, уведомления+consent, бонусы | ✅ |
| **4** POS 2.0 | Тёмный терминал, продажа, service estimate payment, split tender, approval, offline replay, catalog delta-sync и print abstraction; packaged-app E2E и железо не сертифицированы | 🟡 |
| **5** Склад | Fulfillment, серийный и количественный учёт, атомарный резерв/продажа/POS, движение статусов, **Evidence Vault (keyed upload + authorized signed read/access audit)** | ✅ |
| **6** Approval+Возвраты+Обмены | Approval Inbox, refund/return/exchange, **UI обмена кассира** | ✅ |
| **7** Опасные действия | Approval-матрица (цена/write-off/долг/скидка), **RBAC 9 ролей + 2FA + staff-сессии** | ✅ |
| **8** ERP владельца | Дашборд, Risk, Ledger, KPI, Finance/HR/logistics/procurement/service verticals работают; все handoff-модули и состояния ещё не приняты | 🟡 |
| **9** Мультисклад/гарантия | WarrantyCase+SLA, перемещения/инвентаризация, **Supplier RMA+scorecard**, Purchase Orders и race-safe IMEI-приёмка, долги/рассрочка, trade-in, импорт | ✅ |
| **10** Уведомления+CRM | Support Inbox, Customer 360, consent, CRM/outbox adapters готовы; live channel delivery требует credentials/certification | 🟡 |
| **10A** Сервис-центр | Warranty и внешний платный intake, диагностика/смета, клиентское подтверждение, POS split payment/open-shift reconciliation, запчасти, lifecycle, 30-дневная гарантия ремонта и DeviceUnit-backed подменный фонд с Evidence/overdue готовы; exact detail handoff и физический UAT остаются | 🟡 |
| **11** AI-слой | **AI-ассистент владельца** (`/ai/insights`) + **оценка Б/У** (`/ai/assess`, `/assess`) — бесключевые правила за портом | 🟡 |
| **12** Каналы и рост | Подарочные карты, Telegram shell, B2B/опт и защита устройств работают; click&collect требует authoritative point/location, франшиза/реклама — каркас | 🟡 |
| **13** Инфраструктура | Docker/Render blueprint, health, Prometheus-compatible metrics, backup tooling, Sentry ports, realtime и offline software готовы; alerting/staging/restore/rollback/soak ещё не сертифицированы | 🟡 |

## Работает вживую сейчас (прод-режим)
`/` витрина · `/erp` кокпит (+ AI-ассистент, Маржа/KPI, Command Center, Готовность запуска) · `/pos` касса
(+ offline) · `/assess` оценка Б/У · `/warehouse` · `/warranty` · `/exchange` · `/staff` ·
`/support` · `/trade-in` · `/b2b` · `/account/protection` · `/order/[id]` с scoped guest status/receipt recovery · checkout с ERP-owned active StorePoint, точным адресом доставки и point-local резервом · API: `/pos/sale` … Owner API `/reports/*` и `/ai/*` работают
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
| **Фискализация ККМ/ОФД** ⚖️ | Договор с ОФД-провайдером и `FISCAL_PROVIDER*`. **Юридический блокер:** розничная продажа в КР требует фискального чека с налоговыми строками, фискальным номером и Z-отчётами. Сейчас чеки информационные (`fiscal-provider.ts` → `certified: false`, `fiscalNumber: null`), подделок нет. Готово, когда POS-продажа даёт фискальный чек с QR и сходится с кабинетом налоговой. **`npm run launch:check` эту строку не проверяет.** См. `docs/MASTER-PLAN.md` §2 |
| **Боевой платёжный шлюз** | `PAYMENT_PROVIDER`, API URL, merchant ID, API key и webhook secret. `PAYMENT_PROVIDER_CERTIFIED=true` ставится только после live intent, raw-body подписи, replay и refund reconciliation. Provider-neutral port и sandbox готовы. |
| **Боевой SMS/OTP** | `SMS_PROVIDER`, API URL/key и утверждённый sender ID. `SMS_PROVIDER_CERTIFIED=true` ставится после реальной доставки login/recovery OTP и проверки cleanup при отказе провайдера. |
| **AI vision/LLM** — оценка Б/У по фото, разведка рыночных цен, обогащение карточек | `AI_PROVIDER_KEY` (сервер). `POST /ai/grade-photos` и `POST /ai/price-scout` уже работают как бесключевые staff-only rules/fallback endpoints; production quality требует ключ, reference dataset и offline eval. |
| **Apple/Telegram social login** | `APPLE_CLIENT_ID`, `TELEGRAM_BOT_TOKEN`, Apple/Telegram callback/client SDK QA. Backend endpoints and identity linking are ready. |
| **Telegram Mini App / WhatsApp-магазин** | бизнес-аккаунты, токены каналов и webhook/callback QA. Campaign delivery уже включается через `NOTIFICATION_TRANSPORT=channels` + Novu/SMTP/Telegram/WhatsApp env. |
| **Native iOS/Android release** | Swift iOS and Kotlin/Compose Android foundations are real and independently buildable; Staff, Courier and POS software verticals are implemented on both platforms. Final Client provider checks, Apple/Google signing, APNs/FCM credentials and physical-device/hardware QA remain required. |
| **Боевое железо кассы** — сканер, принтер чеков, платёжный терминал | физические устройства (софт-каркас offline+print готов) |

## Опциональная полировка v2 (без блокеров)
Finance 2.0 cashflow/инкассация/валюта · предзаказы (варианты SKU и виртуальные наборы готовы; возврат компонентов выделен отдельно) · quantity-consignment и возврат комиссионного товара (серийная приёмка/начисление/выплата и quantity transfer/adjustment готовы) · first-store HR/device UAT (native Staff attendance, ERP payroll posting и cash handover готовы) ·
exact detail pixel-pass сервис-центра и физический UAT (полный web/API цикл, включая подменный фонд, уже готов) · оптимизация маршрутов/live tracking (зоны, слоты, capacity, checkout и dispatch готовы) · store checklists · live ad-platform/channel certification и автоматический production spend import (advertiser lifecycle, approval, Outbox linkage, manual reconciliation, net ROI и privacy-safe funnel уже закрыты) · расширенная
аналитика · consent retention · франшиза · рекламный кабинет. Эти блоки нужны для полной
95-экранной экосистемы, но не подменяют launch-gates первого магазина.

## Проверка (гейт готовности)
```bash
npm run mvp:verify                    # полный release gate
npm run launch:preflight              # core production env
npm run launch:readiness              # отчёт по apps/api/.env.production
npm run launch:check                  # strict preflight + strict external gate
npm run launch:readiness:strict       # strict external gate
cd apps/api && npx jest                 # 123 suites / 487 тестов ✓
npm run migration:test:service-payment # legacy refund/point migration regression ✓
npm run api:build                     # ✓
cd apps/web && npx next build         # ✓ (37 роутов)
npm run e2e                           # 36/36 ✓
npm run ecosystem:verify              # web/API + all iOS targets/XCTest + four Android APKs/JVM/Lint
npm run mobile:store-preflight        # 0 failures; production env warnings only
cd apps/mobile && npx expo-doctor     # 20/20 ✓
npm run ios:generate                  # regenerates AliStoreNative.xcodeproj
npm run ios:build                     # all four SwiftUI apps + shared core
npm run ios:test                      # AliStoreCore tests on iPhone Simulator
npm run android:build                 # four Kotlin/Compose debug APKs
npm run android:test                  # JVM tests + Android Lint for all modules
npm run android:ui                    # 31/31 connected tests on API 36 emulator
```
