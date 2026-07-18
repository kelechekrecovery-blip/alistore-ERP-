# AliStore Фаза 1: ERP → Web storefront

## 1. Цель и границы

Цель Фазы 1 — доказать единый серверный контракт между ERP/CMS и клиентским интернет-магазином первого магазина.
Изменение товара, цены, медиа, публикации, остатков, точки выдачи, слота доставки или промокода должно предсказуемо отражаться на витрине и повторно проверяться API во время checkout.

Фаза не является production launch и не закрывает App Store/Google Play, реальные платежи, SMS, ОФД, физическое оборудование, полную финансовую сертификацию или отсутствующие дизайн-референсы.

## 2. Исходная точка

Перед началом каждого вертикального среза фиксируются:

- ветка и commit SHA;
- `git status --short` и список параллельных изменений;
- доступные handoff-файлы и строки traceability matrix;
- текущие API/Prisma модели и существующие E2E;
- переменные окружения без чтения или записи секретных значений.

Нельзя принимать результат, если тесты прошли на другом SHA, если в evidence попали незакоммиченные исходники или если reference был выдуман.

## 3. Владение зонами

| Зона | Ответственность | Основной результат |
|---|---|---|
| Catalog contract | API, Prisma, RBAC, цены, варианты, остатки | server-authoritative product/read model |
| CMS publication | draft/review/publish/schedule | опубликованный storefront snapshot |
| Storefront | Next.js customer routes и states | desktop/mobile клиентская витрина |
| Checkout contract | quote, stock, slot, promo, payment intent | повторно проверяемый order quote |
| ERP operations | staff permissions, warehouse, approvals | управляемые операционные изменения |
| QA/evidence | API, Playwright, screenshots, traceability | hash-bound acceptance artifacts |

Shared-файлы (`reference/api-and-events.md`, Prisma schema, `BACKLOG.md`, `PROGRESS.md`, evidence manifests) изменяются только после согласования контракта основным агентом.

## 4. Порядок выполнения

### 4.1. Срез A: контракт каталога

Проверить и при необходимости завершить:

- product CRUD с серверной валидацией имени, SKU, статуса и tracking mode;
- категории, бренды, характеристики и порядок отображения;
- варианты товара и связь variant → SKU → цена → остаток;
- serialized IMEI и quantity stock без смешивания источников;
- публичный read model, который не раскрывает внутренние закупочные поля;
- RBAC для создания, изменения, архивации и удаления;
- журналирование публикационных и ценовых изменений.

Acceptance:

- опубликованный товар виден в `/catalog`, `/search` и `/product/[id]`;
- архивированный или снятый с публикации товар не появляется в публичном списке;
- изменение цены берётся из API, а не из тела checkout-запроса;
- остаток показывает только доступное количество/наличие, без доверия к клиентскому значению;
- cross-tenant/cross-store read и mutation получают 403/404 по политике проекта.

### 4.2. Срез B: медиа и визуальный каталог

- принимать только разрешённые типы и размеры файлов;
- хранить private object key для внутренних документов;
- отдавать публичные product assets через безопасный public media path;
- сортировать галерею стабильно;
- показывать loading, broken image, empty gallery и retry;
- исключить layout shift через фиксированные aspect-ratio контейнеры;
- не подменять референсные изображения цветными заглушками.

Acceptance:

- product image загружается на desktop и mobile;
- внутреннее Evidence Vault не доступно через public media URL;
- удаление/замена медиа отражается после revalidation;
- отсутствие изображения не ломает карточку или сетку.

### 4.3. Срез C: CMS и публикация

Реализовать или проверить состояния:

- draft;
- review;
- approved;
- scheduled;
- published;
- archived/rejected.

Проверить:

- главные баннеры, promo blocks, подборки и navigation blocks;
- порядок блоков и channel targeting;
- preview draft без его публикации;
- публикацию с audit actor из JWT, а не из body;
- идемпотентное повторение publish;
- конфликт двух редакторов и устаревшую версию;
- автоматическое начало/окончание scheduled campaign;
- связь collection → product и поведение удалённого товара.

Acceptance:

- опубликованный CMS snapshot виден на главной витрине;
- draft и rejected content публично не видны;
- повторная публикация не создаёт дубликат Ledger/event записи;
- запрещённая роль получает permission state, а не скрытую ошибку;
- все операции имеют audit trail.

### 4.4. Срез D: цены, промо и quote

- price history с effective date и валютой;
- approval для опасного изменения цены/скидки;
- промокод проверяется сервером: срок, лимит, customer scope, товары и минимальная сумма;
- quote фиксирует server-side subtotal, discount, delivery fee, tax snapshot и total;
- клиент не может присвоить `paid`, `approved`, `discount`, `stock` или `delivered`;
- повторный quote с тем же idempotency key возвращает тот же результат;
- устаревший quote отклоняется понятной ошибкой и предлагает пересчитать корзину.

Acceptance:

- одна валидная акция применяется ровно один раз;
- просроченный, чужой или исчерпанный промокод отклоняется;
- изменение цены между корзиной и checkout приводит к revalidation, а не к продаже по старой цене;
- расчёт total одинаков для desktop, mobile web и native клиентов;
- денежные округления покрыты тестами на KGS и дробных значениях.

