# AliStore ERP

Операционная система для розничной торговли электроникой (новое + Б/У с гарантией) в
Кыргызстане: маркетплейс, клиентское приложение, приложение сотрудника, POS и ERP
владельца поверх единого append-only **Event Ledger**.

Источник правды по продукту и дизайну — **[`design_handoff_alistore/`](design_handoff_alistore/)**
(спецификация, инварианты, Roadmap, `.dc.html` прототипы, schema.prisma, api-and-events).

## Стек
- **Backend** (`apps/api`): NestJS + Prisma + PostgreSQL, REST.
- **Frontend** (`apps/web`): Next.js 16 (App Router) + React + TS + Tailwind.
- **Native iOS** (`apps/ios`): four final SwiftUI targets with shared `AliStoreCore`.
- **Native Android** (`apps/android`): four final Kotlin Compose application modules.
- **Behavioral reference** (`apps/mobile`): legacy Expo workspace; not a release target.
- **Тесты**: Jest + Playwright E2E; QA-сценарии из handoff = приёмочные тесты.

## Что уже реализовано (MVP)
- Prisma-схема (27 сущностей) + 14 миграций + сиды.
- **AuditEvent** — append-only Event Ledger + транзакционная обёртка мутаций
  (инвариант #10: деньги/склад/статус меняются в одной транзакции с записью события).
- **Order state-machine** `created → reserved → paid` (+ полная таблица переходов).
- **IMEI/DeviceUnit** lifecycle с запретом двойной продажи.
- **Payment** с проверкой «нет оплаты без резерва» и идемпотентностью webhook по `txnId`.
- **Catalog search** `GET /api/catalog/products` с optional Meilisearch acceleration и
  Postgres fallback; reindex endpoint закрыт maintenance-token по умолчанию.
- **Customer app / Site 2.0**: каталог, поиск, карточка товара, корзина, checkout,
  избранное, сравнение, аккаунт, бонусы, адреса, уведомления, support, returns, trade-in.
- **Native iOS/Android apps**: SwiftUI и Kotlin Compose клиенты для Client, Staff,
  Courier и POS поверх единого API. Expo сохранён только как behavioral reference.
- **Staff ecosystem**: POS, warehouse, approvals, refund/dispute center, exchange, warranty,
  ERP reports, AI tools, admin product management, campaign/notification delivery.
- **Telegram Mini App shell** и provider-ready Apple/Telegram social login.
- **B2B/опт**: кабинет компании, заявка на безналичный счёт из каталога, staff-очередь и КП.
- **Защита устройств**: полис для купленного IMEI, staff-предложение и customer activation.
- **MVP release gate**: `npm run mvp:verify` проверяет schema, сборки, Jest, Playwright и
  readiness внешних провайдеров без раскрытия секретов.

## Предпосылки
- Node ≥ 20, PostgreSQL 16 (локально; на macOS: `brew install postgresql@16 && brew services start postgresql@16`).

## Запуск
```bash
npm install

# настроить БД (скопировать и при необходимости поправить строку подключения)
cp apps/api/.env.example apps/api/.env
createdb alistore_dev && createdb alistore_test

# миграции + сиды
npm run db:migrate           # prisma migrate dev (apps/api)
npm run db:seed

# API (http://localhost:4000/api)
npm run api

# Legacy Expo behavioral reference (не release-приложение)
EXPO_PUBLIC_API_BASE=http://127.0.0.1:4000/api npm run mobile

# API contract
# Swagger UI:   http://localhost:4000/api/docs
# OpenAPI JSON: http://localhost:4000/api/docs-json

# Catalog search
# GET http://localhost:4000/api/catalog/products?q=iphone&stockOnly=true
```

Optional Meilisearch acceleration is configured via `MEILI_HOST`, `MEILI_API_KEY`,
`MEILI_PRODUCTS_INDEX`, and `SEARCH_ADMIN_TOKEN` in `apps/api/.env`. If Meilisearch
is not configured, catalog search uses Postgres as the source of truth.

## Тесты
```bash
# один раз синхронизировать схему в тестовую БД
DATABASE_URL="postgresql://alistore@localhost:5432/alistore_test?schema=public" \
  npm exec -w @alistore/api -- prisma db push --skip-generate

npm run api:test                # serial integration gate against the shared test DB
npm run mvp:verify              # полный release gate: schema, builds, Jest, E2E, readiness
npm run mvp:verify -- --skip-e2e # быстрый gate без Playwright
npm run launch:preflight        # core production env: DB/JWT/OTP/jobs
npm run launch:readiness        # отчёт по apps/api/.env.production
npm run launch:check            # strict preflight + strict external readiness
npm run launch:readiness:strict # strict gate для внешних production-блокеров
npm run ecosystem:audit        # readable ecosystem/design acceptance report
npm run ecosystem:audit:json   # writes machine contract to .artifacts/ecosystem-audit.json
```

`npm run mvp:verify` не падает из-за отсутствующих production-ключей/железа: внешний статус
печатается отдельно. Для строгой production-проверки используйте `npm run mvp:verify -- --strict-external`.
Финальная активация описана в [`docs/PRODUCTION-ACTIVATION.md`](docs/PRODUCTION-ACTIVATION.md).

## Структура
```
apps/
  api/                 NestJS + Prisma (Event Ledger core)
    prisma/            schema.prisma · migrations · seed.ts
    src/
      audit/           append-only ledger + транзакционная обёртка
      orders/          state-machine, создание/резерв заказа
      payments/        оплата, инвариант «нет paid без резерва», идемпотентность
      catalog/         витринный поиск, optional Meilisearch, Postgres fallback
      units/           IMEI lifecycle, запрет двойной продажи
      prisma/  common/
    test/              unit/e2e acceptance tests
  web/                 Next.js customer app, POS, ERP, staff/admin screens
  mobile/              Expo behavioral reference only
  ios/                 four final SwiftUI application targets
  android/             four final Kotlin Compose application modules
design_handoff_alistore/   источник правды: спека, прототипы, reference
```

## Дальше по Roadmap
Текущий component gate зелёный, но полный софт-MVP ещё не принят: остаются единая
финансовая сверка, reconciled all-role E2E, app-level XCUITest/Android packaged journeys и
дизайн-доказательства. Production-launch дополнительно требует внешние доступы и физическую
сертификацию: POS printer/terminal/scanner QA, provider/channel credentials, storage и
observability.
См. [`BACKLOG.md`](BACKLOG.md) и [`docs/READINESS.md`](docs/READINESS.md).

Open-source candidates and integration order: [`docs/open-source-integrations.md`](docs/open-source-integrations.md).
