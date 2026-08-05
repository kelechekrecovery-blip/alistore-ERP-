# AliStore AI Executive OS — Roadmap P0–P4

This roadmap is dependency-ordered. A phase is complete only when its acceptance
evidence is recorded against one clean Git SHA; implementation presence alone is
not completion.

## P0 — Reliability, security and release truth

Goal: make the current retail core safe, reproducible and honestly releasable.

| Slice | Owner | Dependencies | Acceptance | Rollback / kill criterion |
|---|---|---|---|---|
| P0.1 Clean baseline | QA/SRE | classify dirty worktree | two full identical gates on one SHA; build/test evidence attached | stop on any unclassified change or flaky mismatch |
| P0.2 AI image SSRF | Security/Backend | URL policy | private/link-local/loopback/redirect/DNS-rebinding cases rejected; bounded fetch | disable image grading on any internal-network reachability |
| P0.3 Runtime dependencies | Security/Platform | lockfile update | production audit 0 high/critical; Socket.IO malformed-packet guard | revert compatible lockfile; disable realtime if DoS remains |
| P0.4 PII lifecycle | Privacy/Backend | legal retention matrix | exhaustive export/delete fixtures for email/social/support/evidence/Telegram/free text | disable self-service “complete deletion” claim if retained data is unclassified |
| P0.5 Camera payload safety | Vision/Security | event schemas | typed allowlists, server-derived privacy/TTL, evidence retention binding, timestamp skew test | `EDGE_CAMERA_KILL_SWITCH=true` on any bypass |
| P0.6 Event Ledger immutability | Database/Architecture | runtime/test DB roles | runtime role cannot update/delete `AuditEvent`; migration/restore rehearsal passes | roll back role/trigger compatibly, never delete ledger rows |
| P0.7 Outbox claim/fencing | Backend/SRE | processing lease/fencing migration | concurrent workers deliver once before lease expiry; stale claimant cannot finalize; provider idempotency covers the crash window where supported; dead-letter visible | stop worker and preserve pending rows on unexplained duplicate delivery |
| P0.8 Auth/RBAC hardening | Security/Backend | role matrix | active-role recheck on all privileged routes; full deny matrix; login/signup events | disable affected endpoint on stale-token privilege success |
| P0.9 Approval lifecycle | Backend/Security | backward-compatible schema/API design | claim/expiry/cancel transitions, concurrent claim, stale approval and replay tests pass; current clients remain compatible | keep current requested/approved/rejected flow and disable new transitions on migration or concurrency failure |
| P0.10 Production providers | Owner/Finance/SRE | contracts/credentials | fiscal QR reconciles with tax cabinet; chosen payment/COD model and refunds reconcile | stop sale when fiscal/payment/COD truth diverges |
| P0.11 App Store truth | iOS/Release | live ASC + reviewer accounts | four clean-session logins, physical smoke, live status doc, manual release decision | hold release on rejection/login/device/distribution mismatch |

P0.7 rollout is not compatible with mixed relay versions: drain and stop legacy
relays, apply both additive migrations, deploy one homogeneous worker version,
then enable relay scheduling. Rollback first stops all relays and resets expired
and non-expired claims using
`apps/api/prisma/outbox-processing-rollback.sql` before starting legacy code; it
never runs old and new relay code concurrently. Claims below the attempt cap
become due, while an ambiguous final claim is parked for reconciliation.
Delivery remains at-least-once for providers without idempotency support; the
stable outbox ID is supplied to adapters. Novu consumes it as an idempotency key
and transaction ID; SMTP uses it only as a correlation `Message-ID`, not as a
duplicate-delivery guarantee.

P0 exit gate:

- full isolated API twice, Web unit/build/full Playwright/cross-browser/a11y;
- four iOS builds/tests/UI plus Android build/unit/lint/connected tests;
- migration rehearsal, backup restore, alert delivery and rollback drill;
- strict production readiness with external blockers either certified or explicitly
  disabled by the approved launch model;
- zero unresolved HIGH/CRITICAL security findings.

## P1 — Metrics and Owner Cockpit

Goal: one source-backed operational picture for the owner.

Deliverables:

1. Implement the canonical taxonomy in `AI-EVENT-TAXONOMY.md` with versioned
   producers and compatibility projections.
