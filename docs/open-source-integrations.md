# AliStore Open Source Integration Dossier

Дата исследования: 2026-07-06.

Цель: подобрать open-source проекты, которые усиливают AliStore ERP, не размывая
ключевую архитектурную границу проекта: PostgreSQL + Prisma + audited services +
append-only `AuditEvent` остаются source of truth для денег, склада, IMEI, статусов
и approvals. Внешние OSS-системы допускаются как индексы, очереди, каналы, BI,
identity providers или адаптеры, но не как второй источник правды.

## Методика

- Изучены локальные материалы handoff: `CLAUDE_CODE_PROMPT.md`,
  `reference/schema.prisma`, `reference/api-and-events.md`, `docs/`,
  `.dc.html` прототипы Client App 2.0, POS 2.0, ERP 2.0, Employee App 2.0,
  Process Map, QA Test Scenarios.
- Изучена текущая структура репозитория: NestJS API, Prisma schema,
  `orders`, `payments`, `units`, `audit`, OpenAPI.
- По GitHub/API и официальным сайтам сверены: назначение проекта, лицензия,
  язык/стек, активность, интеграционная форма и риски эксплуатации.
- Решение принималось по критериям: fit к AliStore-инвариантам, лицензия,
  зрелость, сложность эксплуатации, локализация риска, возможность graceful
  degradation, совместимость с NestJS/Postgres/REST.

## Локальные требования AliStore, которые определяют выбор

| Область | Требование handoff | Что это значит для OSS |
|---|---|---|
| Event Ledger | Все изменения денег/склада/статуса пишут `AuditEvent` атомарно | OSS не должен писать core-состояния напрямую |
| IMEI/SN | Нельзя продать один IMEI дважды | Search/BI/queues могут быть только проекциями |
| Payments | `txnId` idempotency, COD, MBank/O!Dengi QR, Bakai/OBank | Банковские интеграции делать custom adapters, не заменять OSS-коммерцией |
| POS 2.0 | Offline queue/sync, кассовая смена, сканер, печать | Нужны queue, local-first UX, barcode/print adapters |
| Catalog 2.0 | Каталог, поиск, фильтры, избранное, сравнение, промокоды | Нужен быстрый search index с Postgres fallback |
| Approvals | Discount/refund/write-off/PII thresholds | Нужны permissions + workflow/outbox, но решение на сервере |
| Evidence | Фото, акты, договоры, warranty/trade-in files | Нужен S3-compatible storage layer, audit refs в БД |
| Support/CRM | Support Inbox, segments, consent-filtered campaigns | Нужны helpdesk/notifications/analytics, consent-gated |
| v2 AI | Trade-in photo assessment, dynamic prices | Не внедрять до накопления качественных данных и evidence vault |

## Уже внедрено

| Интеграция | Статус | Граница безопасности |
|---|---|---|
| `@nestjs/swagger` | Внедрено: `/api/docs`, `/api/docs-json` | Только contract layer; доменная логика не меняется |
| `meilisearch` JS client | Внедрено как optional dependency | Meilisearch ускоряет каталог, Postgres остается source of truth |
| `GET /api/catalog/products` | Внедрено | Если `MEILI_HOST` не задан или Meili недоступен, используется Postgres |
| `POST /api/catalog/search/reindex` | Внедрено, но закрыто | Disabled-by-default через `SEARCH_ADMIN_TOKEN` |

### Meilisearch data boundary

В индекс отправляются только storefront-поля:

- `id`
- `sku`
- `name`
- `price`
- `category`
- `attrs`
- `availableUnits`
- `archived`

В индекс не отправляется `cost`, PII, payments, reservations, audit payload с
чувствительными данными или approval evidence. Даже при Meili-hit продукт
повторно читается из Postgres, чтобы не отдавать удаленный/архивный/устаревший
товар как правду.

## Решение по кандидатам

### 1. API contracts and client generation

| Проект | Решение | Почему |
|---|---|---|
| `@nestjs/swagger` | Adopt now, уже сделано | Нативно для NestJS, дает OpenAPI JSON для web/mobile/POS SDK |
| `openapi-typescript` | Next | Генерировать shared TS-типы из `/api/docs-json` после стабилизации DTO |
| Orval | Next after web scaffold | Генерировать typed fetch/React Query hooks для Next.js storefront |

