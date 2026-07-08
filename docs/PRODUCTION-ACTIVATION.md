# AliStore Production Activation

This runbook is for the final step after the software MVP gate is green. It does not
store secrets in git and it keeps production credentials separate from local test DBs.

## 1. Prove the software build

```bash
npm run mvp:verify
```

This runs Prisma schema validation, Prisma Client generation, API build, web build,
full API Jest, Playwright E2E, and a non-strict external readiness report.

## 2. Prepare production env

```bash
cp apps/api/.env.production.example apps/api/.env.production
```

Fill `apps/api/.env.production` with real values. The file is ignored by git.

Required for a production-ready report:

- `DATABASE_URL`, `JWT_SECRET`, `AUTH_OTP_DEV_ECHO=false`.
- One AI key: `AI_PROVIDER_KEY` or `OPENROUTER_API_KEY`.
- Telegram: `TELEGRAM_BOT_TOKEN`, webhook URL/secret, callback QA.
- WhatsApp: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, webhook verify token.
- Apple login: `APPLE_CLIENT_ID` plus Apple callback/client configuration.
- Campaign delivery: `NOTIFICATION_TRANSPORT=channels` with Novu, SMTP, Telegram, or WhatsApp credentials.
- Media: S3/MinIO values for production Evidence Vault storage.
- Observability: `SENTRY_DSN` or compatible GlitchTip/Sentry DSN.
- `POS_HARDWARE_CERTIFIED=true` only after the on-site hardware checks below pass.

## 3. Check external readiness

```bash
npm run launch:readiness
npm run launch:readiness:strict
```

`launch:readiness` prints a secret-safe report. `launch:readiness:strict` exits non-zero
until every blocking provider/hardware check is ready.

For machine-readable automation:

```bash
npm run readiness -w @alistore/api -- --env-file .env.production --json
```

## 4. Provider QA

Before setting the strict gate to green, verify live callbacks:

- Telegram bot receives webhook updates and opens `/tg` with valid signed initData.
- WhatsApp Cloud API can send a template/test message and validate the webhook token.
- Apple Sign in returns an identity token accepted by `POST /auth/social/apple`.
- Campaign delivery sends through the selected channel transport without fallback logs.
- Sentry/GlitchTip receives a controlled test error from the production API.

## 5. POS hardware certification

Set `POS_HARDWARE_CERTIFIED=true` only after all checks pass in the store:

- Silent ESC/POS or QZ Tray receipt print verified on the store printer.
- Bank terminal SDK/payment handoff verified with the provider account.
- Real scanner QA completed for SKU/barcode and IMEI input.

## 6. Final signoff

```bash
npm run mvp:verify -- --skip-e2e
npm run launch:readiness:strict
```

If both pass in the deployment environment and the ERP `/erp` → `Готовность` tab shows
zero blocking checks, the project is ready for production launch.
