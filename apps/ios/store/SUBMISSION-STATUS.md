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

_Last updated: 2026-07-26. Every line below was read back from the App Store
Connect API or from the uploaded `.ipa` files themselves. Nothing here is
inferred from the repository — the previous revision of this file claimed build
`1.0.0 (2)` and "no review submission exists", and both were wrong._

## Builds in App Store Connect

| App | Build | Uploaded | Version state |
|---|---|---|---|
| AliStore KG | **4** `VALID`, attached to `1.0.0` | 2026-07-25 | `PREPARE_FOR_SUBMISSION` |
| AliStore Staff | **4** `VALID`, attached to `1.0.0` | 2026-07-24 | `PREPARE_FOR_SUBMISSION` |
| AliStore Courier | **4** `VALID`, attached to `1.0.0` | 2026-07-24 | `PREPARE_FOR_SUBMISSION` |
| AliStore POS | **4** `VALID`, attached to `1.0.0` | 2026-07-24 | `PREPARE_FOR_SUBMISSION` |

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
| Age rating | `FOUR_PLUS` for all four; `ageRatingDeclaration` present |
| Pricing | `appPriceSchedule` exists for all four |
| Localization | `ru` version localization for all four with description, keywords, support URL `https://ali.kg/support` and marketing URL `https://ali.kg` |
| App info | Name, subtitle and `privacyPolicyUrl = https://ali.kg/privacy` set for all four |
| Screenshots | Uploaded and `COMPLETE`: Client 10+10+10, Staff 4+4+4, Courier 3+3+3, POS 3+3+3 |
| Review URLs | `https://ali.kg/`, `/privacy`, `/support` and `https://api.ali.kg/api/health` all return `200` from outside the build machine |

## Blocked before App Review submission

Nothing here can be closed from the repository — each item needs the owner in
App Store Connect or in the ERP.

1. **App Review contact is empty for all four.** `contactFirstName`,
   `contactLastName`, `contactEmail` and `contactPhone` are all `null`.
2. **Demo accounts are empty for all four** while `demoAccountRequired = true`.
   See the sign-in section below — the mechanism differs between Client and the
   other three.
3. **App Privacy** data-usage answers must be completed and published. The
   available App Store Connect API version has no readable relationship for this,
   so it can only be confirmed in the web interface. The truthful basis for the
   answers is the shipped `PrivacyInfo.xcprivacy`: phone number, physical address,
   purchase history, photos or videos and other data — all `Linked`, purpose
   `AppFunctionality`, no tracking.
4. **Review submissions exist but are empty.** All four have a `reviewSubmission`
   in state `READY_FOR_REVIEW` with `submittedDate = null` **and an empty `items`
   list** — no version is attached, so nothing has been submitted. Submitting from
   the web interface attaches the version.
5. **Review-visible data.** The production catalog currently returns
   `total: 4` and every product has `availableUnits: 0`, so a reviewer cannot
   complete a purchase — a Guideline 2.1 risk.

## Owner checklist

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
3. **Pricing** → confirm and save the intended "Free" tier.
4. **Add for Review → Submit to App Review.**

App Review Notes for all four are prepared in the `*-metadata.json` files in this
directory and are ready to paste.

### 3. Review data in the ERP

- Raise stock on at least three or four storefront products so the Client
  purchase flow can be completed end to end.
- Seed one live object per role so each app shows its declared workflow: an order
  in progress for Staff, an assigned delivery for Courier, an open shift for POS.

## Known risks that remain after submission

- **Guideline 4.2.1 for Staff, Courier and POS.** These are role-gated business
  apps. The App Review Notes now position them as a retail operations platform
  that any electronics store provisions accounts on, rather than the internal
  tooling of one company, but Apple may still direct them to Apple Business
  Manager Custom Apps. That call is Apple's.
- **Stale iPad screenshots.** Staff, Courier and POS ship as iPhone-only
  (`UIDeviceFamily = [1]`) since build 4, but their version localizations still
  carry `APP_IPAD_PRO_3GEN_11` and `APP_IPAD_PRO_3GEN_129` sets left over from the
  universal builds. App Store Connect follows the current build's device support
  and ignores them, so this does not block submission; remove them when
  convenient so the metadata matches the binary. Client is genuinely universal
  (`UIDeviceFamily = [1, 2]`) and its iPad sets are correct.
