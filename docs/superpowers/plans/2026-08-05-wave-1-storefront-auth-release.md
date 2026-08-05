# Wave 1 Storefront, Identity and Release-Critical UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and harden AliStore’s storefront, guest checkout, phone OTP identity, social enrollment boundaries and release-critical web behavior.

**Architecture:** Keep PostgreSQL/Event Ledger authoritative. The web client may collect checkout state, but the API issues scoped guest capabilities, validates ownership, creates idempotent orders and controls payment state. Interactive HTML is never cached across Next build IDs; provider-dependent actions fail closed.

**Tech Stack:** Next.js 16 App Router, React, NestJS, Prisma/PostgreSQL, Playwright, Jest, Vitest, npm, GitHub Actions, Render and Cloudflare.

## Global Constraints

- Never commit credentials, OTP codes, provider contracts or customer records.
- Guest capabilities are signed, short-lived, scope-limited and entity-bound; never accept one as a bearer access token.
- Payment, SMS, OFD, push and media providers remain fail-closed until live evidence exists.
- PostgreSQL and the Event Ledger remain truth; clients cannot assert payment, inventory, approval or identity state.
- Preserve the four unrelated working-tree edits in `apps/api/src/catalog/catalog.service.ts`, `apps/api/src/catalog/installments.spec.ts`, `apps/api/src/catalog/installments.ts` and `apps/api/src/settings/settings.registry.ts`.
- Every task ends with its focused test, review and a separate commit containing only that task’s files.

---

### Task 1: Establish the Wave 1 evidence baseline

**Files:**
- Read: `docs/superpowers/specs/2026-08-05-alistore-full-audit-design.md`
- Read: `apps/web/app/login/page.tsx`, `apps/web/app/checkout/page.tsx`, `apps/web/lib/auth.tsx`
- Read: `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/guest-capability.ts`, `apps/api/src/customers/customers.controller.ts`, `apps/api/src/orders/orders.controller.ts`
- Test: existing `e2e/web-checkout.spec.ts`, `e2e/checkout-consent.spec.ts`, `apps/api/test/guest-capability.spec.ts`, `apps/api/test/token-type-boundary.e2e-spec.ts`

**Interfaces:**
- Consumes: current production code and disposable PostgreSQL test database.
- Produces: a dated baseline in `docs/acceptance/wave-1-baseline-2026-08-05.md` containing exact commands, pass/fail results, current live cache evidence and owner blockers.

- [ ] **Step 1: Confirm the worktree boundary**

Run:

```bash
git status --short
git diff --name-only
```

Expected: only the four pre-existing catalog/settings files are modified before this plan begins; do not stage them.

- [ ] **Step 2: Run the focused API contracts**

Run:

```bash
npm --prefix apps/api test -- --runInBand \
  test/guest-capability.spec.ts \
  test/token-type-boundary.e2e-spec.ts \
  src/auth/otp-retention.e2e-spec.ts
```

Expected: all selected suites pass; any failure becomes a named implementation task rather than an edited expectation.

- [ ] **Step 3: Run the focused storefront tests**

Run:

```bash
npm test -w @alistore/web
npx playwright test e2e/checkout-consent.spec.ts e2e/web-checkout.spec.ts
```

Expected: Vitest passes and checkout journeys complete against the disposable E2E database.

- [ ] **Step 4: Record public runtime evidence**

Run:

```bash
WEB_BASE_URL=https://ali.kg API_BASE_URL=https://api.ali.kg node scripts/deployment-smoke.mjs
```

Expected: health/catalog checks pass; if `/checkout` reports `s-maxage=31536000`, record `BLOCKED_OWNER` for deploy/cache purge and do not weaken the smoke gate.

- [ ] **Step 5: Write and commit the baseline**

Create the evidence file with command output summaries, test counts, live URLs, commit SHA and blockers. Run `git diff --check`, then:

```bash
git add docs/acceptance/wave-1-baseline-2026-08-05.md
git commit -m "docs(acceptance): record wave 1 baseline"
```

### Task 2: Add browser regression coverage for login and registration boundaries

**Files:**
- Create: `e2e/auth-login.spec.ts`
- Read/modify only if a failing test identifies a defect: `apps/web/app/login/page.tsx`, `apps/web/lib/auth.tsx`
- Test support: `e2e/helpers.ts`, `apps/api/.env`, `apps/api/src/auth/auth.service.ts`

