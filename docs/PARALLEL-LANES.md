# Параллельные полосы — Codex ↔ Mac Mini (оркеструет Claude)

> Остаток работ разложен на ДВЕ непересекающиеся полосы, чтобы два параллельных
> исполнителя не конфликтовали. Каждая полоса трогает ТОЛЬКО свои пути. Claude-lane
> (`reports/`, `ai/`, `components/erp/*View.tsx`) — заморожена, не трогать: она закрыта
> и зелёная (81 сьют / 278 тестов). Claude оркеструет и интегрирует.

## Общий протокол координации (для ОБОИХ)
- Миграции — **только аддитивные** (nullable-колонки / новые таблицы), по одной, коммит сразу.
- Коммитить **явными путями** (не `git add -A`), не переписывать историю (рядом коммитит другой).
- Гейт приёмки: `npm run api:test` зелёный (+ новый тест) · `nest build` + `next build` ·
  живой прогон (HTTP/браузер) + сверка в БД.
- Общие файлы (`schema.prisma`, `app.module.ts`) — только аддитивные правки, коммит быстро.
- Не трогать пути ЧУЖОЙ полосы (список ниже) и Claude-lane.

---

## ПОЛОСА A — CODEX (доводит свои модули + hardening)
Пути: `apps/api/src/{outbox,notifications,tradeins,documents,receipts,labels,import,auth,health,realtime}/`, инфра.

- **A1. Наполнить `TradeInDevice.imei` на `POST /tradeins/intake`** (DTO + сервис). Поле и
  детектор `imei_reuse` уже готовы (Claude) — нужно писать imei при staff-приёмке.
  - Приёмка: intake с imei → запись в БД; тот же imei в скупке и среди проданных → high-риск
    `imei_reuse` в Risk Center (детектор уже ловит).
- **A2. Notification-шаблоны** на все транзакционные события (заказ подтверждён / готов к выдаче /
  гарантия обновлена / напоминание о долге) через outbox/Novu, consent-filtered.
  - Приёмка: каждое событие рендерит шаблон с корректными полями; отозвавший consent исключён.
- **A3. Rate limiting** (`@nestjs/throttler`) на `POST /checkout`, OTP-выдачу,
  `POST /support/tickets`, платёжные webhooks.
  - Приёмка: превышение → 429; нормальный трафик не задет; тест на лимит.
- **A4. PDF/печать полировка** — receipts/labels/documents: корректные поля + локаль (ru-KG).
  - Приёмка: чек (в т.ч. split-tenders), накладная, договор скупки печатаются верно.
- **A5. Infra runbook** — Caddy + бэкапы + запуск self-hosted + restore-check (документ + скрипты).

## ПОЛОСА B — MAC MINI (гринфилд: новые модули/области, ноль пересечения с Codex)
Пути (все НОВЫЕ): `apps/api/src/giftcards/`, `apps/web/app/admin/`, `apps/web/app/tg/`,
`e2e/` (или `apps/web/e2e/`), `.github/workflows/`. Общий `schema.prisma` — только новые таблицы.

- **B1. E2E-набор (Playwright) + CI.** Новый `e2e/` с 5 потоками (покупка web, POS-скидка→approval,
  возврат→refund, обмен, скупка Б/У) + `.github/workflows/ci.yml` (install→lint→typecheck→
  `api:test`→`next build`).
  - Приёмка: `playwright test` зелёный локально; CI краснеет на сломанном PR; артефакты на падении.
- ✅ **B2. Gift cards / стор-кредит** — НОВЫЙ модуль `apps/api/src/giftcards/` + новая таблица
  `GiftCard` (аддитивно): выпуск, баланс, списание в checkout/POS, ledger-события
  (`giftcard.issued` / `giftcard.redeemed`). Веб: поле «промо/подарочная карта» в checkout.
  - Приёмка: выпуск → оплата ею уменьшает баланс; двойное списание невозможно; событие в ledger. ✅
- **B3. Admin Product Management UI** — НОВЫЕ страницы `apps/web/app/admin/products/`
  (список/создать/править/архивировать). Опасные правки (цена/архив) — через СУЩЕСТВУЮЩИЕ
  approval-эндпоинты (executors уже есть), новых серверных правок товара НЕ добавлять.
  Впаять кнопки **«Авто-категория»** (`POST /ai/categorize`) и **«Сгенерировать описание»**
  (`POST /ai/describe`) — это UI-дом для готовых keyless-AI эндпоинтов Claude.
  - Приёмка: CRUD товара из UI; авто-категория и описание подставляются одним кликом; опасные
    правки паркуются в Approval Inbox.
- **B4. Telegram Mini App — оболочка.** НОВЫЙ роут `apps/web/app/tg/`: витрина+checkout против
  существующего API (`channel=telegram`) + webhook-заглушка. Активация позже = токен бота.
  - Приёмка: Mini App проходит заказ в общий бэкенд (channel=telegram) в dev.

---

## Разбор границ (почему не столкнутся)
- A правит существующие модули Codex; B создаёт новые каталоги/таблицы. Единственная общая точка —
  `schema.prisma` (A: `imei` уже влит Claude; B: новая таблица `GiftCard`) — обе правки аддитивны.
- `app.module.ts`: A импортит свои модули, B — `GiftcardsModule` (одна строка, коммит сразу).
- Если mac mini недоступна как агент — Claude может исполнить полосу B управляемыми субагентами
  здесь (как сделан ledger-coverage тест). По запросу.
