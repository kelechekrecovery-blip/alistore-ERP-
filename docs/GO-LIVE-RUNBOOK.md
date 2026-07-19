# AliStore — Go-Live Runbook

Turnkey commands for the full ecosystem release. Prepared 2026-07-19. Everything an
agent could do is committed; the steps below need owner credentials/approval (Render,
Apple, prod DB) and are copy-paste ready. Tracked checklist: see the release-plan artifact.

Branch ready to ship: **`claude/storefront-upgrade`** (off `origin/main`, tsc-clean) —
prod API-base self-heal + a11y + 18-product photo catalog + hero/benefits + device renders.

---

## Phase 0 — Storefront go-live (ali.kg)

### 1. Merge the branch
Open + merge the PR (recommended — keeps clean history vs the concurrent Codex branch):
`https://github.com/kelechekrecovery-blip/alistore-ERP-/pull/new/claude/storefront-upgrade`

> Note: pushing to `main` triggers the staging CD (`.github/workflows/cd-staging.yml`)
> and Render auto-deploy on connected branches. Production stays a **manual** approval.

### 2. Render deploy (owner)
- In the Render **web** service env, set: `NEXT_PUBLIC_API_BASE=https://api.ali.kg/api`
  (belt-and-suspenders; `apps/web/lib/api/http.ts` also self-heals from the origin).
- Deploy `apps/web` and `apps/api`; approve the production deploy.

### 3. Populate the prod catalog (owner — needs prod DATABASE_URL)
```bash
DATABASE_URL="<PROD_DATABASE_URL>" npm run db:seed -w @alistore/api
```
This upserts 18 products (+ 2 IMEI units each) and a published storefront revision
(hero + benefits). Alternatively add products/collections via the ERP CMS.
Real product photos: drop files into `apps/web/public/products/` and point each
product's `attrs.imageUrl` in `apps/api/prisma/seed.ts` (or via ERP).

### 4. Verify (agent can run on request, once prod is up)
```bash
npx playwright test --config playwright.prod-smoke.config.ts
```
Expect: catalog populated, no `localhost:4000` calls, `/catalog`+`/privacy` = 200,
no ≤389px header overflow.

---

## Phase 2 — Live providers (for real transactions)
Set these in the Render api service env (owner secrets); `docs/READINESS.md` gates 🟡:
- Payment gateway prod keys · SMS/OTP provider · APNs production certs.
- Optional AI: `AI_PROVIDER_KEY` + `AI_MODEL` (keyless rules-fallback works without).

---

## Phase 3 — iOS App Store (Client `kg.alistore.client`)
Engineering complete (v1.0.0, iPad screenshots, orientations, /privacy+/support,
credential-free preflight). Remaining, per `apps/ios/store/release-runbook.md`:
1. Fill `apps/ios/.env.production` — `DEVELOPMENT_TEAM`, `ASC_KEY_ID` + `AuthKey_<KEYID>.p8`, `ASC_ISSUER_ID`.
2. Create the App Store Connect record (`kg.alistore.client`, ru-KG, Shopping) + review demo account.
3. `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run ios:store-preflight -- --env-file apps/ios/.env.production --strict-asc --strict-signing`
4. Archive → upload → submit (per the iOS runbook).
Staff / Courier / POS → TestFlight or Apple Business Manager (internal).

---

## Rollback
Render → service → Events → **Rollback** on the previous successful deploy
(re-runs `prisma migrate deploy`, a no-op on an already-migrated DB). Never reverse a
data-bearing migration during an image rollback — ship a forward migration instead.
