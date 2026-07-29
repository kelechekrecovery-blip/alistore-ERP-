# AliStore iOS ecosystem — App Store submission status

Public App Store scope confirmed by the owner on 2026-07-19:

| App | Public name | Bundle ID | App Store Connect ID |
|---|---|---|---|
| Customer store | **AliStore KG** | `kg.alistore.client` | `6792492229` |
| Staff | AliStore Staff | `kg.alistore.staff` | `6792488057` |
| Courier | AliStore Courier | `kg.alistore.courier` | `6792489244` |
| POS | AliStore POS | `kg.alistore.pos` | `6792489921` |

The original Client-only npm/store pipeline remains Client-only. Staff, Courier
and POS use the separate ecosystem metadata and screenshot scripts.

_Last updated: 2026-07-28. Every line below was read back from the App Store
Connect API or from the uploaded `.ipa` files themselves. Nothing here is
inferred from the repository — the previous revision of this file claimed build
`1.0.0 (2)` and "no review submission exists", and both were wrong._

## Builds in App Store Connect

| App | Build | Uploaded | Version state |
|---|---|---|---|
| AliStore KG | **4** `VALID`, attached to `1.0.0` | 2026-07-25 | `WAITING_FOR_REVIEW` |
| AliStore Staff | **4** `VALID`, attached to `1.0.0` | 2026-07-24 | `WAITING_FOR_REVIEW` |
| AliStore Courier | **4** `VALID`, attached to `1.0.0` | 2026-07-24 | `WAITING_FOR_REVIEW` |
| AliStore POS | **4** `VALID`, attached to `1.0.0` | 2026-07-24 | `WAITING_FOR_REVIEW` |

The `Sign in with Apple` provisioning blocker that held the Client back is
resolved; Client was archived, exported and uploaded on 2026-07-25.
**No rebuild and no re-upload is needed for any of the four** — everything still
open is App Store Connect metadata or owner input, not binary content.

## Ready and verified

| Item | Evidence |
|---|---|
| Build attached | All four `1.0.0` versions resolve to build `4`, `processingState = VALID`, not expired |
| Signing | All four archives signed `Apple Distribution: sarikov kamolidin (ZYU3F8W56P)` |
| Bundle IDs | Signed products resolve to the four expected `kg.alistore.*` identifiers |
| Export compliance | `ITSAppUsesNonExemptEncryption = false` in `project.yml` for all four targets; the build resource in ASC reports `usesNonExemptEncryption = false` |
| Privacy manifest | `PrivacyInfo.xcprivacy` present in the app bundle and in `AliStoreCore.framework`; `NSPrivacyTracking = false`, no tracking domains |
| Entitlements (Client) | `aps-environment = production`, `com.apple.developer.applesignin = Default`, `associated-domains = applinks:ali.kg`, `get-task-allow = false` |
| Transport security | `NSAppTransportSecurity` carries only `NSAllowsLocalNetworking`; no arbitrary-loads exception |
| Production API | The shipped Client binary carries `API_BASE_URL = https://api.ali.kg/api`, which answers `200` on `/health` |
| Primary category | Client `SHOPPING`; Staff, Courier and POS `BUSINESS` — applied 2026-07-26 by `scripts/apply-ios-store-metadata.mjs` |
| Content rights | Client `USES_THIRD_PARTY_CONTENT`; Staff, Courier and POS `DOES_NOT_USE_THIRD_PARTY_CONTENT` — applied in the same run |
| Drift guard | `store-preflight --strict-asc` now runs `apply-ios-store-metadata.mjs --check` and fails if App Store Connect stops matching the metadata files |
| Age rating | `FOUR_PLUS` for all four; `ageRatingDeclaration` present |
| Pricing | `appPriceSchedule` exists for all four with base territory `USA` and no manual price rows — i.e. free, as intended |
| Release type | `AFTER_APPROVAL` for all four versions |
| Localization | `ru` version localization for all four with description, keywords, support URL `https://ali.kg/support` and marketing URL `https://ali.kg` |
| App info | Name, subtitle and `privacyPolicyUrl = https://ali.kg/privacy` set for all four |
| Screenshots | Uploaded and `COMPLETE`: Client 10+10+10, Staff 4+4+4, Courier 3+3+3, POS 3+3+3 |
| Review URLs | `https://ali.kg/`, `/privacy`, `/support` and `https://api.ali.kg/api/health` all return `200` from outside the build machine |

## App Review submission completed

