# AliStore native Android applications

The Gradle workspace contains four independent Jetpack Compose applications and a
shared Android core:

- `:app` — Client (`kg.alistore.client`)
- `:staff` — Staff (`kg.alistore.staff`)
- `:courier` — Courier (`kg.alistore.courier`)
- `:pos` — POS (`kg.alistore.pos`)
- `:core` — typed API/auth, Android Keystore session encryption, SQLite offline queue,
  WorkManager replay and shared role-aware Compose shell.

## Debug builds

Debug builds use `http://10.0.2.2:4000/api` and need no secrets.

```bash
cd apps/android
./gradlew :app:assembleDebug :staff:assembleDebug :courier:assembleDebug :pos:assembleDebug
./gradlew :core:connectedDebugAndroidTest
```

## Release builds

All four applications share one release convention declared once in
`apps/android/build.gradle.kts` — versions, signing, R8 and the HTTPS requirement.
Module build files only carry what is genuinely module-specific (namespace,
`applicationId`, Firebase presence, `PAYMENT_RETURN_URL`).

- `versionName` is `1.0.0` for `:app`, `:staff`, `:courier` and `:pos` — the same
  marketing number the iOS targets use.
- `versionCode` is a single counter shared by all four APKs; bump it per store upload
  with `-PALISTORE_VERSION_CODE=<n>` (defaults to `1`).
- Release runs R8 (`isMinifyEnabled`) plus resource shrinking. Shared keep rules live in
  `apps/android/gradle/proguard-alistore.pro`; each module adds its own
  `proguard-rules.pro` on top.
- Release forbids cleartext traffic and requires an HTTPS API endpoint.

### Required build inputs

Every value below is read from a Gradle property (`-P<name>=…`) **or** an environment
variable of the same name. Nothing is stored in the repository.

| Name | Meaning |
|---|---|
| `ALISTORE_API_BASE_URL` | Release API endpoint, must start with `https://` |
| `ALISTORE_KEYSTORE_FILE` | Path to the release `.jks` (absolute, or relative to `apps/android`) |
| `ALISTORE_KEYSTORE_PASSWORD` | Keystore password |
| `ALISTORE_KEY_ALIAS` | Key alias inside the keystore |
| `ALISTORE_KEY_PASSWORD` | Key password |
| `ALISTORE_VERSION_CODE` | Optional shared version code, default `1` |

If any of them is missing, a release task fails during configuration with an explicit
message and no artifact is produced. Debug tasks are unaffected and keep working
without any of these values.

Keep the keystore and its passwords **outside** the repository — in
`~/.gradle/gradle.properties` for local release builds, or in CI secrets. `*.jks`,
`*.keystore`, `keystore.properties` and `apps/android/local.properties` are
git-ignored; never commit them and never paste passwords into a build file.

The local release machine was provisioned on 2026-07-28:

- keystore: `~/.config/alistore/android/alistore-upload.jks`;
- alias: `alistore-upload`;
- password: macOS Keychain item
  `service=com.alistore.android.release`, `account=alistore-upload`;
- SHA-256 certificate fingerprint:
  `30:EA:C1:B1:C7:0D:EA:CF:39:EC:7F:43:52:B0:73:DE:6B:20:6E:16:77:8B:75:C5:D1:8F:84:34:38:D8:81:0A`.

The keystore still requires an encrypted offline backup before the first Play
Console upload. The Keychain copy alone is not a disaster-recovery backup.

```bash
cd apps/android
./gradlew :app:assembleRelease :staff:assembleRelease \
          :courier:assembleRelease :pos:assembleRelease \
  -PALISTORE_API_BASE_URL=https://api.ali.kg/api \
  -PALISTORE_VERSION_CODE=2 \
  -PALISTORE_KEYSTORE_FILE=/secure/path/alistore-release.jks \
  -PALISTORE_KEYSTORE_PASSWORD=… \
  -PALISTORE_KEY_ALIAS=alistore \
  -PALISTORE_KEY_PASSWORD=…
```

### Owner-supplied `google-services.json` (blocking)

`:app`, `:staff` and `:courier` use Firebase Cloud Messaging and refuse to build a
release without the real Firebase config from the project owner:

- `apps/android/app/google-services.json`
- `apps/android/staff/google-services.json`
- `apps/android/courier/google-services.json`

These files are git-ignored and are **not** present in the repository. They must be
downloaded from the Firebase console for the production project (package names
`kg.alistore.client`, `kg.alistore.staff`, `kg.alistore.courier`) and dropped in by the
owner or injected by CI. Placeholder files are not acceptable — FCM registration would
silently target the wrong project. `:pos` has no Firebase dependency and builds a
release without one.

Still owner-owned and outstanding for the store release: an encrypted offline
backup of the generated upload keystore and Play Console app-signing enrollment.

