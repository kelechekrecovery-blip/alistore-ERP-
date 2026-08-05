# AliStore AI Executive OS — Phase 0 Baseline

Дата снимка: 2026-08-05
Git SHA evidence through: `5aafc884`
Статус решения: **REVISE — переход к production rollout запрещён до закрытия P0**.

## Scope

Mode: standard

Проверены архитектура, продукт/retail operations, auth/RBAC, AI Control Plane,
Telegram, camera gateway, reliability/E2E, security/privacy и App Store release.
PostgreSQL и Event Ledger остаются источником бизнес-истины; внешние сервисы и
AI не получают права менять деньги, остатки, роли или юридические статусы напрямую.

## Decision

Status: REVISE

Summary: локальная программная основа AliStore сильная и собирается, но система не
доказана как production-ready. Auth/account, support retry, AI image SSRF и
production dependency HIGH, guest identity response-loss, mobile/TG retry и
staff checkout contracts закрыты проверяемыми slices. Остаются camera/Event
Ledger/approval security gaps, а также внешняя сертификация платежей,
фискализации, каналов, камер и физических устройств. Все четыре App Store
submission ожидают review.

## Confidence

Level: high

Reason: вывод основан на текущем worktree, production builds, изолированных
PostgreSQL test runs, схеме/миграциях и независимых architecture/security/release
reviews. Live production credentials, реальные провайдеры, камеры и POS hardware
в этом worktree отсутствуют, поэтому они не считаются проверенными; ASC status
основан на записанном live readback, а не на постоянном доступе.

## Evidence

- VERIFIED: 151 Prisma models, 78 enums, 158 migrations, 72 API controllers, 62 Nest modules, 43 Web pages, 103 API spec files, 45 Playwright specs, 70 Swift files и 98 Kotlin files.
- VERIFIED: `npm run api:build` — PASS.
- VERIFIED: `npm run build -w @alistore/web` — PASS, 45 Next.js routes generated; storefront `no-store` fetch корректно оставил `/` dynamic.
- VERIFIED: isolated auth/preflight/RBAC/outbox run — 4 suites, 179/179 tests PASS.
- VERIFIED: isolated authz/AI/camera run — 3 suites, 13/13 tests PASS.
- VERIFIED: auth/account release gate — 5 suites, 55/55 tests PASS (OTP,
  recovery, refresh replay/theft, social enrollment, staff sessions, export/delete).
- VERIFIED: customer/support canonical identity and concurrency — 2 suites,
  13/13 tests PASS on isolated PostgreSQL.
- VERIFIED: anonymous POS walk-in identity regression closed with a DB-atomic
  internal sentinel; POS/inventory/ledger/bundle gate — 7 suites, 58/58 PASS.
- VERIFIED: paid-repair phone identity canonicalization, legacy adoption,
  alias concurrency and bounded P2002 recovery — service/auth gate 33/33 PASS.
- VERIFIED: commit `5aafc884` adds hashed UUIDv4 guest-create replay with the
  original 30-minute expiry, authenticated staff resolution, canonical phone
  adoption, deletion-time capability revocation and independent
  customer/order/payment retry attempts in Web, Telegram and legacy mobile.
- VERIFIED: guest identity/RBAC/deletion gate — 12 suites, 55/55 PASS; Web
  retry/error contracts — 5/5 PASS; legacy mobile retry contract — 1/1 PASS;
  API/Web production builds and mobile typecheck PASS; mobile production audit 0.
- VERIFIED: independent architecture, TypeScript, security and product/release
  reviews returned APPROVE for `5aafc884` with no HIGH/CRITICAL findings.
- VERIFIED: production dependency audit — 0 vulnerabilities after compatible
  per-consumer resolution; legacy glob/coverage and Socket.IO runtime tests PASS.
- VERIFIED: iOS unit/contract 164/164 and UI E2E 47/47 PASS across Client,
  Staff, Courier and POS; all four App Store versions read back WAITING_FOR_REVIEW.
- VERIFIED: worktree был dirty до Phase 0 docs; изменения iOS/Web/visual snapshots и незавершённый outbox slice не входят в этот documentation slice.
- UNKNOWN: полный API, полный Playwright, XCUITest/Android connected tests и live provider/device scenarios на этом SHA не запускались.

### Baseline matrix

Разрешённые статусы: `COMPLETE`, `PARTIAL`, `MISSING`, `BLOCKED_EXTERNAL`, `FAILED`.

