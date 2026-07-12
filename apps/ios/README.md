# AliStore native iOS applications

Four independent SwiftUI applications share the `AliStoreCore` framework:

- `AliStoreClient` (`kg.alistore.client`)
- `AliStoreStaff` (`kg.alistore.staff`)
- `AliStoreCourier` (`kg.alistore.courier`)
- `AliStorePOS` (`kg.alistore.pos`)

Generate the Xcode project and build all targets:

```bash
cd apps/ios
xcodegen generate
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project AliStoreNative.xcodeproj -scheme AliStoreClient \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

`API_BASE_URL` currently points to the local API for simulator development. Release
configuration must inject the production HTTPS API before archive/signing.
