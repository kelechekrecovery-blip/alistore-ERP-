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

_Last updated: 2026-07-20 by automated App Store Connect release prep._

## Ready and verified

| Item | Evidence |
|---|---|
| Version | All four signed archives resolve to `1.0.0 (2)` |
| Signed archives | `AliStoreClient`, `AliStoreStaff`, `AliStoreCourier` and `AliStorePOS` all archived successfully with Apple Distribution signing |
| Bundle IDs | Signed products resolve to their four expected `kg.alistore.*` identifiers |
| Provisioning | Four App Store profiles are active; Client includes Associated Domains, In-App Purchase and Push Notifications |
| Production API | Release resolves to `https://api.ali.kg/api` |
| Universal layout | All four apps support iPhone and iPad with the complete iPad orientation set |
| Client screenshots | 10 iPhone + 10 iPad Pro 11 + 10 iPad Pro 12.9 screenshots uploaded and `COMPLETE` in App Store Connect; Apple limits each device set to 10 |
| Ecosystem screenshots | Staff 4+4+4, Courier 3+3+3 and POS 3+3+3 iPhone/iPad Pro 11/iPad Pro 12.9 screenshots uploaded and `COMPLETE` |
| iPad visual QA | Client, Staff, Courier and POS were rendered natively on iPad Pro 11-inch Simulator; no clipping or stretched phone-only layout was found |
| POS visual QA | Screenshot mode no longer displays the transient `Unauthorized` error |
| Metadata | Client metadata and all three separate ecosystem metadata files pass validation |
| Privacy/support source | Repository routes cover the ecosystem and are included in the web application |
| Client preflight | Strict `ios:store-preflight` passes with verified App Store Connect credentials, `1.0.0 (2)`, HTTPS API, production APNs, bundle ID and AppIcon |
| Automated checks | `ios:generate`, `ios:build`, 53/53 tests and all iPhone/iPad visual capture runs passed |

## App Store Connect state

- The correct native Client record uses `kg.alistore.client`; its localized
  public name is saved as **AliStore KG**, not “AliStore Client”.
- The older record bound to `kg.alistore.app` was renamed “AliStore Legacy” and
  was not reused or deleted.
- Separate App Store Connect records and Apple Developer App IDs exist for
  Staff, Courier and POS.
- Signed archives are present locally in `apps/ios/build/archives/`.
- Build `1.0.0 (2)` is `VALID` and attached to the App Store version for all four
  bundle IDs.
- Russian app-info and version localizations are populated for all four apps;
  support and marketing URLs point to `https://ali.kg`.
- App Review detail records exist for all four versions and correctly declare
  that a demo account is required.
- Screenshot sets are uploaded and `COMPLETE`: Client 10+10, Staff 4+4,
  Courier 3+3 and POS 3+3 for iPhone/iPad, plus the required iPad Pro 12.9
  sets for all four apps.
- Unified review-submission drafts exist for all four apps and are currently
  `READY_FOR_REVIEW`; no item is submitted yet.

## Blocked before App Review submission

The apps have been uploaded and processed, but have **not** been submitted for
App Review:

- Real App Review demo credentials are still required for every login-gated
  app. Do not place them in the repository. The App Review API records are
  intentionally marked `demoAccountRequired=true` without fabricated values.
- App Store Connect requires published App Privacy data-usage answers for each
  app; these must be completed by the owner based on the actual provider and
  retention configuration.
- App pricing must be set in App Store Connect. The apps are intended to be
  free downloads, but the owner must confirm and save that commercial choice.
- App Store Connect's current unified `reviewSubmissions` workflow must be
  completed after the demo accounts and review contact details are supplied.
- The public `ali.kg` origin must remain reachable from outside the development
  machine; App Review URLs must return HTTP 200 during submission.

Owner action required:

1. Provide protected review demo accounts for AliStore KG, Staff, Courier and
   POS, with enough seeded data to demonstrate the submitted workflows.
2. Restore the `ali.kg` origin/tunnel and verify `/privacy` and `/support`
   return HTTP 200 from outside the development machine.
3. Re-run:
   ```bash
   DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
     npm run ios:store-preflight -- --env-file apps/ios/.env.production \
       --strict-asc --strict-signing
   ```
4. Complete App Privacy and review contact fields in App Store Connect, then
   submit the four prepared versions through the unified review-submission flow.

The production catalog may currently return `total: 0`. This does not invalidate
the builds, but the owner should seed review-visible products/orders before
submitting the demo accounts.
