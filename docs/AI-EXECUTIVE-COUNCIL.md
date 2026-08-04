# Council Decision

## Scope

Mode: standard

AliStore Phase 0 production readiness across architecture, product and retail
operations, security/privacy, reliability/E2E and App Store release. PostgreSQL
and the Event Ledger remain the sources of business truth. The detailed evidence
matrix is in `docs/AI-EXECUTIVE-BASELINE.md`.

## Decision

Status: REVISE

Summary: AliStore has a substantial locally verified foundation, but it is not proven
production-ready. P0 security, privacy, dependency, payment/fiscal, full-gate and
external release evidence must be closed before rollout.

## Confidence

Level: high

Reason: The decision is based on repository inventory, production API/Web builds, 192
targeted isolated tests, schema and migration review, and independent architecture,
security and product/release reviews. Live providers, physical devices, cameras,
POS hardware and App Store Connect were unavailable and remain explicitly unknown.

## Evidence

- VERIFIED: Repository inventory found 151 Prisma models, 78 enums, 157 migrations, 72 API controllers, 62 Nest modules, 43 Web pages, 103 API spec files, 45 Playwright specs, 70 Swift files and 98 Kotlin files.
- VERIFIED: `npm run api:build` passed on 2026-08-05.
- VERIFIED: `npm run build -w @alistore/web` passed and generated 45 Next.js routes on 2026-08-05.
- VERIFIED: Four isolated auth, preflight, RBAC and outbox suites passed 179 of 179 tests.
- VERIFIED: Three isolated authorization, AI and camera suites passed 13 of 13 tests.
- VERIFIED: Production dependency audit reported 5 high and 0 critical vulnerabilities.
- VERIFIED: The worktree was dirty before this documentation slice; unrelated iOS, Web, snapshot and outbox changes are excluded from its commit.
- UNKNOWN: Full API, full Playwright, native UI, physical device and live provider scenarios were not run on this SHA.

## Blockers

- VERIFIED: AI photo grading can fetch caller-controlled HTTP(S) URLs without enforcing private, link-local and redirect destination restrictions.
- VERIFIED: Account export and deletion do not exhaustively cover retained social, Telegram, evidence and free-text PII.
- VERIFIED: Production dependencies contain five high vulnerabilities, including a runtime-reachable Socket.IO parser issue.
- VERIFIED: Camera metadata accepts arbitrary caller-labeled JSON and lacks server-derived privacy and retention enforcement.
- VERIFIED: Event Ledger immutability is a convention because the runtime database role can update or delete audit rows.
- UNKNOWN: Payment and fiscal providers, production credentials, alerts, legal camera approval, physical hardware and live App Store review state are external or unavailable.

## Dissent

- INFERRED: Product work may continue only for bounded read-only experiments behind flags while P0 blockers are closed.
- INFERRED: Red Team opposes external AI or camera rollout until SSRF, PII retention, typed camera payload and legal/data-processor controls are resolved.

## Risks

- VERIFIED: Repository App Store status documents are stale or mutually inconsistent and cannot certify release state.
- VERIFIED: The pre-existing dirty worktree can contaminate evidence unless each slice stages only owned files.
- INFERRED: Separate Telegram and ERP AI tool registries can drift in authorization, attribution and spend policy.

## Action Plan

### Action: Close security P0
- Owner: Security + Backend
- Priority: P0
- Dependencies: None
- Acceptance: SSRF adversarial tests pass, production audit has zero high or critical findings, PII lifecycle fixtures are exhaustive and camera payloads are typed.
- Rollback: Keep AI image grading, affected PII flows and camera ingest disabled behind kill switches.
- Kill criterion: Any private-network fetch, untracked PII retention or high runtime vulnerability remains.

### Action: Prove a clean release baseline
- Owner: QA + SRE + Release
- Priority: P0
- Dependencies: Clean worktree and production-shaped environment
- Acceptance: Two identical full gates pass on one SHA, strict readiness and live App Store Connect readback are recorded, and no dirty files are unclassified.
- Rollback: Do not promote and retain current approved production images and builds.
- Kill criterion: Any flake, reconciliation mismatch, reviewer login failure or missing rollback evidence remains.

### Action: Enforce business truth boundaries
- Owner: Architecture + Database
- Priority: P0
- Dependencies: Migration and runtime role design
- Acceptance: The runtime database role cannot rewrite Event Ledger rows and every dangerous AI action remains domain-owned, idempotent, audited and approval-gated.
- Rollback: Deploy a compatible runtime-role or trigger rollback while preserving ledger rows.
- Kill criterion: Any direct AI money, stock or role mutation or Event Ledger rewrite succeeds.

## Verification

- VERIFIED: API and Web production builds passed on 2026-08-05.
- VERIFIED: A total of 192 targeted tests passed on isolated PostgreSQL databases.
- VERIFIED: The council report validator and secret scanner are required before commit.
- UNKNOWN: Full ecosystem, native physical-device and live external gates remain required.

## Deferred Questions

- UNKNOWN: Which fiscal, OFD and payment providers are contracted for Kyrgyzstan?
- UNKNOWN: Are Staff, Courier and POS distributed as Public, Unlisted or Custom Apps?
- UNKNOWN: What legal basis and retention matrix apply to passport data, support text, Telegram content and camera-derived evidence?