All four `1.0.0` versions are now in `WAITING_FOR_REVIEW` with release type
`AFTER_APPROVAL`. This live App Store Connect state proves that the versions
were attached and submitted; the earlier empty-submission blockers are no
longer current.

The public catalog probe on 2026-07-28 returned `200`, `total: 4`, with all
four products reporting purchasable stock. Do not replace build 4 while review
is pending unless Apple reports a binary defect.

## Completed submission checklist (reference only)

The steps below describe how the current submissions were prepared. They are
retained for a future version or a rejection response; they are not outstanding
actions for the four versions already waiting for review.

### 1. Sign-in for the reviewer

**AliStore KG (Client)** signs in by phone and one-time code. Set these in the
API environment for the review window, then remove them afterwards — see
`docs/IOS-SUBMISSION.md`:

```
AUTH_REVIEW_PHONE=+996XXXXXXXXX     # throwaway number, never a real customer
AUTH_REVIEW_OTP=Xy7Qw2              # 6 chars, mixed case
AUTH_REVIEW_UNTIL=2026-08-15T00:00:00Z
```

**Staff, Courier and POS do not use that mechanism.** It is customer-scoped
(`verifyOtp` upserts a `Customer`), and these three sign in through
`staff-auth/login` with a user name and a matching credential. Provision three
real employee accounts in the ERP, one per role — staff, courier, cashier — and:

- **switch two-factor off on each of them.** `staff-auth` supports per-account
  TOTP; if it is enabled the reviewer cannot get in.
- put the values into the Demo Account fields of each submission. Never commit
  them — the metadata validator rejects them in these files by design.

### 2. App Store Connect, per app

1. **App Review Information** → Sign-In required with the demo values above, plus
   contact first name, last name, email and phone.
2. **App Privacy** → answer and publish, using the privacy manifest as the basis.
3. **Pricing and availability** → the price schedule already reads as free; confirm
   it, and check the territory list. Territory availability could not be read with
   this API key (`appAvailabilityV2` returns 404), so it is the one required field
   nobody has verified from outside the web interface — look at it explicitly.
4. **Add for Review → Submit to App Review.**

App Review Notes for all four are prepared in the `*-metadata.json` files in this
directory and are ready to paste.

### 3. Review data in the ERP

**Storefront stock — scripted.** `scripts/seed-review-data.mjs` tops up existing
products through `POST /inventory/receive-quantity`, so each write goes through the
Event Ledger with an idempotency key and re-running it cannot double-receive
(verified against a disposable database: a second `--apply` left `onHand` at
exactly 3). It never invents products — a catalog that is merely small is reported,
not filled with fiction.

```bash
npm run review:seed -- --api-base https://api.ali.kg/api --location <branch>
```

That is a dry run and shows exactly what would change. To write:

```bash
ALISTORE_SEED_TOKEN=<staff token> npm run review:seed -- --api-base https://api.ali.kg/api --location <branch> --apply --yes-production
```

`--yes-production` is required for any non-local API. Use the real branch code for
`--location` — stock lands wherever you name, and a typo creates a phantom branch.
Credentials come from `ALISTORE_SEED_TOKEN`, or `ALISTORE_SEED_USERNAME` plus
`ALISTORE_SEED_SECRET`, never from the command line.

**Role objects — manual.** Seed one live object per role so each app shows its
declared workflow: an order in progress for Staff, an assigned delivery for
Courier, an open shift for POS. These depend on your real branches, couriers and
cashiers, so they are not scripted.

## Known risks that remain after submission

- **Guideline 4.2.1 for Staff, Courier and POS.** These are role-gated business
  apps. The App Review Notes now position them as a retail operations platform
  that any electronics store provisions accounts on, rather than the internal
  tooling of one company, but Apple may still direct them to Apple Business
  Manager Custom Apps. That call is Apple's.
- **Stale iPad screenshots — reviewed, deliberately kept.** Staff, Courier and POS
  ship as iPhone-only (`UIDeviceFamily = [1]`) since build 4, but their version
  localizations still carry `APP_IPAD_PRO_3GEN_11` and `APP_IPAD_PRO_3GEN_129` sets
  left over from the universal builds. App Store Connect follows the current
  build's device support and ignores them, so this does not block submission. The
  owner decided on 2026-07-26 to leave them in place — they cost nothing and are
  already there if these apps go universal again. Not an open task. Client is
  genuinely universal (`UIDeviceFamily = [1, 2]`) and its iPad sets are correct.