Правило: generated clients не должны содержать бизнес-логику. Они только вызывают
audited API.

### 2. Catalog search

| Проект | Лицензия/сигнал | Решение |
|---|---|---|
| Meilisearch | CE MIT, EE BUSL; Rust service; GitHub API: ~58.4k stars, активен 2026-07 | Adopt now for MVP catalog |
| Typesense | GPL-3.0; C++; быстрый typo-tolerant search | Good alternative, but license friction for commercial ERP |
| OpenSearch | Apache-2.0; Java; search + analytics suite | Defer; слишком тяжел для MVP catalog, полезнее позже для logs/analytics |

Почему Meilisearch: нужен каталог с typo tolerance, category facets, search-as-you-type
и простой эксплуатацией. Если индекс упал, пользовательская витрина деградирует до
Postgres-поиска, а продажи/склад/оплаты не ломаются.

Следующее по Meilisearch:

1. Добавить domain events для `product.created`, `product.updated`,
   `product.archived`, `unit.received`, `unit.sold`, `unit.returned`.
2. Поставить BullMQ job `catalog.reindexProduct` для incremental sync.
3. Добавить nightly reconciliation: сравнение Postgres count и index count.
4. В web app использовать `/api/catalog/products`, а не обращаться к Meili напрямую.

### 3. Queues, outbox, offline sync

| Проект | Лицензия/сигнал | Решение |
|---|---|---|
| BullMQ | MIT; TypeScript; Redis-backed queue; GitHub API: ~9k stars, активен 2026-07 | Adopt next |
| `@nestjs/bullmq` | Nest integration for BullMQ | Use with dedicated queues per domain |
| Temporal | MIT; Go service; durable workflows; GitHub API: ~21k stars, активен 2026-07 | Defer to v1/v2 |
| NATS JetStream | Apache-2.0-ish ecosystem; streaming/broker | Defer; больше distributed messaging, чем нужно сейчас |
| RabbitMQ | MPL; зрелый broker | Defer; для текущего Nest monolith проще BullMQ |

AliStore queue boundaries:

- Jobs may retry notifications, reindexing, webhook follow-ups, reservation expiry
  scans, POS offline sync ingestion.
- Jobs must not directly mutate `Payment`, `DeviceUnit`, `Order.status` without
  calling audited services.
- For anything that changes money/stock/status, job handler wraps mutation in
  `AuditService.transaction`.

Recommended first queues:

- `catalog-index`
- `notifications-outbox`
- `reservation-expiry`
- `payment-webhook-retry`
- `pos-offline-sync`

### 4. Auth, roles, permissions

| Проект | Решение | Почему |
|---|---|---|
| Custom JWT + OTP in API | MVP | Handoff requires phone+OTP, role checks, refresh; current domain still small |
| CASL | Adopt next for role matrix | TypeScript, incremental, can share read-only UI rules with Next.js |
| Keycloak | Defer | Strong IAM/SSO/MFA, but heavy Java service and separate user model |
| ZITADEL | Defer/watch | Strong OIDC/SAML/MFA/passkeys/multi-tenancy, useful if franchise SSO grows |
| Ory Kratos/Hydra | Defer | Powerful composable identity stack, but more moving parts |
| OpenFGA | v2/franchise | Zanzibar-style FGA is valuable for multi-tenant/franchise/resource sharing |

Rule: UI permissions can hide actions, but server guards remain authoritative.
Dangerous actions still require 2FA/approval according to `api-and-events.md`.

### 5. Notifications and support

| Проект | Лицензия/сигнал | Решение |
|---|---|---|
| Novu | Notification workflows across in-app/email/SMS/push/chat | v1 Notifications Outbox |
| Chatwoot | Omnichannel inbox: live chat, email, WhatsApp, Telegram, etc. | v1 Support Inbox candidate |
| Zammad | AGPL helpdesk | Watch only; heavier and AGPL considerations |
| n8n | Workflow automation | Not core; possible internal ops only after security review |

Integration pattern:

- AliStore writes `notification.requested` / `ticket.created` to Event Ledger.
- Outbox job sends to Novu/Chatwoot.
- External delivery status is written back as audit event, not as silent mutation.
- Marketing sends must filter `Customer.consent = true`.

