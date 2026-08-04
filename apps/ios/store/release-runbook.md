# AliStore iOS release runbook (Client, Staff, Courier, POS)

This runbook covers all four native SwiftUI apps that ship from `apps/ios`:

| Scheme | Bundle id | Metadata |
|---|---|---|
| `AliStoreClient` | `kg.alistore.client` | `apps/ios/store/client-metadata.json` |
| `AliStoreStaff` | `kg.alistore.staff` | `apps/ios/store/staff-metadata.json` |
| `AliStoreCourier` | `kg.alistore.courier` | `apps/ios/store/courier-metadata.json` |
| `AliStorePOS` | `kg.alistore.pos` | `apps/ios/store/pos-metadata.json` |

It does not replace a physical-device smoke test, App Store Connect review, or
provider certification.

Version and build number live in `apps/ios/project.yml`
(`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`) and are shared by all four apps.
Build 4 is in App Store Connect for all four bundle ids and is the build attached
to the `1.0.0` version under review, so the tree is now at
`CURRENT_PROJECT_VERSION: 5`. Bump it again before every new upload — App Store
Connect rejects a duplicate build number. `store-preflight.sh` reads the expected
values from `project.yml`, not from constants inside the script, so the bump is
the only edit needed.

## Required values

Set these in the shell or CI protected environment. Never commit them:

```bash
export ALISTORE_API_BASE_URL="https://api.ali.kg/api"
export DEVELOPMENT_TEAM="XXXXXXXXXX"
export ASC_API_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_KEYID.p8"
export ASC_KEY_ID="KEYID_FROM_AUTHKEY_FILENAME"
export ASC_ISSUER_ID="issuer-uuid-from-app-store-connect"
export IOS_ALLOW_PROVISIONING_UPDATE="false"
```

`ALISTORE_API_BASE_URL` must point at the host that actually serves the API.
Today that is `https://api.ali.kg/api`; `https://ali.kg/api` still returns the
storefront HTML with HTTP 404, because the Cloudflare Functions migration
(`wrangler.toml`, `functions/api`) is not deployed. Switch this value to
`https://ali.kg/api` only after that route serves the API — a build made against
a 404 host is broken on every screen and the failure only shows up at runtime.

Optional export configuration (see "Export and upload"):

```bash
export IOS_EXPORT_METHOD="app-store-connect"   # default
export IOS_EXPORT_UPLOAD_SYMBOLS="true"        # default
export IOS_EXPORT_SIGNING_CERT="Apple Distribution"
export IOS_PROFILE_CLIENT="AliStore Client App Store"
export IOS_PROFILE_STAFF="AliStore Staff App Store"
export IOS_PROFILE_COURIER="AliStore Courier App Store"
export IOS_PROFILE_POS="AliStore POS App Store"
```

`ASC_API_KEY_PATH` must be readable only by the current user or CI secret
manager. `ASC_ISSUER_ID` is not stored in the repository and cannot be
derived from the `.p8` file.

Keep `IOS_ALLOW_PROVISIONING_UPDATE=false` when local App Store provisioning
profiles are expected for all four bundle ids. Set it to `true` only on a
protected release machine that is signed in to the owner Apple Developer account
and is allowed to let Xcode create or download signing profiles.

For local release preflight, copy the ignored template and fill real values:

```bash
cp apps/ios/.env.production.example apps/ios/.env.production
$EDITOR apps/ios/.env.production
```

All three release scripts (`store-preflight.sh`, `archive.sh`,
`export-archives.sh`) load `apps/ios/.env.production` automatically when it
exists, or take `--env-file <path>`.

## 1. Preflight

```bash
chmod 700 apps/ios/scripts/store-preflight.sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  npm run ios:store-preflight -- --env-file apps/ios/.env.production --strict-asc --strict-signing
```

`store-preflight.sh` validates, **for all four schemes**, the production HTTPS API
URL, Release bundle id, AppIcon asset catalog, production APNs resolution, and
that `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` resolve to the values in
`project.yml`. It additionally checks the Client Face ID usage copy, privacy
manifest and `apps/ios/store/client-metadata.json`. It never prints secret values.

With `--strict-asc` it signs a short-lived App Store Connect JWT and calls
Apple's API to prove the issuer/key pair works. It then runs
`scripts/apply-ios-store-metadata.mjs --check` and fails if the primary category
or content rights declaration in App Store Connect has drifted from
`apps/ios/store/*-metadata.json`. Both fields are required before a version can be
submitted, and both were silently empty for Staff, Courier and POS until
2026-07-26 — nothing applied the metadata files, and nothing noticed. To
reconcile:

