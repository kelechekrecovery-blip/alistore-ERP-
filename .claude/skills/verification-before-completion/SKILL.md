---
name: verification-before-completion
description: The real verification gates for alistore-erp — run these before claiming any change done. Use whenever you're about to say "done / fixed / it works". Triggers on "verify, done, finished, ready, is it working, before commit".
---

# Verification Before Completion (alistore-erp)

Don't claim done until you've run the real gates and read the output. Report failures
with the actual output; if a step was skipped (e.g. no Postgres), say so.

## Order (cheap → full)

1. **Typecheck (the static gate — no ESLint/Prettier exist):**
   ```bash
   npx tsc --noEmit -p apps/api/tsconfig.json
   npx tsc --noEmit -p apps/web/tsconfig.json
   ```
   The working tree may be edited concurrently — `git status` first; ignore errors
   in files you didn't touch, but confirm **your** files are clean.

2. **Targeted tests (needs live Postgres `alistore_test`):**
   ```bash
   cd apps/api && NODE_PATH=./node_modules npx jest --runInBand --testPathPattern <name>
   ```
   Run the specs covering your change; then the full API gate if the slice is done:
   `npm run api:test`.

3. **Build (what CI builds):** `npm run api:build` (`tsc -p tsconfig.build.json`),
   `npm run build -w @alistore/web`.

4. **Release gate:** `npm run mvp:verify -- --skip-e2e` (fast) or `npm run mvp:verify`
   (full: schema validate → generate → builds → mobile typecheck → test-DB reset →
   API jest → Playwright e2e → readiness). `npm run ecosystem:audit` for the
   acceptance contract / dirty-tree check.

## Preconditions & caveats (don't get surprised)

- **Postgres is mandatory** for `apps/api` jest and Playwright e2e (both connect to
  `localhost:5432`). No DB → they fail at startup, not as assertions. See `CLAUDE.md`
  for the one-time `prisma db push` to the test DB.
- `mvp:verify` **throws if `TEST_DATABASE_URL` is unset** and refuses to reset a DB
  whose name doesn't contain "test" — safety rails, respect them.
- **External-readiness is non-blocking.** A green `mvp:verify` ≠ launch-ready — many
  `docs/READINESS.md` rows are 🟡 (payment gateway, AI key, POS hardware, push).
  Use `-- --strict-external` for a release check.
- Sandbox/offline: without Postgres (and Xcode/Android for `ecosystem:verify`) these
  gates can't run — verify what you can (`tsc`, pure-logic specs) and state the rest
  as unverified.

Authoritative "what must pass": CI `.github/workflows/ci.yml`
(prisma generate → migrate deploy → api:build → web build → `api:test` → `e2e`).