### 6. Evidence vault / object storage

| Проект | Лицензия/сигнал | Решение |
|---|---|---|
| S3-compatible interface via AWS SDK | Adopt next | Keeps AliStore independent from storage vendor |
| MinIO | AGPL-3.0; high-performance S3-compatible object store | Good dev/lab option, legal review before production |
| Garage | AGPL-3.0; self-hosted small/medium S3-compatible storage | Good ops fit for smaller deployments, license review required |
| SeaweedFS | Apache-2.0; S3/object/file storage | Evaluate for production if storage complexity grows |
| RustFS | Apache-2.0; promising S3-compatible object storage | Watch/evaluate; newer ecosystem |

Recommendation: implement `EvidenceStorage` interface first:

- `putEvidence(ref, file, metadata)`
- `getSignedReadUrl(evidenceId)`
- `deleteBlocked()` returns always forbidden for audit-bound evidence

Store only object key/hash/metadata in Postgres; keep full files outside DB.

### 7. Analytics, BI, observability

| Проект | Решение | Boundary |
|---|---|---|
| OpenTelemetry | Adopt next | Instrument API, jobs, DB calls |
| Prometheus + Grafana | Adopt next | Operational metrics, alerts, SLOs |
| Loki/Tempo | Adopt when ops starts | Logs/traces, incident analysis |
| Apache Superset | v1/v2 BI candidate | Apache-2.0, stronger for analytical dashboards |
| Metabase | v1 owner dashboards candidate | Easier for business users; check embedding/licensing |
| PostHog | v2 growth/product analytics | Consent-gated events, no raw PII/session replay without policy |

Command Center should query read models/views, not transactional tables directly
from the app request path.

### 8. POS, barcode, printing

| Проект | Решение | Notes |
|---|---|---|
| `@zxing/browser` / `@zxing/library` | Adopt in POS/Employee app | Browser barcode/QR scanning for IMEI/SN and stock count |
| `bwip-js` | Adopt for labels/QR/barcodes | Generate barcode/QR labels in browser/server |
| QZ Tray | Evaluate for web POS printing | Good for silent local printing, but has certificate/signing ops |
| ESC/POS Node drivers | Evaluate per hardware | Useful for local POS companion, but printer compatibility varies |

Rule: scanned IMEI is just input. The server still validates `DeviceUnit.status`.

### 9. Commerce platforms

| Проект | Решение | Why not core |
|---|---|---|
| Medusa | Reference only | Good commerce primitives, but would duplicate AliStore ledger/IMEI/COD rules |
| Vendure | Reference only | Built on NestJS and commerce-rich, but GraphQL/plugin core conflicts with current REST audited services |
| Saleor | Reference only | Mature commerce, but adopting it as core would move invariants outside AliStore |

These projects are useful for UX/admin/storefront patterns, not as the AliStore
backend. AliStore's differentiator is retail operations with IMEI, COD, repairs,
trade-in, cash shifts, approvals, and audit.

### 10. AI and used-device assessment

Do not integrate AI assessment in MVP. First prerequisites:

- Evidence vault with normalized photos/videos.
- Trade-in grading schema and human-reviewed outcomes.
- Audit trail for every suggested price/grade.
- Bias/fraud review and owner override workflow.

Later candidates: OpenCV, Tesseract, ONNX Runtime, vector search/embeddings. None
should write product price or grade without approval/audit.

## Prioritized integration roadmap

### Done in this branch

1. OpenAPI contract via `@nestjs/swagger`.
2. Optional Meilisearch catalog integration:
   - `GET /api/catalog/products`
   - `POST /api/catalog/search/reindex`
   - Postgres fallback
   - protected maintenance token for reindex
   - test coverage for fallback and protected reindex

### Next 1-2 iterations

1. Add `openapi-typescript` and generated shared client types.
2. Add BullMQ + Redis for `catalog-index` and `notifications-outbox`.
3. Move catalog reindex to queue-backed job and add incremental product sync.
4. Add CASL server guard skeleton for Role Permission Matrix.

### v1