**Interfaces:**
- Consumes: `/login`, `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/recovery/request` and the existing review/dev OTP contract.
- Produces: deterministic browser evidence that invalid input is rejected, a valid challenge advances to code entry, and guest continuation does not create an authenticated session.

- [ ] **Step 1: Write failing tests for invalid phone and guest continuation**

```ts
import { expect, test } from '@playwright/test';

test('login rejects an empty phone without an API request', async ({ page }) => {
  let otpRequests = 0;
  await page.route('**/auth/otp/request', async (route) => {
    otpRequests += 1;
    await route.continue();
  });
  await page.goto('/login');
  await page.getByRole('button', { name: /Получить код/i }).click();
  await expect(page.getByText(/корректный номер/i)).toBeVisible();
  expect(otpRequests).toBe(0);
});

test('guest continuation returns to storefront without an access token', async ({ page }) => {
  await page.goto('/login?next=%2Fcart');
  await page.getByRole('button', { name: /Продолжить как гость/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('alistore.auth.v1'))).toBeNull();
});
```

- [ ] **Step 2: Run only the new tests and capture the failure**

Run:

```bash
npx playwright test e2e/auth-login.spec.ts
```

Expected: the new tests fail only if the current selectors or behavior are wrong; do not increase timeouts to hide a real failure.

- [ ] **Step 3: Implement the smallest production fix**

Use the existing `useAuth` and page validation conventions. Preserve `/login?next=...` allowlisting, keep OTP request buttons disabled/validated before network calls, and keep guest continuation unauthenticated. Do not add a client-side OTP fallback.

- [ ] **Step 4: Re-run focused web/API tests**

```bash
npx playwright test e2e/auth-login.spec.ts
npm test -w @alistore/web
npm --prefix apps/api test -- --runInBand test/auth-methods.spec.ts test/auth-throttle.e2e-spec.ts
```

Expected: all pass with no changed security assertions.

- [ ] **Step 5: Commit**

```bash
git add e2e/auth-login.spec.ts apps/web/app/login/page.tsx apps/web/lib/auth.tsx
git commit -m "test(auth): cover login and guest boundaries"
```

### Task 3: Prove guest checkout navigation, capability propagation and fail-closed payment

**Files:**
- Create or modify: `e2e/guest-checkout-navigation.spec.ts`
- Read/modify only if a test fails: `apps/web/app/cart/page.tsx`, `apps/web/app/checkout/page.tsx`, `apps/web/lib/api/orders.ts`, `apps/web/lib/guest-order-access.ts`
- API contract tests: `apps/api/test/guest-capability.spec.ts`, `apps/api/test/payments-auth-regression.spec.ts`

**Interfaces:**
- Consumes: cart localStorage contract, `/checkout`, `/customers`, `/orders`, signed `x-guest-capability`, and guest order status/receipt routes.
- Produces: a browser regression covering catalog → cart → checkout → consent → order status, plus negative assertions for missing/tampered capability and unavailable online payment.

- [ ] **Step 1: Write the navigation regression**

The test must seed one product in the disposable database, add it through the real catalog UI, click the `/cart` checkout link, assert the URL becomes `/checkout`, and assert the first checkout step is visible. It must collect `pageerror` and failed responses and fail if a Next chunk returns 404 or a MIME mismatch.

```ts
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', (response) => {
  if (response.url().includes('/_next/static/') && response.status() >= 400) chunkFailures.push(response.url());
});
await page.getByRole('link', { name: 'Перейти к оформлению' }).click();
await expect(page).toHaveURL(/\/checkout$/);
await expect(page.getByText('Способ получения')).toBeVisible();
expect(chunkFailures).toEqual([]);
expect(errors.filter((message) => /ChunkLoadError|MIME/i.test(message))).toEqual([]);
```

- [ ] **Step 2: Add capability negative assertions**

Extend the API test only if coverage is absent: missing capability returns `401 guest_capability_required`; order-scoped capability for another order returns `403 guest_capability_entity_mismatch`; a guest capability in `Authorization: Bearer` cannot access customer data.

- [ ] **Step 3: Verify provider fail-closed UI**

Run the checkout E2E with production-like `PAYMENT_PROVIDER=none` and assert the card/QR action is disabled or shows `online_payments_unavailable`, while cash/pickup remains explicit and auditable. Never enable sandbox confirmation in production configuration.

