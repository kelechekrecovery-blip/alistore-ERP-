# AliStore release readiness — 2026-07-28

## Decision

The four iOS applications are submitted and waiting for Apple review. The
repository builds and its automated business suites pass. Google Play and the
backend production cutover are **not** ready for public release because required
provider credentials and production Firebase configurations are absent.

The owner subsequently deferred further publication work. Current engineering
continues locally; production deploys and cutovers remain paused.

No review login, password, OTP, API key, or signing password is recorded in this
document.

## Verified release state

| Surface | Evidence | Result |
|---|---|---|
| App Store Connect | Live API readback | Client, Staff, Courier and POS `1.0.0 (4)` are `WAITING_FOR_REVIEW`; release type `AFTER_APPROVAL`; uploaded builds are `VALID` |
| iOS metadata/signing | `store-preflight.sh --strict-asc --strict-signing` | All four bundle IDs, metadata records, production APNs entitlements, Apple Distribution identity and App Store profiles pass |
| iOS build | Xcode simulator build | Client, Staff, Courier and POS schemes build |
| iOS unit/contract tests | `AliStoreCoreTests` | 147 passed, 0 failed |
| iOS UI tests | Four isolated Xcode UI targets | Client 27/27, Staff 11/11, Courier 3/3 and POS 5/5; 46 passed, 0 failed |
| iOS lint | Project SwiftLint gate | Pass; 0 error-level findings, 229 warning-level findings remain |
| Web production build | Next.js production build | Pass |
| Web E2E | Playwright, Chromium, one worker | 141 passed, 0 failed |
| API production build | TypeScript/Nest build | Pass |
| API isolated suite | Dedicated cloned PostgreSQL test database | 235 suites and 1,384 tests passed |
| Android debug | Four application modules | Client, Staff, Courier and POS build; unit tests and `lintDebug` pass |
| Android Data Safety | Four store declarations | Pass |
| Dependency security | OSV Scanner and npm audit | No known issue; npm audit reports 0 vulnerabilities |
| Secret scan | Gitleaks | No leak found |
| Public smoke | `ali.kg` and `api.ali.kg` | Site, catalog, privacy, API live/ready and catalog return HTTP 200 |
| Public stock | Production catalog | 4 products returned; 4 purchasable |

The monolithic iOS UI scheme exceeds the five-minute tool-call limit, so the
same four test targets were executed independently and the Client target was
split into bounded batches. All 46 selected tests executed and passed; zero-test
selector runs were discarded rather than counted. The SwiftLint gate is green
with no error-level findings. Its remaining 229 warning-level findings are
tracked quality debt, not build failures.

## Changes made in this release pass

1. App Store metadata verification can inspect submitted read-only app records
   while apply mode remains restricted to editable records.
2. App Store status documentation now reflects the live
   `WAITING_FOR_REVIEW` state.
3. Vulnerable `brace-expansion`, `postcss` and `sharp` resolutions were moved to
   patched versions and both dependency scanners were rerun.
4. Cloudflare D1 databases, R2 buckets and outbox queues were provisioned for
   staging/review/production foundation work. Migrations and an isolated restore
   drill succeeded.
5. Staging and review Workers were deployed. Unmigrated routes fail closed with
   `ROUTE_NOT_MIGRATED`.
6. Android release Firebase checks now apply only to the module being built.
   A POS build no longer fails because Client/Staff/Courier Firebase files are
   absent.
7. The two E2E checks that were unstable under concurrent native-test load now
   verify the authoritative API response and allow the dev server's on-demand
   route compilation to complete. The subsequent full 141-test run passed.
8. Three obsolete local `.env.bak*` credential copies were moved to macOS Trash.
9. All 68 error-level SwiftLint findings were removed or given narrowly
   documented legacy exemptions. An unsafe forced cast in the shared API client
   was replaced with a checked conversion.
10. The checked-in API LaunchAgent now always sets `NODE_ENV=production`.
    `npm run launch:activate:api` runs strict production and external readiness,
    builds the API and validates the plist before it can touch launchd. Contract
    tests prove a failed gate performs no launchd or filesystem mutation.
