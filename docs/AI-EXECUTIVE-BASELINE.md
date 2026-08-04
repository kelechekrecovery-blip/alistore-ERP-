# AliStore AI Executive OS — Phase 0 Baseline

Дата снимка: 2026-08-05
Git SHA: `c632b36e`
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
доказана как production-ready. Core API/Web builds и 192 targeted теста прошли,
однако остаются security/privacy defects, внешняя сертификация платежей,
фискализации, каналов, камер и устройств, а App Store evidence в репозитории
противоречиво. Следующая работа должна закрывать P0 reliability/security slices,
каждый отдельным проверяемым коммитом.

## Confidence

Level: high

Reason: вывод основан на текущем worktree, production builds, изолированных
PostgreSQL test runs, схеме/миграциях и независимых architecture/security/release
reviews. Live production credentials, реальные провайдеры, камеры, POS hardware и
актуальный App Store Connect readback в этом worktree отсутствуют, поэтому они не
считаются проверенными.

## Evidence

- VERIFIED: 151 Prisma models, 78 enums, 157 migrations, 72 API controllers, 62 Nest modules, 43 Web pages, 103 API spec files, 45 Playwright specs, 70 Swift files и 98 Kotlin files.
- VERIFIED: `npm run api:build` — PASS.
- VERIFIED: `npm run build -w @alistore/web` — PASS, 45 Next.js routes generated; storefront `no-store` fetch корректно оставил `/` dynamic.
- VERIFIED: isolated auth/preflight/RBAC/outbox run — 4 suites, 179/179 tests PASS.
- VERIFIED: isolated authz/AI/camera run — 3 suites, 13/13 tests PASS.
- VERIFIED: production dependency audit — 5 high, 0 critical (`ajv`, `brace-expansion`, `fast-uri`, `minimatch`, `socket.io-parser`).
- VERIFIED: worktree был dirty до Phase 0 docs; изменения iOS/Web/visual snapshots и незавершённый outbox slice не входят в этот documentation slice.
- UNKNOWN: полный API, полный Playwright, XCUITest/Android connected tests и live provider/device scenarios на этом SHA не запускались.

### Baseline matrix

Разрешённые статусы: `COMPLETE`, `PARTIAL`, `MISSING`, `BLOCKED_EXTERNAL`, `FAILED`.

| Область | Статус | Доказательство | Риск | Следующий шаг |
|---|---|---|---|---|
| Auth | PARTIAL | OTP/email/social/refresh/logout endpoints: `apps/api/src/auth/auth.controller.ts`; fail-closed method discovery: `apps/api/test/auth-methods.spec.ts`; targeted tests PASS | Боевой SMS/Apple/Telegram зависит от внешних credentials; customer auth события не нормализованы | Сертифицировать один production login path; добавить `auth.login` failure/success taxonomy и live clean-session E2E |
| Registration | PARTIAL | OTP создаёт/находит customer; social enrollment v2 существует; `auth-methods.spec.ts` доказывает, когда регистрация недоступна | В production без SMS social login не регистрирует нового клиента; `auth.signup` отсутствует | Выбрать authoritative signup path, добавить consent/version capture и E2E registration→logout→login |
| RBAC | PARTIAL | Casbin guard и серверная approval matrix; isolated RBAC/authz tests PASS | Требуемые AI-роли и canonical `manager` не существуют; один consent endpoint не rechecks active staff | Спроектировать AI capability roles; закрыть active-staff gap; прогнать deny matrix по всем опасным endpoints |
| Orders | PARTIAL | Transactional order creation/reservation/state machine, idempotency и ledger; Web checkout E2E specs существуют | Полный reconciled all-role E2E на текущем SHA не прогнан | Прогнать create→reserve→pay/COD→fulfill→return на isolated DB и cross-browser |
| Payments | BLOCKED_EXTERNAL | Provider-neutral ports, refund approvals, webhook/idempotency tests; `production-payment-gateway.provider.ts` fail-closed | Production gateway намеренно не активирован; фискальный чек отсутствует | Выбрать cash/COD pilot или сертифицированный provider; live signed webhook/refund reconciliation; OFD/KKM |
| Inventory | PARTIAL | IMEI/quantity locks, reservation, valuation, quarantine and ledger paths in API; inventory E2E specs существуют | Scanner/physical store flow и полный supply release gate не сертифицированы | Прогнать exact-once procurement→receipt→sale→return; physical scanner and stock-count UAT |
| Delivery | BLOCKED_EXTERNAL | Courier assignment, evidence, COD handover and offline queues implemented; courier E2E specs существуют | Live push/maps/camera/network and physical COD handover не сертифицированы | Physical-device run with offline restart, evidence upload, failure→redispatch and cash reconciliation |
| Support | PARTIAL | Customer/staff scoped support API and audited transitions; AI triage produces approval-backed draft | Web retry path может создать duplicate ticket; live WhatsApp/Telegram delivery external | Stable idempotency key for support create; channel certification; SLA and escalation E2E |
| AI | PARTIAL | Allowlisted read tools, owner/admin guard, kill switch, durable runs/steps/decisions and approval-backed triage; isolated AI tests PASS | `confidence=1` hard-coded; sourceRefs недостаточны; image URL resolver имеет SSRF risk; нет eval gate | Сначала SSRF fix; затем typed Executive response, real evidence refs, confidence policy and offline evals |
| Telegram | BLOCKED_EXTERNAL | Pairing/TOTP, webhook secret, idempotent inbox, revocation, retention and approvals implemented | Отдельный AI tool registry может дрейфовать от Control Plane; data processor/privacy approval и bot credentials отсутствуют | Перевести на shared orchestrator; data-minimization review; live webhook/pair/revoke E2E |
| Cameras | PARTIAL | Edge enrollment, hashed secrets, idempotent metadata ingest, global kill switch and retention purge; isolated camera tests PASS | `value` — arbitrary JSON; privacy label caller-controlled; нет EZVIZ/ONVIF/RTSP adapter, per-camera kill switch и legal decision | Typed per-event schemas, server-derived TTL/privacy, local gateway adapter and physical privacy UAT; face recognition запрещено |
| iOS | PARTIAL | 4 SwiftUI targets; build number `1.0.0 (6)`; store scripts/signing contracts tracked | Current worktree lacks ASC/signing env and physical test evidence | Re-run four builds/tests/UI, physical device smoke and strict live ASC readback on clean SHA |
| Web | PARTIAL | Production build PASS, 45 routes; 30 unit test files and 45 Playwright specs exist | Worktree contains unrelated uncommitted UI changes; full E2E not rerun | Separate/commit UI work, then full route audit, a11y, cross-browser and visual regression |
| E2E | PARTIAL | 192 targeted API tests PASS on isolated databases; comprehensive Playwright journeys exist | Targeted checks do not prove whole ecosystem; no repeated flake run on current SHA | Run full isolated API twice, full Playwright, reconciled ecosystem, native UI and failure injection |
| Security | FAILED | Fail-closed JWT/OTP/storage guards and secret scan controls exist | HIGH: AI image SSRF, incomplete PII export/delete, 5 high runtime dependency findings, camera metadata bypass; Event Ledger not DB-immutable | Close each HIGH as separate P0 slice with adversarial tests and independent security review |
| App Store | BLOCKED_EXTERNAL | Project at build 6; store/runbook scripts exist; repository documents older WAITING_FOR_REVIEW and newer rejection remediation | Repository evidence is stale/conflicting; Apple review, Unlisted distribution and reviewer login are external | Live ASC readback, reconcile status doc, clean-session reviewer login for all four apps; manual release only |

