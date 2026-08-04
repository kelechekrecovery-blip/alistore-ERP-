---
name: systematic-debugging
description: Four-phase root-cause debugging for alistore-erp. Use when something is broken, failing, flaky, or behaving wrong (a failing test, a 500, wrong data, a UI defect) — reproduce first, find the root cause, never patch a symptom blind. Triggers on "bug, broken, failing, error, doesn't work, unexpected, flaky".
---

# Systematic Debugging (alistore-erp)

Do **not** change code before you can reproduce the failure. Fix the root cause,
not the symptom.

## Phase 1 — Reproduce

Get a deterministic repro you can run on demand.
- Backend: a **minimal failing `*.spec.ts`** that triggers the bug
  (`cd apps/api && NODE_PATH=./node_modules npx jest --runInBand --testPathPattern <name>`).
  This becomes the regression test you keep.
- Web: drive the flow in the preview browser; capture the failing step,
  `read_console_messages`, and `read_network_requests`.
- If you can't reproduce it, you can't fix it — gather more signal first.

## Phase 2 — Isolate

Narrow to the smallest failing surface.
- Bisect: remove/mock inputs until the failure flips on/off — the boundary is the suspect.
- Read the evidence, don't guess: NestJS logs, Prisma query errors, and the
  **Event Ledger** (`AuditEvent` rows) — money/stock/status changes are recorded
  transactionally, so the ledger often shows exactly what happened and when.
- For data bugs, inspect the DB directly (`npm run db:studio -w @alistore/api`).

## Phase 3 — Root cause (not symptom)

State the actual cause in one sentence: "X happens because Y". If your explanation
is "add a null check / retry / try-catch" without knowing *why* the value is null or
the call fails, you've found a symptom. Keep going until the sentence names the real
defect (wrong query, missing invariant, race, stale cache, bad assumption).

## Phase 4 — Fix + verify

- Make the smallest change that addresses the root cause.
- **Re-run the exact repro from Phase 1** — it must now pass.
- Keep the repro as a regression test.
- Run **verification-before-completion** before claiming fixed.

## Repo notes

- Concurrency / idempotency / replay bugs are common here — reproduce them with
  integration specs (parallel calls, duplicate events) per the testing pyramid.
- `apps/api` jest needs a live Postgres (`alistore_test`); see `CLAUDE.md`.
