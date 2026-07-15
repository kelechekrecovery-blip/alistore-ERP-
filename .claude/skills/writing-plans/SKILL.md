---
name: writing-plans
description: How to write an implementation plan for alistore-erp before coding. Use when starting a non-trivial feature, refactor, or multi-step change — produce a plan a careful junior with no taste or context could execute exactly. Triggers on "plan, design, how should we build, before I start coding".
---

# Writing Plans (alistore-erp)

A plan is done when a careful junior **with no taste and no context** could execute
it without guessing. If a step needs judgment you didn't write down, the plan isn't
finished.

## Principles

- **One vertical slice.** Plan one complete, shippable slice (migration → domain →
  API → UI → tests), not a horizontal layer across many features. Mirrors the
  Iteration loop in `docs/MASTER-ENGINEERING-PROMPT.md`.
- **Acceptance evidence first.** Before any edit, state what proves it works — the
  exact failing test(s) or the observable behavior. This is the RED step (see
  `test-driven-development`).
- **Migrations & invariants first.** Schema/Prisma migration and the invariant it
  protects come before the code that relies on them.
- **TDD-first.** Each task names its test before its implementation.
- **YAGNI / DRY.** Only what the slice needs; reuse existing services/helpers —
  name them with file paths. No speculative options or abstractions.
- **Name concrete files & functions.** "Update `products.service.ts:createReview`
  to call `ModerationService.moderate`" — not "add moderation somewhere". Never
  "and so on".

## Shape of a good plan

1. **Context** — why, what problem, intended outcome.
2. **Tasks** — ordered, each: files to touch (exact paths), the reused
   functions/utilities, the failing test that defines "done", the minimal change.
3. **Verification** — the real gates to run (defer to `verification-before-completion`).
4. **Files** — created vs modified; what is explicitly *not* touched.

## Repo facts to respect

- No ESLint/Prettier; the static gate is `tsc`. Tests need a live Postgres
  (`alistore_test`). See `CLAUDE.md`.
- Point verification at existing gates (`scripts/mvp-verify.mjs`, `ecosystem:audit`,
  CI) — don't invent new ones.
- Record outcomes in `PROGRESS.md` / `BACKLOG.md` / `docs/READINESS.md` (existing
  convention), not a new changelog.

Hand off to `executing-plans` once the plan is approved.
