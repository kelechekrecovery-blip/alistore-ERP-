---
name: executing-plans
description: How to execute an approved plan in alistore-erp task-by-task with TDD and honest verification. Use after a plan is approved and you're implementing it. Triggers on "implement the plan, start coding, execute, build it now".
---

# Executing Plans (alistore-erp)

Work the plan one task at a time. Each task is a small RED→GREEN→verify cycle, not a
big-bang edit.

## Per-task loop

1. **RED** — write/extend the failing `*.spec.ts` the plan named; run it and confirm
   it fails for the right reason (see `test-driven-development`).
2. **GREEN** — minimum implementation to pass. Reuse existing services/helpers the
   plan referenced. Re-run the spec.
3. **REFACTOR** — remove duplication, keep the spec green.
4. **Verify the slice** — run `verification-before-completion` (at least `tsc` +
   the targeted specs) before moving on.

## Deviations

If reality contradicts the plan (a file/API isn't what the plan assumed, a step is
wrong), **stop and surface it** — don't silently improvise a different design. Adjust
the plan, then continue. Report what you skipped or couldn't verify, faithfully.

## Finishing a slice

- **One complete vertical slice = one commit** with a clean tree (repo convention,
  `docs/MASTER-ENGINEERING-PROMPT.md` DoD). Commit only when the user asks.
- Update the existing worklogs, not a new changelog: append to `PROGRESS.md`
  (Task / Result / Files changed), tick `BACKLOG.md`, update `docs/READINESS.md`
  if a handoff row changed.
- Optional review: dispatch `code-reviewer` (and `security-reviewer` for
  auth/payments/user-data/DB changes) before finishing.

## Repo facts

- Postgres (`alistore_test`) required for `apps/api` jest; no ESLint/Prettier —
  `tsc` is the static gate. Real gates: `npm run mvp:verify [-- --skip-e2e]`,
  `npm run ecosystem:audit`. See `CLAUDE.md` and `verification-before-completion`.
- The working tree may be edited concurrently by other tooling — check `git status`
  before assuming a failure is yours.
