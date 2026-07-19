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

_Last prepared: 2026-07-19 by automated release prep._

## Ready and verified

| Item | Evidence |
|---|---|
| Version | All four signed archives resolve to `1.0.0 (1)` |
| Signed archives | `AliStoreClient`, `AliStoreStaff`, `AliStoreCourier` and `AliStorePOS` all archived successfully with Apple Distribution signing |
| Bundle IDs | Signed products resolve to their four expected `kg.alistore.*` identifiers |
| Provisioning | Four App Store profiles are active; Client includes Associated Domains, In-App Purchase and Push Notifications |
| Production API | Release resolves to `https://api.ali.kg/api` |
| Universal layout | All four apps support iPhone and iPad with the complete iPad orientation set |
| Client screenshots | 17 iPhone + 17 iPad screenshots packaged under `build/AppStoreScreenshots/ru-KG/` |
| Ecosystem screenshots | Staff 4+4, Courier 3+3 and POS 3+3 iPhone/iPad screenshots packaged in separate app folders |
| iPad visual QA | Client, Staff, Courier and POS were rendered natively on iPad Pro 11-inch Simulator; no clipping or stretched phone-only layout was found |
| POS visual QA | Screenshot mode no longer displays the transient `Unauthorized` error |
| Metadata | Client metadata and all three separate ecosystem metadata files pass validation |
| Privacy/support source | Repository routes cover the ecosystem and are included in the web application |
| Client preflight | Non-strict `ios:store-preflight` passes, including `1.0.0 (1)`, HTTPS API, production APNs, bundle ID and AppIcon |
| Automated checks | `ios:generate`, `ios:build`, 53/53 tests and all iPhone/iPad visual capture runs passed |

## App Store Connect state

- The correct native Client record uses `kg.alistore.client`; its localized
  public name is saved as **AliStore KG**, not “AliStore Client”.
- The older record bound to `kg.alistore.app` was renamed “AliStore Legacy” and
  was not reused or deleted.
- Separate App Store Connect records and Apple Developer App IDs exist for
  Staff, Courier and POS.
- Signed archives are present locally in `apps/ios/build/archives/`.

## Blocked before upload and App Review

The apps have **not** been uploaded or submitted. The strict App Store Connect
credential check is not green:

- `.env.production` contains correctly shaped Apple values, and an App Store
  Connect `.p8` file exists locally, but the configured key ID/path does not
  form a verified key/issuer pair.
- `--strict-asc --strict-signing` therefore stops before contacting App Store
  Connect successfully. Values were not guessed or copied into Git.
- Real App Review demo credentials are also still required for every
  login-gated app. Do not place them in the repository.
- The public `ali.kg` Cloudflare Tunnel is currently down. Both `/privacy` and
  `/support` return Cloudflare `530` / error `1033`, so App Review URLs are not
  usable until the workstation-backed tunnel is restored or the web app is
  deployed to a durable origin.

Owner action required:

1. Provide one matching App Store Connect set:
   `ASC_KEY_ID`, `AuthKey_<ASC_KEY_ID>.p8`, and `ASC_ISSUER_ID`.
2. Provide protected review demo accounts for AliStore KG, Staff, Courier and
   POS, with enough seeded data to demonstrate the submitted workflows.
3. Restore the `ali.kg` origin/tunnel and verify `/privacy` and `/support`
   return HTTP 200 from outside the development machine.
4. Re-run:
   ```bash
   DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
     npm run ios:store-preflight -- --env-file apps/ios/.env.production \
       --strict-asc --strict-signing
   ```
5. Export/upload the four signed archives, attach localized metadata and the
   corresponding iPhone/iPad screenshots, complete privacy answers, and submit
   only after each uploaded build finishes App Store processing.

The production catalog may currently return `total: 0`. This does not invalidate
the builds, but the owner should seed review-visible products/orders before
submitting the demo accounts.
