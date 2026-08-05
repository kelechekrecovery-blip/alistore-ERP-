# AliStore AI Executive OS — Phase 0 Baseline

Дата снимка: 2026-08-05
Git SHA evidence through: `702885b8`
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
production dependency HIGH, guest identity response-loss, mobile/TG retry,
staff checkout contracts и destructive-DML Event Ledger trigger закрыты
проверяемыми slices. Остаются camera, database-role/Event Ledger,
approval security gaps, а также внешняя сертификация платежей,
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

- VERIFIED: 151 Prisma models, 78 enums, 162 migrations, 72 API controllers, 62 Nest modules, 43 Web pages, 103 API spec files, 45 Playwright specs, 70 Swift files и 98 Kotlin files.
- VERIFIED: `npm run api:build` — PASS.
- VERIFIED: `npm run build -w @alistore/web` — PASS, 45 Next.js routes generated; storefront `no-store` fetch корректно оставил `/` dynamic.
- VERIFIED: isolated auth/preflight/RBAC/outbox run — 4 suites, 179/179 tests PASS.
- VERIFIED: isolated authz/AI/camera run — 3 suites, 13/13 tests PASS.
- VERIFIED: auth/account release gate — 5 suites, 55/55 tests PASS (OTP,
  recovery, refresh replay/theft, social enrollment, staff sessions, export/delete).
- VERIFIED: commits `c6638eeb` and `e0c7ec5e` make deletion an immediate
  credential boundary: stale HTTP/WebSocket-handshake JWTs fail, refresh and
  login issuance serialize with deletion, address/profile/consent writes cannot
  cross the deletion commit, and established customer realtime delivery is
  fenced from staff delivery. Focused isolated gate: 9 suites, 127/127 PASS.
- VERIFIED: commit `3deb64f5` fences email attach, social identity/replay
  artifacts and push-token ownership from account deletion. Migration purges or
  minimizes historical PII, SMTP cancellation destroys the owned socket, and
  social completion follows Customer → SocialEnrollment → OTP. API build PASS;
  focused isolated gate: 6 suites, 68/68 PASS.
- VERIFIED: commit `df091d72` serializes fresh and idempotent order creation
  with account deletion before slot, promotion, loyalty, receivable, outbox and
  ledger effects; customer and guest order gate: 2 suites, 18/18 PASS.
- VERIFIED: commit `1d218422` fences trade-in passport, cash, accounting,
  outbox and ledger writes from deletion; persisted payout mode closes
  self-service/staff cross-mode replay. Fresh 161-migration rehearsal and
  customer/RBAC/buyback gate: 3 suites, 13/13 PASS.
- VERIFIED: commit `8b526833` fences customer/guest evidence retention and
  replay from account deletion. A deletion that wins after object storage leaves
  no `EvidenceUpload` or ledger event and removes or durably schedules cleanup
  of the object; API build and evidence gate: 4 suites, 18/18 PASS. Independent
  code, TypeScript and security/privacy reviews APPROVE.
- VERIFIED: commit `2260d217` fences customer return creation and replay from
  account deletion, requires idempotency on both HTTP aliases, prevents
  cross-owner replay, and persists a canonical request hash. Historical keyed
  rows fail closed through migration backfill + DB CHECK; staff reconciliation
  remains independent. Fresh 162-migration rehearsal, API build and return gate:
  5 suites, 56/56 PASS; code, TypeScript and security reviews APPROVE.
- VERIFIED: commit `5d4f3bb6` fences customer supply-order cancellation,
  refund allocation, receivable, supply, ledger and outbox mutations from
  account deletion across fast replay, main transaction and unique fallback.
  API build and cancellation gate: 2 suites, 28/28 PASS; independent code,
  TypeScript and security reviews APPROVE.
- VERIFIED: commit `702885b8` fences customer/guest gift-card replay,
  fulfillment and debit with Customer → Order → GiftCard ordering. Deletion
  between fulfillment and debit leaves the pre-deletion reservation but no card
  debit, Payment or accounting entry; verified provider continuation remains
  available after tombstone. API build and payment gate: 5 suites, 40/40 PASS;
  code, TypeScript and security reviews APPROVE.
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
- VERIFIED: commit `3152221e` installs an unconditional PostgreSQL statement
  trigger that rejects `AuditEvent` UPDATE, DELETE and TRUNCATE with SQLSTATE
  55000 while preserving INSERT/compensating INSERT.
