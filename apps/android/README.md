# AliStore native Android applications

The Gradle workspace contains four independent Jetpack Compose applications and a
shared Android core:

- `:app` — Client (`kg.alistore.client`)
- `:staff` — Staff (`kg.alistore.staff`)
- `:courier` — Courier (`kg.alistore.courier`)
- `:pos` — POS (`kg.alistore.pos`)
- `:core` — typed API/auth, Android Keystore session encryption, SQLite offline queue,
  WorkManager replay and shared role-aware Compose shell.

Debug builds use `http://10.0.2.2:4000/api`. Release builds fail before compilation
unless the release pipeline injects an HTTPS endpoint through
`-PALISTORE_API_BASE_URL=https://api.example.com/api`.

```bash
cd apps/android
./gradlew :app:assembleDebug :staff:assembleDebug :courier:assembleDebug :pos:assembleDebug
./gradlew :core:connectedDebugAndroidTest
```

The Client authenticates through phone OTP, stores the access/refresh pair encrypted
with Android Keystore, refreshes an expired access token during process restore, and
revokes the refresh session on logout. Dev OTP autofill appears only when the API
explicitly returns `devCode`; production builds rely on the configured SMS provider.
