# AliStore ERP — Хендофф (готовый проект)

Операционная система для магазина электроники в Кыргызстане: витрина + клиент-апп + POS +
склад + ERP владельца — всё поверх единого **Event Ledger** (append-only книга событий).

## Стек
- **apps/api** — NestJS 10 + Prisma 5 + PostgreSQL (порт 4000, префикс `/api`)
- **apps/web** — Next.js 14 (App Router) + Tailwind (порт 3000)
- Монорепо на npm workspaces.

## Как запустить

### Предпосылки
- Node 20+, PostgreSQL. БД `alistore_dev` (+ `alistore_test` для тестов).
- `apps/api/.env`: `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET`.

### Первый запуск
```bash
npm install
npm run db:migrate        # применить миграции
npm run db:seed           # демо-данные (товары, единицы, клиент)
```

### Dev-режим (с авто-перезагрузкой)
```bash
npm run api               # API на http://localhost:4000/api
npm run web               # веб на http://localhost:3000
```

### Prod-режим (стабильный, без watch)
```bash
# API
cd apps/api && npm run build && node dist/main.js
# web
cd apps/web && npm run build && npx next start -p 3000
```

## Проверка
```bash
npm run mvp:verify                     # schema + API/web build + Jest + Playwright + readiness
npm run mvp:verify -- --skip-e2e       # быстрый gate без Playwright
npm run api:test                       # 89 сьютов / 316 тестов (jest)
npm run api:build                      # прод-сборка API
npm run build -w @alistore/web         # прод-сборка веб (32 роута)
```

`mvp:verify` печатает внешний readiness без раскрытия секретов. Добавьте `--strict-external`,
если production gate должен падать на отсутствующих provider credentials или POS hardware marker.

## Экраны (маршруты веб)
| Маршрут | Назначение |
|---|---|
| `/` · `/product/[id]` · `/cart` · `/checkout` | Витрина (Клиент App 2.0) |
| `/account` · `/account/orders/[id]` · `/account/orders/[id]/status` | Кабинет, заказ, таймлайн статуса |
| `/account/devices` · `/account/warranty/[imei]` | Мои устройства, гарантийный талон |
| `/compare` · `/favorites` | Сравнение, избранное |
| `/login` | Вход телефон+OTP |
| `/pos` | POS-касса (POS 2.0) |
| `/exchange` | Обмен товара (кассир) |
| `/warehouse` · `/warranty` | Консоли склада и гарантии (тёмные) |
| `/approvals` | Approval Inbox (одобрения) |
| `/staff` | Приложение сотрудника (Сотрудник App 2.0) |
| `/erp` | Кокпит владельца (ERP 2.0): дашборд · Финансы · Маржа/KPI · Склад · CRM-инбокс · Риски · Event Ledger |

## Ключевая архитектура
- **Event Ledger** — единственный источник правды. Все отчёты, дашборд, KPI, Risk Center
  читаются из событий → числа не расходятся с реальностью.
- **Инвариант #10** — деньги/склад/статус заказа меняются в ОДНОЙ транзакции с записью
  события (`AuditService.transaction`).
- **Approval Rules Matrix** — опасные действия (скидка>10%, возврат, долг>лимита, изменение
  цены>15%, списание, удаление) паркуются на одобрение (`approvals/action-executors.ts`),
  исполняются только после подтверждения роли.
- **Инварианты**: нельзя продать IMEI дважды (условный UPDATE), нет оплаты без резерва,
  сверка кассы, COD-хендовер, сумма возвратов ≤ оплаченной.
- **Command Center** — сигнал Risk Center кликабелен → переход на экран решения.

## Статус
Полный статус по фазам, что готово / что за параллельным агентом (Codex) / что за внешними
блокерами (AI-ключи, Telegram/WhatsApp, hardware) — см. [`PHASES.md`](./PHASES.md).