## Blockers

- VERIFIED: AI photo grading can fetch caller-controlled HTTP(S) URLs without a private/link-local/redirect allowlist (`apps/api/src/ai/llm/image-resolver.ts`).
- VERIFIED: account export/delete does not exhaustively cover retained free-text, social, Telegram and Evidence PII (`apps/api/src/customers/customers.service.ts`).
- VERIFIED: production npm audit reports 5 high vulnerabilities; Socket.IO parser is runtime reachable.
- VERIFIED: camera payload privacy relies on caller-provided arbitrary JSON and a keyword heuristic (`apps/api/src/camera-gateway/camera-gateway.dto.ts`).
- VERIFIED: `AuditEvent` is described as append-only but the database role can update/delete it; immutability is convention, not DB enforcement.
- UNKNOWN: certified payment/fiscal providers, SMS/social credentials, object storage, alerts, camera/legal approval, physical devices/POS hardware and App Store review.

## Dissent

- INFERRED: Product can safely continue read-only catalog/support/owner insight experiments behind flags while P0 is being closed.
- INFERRED: Red Team opposes enabling any external AI/camera rollout until SSRF, PII retention, typed camera payloads and processor/legal approval are resolved.

## Risks

- VERIFIED: documentation counts and App Store status files are stale or mutually inconsistent, so documentation alone cannot certify release state.
- VERIFIED: current dirty worktree can contaminate evidence unless each slice stages only owned files.
- INFERRED: separate Telegram and ERP AI registries will drift in tool policy, source attribution and spend limits.

## Action Plan

### Action: Close security P0
- Owner: Security + Backend
- Priority: P0
- Dependencies: None
- Acceptance: SSRF/private-network tests pass; production audit has 0 high/critical; PII export/delete fixtures are exhaustive; camera payloads are typed.
- Rollback: keep AI image grading, camera ingest and affected export/delete flows disabled behind kill switches.
- Kill criterion: any private IP fetch, untracked PII retention or high runtime CVE remains.

### Action: Prove a clean release baseline
- Owner: QA + SRE + Release
- Priority: P0
- Dependencies: clean worktree and production-shaped environment
- Acceptance: two identical full gates on one SHA; strict readiness and live ASC readback recorded; no unclassified dirty files.
- Rollback: do not promote; retain current approved production images/builds.
- Kill criterion: flake, reconciliation mismatch, reviewer login failure or missing rollback evidence.

### Action: Enforce business truth boundaries
- Owner: Architecture + Database
- Priority: P0
- Dependencies: migration/role design
- Acceptance: runtime DB role cannot update/delete Event Ledger; every dangerous AI action remains domain-owned, idempotent, audited and approval-gated.
- Rollback: deploy compatible runtime role/trigger rollback while preserving ledger rows.
- Kill criterion: any direct AI money/stock/role mutation or ledger rewrite succeeds.

## Verification

- VERIFIED: API and Web production builds passed on 2026-08-05.
- VERIFIED: 192 targeted tests passed on isolated PostgreSQL databases.
- VERIFIED: `git diff --check` passed before documentation edits.
- UNKNOWN: full ecosystem, native physical and live external gates remain required.

## Deferred Questions

- UNKNOWN: Which fiscal/OFD and payment providers are contracted for Kyrgyzstan?
- UNKNOWN: Is Staff/Courier/POS distribution Public, Unlisted or Custom App?
- UNKNOWN: What legal basis and retention matrix apply to passports, support text, Telegram content and camera-derived evidence?