The Client authenticates through phone OTP, stores the access/refresh pair encrypted
with Android Keystore, refreshes an expired access token during process restore, and
revokes the refresh session on logout. Dev OTP autofill appears only when the API
explicitly returns `devCode`; production builds rely on the configured SMS provider.

The Client cart enforces catalog stock caps and submits pickup/courier checkout through
the customer JWT with a stable idempotency key. Prices, availability and the resulting
order status are recalculated by the API. Network failures enter the encrypted-session
WorkManager replay contour; conflicts remain visible for manual retry instead of being
silently resubmitted by the worker. A dedicated conflict-list screen remains part of
the account-data parity phase.

Online checkout creates card, MBank, O!Деньги or installment intents through the
customer-owned API with a separate stable payment idempotency key. The app opens the
provider URL, handles `alistore://payment-return`, and routes back to a protected order
history that reloads server-authoritative payment/order statuses. A 401 during intent
creation or order loading triggers one refresh-token rotation and repeats the same
idempotent command; the Client never assigns `paid` locally.

The account loads purchased serialized devices from `customers/me/devices`, shows
coverage and the current service case, and opens warranty cases with a stable
idempotency key that survives one token refresh. The API verifies that the IMEI is
linked to an order owned by the authenticated customer, rejects a second active case,
and writes exactly one `warranty.created` Event Ledger entry for an exact replay.

Support and returns are customer-owned native flows. The Client lists only the signed-in
customer's tickets and return requests, preserves one command key across token refresh
and manual retry, and can attach a photo through the private Evidence Vault upload API.
Return creation starts from an eligible order loaded through `orders/mine`; the API
derives ownership from the customer JWT and exact-replays concurrent duplicate commands.

Bonuses, addresses and settings use the same customer-owned API as the web cabinet.
The Client renders the server ledger balance, coupons and history; creates addresses with
a stable idempotency key across token refresh; rotates the primary address through the
API; and updates profile, marketing consent and notification channels. Loading, empty,
error and retry states are covered by the API 36 Compose suite. Loyalty redemption during
checkout remains a separate server-authoritative money-flow task and is not inferred by
the client.

The Staff APK now has its own password login and encrypted Keystore token. Process
restore revalidates the employee through `staff-auth/me`, so revoked users cannot keep
working from a stale local role. Its order queue reads the same guarded order state
machine used by web ERP/Staff, and its shift screen opens, reloads and reconciles the
same cash shifts used by POS. Open/close retries retain a stable idempotency key and
cash discrepancies require a reason before the API writes the result to Event Ledger.
The Scanner tab uses bundled ML Kit over CameraX for EAN-8, EAN-13, Code128 and QR,
keeps a manual IMEI fallback, and attaches camera/gallery evidence to any supported
operation through the same staff JWT and server-derived Ledger actor. Tasks, Customer
360, warranty and support actions use the same server contracts as web ERP. The Tasks
tab reads PostgreSQL assignments, advances only the signed-in employee's task through
guarded server states and reloads the authoritative result. When
`apps/android/staff/google-services.json` is present, Staff registers its FCM token under
the active staff JWT, receives task notifications and routes `alistore-staff://` links to
Tasks, Orders, Customer 360, warranty or support. A Staff Release build fails fast without
both that ignored Firebase file and an HTTPS API URL. Live FCM delivery, camera focus and
barcode recognition still require physical-device certification.

The Courier APK uses a separate Keystore staff session and accepts only an active
`courier` role. ERP assigns eligible delivery orders to a courier run; the app then
loads only JWT-owned assignments, opens map/phone handoffs and invokes dedicated
start, deliver and fail endpoints. Outstanding COD is calculated from server payment
records, collection increments the run atomically and handover is blocked until the
run reconciles. Network failures enter a courier-only SQLite/WorkManager queue that
retains the original idempotency key across process restart. Evidence photos,
FCM/deep-link routing and physical maps/camera/network QA remain release gates.

The POS APK uses its own encrypted cashier session and reads the same catalog and
stock projection as the storefront and ERP. It builds a quantity-capped ticket,
supports cash, card and MBank including split tender, and retries a parked discount
with the same `clientSaleId` after approval. A keyboard or CameraX/ML Kit scan resolves
SKU/IMEI through the API; a serialized line binds the exact in-stock IMEI and the API
rejects stale or mismatched product, price and unit data before changing payment or
stock. The cashier opens/closes the shared server shift, and network failures preserve
the exact command/idempotency key in a POS-only SQLite queue. HTTP 202 approvals remain
visible as recoverable conflicts. Successful sales load the server-rendered receipt
with ESC/POS bytes; the Operations tab reads payments, advances returns, requests an
approval-gated refund and performs an atomic idempotent exchange. Physical silent
printing and scanner/payment-terminal certification remain external release gates.