```bash
npm run ios:store-metadata          # dry run — shows what differs
npm run ios:store-metadata:apply    # writes only the fields that differ
```

With `--strict-signing` it verifies an Apple Distribution identity for the
configured team **and one App Store provisioning profile per bundle id** —
`kg.alistore.client`, `kg.alistore.staff`, `kg.alistore.courier`,
`kg.alistore.pos` — in `~/Library/MobileDevice/Provisioning Profiles` or
`~/Library/Developer/Xcode/UserData/Provisioning Profiles`. Only App Store
profiles count: a profile with `get-task-allow=true` or with a device list is a
Development/Ad Hoc profile and is ignored. A missing profile is named in the
error, e.g.:

```
store-preflight: App Store provisioning profile missing for: kg.alistore.pos — …
```

Set `IOS_ALLOW_PROVISIONING_UPDATE=true` to downgrade that failure to a printed
warning on a machine where Xcode is allowed to fetch profiles; the final summary
line then says which apps were not verified locally instead of claiming that all
signing material is present.

## 2. Visual evidence and screenshots (Client)

```bash
npm run ios:visual
npm run ios:store-screenshots
```

`ios:visual` runs the deterministic screenshot gate for all four iOS apps
(`client`, `staff`, `courier`, `pos`) on the two Apple **base** device classes:
the 6.9" iPhone (iPhone 17 Pro Max, 1320x2868) and the 13" iPad
(iPad Pro 13-inch (M5), 2064x2752). Apple scales every smaller class from those
uploads, so capturing on a 6.3" or 11" simulator silently degrades the listing.
If a required simulator is not installed, the script creates it from the newest
available iOS runtime instead of failing.

Scope it while iterating:

```bash
npm run ios:visual                    # all four apps, both device classes
npm run ios:visual:client             # Client only
npm run ios:visual:ecosystem          # Staff + Courier + POS
IOS_VISUAL_DEVICES=iphone npm run ios:visual -- staff
```

The Client set is 17 states (home, catalog, product detail, favorites, compare,
cart, checkout, order status, account, devices, warranty, returns, support,
Trade-in, loyalty, addresses, search); Staff 6, Courier 5 and POS 6 — the exact
lists live in `apps/ios/store/<app>-metadata.json`. These are review evidence
only; they do not replace owner pixel approval or physical-device release smoke.

`ios:store-screenshots` reads `apps/ios/store/client-metadata.json`, verifies all
17 required states in the Xcode attachment manifest, checks PNG dimensions and
SHA-256 hashes, and writes
`apps/ios/build/AppStoreScreenshots/ru-KG/iphone-17-pro/`. Upload those generated
files to App Store Connect in numeric order.

Staff, Courier and POS declare their own required states
(`staff-*`, `courier-*`, `pos-*`) in their metadata files; their screenshot sets
are produced by the ecosystem capture pipeline, not by `ios:visual`.

## 3. Archive

```bash
npm run ios:store-screenshots                  # all four apps
npm run ios:store-screenshots -- --app staff   # one app
```

The command reads every `apps/ios/store/<app>-metadata.json`, verifies each
required state is present in the Xcode attachment manifest, **fails when a PNG
is not the `expectedDimensions` device class declared for that simulator**,
records SHA-256 hashes and writes
`apps/ios/build/AppStoreScreenshots/ru-KG/<app>/{iphone-6-9,ipad-13}/`.
Upload those generated files to App Store Connect in numeric order.

The dimension guard itself is covered by
`npm run ios:store-screenshots:test` (no simulator required).

The archive must be signed with an Apple Distribution identity and a
provisioning profile for `kg.alistore.client`. If the archive fails because no
profile is available, create/download the profile in the Apple Developer
portal or let Xcode update signing with the protected account; do not weaken
the release to use local API URLs.

Each archive is built `-configuration Release` for `generic/platform=iOS` with
`DEVELOPMENT_TEAM` and `ALISTORE_API_BASE_URL` passed on the command line, so a
local API URL cannot leak into a release archive. `IOS_ALLOW_PROVISIONING_UPDATE=true`
adds `-allowProvisioningUpdates`; `IOS_SKIP_XCODEGEN=true` skips regeneration.

One app at a time:

```bash
npm run ios:archive -- --scheme AliStorePOS
```

The archive must be signed with an Apple Distribution identity and an App Store
provisioning profile for that bundle id. If it fails because no profile is
available, create or download the profile in the Apple Developer portal, or let
Xcode update signing with the protected account; do not weaken the release to use
local API URLs.

