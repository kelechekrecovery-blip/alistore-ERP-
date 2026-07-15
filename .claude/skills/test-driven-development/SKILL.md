---
name: test-driven-development
description: RED→GREEN→REFACTOR discipline for alistore-erp. Use BEFORE writing or changing any apps/api (NestJS) logic — write a failing *.spec.ts first, watch it fail, then implement the minimum to pass. Triggers on "add/change a service, endpoint, domain rule, bug fix, feature".
---

# Test-Driven Development (alistore-erp)

Write the test first. In this repo "define acceptance evidence before editing"
(`docs/MASTER-ENGINEERING-PROMPT.md`, Iteration loop) **is** the RED step.

## The loop

1. **RED — write a failing spec first.** Add/extend a `*.spec.ts` next to the code
   (`apps/api/test/*.spec.ts` or colocated `src/**/…spec.ts`). Encode the exact
   behavior you're about to build as an assertion. Then run just that spec and
   **watch it fail for the right reason** (assertion, not a typo/import error):

   ```bash
   cd apps/api && NODE_PATH=./node_modules npx jest --runInBand --testPathPattern <name>
   ```

2. **GREEN — minimum code to pass.** Implement the least code that makes the spec
   pass. No extra abstractions, no speculative options (YAGNI). Re-run the same spec.

3. **REFACTOR — clean up, tests stay green.** Remove duplication (DRY), rename for
   clarity, keep behavior identical. Re-run the spec after each change.

## Non-negotiable

- **Test before implementation.** If you catch yourself writing implementation
  before its test: **stop, set the implementation aside (or revert it), write the
  failing test first, then bring the implementation back to make it pass.** Code
  written before a test is untrusted until a red-then-green test covers it.
- **A test that never went red proves nothing.** Confirm RED before GREEN.
- **Match the testing pyramid** (`docs/MASTER-ENGINEERING-PROMPT.md`):
  domain unit (pure functions) → API integration (RBAC, IDOR, idempotency,
  concurrency, Event-Ledger atomicity, replay) → Playwright per role. Pick the
  lowest tier that captures the behavior.

## Repo facts

- **Postgres is required for `apps/api` jest** — `test/setup-db.ts` `beforeAll`
  connects and upserts. No DB → every spec errors at startup, not as an assertion.
  Ensure `alistore_test` exists and its schema is pushed (see `CLAUDE.md`).
- Jest picks up both `*.spec.ts` and `*.e2e-spec.ts` (`testRegex` in
  `apps/api/jest.config.js`); run serial (`--runInBand`) — suites share one DB.
- **No ESLint/Prettier, no coverage threshold.** The static gate is `tsc` — see
  `verification-before-completion`.
- Pure/domain logic (no Nest DI, no DB) can be unit-tested by constructing the
  function/class directly with mocks — prefer this tier; it needs no Postgres for
  the assertion (the global `setup-db` beforeAll still runs).

When the change is verified, run **verification-before-completion** before claiming done.