| Область | Статус | Доказательство | Риск | Следующий шаг |
|---|---|---|---|---|
| Auth | PARTIAL | 55/55 isolated auth/account tests PASS; canonical phone identity, OTP/recovery, refresh replay/theft, social enrollment, logout and account deletion are fail-closed | Боевой SMS/Apple/Telegram и fresh-device SIWA зависят от external credentials/device; customer auth events ещё не нормализованы | Physical iPad fresh enrollment and production SMS clean-session E2E; normalize auth event taxonomy |
| Registration | PARTIAL | OTP and social enrollment converge on canonical customer identity; plus/no-plus/legacy/concurrency tests PASS | Production signup still depends on SMS; consent/version capture at signup is incomplete | Physical registration→logout→login test; persist consent/policy versions |
| RBAC | PARTIAL | Casbin guard и серверная approval matrix; isolated RBAC/authz tests PASS | Требуемые AI-роли и canonical `manager` не существуют; approval lifecycle не имеет claim/expiry/cancel ownership; один consent endpoint не rechecks active staff | Спроектировать AI capability roles; добавить claim/expiry/cancel и concurrency tests; закрыть active-staff gap; прогнать deny matrix |
| Orders | PARTIAL | Transactional order creation/reservation/state machine and ledger; guest identity, order and payment attempts are independently replay-safe; mobile routes guest capability and customer JWT to separate endpoints; staff resolver is authenticated; 55/55 API and 6/6 client contract tests PASS | Full create→reserve→pay/COD→fulfill→return ecosystem and installed-client adoption are not yet proven | Roll out migration→compatibility API→clients; instrument adoption, then full money/reconciliation E2E before removing missing-key compatibility |
| Payments | BLOCKED_EXTERNAL | Provider-neutral ports, refund approvals, webhook/idempotency tests; `production-payment-gateway.provider.ts` fail-closed | Production gateway намеренно не активирован; фискальный чек отсутствует | Выбрать cash/COD pilot или сертифицированный provider; live signed webhook/refund reconciliation; OFD/KKM |
| Inventory | PARTIAL | IMEI/quantity locks, reservation, valuation, quarantine and ledger paths in API; POS/inventory 58/58 and service/auth 33/33 gates PASS | Scanner/physical store flow and complete supply reconciliation are not certified | Exact-once procurement→receipt→sale→repair/return; physical scanner and stock-count UAT |
| Delivery | BLOCKED_EXTERNAL | Courier assignment, evidence, COD handover and offline queues implemented; courier E2E specs существуют | Live push/maps/camera/network and physical COD handover не сертифицированы | Physical-device run with offline restart, evidence upload, failure→redispatch and cash reconciliation |
| Support | PARTIAL | Auth and guest create are atomic/idempotent; evidence keys are content-stable; canonical/legacy ownership, concurrent replay and expiry tests PASS | Live WhatsApp/Telegram delivery remains external | Channel certification plus SLA/escalation/failure E2E |
| AI | PARTIAL | Allowlisted read tools, owner/admin guard, kill switch, durable runs/steps/decisions, approval-backed triage and hardened image URL resolver | `confidence=1` hard-coded; sourceRefs insufficient; no complete eval gate | Typed Executive response, real evidence refs, confidence policy and offline evals |
| Telegram | BLOCKED_EXTERNAL | Pairing/TOTP, webhook secret, idempotent inbox, revocation, retention and approvals implemented | Отдельный AI tool registry может дрейфовать от Control Plane; data processor/privacy approval и bot credentials отсутствуют | Перевести на shared orchestrator; data-minimization review; live webhook/pair/revoke E2E |
| Cameras | PARTIAL | Edge enrollment, hashed secrets, idempotent metadata ingest, global kill switch and retention purge; isolated camera tests PASS | `value` — arbitrary JSON; privacy label caller-controlled; нет EZVIZ/ONVIF/RTSP adapter, per-camera kill switch и legal decision | Typed per-event schemas, server-derived TTL/privacy, local gateway adapter and physical privacy UAT; face recognition запрещено |
| iOS | PARTIAL | 4 SwiftUI targets at repository build 6; unit/contract 164/164, UI 47/47 and strict signing/metadata preflight PASS | Pending ASC submissions use build 5; fresh physical-device SIWA is unverified | Do not replace build 5 while under review; physical-device auth smoke and post-review readback |
| Web | PARTIAL | Production build PASS, 45 routes; guest checkout/TG/trade-in terminal errors and retry attempts have 5/5 focused contract tests; 45 Playwright specs exist | Worktree contains unrelated uncommitted UI changes; full E2E not rerun | Separate/commit UI work, then full route audit, a11y, cross-browser and visual regression |
| E2E | PARTIAL | Auth/account 55/55, customer/support 13/13, guest identity/RBAC/deletion 55/55, POS/inventory/ledger 58/58 and service/auth 33/33 isolated gates PASS; Web/mobile retry contracts 6/6 PASS | Targeted checks do not prove whole ecosystem; no repeated full-suite flake run on current SHA | Run full isolated API twice, full Playwright, reconciled ecosystem, native UI and failure injection |
| Security | PARTIAL | JWT/OTP/storage guards, hardened image resolver, exhaustive account deletion tests and production audit 0; independent reviews APPROVE completed slices | Camera metadata policy, DB-enforced Event Ledger immutability, approval ownership and cross-writer phone consistency remain open; phone-existence response is an accepted rate-limited privacy risk | Close camera schema/retention, AuditEvent immutability, approval lifecycle and phone-writer consistency; full secret/container/IDOR scan |
| App Store | BLOCKED_EXTERNAL | All four `1.0.0` build-5 versions verified WAITING_FOR_REVIEW; strict signing/metadata preflight and reviewer logins PASS; iOS UI 47/47 | Apple review, Unlisted distribution and fresh physical-iPad SIWA remain external | Do not replace build 5; monitor review; physical SIWA smoke and distribution decision |