- VERIFIED: fresh-schema migration probe, direct migrated-DB tamper probes and
  ledger/invariant/POS/reports regression 33/33 PASS; architecture, database and
  adversarial security reviews APPROVE the bounded trigger slice.
- VERIFIED: commit `49da1956` separates owner/migrator, runtime and backup DB
  credentials in code; API/worker startup rejects owner/elevated roles and any
  role that can mutate `AuditEvent`, backup independently requires SELECT-only
  access, and migrations run before a commit-bound Render deploy with
  environment-scoped secrets.
- VERIFIED: disposable PostgreSQL 16 rehearsal applied all 159 migrations,
  removed seeded broad grants, enforced SQLSTATE 55000 owner tamper probes,
  proved fail-closed future runtime defaults and completed a read-only custom
  `pg_dump`; ACL/Render unit 12/12, focused guards/backup 32/32, API build and YAML PASS.
- VERIFIED: commit `ea5be1c9` switches only identity-verified Render services to
  the intended API pool, worker direct and backup read-only URLs before an
  exact-SHA deploy; wrong/swapped hooks and partial credential updates fail closed.
- VERIFIED: commit `16596bca` removes direct/manual production-CD bypasses:
  only a successful same-repository push CI on the current allowed `main`/`master` branch can release
  its exact SHA. The branch head is reverified at migration, Render mutation,
  every deploy hook/poll and immediately before accepting `live`; superseded
  handoffs cancel accepted deploys and incomplete cancellation fails loudly.
  Workflow/Render contract tests 18/18, YAML parse and independent code/security
  reviews PASS.
- VERIFIED: production dependency audit — 0 vulnerabilities after compatible
  per-consumer resolution; legacy glob/coverage and Socket.IO runtime tests PASS.
- VERIFIED: iOS unit/contract 164/164 and UI E2E 47/47 PASS across Client,
  Staff, Courier and POS; all four App Store versions read back WAITING_FOR_REVIEW.
- VERIFIED: every completed Phase 0 slice is committed separately; the worktree
  was clean before starting the CI-certified production-release slice.
- UNKNOWN: полный API, полный Playwright, XCUITest/Android connected tests и live provider/device scenarios на этом SHA не запускались.

### Baseline matrix

Разрешённые статусы: `COMPLETE`, `PARTIAL`, `MISSING`, `BLOCKED_EXTERNAL`, `FAILED`.

