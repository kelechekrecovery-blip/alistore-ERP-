# App Store / Google Play Review Checklist

## Required External Accounts

- Apple Developer Program account.
- App Store Connect app record for bundle id `kg.alistore.mobile`.
- Google Play Console app record for package `kg.alistore.mobile`.
- Expo account and EAS project linked from `apps/mobile`.
- App Store Connect API key or Apple ID/team env vars.
- Google Play service account with internal/production release permissions.

## Required Production Values

- `EXPO_PUBLIC_API_BASE=https://.../api` in the EAS production environment.
- `EXPO_PUBLIC_EAS_PROJECT_ID` from the linked EAS project.
- Production API must pass `npm run launch:check` at the repository root.
- Demo customer account and staff account for reviewers.
- Published privacy policy: `https://alistore.kg/privacy`.
- Published support URL: `https://alistore.kg/support`.

## TestFlight First

1. Run `npm --prefix apps/mobile run store:preflight:production`.
2. Run `npm --prefix apps/mobile run eas:build:ios`.
3. Submit to TestFlight: `npm --prefix apps/mobile run eas:submit:ios`.
4. Test customer checkout and staff POS on physical devices.
5. Add release notes and submit external TestFlight before App Store review.

## Google Play Internal First

1. Run `npm --prefix apps/mobile run store:preflight:production`.
2. Run `npm --prefix apps/mobile run eas:build:android`.
3. Submit to internal track: `npm --prefix apps/mobile run eas:submit:android`.
4. Review Play Pre-launch report.
5. Promote internal -> closed -> production after QA.

## Manual QA Matrix

- iPhone small screen and large screen.
- Android small screen and large screen.
- Slow network and no-network states.
- Customer catalog/search/favorites/cart.
- Checkout with cash and sandbox online payment.
- Staff login/logout and SecureStore persistence.
- Staff order queue.
- POS sale with cash/card/QR methods.
- Discount above approval threshold returns approval state.
- Push permission prompt and `POST /notifications/push-tokens` registration.