## Blockers

- VERIFIED: camera payload privacy relies on caller-provided arbitrary JSON and a keyword heuristic (`apps/api/src/camera-gateway/camera-gateway.dto.ts`).
- VERIFIED: `AuditEvent` is described as append-only but the database role can update/delete it; immutability is convention, not DB enforcement.
- VERIFIED: approval status has only requested/approved/rejected; no atomic claim,
  expiry or cancellation ownership protects concurrent execution.
- VERIFIED: the temporary absent-key compatibility path intentionally preserves
  one-shot behavior for installed clients; removal requires adoption telemetry.
- VERIFIED: remaining auth/customer writers still need one explicit shared-lock/P2002 contract audit.
- UNKNOWN: certified payment/fiscal providers, SMS/social credentials, object storage, alerts, camera/legal approval, physical devices/POS hardware and App Store review.

## Dissent

- INFERRED: Product can safely continue read-only catalog/support/owner insight experiments behind flags while P0 is being closed.
- INFERRED: Red Team opposes enabling any external AI/camera rollout until typed
  camera payloads, server-derived retention/privacy and processor/legal approval are resolved.

## Risks

- VERIFIED: historical release documents contain mixed build/status snapshots, so
  the recorded live ASC readback remains authoritative over prose documentation.
- VERIFIED: current dirty worktree can contaminate evidence unless each slice stages only owned files.
- INFERRED: separate Telegram and ERP AI registries will drift in tool policy, source attribution and spend limits.

## Action Plan

### Action: Close remaining security P0
- Owner: Security + Backend
- Priority: P0
- Dependencies: None
- Acceptance: camera payloads/retention are server-derived and typed; Event Ledger
  is DB-immutable; approvals have atomic ownership/expiry/cancel; all customer writers
  converge on canonical identity; production audit remains 0 high/critical.
- Rollback: keep camera ingest and approval-backed automation disabled behind kill switches.
- Kill criterion: metadata policy bypass, ledger rewrite, double execution or identity split remains.

### Action: Prove a clean release baseline
- Owner: QA + SRE + Release
- Priority: P0
- Dependencies: clean worktree and production-shaped environment
- Acceptance: two identical full gates on one SHA; strict readiness and live ASC readback recorded; no unclassified dirty files.
- Rollback: do not promote; retain current approved production images/builds.
- Kill criterion: flake, reconciliation mismatch, reviewer login failure or missing rollback evidence.

### Action: Roll out repaired customer and order contracts
- Owner: Backend + Mobile + Web
- Priority: P0
- Dependencies: commit `5aafc884`, additive migration and deployment telemetry
- Acceptance: deploy in order migration→compatibility API→Web/TG/staff/mobile;
  keyed traffic adoption is measured; no duplicate identity/order/payment appears;
  missing-key compatibility is removed only after the installed-client threshold is met.
- Rollback: disable affected guest customer/order creation, mobile checkout and staff buyback entry points;
  retain the verified Web/iOS paths without broadening guest capabilities.
- Kill criterion: any alias split, stranded retry, duplicate order/payment,
  unauthenticated order, capability leak or guest endpoint use from staff appears.

### Action: Enforce business truth boundaries
- Owner: Architecture + Database
- Priority: P0
- Dependencies: migration/role design
- Acceptance: runtime DB role cannot update/delete Event Ledger; every dangerous AI action remains domain-owned, idempotent, audited and approval-gated.
- Rollback: deploy compatible runtime role/trigger rollback while preserving ledger rows.
- Kill criterion: any direct AI money/stock/role mutation or ledger rewrite succeeds.

## Verification

- VERIFIED: API and Web production builds passed on 2026-08-05.
- VERIFIED: current guest identity gate passed 12/12 suites and 55/55 tests;
  Web retry/error contracts 5/5; mobile retry contract 1/1; mobile typecheck and
  production dependency audit passed.
- VERIFIED: isolated gates passed for auth/account 55/55, customer/support 13/13,
  POS/inventory/ledger 58/58, service/auth 33/33, auth/preflight/RBAC/outbox
  179/179 and authz/AI/camera 13/13.
- VERIFIED: `git diff --check` passed before documentation edits.
- UNKNOWN: full ecosystem, native physical and live external gates remain required.

## Deferred Questions

- UNKNOWN: Which fiscal/OFD and payment providers are contracted for Kyrgyzstan?
- UNKNOWN: Is Staff/Courier/POS distribution Public, Unlisted or Custom App?
- UNKNOWN: What legal basis and retention matrix apply to passports, support text, Telegram content and camera-derived evidence?