2. Data-quality service: missing refs, unknown event types, late events,
   duplicates, projection lag and reconciliation invariants.
3. Owner Cockpit facts: net sales, margin, refunds, COD, stockout, aging stock,
   delivery SLA, support SLA, approval queue, worker/channel health.
4. Every metric exposes definition, time window, freshness and evidence link.
5. AI Executive read-only response validates the required contract and uses real
   evidence refs/confidence method.
6. Daily briefing remains draft-only until owner approves its delivery channel.

Acceptance:

- dashboard totals reconcile with domain tables and ledger fixtures;
- numeric AI claims resolve to evidence and fail closed on stale/missing data;
- owner can drill from recommendation to source rows/events;
- cockpit works in degraded mode when AI/search/Redis is unavailable.

## P2 — AI Agents and approval-safe execution

Goal: composable agents that improve work without bypassing domain authority.

Agents:

- Owner Executive — prioritized daily risks/opportunities;
- Catalog Factory — description/spec/SEO/cross-sell drafts;
- Support Triage — category, priority, SLA and reply draft;
- Reorder Advisor — stockout/aging/lead-time recommendation;
- Price Scout — market evidence and margin-safe suggestion;
- Service/Warranty Copilot — diagnosis checklist and next action;
- Finance Reconciliation Copilot — explains variances, never closes periods.

Platform work:

- shared actor/surface-aware orchestrator for ERP and Telegram;
- AI capability roles from `AI-ROLE-MATRIX.md`;
- typed tools, structured output, prompt injection isolation;
- model/prompt/eval registry, reference datasets and regression thresholds;
- cost/rate/tool budgets and per-agent kill switches;
- draft→approval→deterministic domain executor trace;
- production monitoring for quality, abstention, spend and rollback.

Acceptance:

- AI cannot mutate money/stock/status/role/public content directly;
- adversarial prompts cannot escape tool/resource scope;
- eval thresholds and human acceptance metrics are versioned;
- approved command replay is idempotent and fully ledger-backed.

## P3 — Telegram and local camera gateway

Goal: safe operational channels and privacy-preserving physical-store signals.

Telegram:

- consolidate reads/drafts onto shared Control Plane;
- keep TOTP pairing, revocation fence and customer self-scope;
- consent/disclosure and processor/data-residency decision;
- verified webhook, delivery, retry, retention and unlink E2E;
- mass/legal messages remain approval-gated.

Camera edge:

- local EZVIZ/ONVIF/RTSP adapter and encrypted device registry;
- edge inference produces typed minimal events only;
- queue, shelf-empty, offline/tamper and safety incident review tasks;
- global/store/device/event/model kill switches;
- private short-lived evidence clips only when legally approved;
- no face recognition, audio recording, emotion inference or employee scoring.

Acceptance:

- physical pilot with clock skew/network loss/reconnect/replay tests;
- zero raw video/audio/identifier leakage into Postgres/logs/AI provider;
- retention purge deletes both metadata and bound evidence on schedule;
- camera event never changes stock/staff status without reviewed domain command.

## P4 — Digital twin, franchise and agent marketplace

Goal: scale verified operations across stores without fragmenting truth.

Deliverables:

- store digital twin of inventory, demand, staff capacity, delivery and service;
- forecast/simulation separated from actual ledger facts;
- franchise/store tenancy, scoped roles, configuration and benchmarking;
- agent registry with owner, version, tools, datasets, budget, evals, rollout and
  revocation metadata;
- internal marketplace approval before an agent can access a new tool/domain;
- synthetic scenario testing and shadow comparison before store activation.

Acceptance:

- strict store/tenant isolation and data-minimized benchmarking;
- simulations cannot post actual commands;
- every agent has an owner, budget, eval, kill switch and rollback;
- franchise-wide rollout is canary-based and reversible per store;
- accounting/inventory/legal truth remains in the same domain APIs and Event Ledger.

## Operating cadence for every slice

1. Evidence audit and explicit acceptance gate.
2. One bounded implementation.
3. Unit, integration, E2E and failure tests proportional to risk.
4. Security review and independent code review.
5. Stage only owned files; commit with one purpose.
6. Record actual commands/results, risks, blockers, rollback and next slice.
