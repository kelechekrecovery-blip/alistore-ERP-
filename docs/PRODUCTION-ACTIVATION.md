# AliStore Production Activation

This runbook is for the final step after the software MVP gate is green. It does not
store secrets in git and it keeps production credentials separate from local test DBs.

## 1. Prove the software build

```bash
npm run mvp:verify
```

This runs Prisma schema validation, Prisma Client generation, API build, web build,
full API Jest, Playwright E2E, and a non-strict external readiness report.

Guest web and Telegram checkout first obtain a short-lived signed customer capability
from `POST /customers`; order creation and public payment intents reject missing,
tampered, wrong-owner or wrong-scope capabilities. Do not bypass this contract in an
edge proxy or production client.

## 2. Prepare production env

```bash
cp apps/api/.env.production.example apps/api/.env.production
```

Fill `apps/api/.env.production` with real values. The file is ignored by git.

Required for a production-ready report:

- `DATABASE_URL`, `JWT_SECRET`, `AUTH_OTP_DEV_ECHO=false`, and exact HTTPS origins in `CORS_ORIGINS`.
- Payment gateway: `PAYMENT_PROVIDER=production`, `PAYMENT_API_URL`, `PAYMENT_MERCHANT_ID`, `PAYMENT_API_KEY`, and `PAYMENT_WEBHOOK_SECRET` after the merchant contract is active.
- Keep `PAYMENT_PROVIDER_CERTIFIED=false` until signed webhook, replay, reconciliation, and refund checks pass against the provider account.
- SMS/OTP: set `SMS_PROVIDER=production`, API URL/key and approved sender ID; keep `SMS_PROVIDER_CERTIFIED=false` until login/recovery delivery and outage cleanup pass on a real phone.
- SMS/OTP bridge (before a carrier contract): set `SMS_PROVIDER=android_gateway` and the four `SMS_GATEWAY_*` vars to route OTP through an Android phone with an ordinary SIM. Steps: install `capcom6/android-sms-gateway`; enable **Cloud Server**; copy the auto-generated username/password from Settings → Cloud Server into `SMS_GATEWAY_USERNAME`/`SMS_GATEWAY_PASSWORD`; set an encryption passphrase on the device and put the **same** string in `SMS_GATEWAY_ENCRYPTION_PASSPHRASE` (OTP is sent end-to-end encrypted, so a mismatch means the phone can't decrypt); leave `SMS_GATEWAY_URL=https://api.sms-gate.app/3rdparty/v1`. This delivers OTP but is **not** a certified A2P channel — never set `SMS_PROVIDER_CERTIFIED=true` for the bridge, and confirm the SIM operator permits this traffic at OTP-only volume. Keep the phone charged, online, and in-credit; if it's unreachable, login fails cleanly and guest checkout still works. After activation, verify with `node apps/api/scripts/smoke-sms-gateway.mjs --url https://api.ali.kg --phone +996XXXXXXXXX` — it confirms the server accepted and dispatched the request; then check the recipient phone for the actual SMS (arrival can only be confirmed on the handset).
- One AI key: `AI_PROVIDER_KEY` or `OPENROUTER_API_KEY`.
- Telegram: `TELEGRAM_BOT_TOKEN`, webhook URL/secret, callback QA.
- WhatsApp: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, webhook verify token.
- Apple login: `APPLE_CLIENT_ID` plus Apple callback/client configuration.
- Campaign delivery: `NOTIFICATION_TRANSPORT=channels` with Novu, SMTP, Expo Push, Telegram, or WhatsApp credentials.
- Native Android Staff push: `FCM_SERVICE_ACCOUNT_JSON` (or the mounted `FCM_SERVICE_ACCOUNT_KEY_PATH`), ignored app `google-services.json`, and `FCM_PROVIDER_CERTIFIED=false` until physical-device delivery/routing passes. iOS still requires APNs credentials and device certification; Expo remains legacy compatibility only.
- Media: S3/MinIO values for production Evidence Vault storage.
- Observability: `SENTRY_DSN` or compatible GlitchTip/Sentry DSN.
- Metrics: a random high-entropy `METRICS_TOKEN`; scrape `/api/metrics` only through a private monitoring path.
- Native HTTPS links: `APPLE_TEAM_ID` for `/.well-known/apple-app-site-association` and comma-separated `ANDROID_APP_LINK_SHA256` release certificate fingerprints for `/.well-known/assetlinks.json`. Both endpoints fail closed with `503` until signing values are supplied.
- `POS_HARDWARE_CERTIFIED=true` only after the on-site hardware checks below pass.

## 3. Check external readiness

```bash
npm run launch:preflight
npm run launch:readiness
npm run launch:check
npm run launch:readiness:strict
```

`launch:preflight` checks the core production env: `NODE_ENV=production`,
`DATABASE_URL`, exact `CORS_ORIGINS`, strong `JWT_SECRET`, `AUTH_OTP_DEV_ECHO=false`, and enabled background
jobs. The API runs the same core check before production bootstrap and applies Helmet CSP/security headers.
`launch:readiness` prints a secret-safe external report. `launch:check` runs the
strict core preflight and strict external readiness gates together.

For machine-readable automation:

```bash
npm run preflight -w @alistore/api -- --env-file .env.production --json
npm run readiness -w @alistore/api -- --env-file .env.production --json
```

## 4. Provider QA

Before setting the strict gate to green, verify live callbacks:

- Payment provider creates a real intent, rejects an invalid webhook signature, deduplicates a replay, reconciles amount/order, and completes a refund reconciliation run.
- Telegram bot receives webhook updates and opens `/tg` with valid signed initData.
- WhatsApp Cloud API can send a template/test message and validate the webhook token.
- Apple Sign in returns an identity token accepted by `POST /auth/social/apple`.
- Campaign delivery sends through the selected channel transport without fallback logs.
- Native Android Staff obtains an FCM token, binds it to the active staff JWT through `POST /notifications/push-tokens`, receives a task notification and opens its scoped deep link. Native iOS separately proves APNs registration and delivery.
- Sentry/GlitchTip receives a controlled test error from the production API.

## 5. POS hardware certification

Set `POS_HARDWARE_CERTIFIED=true` only after all checks pass in the store:

- Silent ESC/POS or QZ Tray receipt print verified on the store printer.
- Bank terminal SDK/payment handoff verified with the provider account.
- Real scanner QA completed for SKU/barcode and IMEI input.

## 6. Final signoff

```bash
npm run mvp:verify -- --skip-e2e
npm run launch:check
```

If both pass in the deployment environment and the ERP `/erp` → `Готовность` tab shows
zero blocking checks, the project is ready for production launch.
