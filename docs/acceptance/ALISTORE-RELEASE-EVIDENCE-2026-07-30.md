# AliStore release-candidate evidence — 2026-07-30

## Decision

The implementation is a release candidate, but the repository is intentionally
`NOT_READY` for production cutover or public store release.

No production deployment, App Store submission, Google Play release, agreement
acceptance, credential entry, or external bot activation was performed.

## Implemented scope

- To-order and mixed-order web parity: availability, lead time, server-reconciled
  receivables, line progress, cancellation preview, and stable cancellation
  idempotency.
- Auth V2 hardening: purpose-bound OTP, email login/attachment, social
  enrollment, refresh rotation, Apple nonce verification, guarded review login,
  race-safe cleanup, and cross-tab logout/session recovery.
- Telegram support-agent safety: fail-closed feature controls, RBAC, redaction,
  prompt-injection rejection, bounded tools, audit, step-up/four-eyes approval,
  atomic ticket revisions, and idempotent execution.
- Stable native mutation intents for Android and iOS, including canonical
  handover operations and retry-safe command identities.
- Forward-only auth/support migrations, isolated Jest schemas, populated-schema
  upgrade validation, signed release evidence policy, and CI coverage.

## Verification evidence

| Gate | Result |
| --- | --- |
| API full Jest suite | PASS — 254 suites, 1574 tests |
| API TypeScript production build | PASS |
| Populated pre-supply migration upgrade | PASS |
| Web Vitest suite | PASS — 27 files, 163 tests |
| Web Next.js production build | PASS |
| Checkout + email-login Playwright journeys | PASS — 10 tests |
| Release-gate adversarial tests | PASS — 20 tests |
| iOS AliStoreClient tests | PASS — 164 tests |
| Android Java 17 unit/compile/lint gate | PASS |
| Secret scan | PASS; exposed Telegram token is not present in the workspace |
| Dependency vulnerability scan | PASS; no known findings |
| `git diff --check` | PASS |
| Final independent TypeScript review | APPROVE |
| Final holistic web review | APPROVE |

The Next.js build reports the expected dynamic-render notice for the storefront
route because it uses a `no-store` API fetch; compilation and type checking
complete successfully.

## Release blockers

1. The current worktree contains a large, uncommitted integration diff. The
   release gate requires two complete passes on the same clean commit.
2. Production certifications are not signed for payment/refund, SMTP/SMS,
   FCM/APNs, object storage, fiscal/OFD, monitoring, and POS hardware. Related
   capabilities must remain fail-closed.
3. The Telegram token exposed in conversation must be revoked in BotFather.
   A replacement may be provisioned only through the production secret channel,
   followed by webhook-secret rotation and event audit.
4. Production cutover and public store releases require a separate owner
   decision after the clean-commit gate and external certification evidence.

## Required release sequence

1. Review and split the integration diff into coherent commits without
   discarding pre-existing owner changes.
2. Revoke and rotate the Telegram credential outside Git.
3. Certify the required external systems and attach trusted signed evidence.
4. Run the complete release gate twice against the same clean commit.
5. Review the generated evidence artifact and explicitly authorize staging,
   production cutover, and store release as separate actions.
