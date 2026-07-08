# Native Store Release Runbook

Run all commands from the repository root unless stated otherwise.

## One-Time Setup

1. Create the Expo project and link `apps/mobile` to the AliStore Expo account.
2. Create App Store Connect app `kg.alistore.mobile`.
3. Create Google Play app `kg.alistore.mobile`.
4. Copy `apps/mobile/.env.production.example` to `apps/mobile/.env.production`.
5. Fill `EXPO_PUBLIC_API_BASE`, `EXPO_TOKEN`, Apple credentials, and Google Play credentials.
6. Put ignored local credential files in `apps/mobile` when using file paths:
   - `AuthKey_*.p8`
   - `google-service-account.json`

## Preflight

```bash
npm run launch:check
npm run mobile:store-preflight
npm --prefix apps/mobile run store:preflight:production
```

The production preflight must pass before any store build. If it fails, do not
submit a binary.

## Build

```bash
npm --prefix apps/mobile run eas:build:ios
npm --prefix apps/mobile run eas:build:android
```

Use App Store/TestFlight and Play Internal builds first. Do not promote to
production before physical-device QA passes.

## Submit

```bash
npm --prefix apps/mobile run eas:submit:ios
npm --prefix apps/mobile run eas:submit:android
```

The Android submit profile starts on the internal track with draft release
status. Promote manually after review of the Play pre-launch report.

## QA Gate

- Customer catalog, search, favorites, cart, checkout, account.
- Staff login/logout and token persistence.
- Staff order queue.
- POS sale with cash, card, QR, and installment labels.
- Approval threshold behavior for discounts.
- Offline/slow-network states.
- iPhone small/large screen and Android small/large screen.
- App Store privacy labels and Google Play data safety match `store/privacy-data.md`.
