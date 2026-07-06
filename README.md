# AliStore ERP

Операционная система для розничной торговли электроникой (новое + Б/У с гарантией) в
Кыргызстане: маркетплейс, клиентское приложение, приложение сотрудника, POS и ERP
владельца поверх единого append-only **Event Ledger**.

Источник правды по продукту и дизайну — **[`design_handoff_alistore/`](design_handoff_alistore/)**
(спецификация, инварианты, Roadmap, `.dc.html` прототипы, schema.prisma, api-and-events).

## Стек
- **Backend** (`apps/api`): NestJS + Prisma + PostgreSQL, REST.
- **Frontend** (`apps/web`): Next.js 14 (App Router) + React + TS + Tailwind — *scaffolding в следующей итерации*.
- **Тесты**: Jest; QA-сценарии из handoff = приёмочные тесты.

## Что уже реализовано (MVP · Ядро)
- Prisma-схема (18 сущностей) + миграция + сиды.
- **AuditEvent** — append-only Event Ledger + транзакционная обёртка мутаций
  (инвариант #10: деньги/склад/статус меняются в одной транзакции с записью события).
- **Order state-machine** `created → reserved → paid` (+ полная таблица переходов).
- **IMEI/DeviceUnit** lifecycle с запретом двойной продажи.
- **Payment** с проверкой «нет оплаты без резерва» и идемпотентностью webhook по `txnId`.
- Приёмочные тесты P0 🔴: двойная продажа IMEI → 409, оплата без резерва → 409.

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
```

## Тесты
```bash
# один раз синхронизировать схему в тестовую БД
DATABASE_URL="postgresql://alistore@localhost:5432/alistore_test?schema=public" \
  npm exec -w @alistore/api -- prisma db push --skip-generate

npm run api:test
```

## Структура
```
apps/
  api/                 NestJS + Prisma (Event Ledger core)
    prisma/            schema.prisma · migrations · seed.ts
    src/
      audit/           append-only ledger + транзакционная обёртка
      orders/          state-machine, создание/резерв заказа
      payments/        оплата, инвариант «нет paid без резерва», идемпотентность
      units/           IMEI lifecycle, запрет двойной продажи
      prisma/  common/
    test/              pure state-machine + P0 приёмочные тесты
  web/                 Next.js (следующая итерация)
design_handoff_alistore/   источник правды: спека, прототипы, reference
```

## Дальше по Roadmap
POS 2.0 экран продажи → витрина (каталог→карточка→корзина→checkout) → auth (телефон+OTP) →
CashShift / Courier COD → возвраты/обмены и approval-цикл опасных действий (v1).
См. [`design_handoff_alistore/docs/Roadmap запуска.md`](design_handoff_alistore/docs/Roadmap%20запуска.md).
