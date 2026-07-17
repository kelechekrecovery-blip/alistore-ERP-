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
export ASC_ISSUER_ID="issuer-uuid-from-app-store-connect"
```

`ASC_API_KEY_PATH` must be readable only by the current user or CI secret
manager. `ASC_ISSUER_ID` is not stored in the repository and cannot be
derived from the `.p8` file.

## Preflight and archive

Run from the repository root:

```bash
chmod 700 apps/ios/scripts/store-preflight.sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  apps/ios/scripts/store-preflight.sh

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

`ios:visual` runs the deterministic Client screenshot gate on the iPhone 17 Pro
Simulator and exports seven retained PNG attachments (home, catalog, product
detail, cart, account, payment success and payment failure). These are review evidence only;
they do not replace pixel comparison against the handoff or physical-device
release smoke.

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