11. Cloudflare health coverage now includes `/api/health`, `/live` and `/ready`
    with the same public success payload as NestJS. Failure responses no longer
    expose missing binding names. The updated Worker was deployed to staging and
    review; production routing remains detached.
12. The Cloudflare release gate now compares exact Worker coverage against all
    379 NestJS contracts. It correctly reports `3/379` instead of treating any
    third route as a complete migration. API base validation is phase-aware:
    clients stay on `api.ali.kg` until an explicit production route cutover.
13. Actionable production Swift warnings for forced unwraps, optional data
    conversions and Swift 6 actor isolation were removed. All four iOS schemes
    rebuild without compiler warnings and the 147-test core suite still passes.
14. A local-only maintainability pass removed identifier, statement-position,
    trailing-comma, parameter-count and checkout-complexity findings. Checkout
    validation/order creation were split into explicit operations, fixture
    builders now use typed configurations, and all four XCTest UI classes are
    main-actor isolated. The affected UI scenarios pass without compiler
    diagnostics.

## Android release artifact

The local upload key is stored outside the repository and its password is stored
in macOS Keychain. The generated artifact is:

`apps/android/pos/build/outputs/bundle/release/pos-release.aab`

- Version: `1.0.0 (1)`
- API base: `https://api.ali.kg/api`
- Size: approximately 16 MB
- SHA-256:
  `cb8b059eea3756efb57a9e852543137863519904e80e954093c9c7ac29021c1b`
- Signature verification: `jar verified`

Before the first Play upload, create an encrypted offline backup of the upload
keystore and enroll the applications in Play App Signing.

Client, Staff and Courier release AABs intentionally fail closed until the real
production files are supplied:

- `apps/android/app/google-services.json`
- `apps/android/staff/google-services.json`
- `apps/android/courier/google-services.json`

The backend also needs the matching FCM service account and physical-device push
certification. Placeholder Firebase files are not acceptable.

## Backend production blockers

`launch:check` remains blocked with four runtime items:

1. Transactional SMTP: `SMTP_HOST` and verified `SMTP_FROM`.
2. Critical Telegram alert delivery: bot token and alert chat.
3. Durable outbox relay must be enabled with real delivery channels.
4. Private S3/R2 media storage credentials and bucket configuration.

External readiness also remains blocked for production SMS, payment acquiring,
fiscal/OFD, Telegram/WhatsApp, Android FCM, POS hardware, S3 media and
observability certification.

The current `api.ali.kg` legacy process still exposes `/api/metrics` without a
Bearer token. The current source protects metrics in production, but the live
launchd process was started without `NODE_ENV=production` and cannot be safely
restarted in production mode until the four strict preflight items above are
real. The safe activation command currently refuses before touching the live
process, as designed. Treat the current public backend as a review/demo contour,
not a certified production launch.

## Cloudflare migration track

Cloudflare is a separate future runtime migration, not the activation path for
the current `api.ali.kg` NestJS release. Production Worker routing remains
deliberately detached:

- 3 of 379 API contracts are migrated;
- the active client base correctly remains on the legacy host until cutover;
- the Cloudflare account cron limit is already reached, so staging temporarily
  owns AliStore's only scheduled Worker trigger;
- production traffic must not cut over until the complete API contract matrix,
  data migration, reconciliation and rollback rehearsal pass.

This does not block hardening the existing NestJS production contour. It does
block attaching `ali.kg/api/*` to the incomplete Worker.

## Owner/external actions

1. Leave all four Apple review accounts active while the versions are
   `WAITING_FOR_REVIEW`. After review completes, remove `AUTH_REVIEW_*` and
   deactivate the review users.
2. Provide the three production Firebase client files and the matching backend
   service account through the secret channel.
3. Back up the Android upload keystore, enroll Play App Signing, then upload the
   signed AABs to the correct Play Console application records.
4. Supply and certify SMTP, SMS, payment, fiscal, alerting, media and monitoring
   providers.
5. Keep the Cloudflare production route detached. Complete its route/data
   migration only before choosing that separate runtime cutover.
