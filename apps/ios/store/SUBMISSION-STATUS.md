# AliStore Client — App Store submission status

App Store target: **AliStore Client** (`kg.alistore.client`), the public customer
shopping app. Staff / Courier / POS are internal ERP apps and are **not** part of
this public-store pipeline (see "Other three apps" below).

_Last prepared: 2026-07-19 by automated release prep._

## ✅ Ready (verified)

| Item | Evidence |
|---|---|
| Release build compiles for device | `xcodebuild ... -configuration Release -destination 'generic/platform=iOS'` → **BUILD SUCCEEDED** (unsigned dry-run) |
| Production API wired | `API_BASE_URL` resolves to `https://api.ali.kg/api` in Release |
| Bundle id | `PRODUCT_BUNDLE_IDENTIFIER = kg.alistore.client` |
| App icon | `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` (3.0 icon set present) |
| Push environment | `APS_ENVIRONMENT = production` |
| Privacy manifest | `PrivacyInfo.xcprivacy` present, `NSPrivacyTracking = false` |
| Face ID purpose string | matches review metadata |
| App Store metadata | `store/client-metadata.json` passes `validate-ios-store-metadata.mjs` |
| Screenshots | 17/17 required states, iPhone 17 Pro, `build/AppStoreScreenshots/ru-KG/iphone-17-pro/` |
| Compliance | Non-functional Apple/Telegram login stubs removed (rules 2.1/4.8); export-compliance key set |
| Shipped version | `CFBundleShortVersionString = 1.0`, `CFBundleVersion = 1` |

## ⛔ Owner-gated — final steps (need the Apple Developer account)

Everything below requires secrets I cannot access. Config file is already staged at
`apps/ios/.env.production` (gitignored) with the API filled — just replace the 3
placeholders and drop in the key:

1. **Fill Apple credentials** in `apps/ios/.env.production`:
   - `DEVELOPMENT_TEAM` — Apple Developer → Membership → Team ID (10 chars)
   - `ASC_KEY_ID` + place `AuthKey_<KEYID>.p8` at `ASC_API_KEY_PATH`
   - `ASC_ISSUER_ID` — App Store Connect → Users and Access → Integrations (UUID)
2. **Create the app record** in App Store Connect for `kg.alistore.client`
   (name "AliStore", primary language ru-KG, category Shopping). Add a review
   demo account in the review notes (do not commit it).
3. **Preflight (strict), archive, upload** — from repo root:
   ```bash
   DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
     npm run ios:store-preflight -- --env-file apps/ios/.env.production --strict-asc --strict-signing
   # then follow apps/ios/store/release-runbook.md for archive + upload
   ```

## Notes for the owner

- **Version numbering:** ships as `1.0 (1)`. The `MARKETING_VERSION=0.1.0` build
  setting is unused (Info.plist hardcodes `1.0`). Fine as-is; change in
  `Client/Info.plist` if you want a different first-release number.
- **Orientation warning:** the Release build warns "All interface orientations
  must be supported unless the app requires full screen." Harmless for an
  iPhone-first app; if you also target iPad, either support more orientations or
  set `UIRequiresFullScreen`.
- **Provider certification:** payments / SMS / push must use certified production
  providers before public release (already noted in the review metadata).

## Other three apps (Staff / Courier / POS)

`kg.alistore.staff`, `kg.alistore.courier`, `kg.alistore.pos` are internal
employee apps. They build and run but are **not** public App Store candidates —
distribute via TestFlight (internal testers) or Apple Business Manager (custom
apps). No public listing/metadata is prepared for them by design.
