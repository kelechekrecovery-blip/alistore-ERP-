# AliStore ERP

Операционная система для розничной торговли электроникой (новое + Б/У с гарантией) в
Кыргызстане: маркетплейс, клиентское приложение, приложение сотрудника, POS и ERP
владельца поверх единого append-only **Event Ledger**.

Источник правды по продукту и дизайну — **[`design_handoff_alistore/`](design_handoff_alistore/)**
(спецификация, инварианты, Roadmap, `.dc.html` прототипы, schema.prisma, api-and-events).

## Стек
- **Backend** (`apps/api`): NestJS + Prisma + PostgreSQL, REST.
- **Frontend** (`apps/web`): Next.js 14 (App Router) + React + TS + Tailwind.
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
- **Staff ecosystem**: POS, warehouse, approvals, refund/dispute center, exchange, warranty,
  ERP reports, AI tools, admin product management, campaign/notification delivery.
- **Telegram Mini App shell** и provider-ready Apple/Telegram social login.
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

npm run api:test
npm run mvp:verify              # полный release gate: schema, builds, Jest, E2E, readiness
npm run mvp:verify -- --skip-e2e # быстрый gate без Playwright
```

`npm run mvp:verify` не падает из-за отсутствующих production-ключей/железа: внешний статус
печатается отдельно. Для строгой production-проверки используйте `npm run mvp:verify -- --strict-external`.

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
design_handoff_alistore/   источник правды: спека, прототипы, reference
```

## Дальше по Roadmap
Софт-MVP закрыт текущим gate. Production-launch дальше упирается в внешние доступы и
физическую сертификацию: POS printer/terminal/scanner QA, Telegram/WhatsApp/Novu credentials,
Apple/Telegram social-login callbacks, S3 media storage и observability.
См. [`BACKLOG.md`](BACKLOG.md) и [`docs/READINESS.md`](docs/READINESS.md).

Open-source candidates and integration order: [`docs/open-source-integrations.md`](docs/open-source-integrations.md).
