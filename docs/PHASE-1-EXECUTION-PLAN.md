> ⚠️ **SUPERSEDED** — см. [docs/MASTER-PLAN.md](./MASTER-PLAN.md) (2026-07-23).
> Файл оставлен ради истории. Утверждения о состоянии кода в нём устарели.

# AliStore Phase 1 Execution Plan

## Цель

Довести первый операционный контур AliStore до проверяемого MVP: клиентский Web, ERP, Staff, Courier, POS и Client native используют единые API-контракты, серверные права, идемпотентные операции и Event Ledger.

Фаза считается принятой только после выполнения всех gates ниже. Наличие экранов или успешной сборки само по себе не означает готовность к production или публикации в stores.

## Порядок работ

### 1. Baseline и границы изменений

- Проверить ветку, `git status`, текущий HEAD и незакоммиченные изменения.
- Разделять изменения по зонам: Web/ERP, API/финансы, iOS, Android, QA.
- Не включать секреты, demo credentials и generated files в коммиты.
- Для каждого вертикального среза зафиксировать acceptance command до редактирования.

**Gate:** источник компилируется, diff не содержит случайного форматирования, параллельные изменения идентифицированы.

### 2. Web и ERP operations

- Ограничить ERP navigation по серверному staff grant и не показывать ролью недоступные модули.
- В owner-only admin surface добавить создание staff account, деактивацию с проверкой открытой смены/активной доставки и сброс 2FA.
- В Staff добавить скачивание trade-in договора.
- В Warehouse добавить server-generated IMEI label и печать через существующую hardware abstraction.
- В Warranty добавить server-generated warranty talon.
- В Approvals/Refunds показать только роли, которым сервер разрешает refund management.
- Проверить loading, error, 403, empty и повторный клик.

**Gate:** `npm run build --prefix apps/web`; targeted Vitest RBAC tests; browser smoke ERP/Staff/Warehouse/Warranty/Refunds; отсутствие responsive overflow.

### 3. Native contracts

- Android: единые tender options, reason-aware COD handover, Staff order statuses/support queue и typed API gateway.
- iOS: Customer settings/catalog decoding, order ledger model и customer timeline builder, подключённые в Xcode test target.
- Сохранять server-authoritative payment, delivery, stock и approval statuses.
- Для offline mutations использовать постоянный idempotency key и повторяемый replay.

**Gate:** `:core:test`; `npm run ios:build`; `npm run ios:test`; затем packaged app UI tests на чистом HEAD.

### 4. Notification contract

- Проверить transactional notifications для payment, delivery, refunds, service, trade-in, support и approvals.
- Проверить consent filtering: transactional notices не зависят от marketing consent, promo notices зависят.
- Проверить outbox deduplication, retry/backoff и отсутствие PII/OTP в логах.
- Не принимать новый E2E, если он собран под устаревшие constructor/API signatures.

**Gate:** API typecheck, isolated notification integration suite на disposable DB, replay и failure cases.

### 5. Hash-bound evidence

- Остановить параллельные source changes.
- Получить clean worktree и записать source-tree hash.
- Записать iOS и Android evidence одной командой recorder на том же HEAD.
- Не переносить артефакты с другого SHA.

**Gate:** `npm run ecosystem:verify:ui` и strict audit видят актуальные native artifacts.

### 6. Ecosystem reconciliation

- POS sale → return → refund → cash/ledger reconciliation.
- Courier COD → handover → finance reconciliation.
- Service/loaner → payment/stock/evidence reconciliation.
- Procurement partial receiving → stock → sale.
- Duplicate webhook, timeout, restart, offline replay, IDOR и expired capability.

**Gate:** `npm run ecosystem:e2e`, API suites и Playwright зелёные; Critical/High defects отсутствуют.

## Что не закрывает Фаза 1

- Production credentials, Cloudflare/Render/R2/Sentry deployment и live provider certification.
- Physical-device APNs/FCM, Face ID/Touch ID, camera, maps, scanners, printers и payment terminals.
- App Store/Google Play signing/review.
- 64 отсутствующих handoff references без owner-provided originals или approved retirement.
- Бухгалтерская, налоговая и юридическая сертификация по КР.

## Definition of Done

Вертикальный поток принимается только при наличии серверной авторизации, idempotency, Ledger coverage для критических mutations, unit/integration/E2E проверки, UI states, документации и отдельного проверенного commit.