### 4.5. Срез E: store points, stock и delivery slots

- активные точки выдачи фильтруются по доступности и operational status;
- stock availability вычисляется на сервере отдельно для quantity и serialized товара;
- reserved stock не показывается как available;
- delivery zones, slots, capacity и Bishkek timezone используют один календарный контракт;
- checkout повторно проверяет точку, слот, capacity и наличие;
- отключение точки блокируется при открытой смене, активном fulfilment или принадлежащем ей остатке;
- отказ Redis/Search не изменяет бизнес-истину в PostgreSQL.

Acceptance:

- недоступная точка/слот не может быть выбран через подмену request body;
- последний доступный товар нельзя продать дважды при параллельном checkout;
- полная capacity слота возвращает стабильную бизнес-ошибку;
- выбранные pickup/courier параметры видны одинаково в заказе и ERP.

### 4.6. Срез F: customer storefront routes

Проверить маршруты по handoff и общей design system:

`/`, `/catalog`, `/product/[id]`, `/search`, `/favorites`, `/compare`, `/cart`, `/checkout`, `/login`, `/account`, `/account/orders/*`, `/account/addresses`, `/account/bonuses`, `/account/devices`, `/account/returns`, `/account/protection`, `/account/settings`, `/support`, `/trade-in`, `/warranty`.

Для каждого маршрута обязательны:

- loading state;
- empty state;
- error/retry state;
- permission/auth state;
- offline или network-failure state там, где есть mutation;
- keyboard/focus/accessibility state;
- desktop layout 1280/1440 px;
- mobile layout 390/402/360 px;
- отсутствие horizontal overflow.

## 5. Сквозные правила безопасности

- Customer reads используют JWT ownership; `customerId` из body не является доказательством личности.
- Staff reads/mutations используют active Staff JWT и серверный RBAC.
- Guest capability имеет короткий TTL, entity/action scope и ownership binding.
- `actor`, `staffId`, `paid`, `approved`, `delivered` и складские статусы не принимаются как доверенные поля клиента.
- Критические mutation имеют постоянный `Idempotency-Key`.
- Денежные, складские, approval и publication операции атомарны и записываются в Event Ledger.
- Webhook проверяется по raw body и защищён от replay.
- Public API не раскрывает PII, закупочную себестоимость, private evidence keys или внутренние токены.

## 6. Матрица тестирования

### API

- DTO/validation и ownership/RBAC;
- product/variant/price/promotion invariants;
- concurrent checkout и stock reservation;
- CMS publish/reject/schedule/replay;
- slot capacity и timezone;
- idempotency/repeated tap;
- webhook replay и provider timeout;
- Ledger/event count и финансовые суммы.

### Web

- `npm run build --prefix apps/web`;
- targeted Vitest для permissions, hardware и API adapters;
- Playwright storefront: catalog → product → cart → checkout;
- ERP: CMS publish → storefront visibility;
- ERP: price/stock/slot mutation → checkout revalidation;
- desktop/mobile screenshots и overflow scan;
- accessibility smoke.

### Evidence

Каждый accepted vertical slice сохраняет:

- command и environment class;
- commit SHA;
- source-tree hash;
- test counts;
- screenshot/artifact SHA-256;
- known limitations;
- ссылку на handoff или owner-approved retirement record.

## 7. Гейты и порядок команд

1. `git diff --check` и проверка clean boundary.
2. API targeted tests на disposable database.
3. `npm run build --prefix apps/api`.
4. `npm run build --prefix apps/web`.
5. targeted Playwright ERP/storefront suite.
6. visual screenshot suite.
7. `npm run mvp:verify`.
8. `npm run ecosystem:verify:ui`.
9. `npm run ecosystem:audit:strict`.

При падении гейта фиксируется причина и блокирующий владелец. Запрещено скрывать failure отключением теста или ослаблением audit.

## 8. Выходные артефакты

- один или несколько тематических source commits;
- обновлённые `BACKLOG.md` и `PROGRESS.md`;
- актуальная traceability matrix;
- API/Web/native test logs;
- hash-bound visual/e2e evidence;
- список открытых GAP с owner и следующим действием;
- release note с формулировкой «локально принято» или «внешне заблокировано».

## 9. Definition of Done Фазы 1

Фаза 1 считается локально принятой, когда:

- ERP/CMS изменения проходят в публичную витрину через серверный контракт;
- product, price, promo, stock, store point и slot повторно валидируются на checkout;
- клиентские storefront routes покрыты desktop/mobile и состояниями loading/empty/error/permission;
- API/Web/Playwright/visual gates зелёные на одном clean SHA;
- RBAC, ownership, idempotency и Ledger invariants проверены;
- каждый accepted route имеет traceability status;
- отсутствующие reference-файлы отражены как внешний blocker, а не замаскированы;
- документация обновлена и каждый срез зафиксирован отдельным проверенным commit.

Фаза 1 не получает формулировку «production готово», пока не пройдены staging, live providers, physical-device и owner/legal gates.