| Область | Статус | Доказательство | Риск | Следующий шаг |
|---|---|---|---|---|
| Auth | PARTIAL | 127/127 auth/customer/realtime gate plus 68/68 email/social/push privacy gate PASS; stale credentials, OTP/refresh issuance, profile writes, owned identity artifacts and local realtime are deletion-fenced | Боевой SMS/Apple/Telegram, fresh-device SIWA, remaining customer-domain writers and multi-replica realtime depend on further code/external evidence | Fence remaining customer-domain mutations; physical iPad fresh enrollment and production SMS clean-session E2E; normalize auth events |
| Registration | PARTIAL | OTP and social enrollment converge on canonical customer identity; plus/no-plus/legacy/concurrency tests PASS | Production signup still depends on SMS; consent/version capture at signup is incomplete | Physical registration→logout→login test; persist consent/policy versions |
| RBAC | PARTIAL | Casbin guard и серверная approval matrix; isolated RBAC/authz tests PASS | Требуемые AI-роли и canonical `manager` не существуют; approval lifecycle не имеет claim/expiry/cancel ownership; один consent endpoint не rechecks active staff | Спроектировать AI capability roles; добавить claim/expiry/cancel и concurrency tests; закрыть active-staff gap; прогнать deny matrix |
| Orders | PARTIAL | Transactional order creation/reservation/state machine and ledger; order creation, supply cancellation, return creation/replay and gift-card debit are deletion-fenced; cancellation financial/supply effects are atomic; return replay is owner-bound and request-hashed | Online payment-intent lifecycle still needs a durable external-side-effect fence; full create→reserve→pay/COD→fulfill→return ecosystem and installed-client adoption are not yet proven | Build durable payment-intent lifecycle; then full money/reconciliation E2E before removing missing-key compatibility |
| Payments | BLOCKED_EXTERNAL | Customer/guest gift-card fulfillment/replay/debit is lifecycle-fenced; provider-neutral ports, refund approvals, webhook/idempotency tests exist; payment gate 40/40 PASS; `production-payment-gateway.provider.ts` fail-closed | Online intent command can still lose an external provider success before durable finalization; production gateway intentionally inactive; fiscal receipt absent | Implement durable intent claim/result/reconcile/cancel state machine; choose certified provider; live signed webhook/refund reconciliation; OFD/KKM |
| Inventory | PARTIAL | IMEI/quantity locks, reservation, valuation, quarantine and ledger paths in API; POS/inventory 58/58 and service/auth 33/33 gates PASS | Scanner/physical store flow and complete supply reconciliation are not certified | Exact-once procurement→receipt→sale→repair/return; physical scanner and stock-count UAT |
| Delivery | BLOCKED_EXTERNAL | Courier assignment, deletion-fenced evidence retention, COD handover and offline queues implemented; courier E2E specs существуют | Live push/maps/camera/network and physical COD handover не сертифицированы | Physical-device run with offline restart, evidence upload, failure→redispatch and cash reconciliation |
| Support | PARTIAL | Auth and guest create are atomic/idempotent; customer evidence retention/replay is deletion-fenced with compensating object cleanup; canonical/legacy ownership, concurrent replay and expiry tests PASS | Support creation itself still needs a transaction lifecycle fence; live WhatsApp/Telegram delivery remains external | Fence customer support creation, then channel certification plus SLA/escalation/failure E2E |
| AI | PARTIAL | Allowlisted read tools, owner/admin guard, kill switch, durable runs/steps/decisions, approval-backed triage and hardened image URL resolver | `confidence=1` hard-coded; sourceRefs insufficient; no complete eval gate | Typed Executive response, real evidence refs, confidence policy and offline evals |
| Telegram | BLOCKED_EXTERNAL | Pairing/TOTP, webhook secret, idempotent inbox, revocation, retention and approvals implemented | Отдельный AI tool registry может дрейфовать от Control Plane; data processor/privacy approval и bot credentials отсутствуют | Перевести на shared orchestrator; data-minimization review; live webhook/pair/revoke E2E |
| Cameras | PARTIAL | Edge enrollment, hashed secrets, idempotent metadata ingest, global kill switch and retention purge; isolated camera tests PASS | `value` — arbitrary JSON; privacy label caller-controlled; нет EZVIZ/ONVIF/RTSP adapter, per-camera kill switch и legal decision | Typed per-event schemas, server-derived TTL/privacy, local gateway adapter and physical privacy UAT; face recognition запрещено |
| iOS | PARTIAL | 4 SwiftUI targets at repository build 6; unit/contract 164/164, UI 47/47 and strict signing/metadata preflight PASS | Pending ASC submissions use build 5; fresh physical-device SIWA is unverified | Do not replace build 5 while under review; physical-device auth smoke and post-review readback |
| Web | PARTIAL | Production build PASS, 45 routes; guest checkout/TG/trade-in terminal errors and retry attempts have 5/5 focused contract tests; 45 Playwright specs exist | Worktree contains unrelated uncommitted UI changes; full E2E not rerun | Separate/commit UI work, then full route audit, a11y, cross-browser and visual regression |
| E2E | PARTIAL | Current auth/customer/realtime gates 127/127 and 68/68 PASS; payment 40/40, cancellations 28/28, returns 56/56, evidence deletion/cleanup 18/18, guest identity/RBAC/deletion 55/55, POS/inventory/ledger 58/58 and service/auth 33/33 gates PASS | Targeted checks do not prove the whole ecosystem; multi-replica realtime, full Playwright and native-device flows remain unverified | Run full isolated API twice, full Playwright, reconciled ecosystem, native UI, Redis multi-replica and failure injection |
| Security | PARTIAL | JWT/OTP/storage guards, production audit 0; customer evidence objects cannot survive a tombstone-first retention race; PostgreSQL trigger + startup/cron guards separate owner/runtime/backup capabilities; ACL/pg_dump rehearsals and independent reviews APPROVE | Role split is not yet applied in live Render; private runners/protected environments, staging JWT rotation and restore drill lack live evidence; forged/missing events and approval/camera risks remain | Provision credentials/runners in safe order, rotate staging JWT, run staging→production CD and restore drill; then close authenticity, camera and approval lifecycle |
| App Store | BLOCKED_EXTERNAL | All four `1.0.0` build-5 versions verified WAITING_FOR_REVIEW; strict signing/metadata preflight and reviewer logins PASS; iOS UI 47/47 | Apple review, Unlisted distribution and fresh physical-iPad SIWA remain external | Do not replace build 5; monitor review; physical SIWA smoke and distribution decision |

