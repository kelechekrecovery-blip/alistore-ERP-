# AliStore Engineering Constitution

## Core Principles

### I. Server-Authoritative Commerce
Money, tax, inventory, IMEI, approvals, refunds, fulfillment, and order status
are changed only by authenticated domain services. Clients never establish a
business fact by sending identity or terminal-state fields.

### II. Atomic Ledger-Backed Mutations
Every critical mutation is atomic with its Event Ledger and accounting or stock
records. PostgreSQL is business truth; Redis, Meilisearch, R2, caches, and
offline stores are rebuildable projections or delivery mechanisms.

### III. Identity, Ownership, and Replay Safety
Customer reads use JWT ownership or a short-lived entity/action-scoped guest
capability. Staff operations require an active staff JWT and server-side RBAC.
Every repeatable or offline mutation uses a stable Idempotency-Key, and webhook
signatures are verified from the raw request body.

### IV. Evidence Before Acceptance
A feature is accepted only after its strongest practical unit, integration,
E2E, security, accessibility, and visual gates run successfully. Missing design
references, credentials, physical devices, or provider certification remain
explicit external blockers and are never reported as completed.

### V. Handoff-Driven Product Quality
Functional contracts come from project documentation, Prisma, and API events.
Visual acceptance comes from the corresponding `design_handoff_alistore` file.
Generated UI may fill a documented gap but cannot silently replace an existing
reference or be presented as 1:1 acceptance.

## Delivery Constraints

- Preserve user and parallel changes; keep each vertical iteration bounded.
- Release builds fail on localhost, dev OTP, demo mode, sandbox providers, or
  missing mandatory production variables.
- AI produces recommendations only; domain services execute business changes.
- Render, Cloudflare, R2, and Sentry remain the launch platform until measured
  requirements justify a platform change.
- Secrets never enter Git, fixtures, screenshots, logs, or agent memory.

## Workflow and Gates

Each specification defines acceptance before implementation, includes failure
and permission states, identifies authorization/idempotency/Ledger behavior,
and names executable gates. A completed iteration updates `BACKLOG.md` and
`PROGRESS.md`, records evidence, and is committed independently when the shared
working tree allows a coherent commit.

## Governance

This constitution governs new Spec Kit artifacts. Existing architecture and
security decisions remain binding unless an explicit, reviewed migration
amends them. Any exception requires a written rationale, risk owner, expiry or
follow-up task, and a regression test where automation is possible.

**Version**: 1.0.0 | **Ratified**: 2026-07-21 | **Last Amended**: 2026-07-21
