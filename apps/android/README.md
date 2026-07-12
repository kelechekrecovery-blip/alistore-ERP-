# AliStore native Android applications

The Gradle workspace contains four independent Jetpack Compose applications and a
shared Android core:

- `:app` — Client (`kg.alistore.client`)
- `:staff` — Staff (`kg.alistore.staff`)
- `:courier` — Courier (`kg.alistore.courier`)
- `:pos` — POS (`kg.alistore.pos`)
- `:core` — typed API, Android Keystore token encryption, SQLite offline queue,
  WorkManager replay and shared role-aware Compose shell.

Debug builds use `http://10.0.2.2:4000/api`. Release builds fail before compilation
unless the release pipeline injects an HTTPS endpoint through
`-PALISTORE_API_BASE_URL=https://api.example.com/api`.

```bash
cd apps/android
./gradlew :app:assembleDebug :staff:assembleDebug :courier:assembleDebug :pos:assembleDebug
```