1. Evidence storage interface + S3-compatible backend.
2. Novu notification outbox.
3. Chatwoot support inbox integration.
4. OpenTelemetry + Grafana/Prometheus.
5. Returns/refunds/approvals workflows with queue-backed retries.

### v2

1. OpenFGA for franchise/multi-tenant resource sharing if CASL becomes too coarse.
2. Temporal for long-running warranty/RMA/courier workflows if BullMQ state machines
   become fragile.
3. PostHog for consent-gated product analytics and experiments.
4. AI trade-in assessment after evidence data is trustworthy.

## Operational notes for Meilisearch

Environment:

```bash
MEILI_HOST="http://localhost:7700"
MEILI_API_KEY="dev-master-key"
MEILI_PRODUCTS_INDEX="products"
SEARCH_ADMIN_TOKEN="local-maintenance-token"
```

Reindex:

```bash
curl -X POST http://localhost:4000/api/catalog/search/reindex \
  -H "x-maintenance-token: local-maintenance-token"
```

Search:

```bash
curl "http://localhost:4000/api/catalog/products?q=iphone&stockOnly=true&limit=12"
```

Expected behavior:

- `source: "meilisearch"` when Meili is configured and reachable.
- `source: "postgres"` when Meili is not configured.
- `source: "postgres_fallback"` and `warning: "meilisearch_unavailable"` when
  Meili is configured but search fails.

## Validation run

Commands executed after implementation:

```bash
npm run api:build
npm run api:test
node -e "new Function('specifier','return import(specifier)')('meilisearch')"
PORT=4011 npm run start:prod -w @alistore/api
curl http://localhost:4011/api/docs-json
curl "http://localhost:4011/api/catalog/products?q=iphone&stockOnly=true&limit=5"
curl -X POST http://localhost:4011/api/catalog/search/reindex
```

Observed results:

- Build passed.
- Jest passed: 3 suites, 10 tests.
- Jest DB suites now run with `maxWorkers: 1`; they share one Postgres test DB
  and must not wipe fixtures concurrently.
- Meilisearch SDK dynamic import was verified under Node/CommonJS.
- Runtime OpenAPI returned HTTP 200 and exposed:
  - `/api/catalog/products`
  - `/api/catalog/search/reindex`
- Catalog search returned HTTP 200 with `source: "postgres"`.
- Reindex without `SEARCH_ADMIN_TOKEN` returned expected HTTP 403.

## Primary sources

- Meilisearch: https://github.com/meilisearch/meilisearch and
  https://meilisearch.com/docs/resources/self_hosting/enterprise_edition
- Typesense: https://github.com/typesense/typesense and https://typesense.org/
- OpenSearch: https://github.com/opensearch-project/OpenSearch and https://opensearch.org/
- BullMQ: https://bullmq.io/ and https://docs.bullmq.io/guide/nestjs
- Nest queues: https://docs.nestjs.com/techniques/queues
- Temporal: https://github.com/temporalio/temporal and https://temporal.io/
- CASL: https://github.com/stalniy/casl and https://casl.js.org/
- Keycloak: https://www.keycloak.org/ and https://github.com/keycloak/keycloak
- Ory Kratos/Hydra: https://github.com/ory/kratos and https://github.com/ory/hydra
- ZITADEL: https://github.com/zitadel/zitadel
- OpenFGA: https://openfga.dev/ and https://github.com/openfga/openfga
- Novu: https://github.com/novuhq/novu and https://novu.co/
- Chatwoot: https://github.com/chatwoot/chatwoot and https://www.chatwoot.com/
- Zammad: https://github.com/zammad/zammad
- MinIO: https://github.com/minio/minio
- Garage: https://github.com/deuxfleurs-org/garage and https://garagehq.deuxfleurs.fr/
- SeaweedFS: https://github.com/seaweedfs/seaweedfs
- RustFS: https://github.com/rustfs/rustfs
- Apache Superset: https://github.com/apache/superset
- Metabase: https://github.com/metabase/metabase
- PostHog: https://github.com/posthog/posthog
- ZXing JS: https://github.com/zxing-js/library
- bwip-js: https://github.com/metafloor/bwip-js/
- QZ Tray: https://qz.io/
- Medusa: https://github.com/medusajs/medusa
- Vendure: https://github.com/vendurehq/vendure
