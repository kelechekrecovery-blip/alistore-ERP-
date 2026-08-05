# Wave 1 baseline — 2026-08-05

## Scope

Storefront, identity, guest capability, checkout, and release-critical runtime evidence before adding new Wave 1 journeys.

## Worktree boundary

`git status --short` showed pre-existing user changes in catalog/settings modules (and additional concurrent edits); none were staged or reverted by this baseline task.

## Focused API contracts

Command:

```text
npm --prefix apps/api test -- --runInBand test/guest-capability.spec.ts test/token-type-boundary.e2e-spec.ts src/auth/otp-retention.e2e-spec.ts
```

Result: PASS — 3 suites, 11 tests.

## Storefront tests

Commands:

```text
npm test -w @alistore/web
npx playwright test e2e/checkout-consent.spec.ts e2e/web-checkout.spec.ts
```

Results: PASS — Vitest 30 files / 183 tests; Playwright 9 tests passed.

## Public runtime evidence

Command:

```text
WEB_BASE_URL=https://ali.kg API_BASE_URL=https://api.ali.kg node scripts/deployment-smoke.mjs
```

Result: PASS. Web health 200, checkout/cart `no-store`, API liveness/readiness 200, catalog 200 with items.

## Owner blockers

No code-level blocker observed in this baseline. Production release still depends on external owner credentials and approvals documented in `docs/LAUNCH-BLOCKERS.md` (Render deploy hooks, provider credentials, App Store submission access, and cache purge authority).

## Baseline commit

Captured from the Wave 1 execution branch; see Git history for the exact commit SHA.

