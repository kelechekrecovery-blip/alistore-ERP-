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

_Last updated: 2026-08-06. The Apps list was read back live from App Store
Connect in the browser. All four `1.0.0` versions now show `REJECTED`. Opening
the detailed review messages required a fresh Apple sign-in, so the new rejection
text is not yet recorded here. Credentials and tokens are intentionally omitted._

## Builds in App Store Connect

| App | Build | Uploaded | Version state |
|---|---|---|---|
| AliStore KG | **5**, last verified attached to `1.0.0` on 2026-08-05 | resubmitted 2026-08-04 | `REJECTED` |
| AliStore Staff | **5**, last verified attached to `1.0.0` on 2026-08-05 | resubmitted before 2026-08-05 | `REJECTED` |
| AliStore Courier | **5**, last verified attached to `1.0.0` on 2026-08-05 | resubmitted before 2026-08-05 | `REJECTED` |
| AliStore POS | **5**, last verified attached to `1.0.0` on 2026-08-05 | resubmitted before 2026-08-05 | `REJECTED` |

The `Sign in with Apple` provisioning blocker that held the Client back is
resolved; Client was archived, exported and uploaded on 2026-07-25.
The repository is already at build 6. All four build-5 submissions are now
rejected. Do **not** upload build 6 or replace the attached builds until the
detailed rejection messages are read; a metadata/distribution rejection may not
require a replacement binary.

## Ready and verified

| Item | Evidence |
|---|---|
| Build attached | All four `1.0.0` versions resolved to build `5`, `processingState = VALID`, not expired, in the last strict readback on 2026-08-05 |
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

### 2026-08-05 release-gate evidence

- strict App Store Connect and signing preflight: PASS for all four apps;
- App Store metadata drift check on 2026-08-05: PASS; all four versions then read
  back as `WAITING_FOR_REVIEW`;
- API TypeScript build: PASS;
- review-readiness script tests: 19/19 PASS;
- review-login and DTO integration tests: 33/33 PASS;
- iOS unit/contract tests: 164/164 PASS;
- iOS UI E2E: 47/47 PASS (Client 28, Staff 11, Courier 3, POS 5);
- live build-5 reviewer login and role/readiness data: PASS for Client, Staff,
  Courier and POS on 2026-08-05. The login probe updates auth audit/session state,
  so it is not repeated as an unattended check.

### 2026-08-06 local rejection-response evidence

- all four privacy manifests pass `plutil -lint` and the repository privacy
  contract, including exact collected-data declarations and capability checks;
- Client, Staff, Courier and POS metadata schemas pass the unified store
  preflight against build 6 configuration;
- full simulator UI suite: **47/47 PASS** (Client 28, Staff 11, Courier 3,
  POS 5), with the `.xcresult` retained locally;
- the Staff inventory loading/error race found by the first full run was fixed,
  then passed targeted UI tests and the complete clean rerun;
- this evidence does not replace a physical-device Sign in with Apple check or
  the still-required readback of Apple's detailed rejection messages.

## Current App Review status — rejected

All four `1.0.0` versions were verified on 2026-08-05 in `WAITING_FOR_REVIEW`
with release type `AFTER_APPROVAL`. On 2026-08-06 the authenticated App Store
Connect Apps list showed all four versions as `REJECTED`. Do not resubmit,
replace build 5 or upload build 6 until the detailed review messages have been
read and mapped to code, metadata or distribution fixes.

The public catalog probe on 2026-07-28 returned `200`, `total: 4`, with all
four products reporting purchasable stock. That catalog result remains historical
evidence, not proof that the rejected submissions are now ready.

## Completed submission checklist (reference only)

The steps below describe how the current submissions were prepared. They are
retained for the current rejection response and a future version. Every mutable
field must be rechecked before resubmission.

### 1. Sign-in for the reviewer

**AliStore KG (Client)** signs in by phone and one-time code. Set these in the
API environment for the review window, then remove them afterwards — see
`docs/IOS-SUBMISSION.md`:

```
AUTH_REVIEW_PHONE=+996XXXXXXXXX     # dedicated pre-created synthetic account
AUTH_REVIEW_CUSTOMER_ID=<exact database customer id>
AUTH_REVIEW_OTP=123456               # exactly 6 digits
AUTH_REVIEW_UNTIL=<future ISO time, at most 7 days; generator uses 72 hours>
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

- **Build 5 is the rejected binary of record.** The strengthened build 6
  gate binds the fixed review OTP to `AUTH_REVIEW_CUSTOMER_ID`; deploying that
  backend change requires setting the matching server variable first. Do not
  deploy it blindly during review.
- **Fresh Sign in with Apple enrollment on a physical iPad is not yet proven.**
  A new Apple identity still reaches phone enrollment, which depends on the SMS
  channel. Build 5's fixed demo-account path was live-tested successfully; the
  separate fresh-SIWA path remains a manual device test.
- **Distribution method remains externally controlled.** Staff was read back as
  Public/Discoverable while the unlisted-distribution request status could not
  be verified. Staff, Courier and POS must not be presented as internal employee
  apps unless Apple approves Unlisted or the distribution strategy changes.
- **Privacy declaration follow-up for build 6.** Local manifests now declare the
  user-linked installation identifier as Device ID for all four apps, and POS
  declares Photos or Videos for exchange evidence. App Store Connect App Privacy
  answers must be updated to match before a future submission.

- **Business-app distribution for Staff, Courier and POS.** These are role-gated
  employee resources for AliStore. Their current metadata requests Unlisted
  distribution and does not claim a public multi-tenant SaaS model. Apple may
  still direct them to Apple Business Manager Custom Apps; that decision and
  the three Unlisted request states remain external.
- **Stale iPad screenshots — reviewed, deliberately kept.** Staff, Courier and POS
  ship as iPhone-only (`UIDeviceFamily = [1]`) since build 4, but their version
  localizations still carry `APP_IPAD_PRO_3GEN_11` and `APP_IPAD_PRO_3GEN_129` sets
  left over from the universal builds. App Store Connect follows the current
  build's device support and ignores them, so this does not block submission. The
  owner decided on 2026-07-26 to leave them in place — they cost nothing and are
  already there if these apps go universal again. Not an open task. Client is
  genuinely universal (`UIDeviceFamily = [1, 2]`) and its iPad sets are correct.
