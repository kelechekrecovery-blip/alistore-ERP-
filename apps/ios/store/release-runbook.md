# AliStore Client iOS release runbook

This runbook is for the native SwiftUI app `kg.alistore.client`. It does not
replace a physical-device smoke test, App Store Connect review, or provider
certification.

## Required values

Set these in the shell or CI protected environment. Never commit them:

```bash
export ALISTORE_API_BASE_URL="https://api.alistore.kg/api"
export DEVELOPMENT_TEAM="XXXXXXXXXX"
export ASC_API_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_KEYID.p8"
export ASC_KEY_ID="KEYID_FROM_AUTHKEY_FILENAME"
export ASC_ISSUER_ID="issuer-uuid-from-app-store-connect"
export IOS_ALLOW_PROVISIONING_UPDATE="false"
```

`ASC_API_KEY_PATH` must be readable only by the current user or CI secret
manager. `ASC_ISSUER_ID` is not stored in the repository and cannot be
derived from the `.p8` file.

Keep `IOS_ALLOW_PROVISIONING_UPDATE=false` when a local App Store provisioning
profile is expected. Set it to `true` only on a protected release machine that
is signed in to the owner Apple Developer account and is allowed to let Xcode
create or download signing profiles.

For local release preflight, copy the ignored template and fill real values:

```bash
cp apps/ios/.env.production.example apps/ios/.env.production
$EDITOR apps/ios/.env.production
```

## Preflight and archive

Run from the repository root:

```bash
chmod 700 apps/ios/scripts/store-preflight.sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  npm run ios:store-preflight -- --env-file apps/ios/.env.production --strict-asc --strict-signing

npm run ios:visual

cd apps/ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodegen generate
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project AliStoreNative.xcodeproj \
  -scheme AliStoreClient \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$PWD/build/AliStoreClient.xcarchive" \
  DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
  ALISTORE_API_BASE_URL="$ALISTORE_API_BASE_URL" \
  -allowProvisioningUpdate \
  archive
```

`store-preflight.sh` validates the production HTTPS API URL, Apple team and
App Store Connect key presence, Release bundle id, AppIcon, production APNs
resolution, Face ID usage copy, privacy manifest and `apps/ios/store/client-metadata.json`.
With `--strict-asc`, it also signs a short-lived App Store Connect JWT and calls
Apple's API to prove the issuer/key pair works. It never prints secret values.
With `--strict-signing`, it verifies an Apple Distribution signing identity for
the configured team and a local App Store provisioning profile for
`kg.alistore.client`, unless `IOS_ALLOW_PROVISIONING_UPDATE=true` is explicitly
set for protected Xcode automatic signing.

`ios:visual` runs the deterministic Client screenshot gate on the iPhone 17 Pro
Simulator and exports 17 retained PNG attachments: home, catalog, product detail,
favorites, compare, cart, checkout, order status, account, devices, warranty,
returns, support, Trade-in, loyalty, addresses and search. These are
review evidence only; they do not replace owner pixel approval or physical-device
release smoke.

After `ios:visual`, package the retained Xcode attachments into deterministic
App Store Connect filenames:

```bash
npm run ios:store-screenshots
```

The command reads `apps/ios/store/client-metadata.json`, verifies all 17 required
states in the Xcode attachment manifest, checks PNG dimensions and SHA-256
hashes, and writes `apps/ios/build/AppStoreScreenshots/ru-KG/iphone-17-pro/`.
Upload those generated files to App Store Connect in numeric order.

The archive must be signed with an Apple Distribution identity and a
provisioning profile for `kg.alistore.client`. If the archive fails because no
profile is available, create/download the profile in the Apple Developer
portal or let Xcode update signing with the protected account; do not weaken
the release to use local API URLs.

## Export and upload

Create an App Store export options plist in CI or locally outside Git with the
correct team, method, and signing configuration. Then export and upload using
the same signed archive:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -exportArchive \
  -archivePath build/AliStoreClient.xcarchive \
  -exportOptionsPlist "$ASC_EXPORT_OPTIONS_PLIST" \
  -exportPath build/export

xcrun altool --upload-app \
  -f build/export/AliStore.ipa \
  -t ios \
  -apiKey "${ASC_KEY_ID}" \
  -apiIssuer "$ASC_ISSUER_ID"
```

After upload, verify the build in App Store Connect, attach the privacy and
data-use answers, add screenshots/localized metadata, and distribute through
TestFlight before requesting App Review.

Use `apps/ios/store/client-metadata.json` as the source for App Store Connect
text fields and review notes. Enter the real demo customer account only in App
Store Connect review notes or a protected secret manager; never commit it.

## Mandatory device gate

Before submission, test on a physical iPhone with the Release build:

- OTP login, session restore, Face ID quick unlock and PIN fallback;
- catalog image loading, search, product detail, cart and payment return;
- push routing to orders, warranty and account;
- camera/permission behavior where enabled, offline queue, retry and restart;
- no localhost, dev OTP, sandbox payment URL, test secret, or demo-only state.

The current repository has a valid local Apple Development and Distribution
identity, but no local provisioning profile or verified App Store Connect
issuer/team configuration. Until those are provided to the protected release
environment, an archive or TestFlight upload must be reported as blocked.