- [ ] **Step 4: Run focused gates and commit**

```bash
npx playwright test e2e/guest-checkout-navigation.spec.ts e2e/checkout-consent.spec.ts
npm --prefix apps/api test -- --runInBand test/guest-capability.spec.ts test/payments-auth-regression.spec.ts
git add e2e/guest-checkout-navigation.spec.ts apps/web/app/cart/page.tsx apps/web/app/checkout/page.tsx apps/web/lib/api/orders.ts apps/web/lib/guest-order-access.ts
git commit -m "test(checkout): cover guest navigation and capability boundaries"
```

### Task 4: Verify HTML cache/build-id and release metadata gates

**Files:**
- Read: `apps/web/next.config.mjs`, `scripts/deployment-smoke.mjs`, `docs/PRODUCTION-ACTIVATION.md`
- Test: relevant `scripts/__tests__/` smoke tests; `apps/ios/scripts/store-preflight.sh`; `scripts/verify-ios-review-readiness.mjs`
- Evidence: `docs/acceptance/wave-1-release-evidence-2026-08-05.md`

**Interfaces:**
- Consumes: local Next production build, local `next start`, public `ali.kg`/`api.ali.kg`, App Store Connect credentials already configured outside Git.
- Produces: reproducible cache-policy evidence and four-app iOS review readiness evidence.

- [ ] **Step 1: Build and inspect local headers**

```bash
npm run build -w @alistore/web
npm run start -w @alistore/web -- -p 3100
WEB_BASE_URL=http://127.0.0.1:3100 API_BASE_URL=https://api.ali.kg node scripts/deployment-smoke.mjs
```

Expected: `/checkout` and `/cart` return `no-store`; `/api/runtime-config` retains its intentional public cache policy; the smoke passes. Stop the local server after the check.

- [ ] **Step 2: Run iOS release gates**

```bash
npm run ios:store-preflight -- --env-file apps/ios/.env.production --strict-asc --strict-signing
npm run ios:review-readiness -- --env-file apps/ios/.env.production
```

Expected: all four bundle IDs, metadata, signing profiles and read-only reviewer journeys pass.

- [ ] **Step 3: Record external deployment state**

Record the GitHub CD run URL, migration rehearsal result, deploy job result and live cache headers. If Render hooks are missing, write exact `BLOCKED_OWNER` entries instead of claiming release completion.

- [ ] **Step 4: Commit evidence**

```bash
git add docs/acceptance/wave-1-release-evidence-2026-08-05.md
git commit -m "docs(acceptance): record wave 1 release evidence"
```

### Task 5: Wave 1 integration gate and handoff

**Files:**
- Read: all Wave 1 task outputs and commits.
- Create: `docs/acceptance/wave-1-final-2026-08-05.md`

**Interfaces:**
- Consumes: task evidence, GitHub CD status, public smoke, focused API/Web/E2E results.
- Produces: a commit-linked evidence summary that either marks Wave 1 `PASS` or lists each remaining `BLOCKED_OWNER`/`BLOCKED_ENGINEERING` item and starts the Wave 2 plan.

- [ ] **Step 1: Run the combined Wave 1 gate**

```bash
npm test -w @alistore/web
npm run security:dependencies
npm run security:secrets
npx playwright test e2e/auth-login.spec.ts e2e/guest-checkout-navigation.spec.ts e2e/checkout-consent.spec.ts
npm --prefix apps/api test -- --runInBand test/guest-capability.spec.ts test/token-type-boundary.e2e-spec.ts test/payments-auth-regression.spec.ts
```

- [ ] **Step 2: Verify no unrelated files are staged**

```bash
git diff --cached --name-only
git status --short
git diff --check
```

Expected: only the intended Wave 1 task files are in each commit; the four pre-existing catalog/settings edits remain untouched.

- [ ] **Step 3: Write the final evidence summary**

Include commit SHAs, exact command results, live URLs, screenshots/artifact paths when available, and owner blockers with the next action and acceptance criterion.

- [ ] **Step 4: Commit and review**

```bash
git add docs/acceptance/wave-1-final-2026-08-05.md
git commit -m "docs(acceptance): close wave 1 audit gate"
```

After this gate, create a separate Wave 2 plan; do not combine money/inventory changes with the auth/storefront commits.