## 4. Export

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run ios:export
```

`ios:export` (`apps/ios/scripts/export-archives.sh`) **generates** the export
options plist per scheme from the environment and writes it to
`apps/ios/build/exportOptions/<Scheme>-exportOptions.plist` (that directory is
git-ignored, so nothing sensitive is committed and the release stays
reproducible — the plist is no longer a hand-made file living outside the repo).
It then exports:

```
apps/ios/build/export/AliStoreClient/*.ipa
apps/ios/build/export/AliStoreStaff/*.ipa
apps/ios/build/export/AliStoreCourier/*.ipa
apps/ios/build/export/AliStorePOS/*.ipa
```

The generated plist contains `method` (`IOS_EXPORT_METHOD`, default
`app-store-connect`), `teamID`, `destination=export`, `uploadSymbols`
(`IOS_EXPORT_UPLOAD_SYMBOLS`), `manageAppVersionAndBuildNumber=false` and
`stripSwiftSymbols=true`. A scheme whose `IOS_PROFILE_*` variable is set is
exported with **manual** signing and exactly that profile; a scheme without it
falls back to **automatic** signing, and with
`IOS_ALLOW_PROVISIONING_UPDATE=true` the export is run with
`-allowProvisioningUpdates`, authenticated non-interactively from
`ASC_API_KEY_PATH` / `ASC_KEY_ID` / `ASC_ISSUER_ID` when those are set.

`--scheme` works here too, and `--help` prints the full variable list.

## 5. Upload

Upload each `.ipa` with the App Store Connect API key:

```bash
for scheme in AliStoreClient AliStoreStaff AliStoreCourier AliStorePOS; do
  xcrun altool --upload-app \
    -f "$(find "apps/ios/build/export/$scheme" -maxdepth 1 -name '*.ipa' | head -n 1)" \
    -t ios \
    -apiKey "$ASC_KEY_ID" \
    -apiIssuer "$ASC_ISSUER_ID"
done
```

After upload, verify each build in App Store Connect, attach the privacy and
data-use answers, add screenshots and localized metadata, and distribute through
TestFlight before requesting App Review.

## 6. App Store Connect text and review notes

Use the four metadata files as the source for App Store Connect text fields:
`app`, `urls`, `localizations.ru-KG` and `review`.

`review.appReviewNotes` in each file is the exact text for **App Review
Information > Notes** and is validated on every run of
`scripts/validate-ios-store-metadata.mjs` (Client) and
`scripts/validate-ios-ecosystem-store-metadata.mjs` (Staff/Courier/POS), which
also reject any credential-looking string in it.

- **Client** — sign-in is a one-time SMS code sent to the owner phone number
  inside Kyrgyzstan (operators there do not deliver SMS abroad). The notes tell
  the reviewer to enter that number and ask us for the current code through App
  Review Notes; the code is relayed on request and is never written into the
  notes or the repository.
- **Staff / Courier / POS** — role-based apps with no self-service registration.
  The notes state that a dedicated demo employee, courier or cashier account is
  provisioned from the ERP back office, is loaded with representative
  non-production review data, and is re-issued on request if it expires during
  review.

Enter the real demo account values only in App Store Connect Demo Account fields
or a protected secret manager; never commit them.

## 7. Mandatory device gate

Before submission, test each app on a physical iPhone with the Release build.

Client:

- OTP login, session restore, Face ID quick unlock and PIN fallback;
- catalog image loading, search, product detail, cart and payment return;
- push routing to orders, warranty and account;
- camera/permission behavior where enabled, offline queue, retry and restart.

Staff:

- role-based login and session restore;
- order processing, warehouse/service task flow, KPI screen, customer lookup;
- goods intake and buyback flows;
- push routing to assigned tasks and orders.

Courier:

- login, assigned route and delivery list;
- delivery evidence capture and location permission behavior;
- cash-on-delivery handling and end-of-run reconciliation;
- offline queue and retry on a flaky mobile network.

POS:

- login and shift open/close;
- catalog lookup, sale composition, split tender, server-issued receipt;
- operation history;
- behavior without external receipt printer or payment terminal.

For all four: no localhost, dev OTP, sandbox payment URL, test-only credential,
or demo-only state may be reachable in the Release build.

Local App Store provisioning profiles for all four apps and a verified App Store
Connect issuer/team configuration are a precondition for archiving: prove them
with `--strict-asc --strict-signing` above. If preflight reports a missing
profile or an unverified key, report the archive and TestFlight upload as
blocked rather than working around it.