## Blockers

- VERIFIED: camera payload privacy relies on caller-provided arbitrary JSON and a keyword heuristic (`apps/api/src/camera-gateway/camera-gateway.dto.ts`).
- VERIFIED: code now rejects an owner/elevated Render runtime and enforces a
  separate SELECT-only backup identity; the currently deployed credentials have
  not been rotated, so live credential isolation and restore evidence remain open.
- BLOCKED_EXTERNAL: protected runners `alistore-render-db-staging` and
  `alistore-render-db-production`, GitHub environments/secrets, safe Render
  credential switchover and invalidation of sessions signed by the previously
  tracked staging JWT must be completed by the owner.
- VERIFIED: approval status has only requested/approved/rejected; no atomic claim,
  expiry or cancellation ownership protects concurrent execution.
- VERIFIED: the temporary absent-key compatibility path intentionally preserves
  one-shot behavior for installed clients; removal requires adoption telemetry.
- VERIFIED: profile/address/settings/consent, order creation, trade-in and
  return creation and evidence-retention writers are fenced from account deletion,
  but support, warranty, B2B, protection and payment customer writers still need the
  same explicit transaction-boundary audit.
- VERIFIED: generic customer notification enqueue/relay is not yet linearized
  with deletion; pending real-phone outbox rows require a separate cancellation,
  redaction and delivery-time lifecycle fence.
- BLOCKED_EXTERNAL: realtime now fails closed without a bound Socket.IO server
  and protects local established sockets; multi-replica rooms, worker emission
  and cluster disconnect still require a Redis adapter/emitter and staging topology proof.
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
  trigger and runtime ACL prevent destructive DML; approvals have atomic ownership/expiry/cancel; all customer writers
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
- VERIFIED: Event Ledger trigger migration/tamper probe passed; focused
  ledger/invariant/POS/reports gate passed 4/4 suites and 33/33 tests.
- VERIFIED: credential-split gate passed 159 migrations on disposable PostgreSQL
  16, exact runtime/backup ACL probes, future-default probes and read-only
  `pg_dump`; Node 12/12, focused Jest 32/32, API build and YAML parse passed.
- VERIFIED: isolated gates passed for auth/account 55/55, customer/support 13/13,
  POS/inventory/ledger 58/58, service/auth 33/33, auth/preflight/RBAC/outbox
  179/179 and authz/AI/camera 13/13.
- VERIFIED: evidence lifecycle gate passed 4/4 suites and 18/18 tests after an
  API build; deletion-before-retention left no DB/ledger/file artifact.
- VERIFIED: return lifecycle gate passed fresh 162 migrations, API build, 5/5
  suites and 56/56 tests, including tombstone races, legacy fail-closed replay
  and successful staff continuation.
- VERIFIED: cancellation lifecycle gate passed API build, 2/2 suites and 28/28
  tests, including tombstone-first zero-effects and post-delete replay rejection.
- VERIFIED: gift-card lifecycle gate passed API build, 5/5 suites and 40/40
  tests, including deletion-before-debit, deletion after fulfill, tombstoned
  replay and verified provider continuation.
- VERIFIED: `git diff --check` passed before documentation edits.
- UNKNOWN: full ecosystem, native physical and live external gates remain required.

## Deferred Questions

- UNKNOWN: Which fiscal/OFD and payment providers are contracted for Kyrgyzstan?
- UNKNOWN: Is Staff/Courier/POS distribution Public, Unlisted or Custom App?
- UNKNOWN: What legal basis and retention matrix apply to passports, support text, Telegram content and camera-derived evidence?
