# AliStore Native

Expo React Native app for the AliStore ecosystem. This is not a PWA, not a
Capacitor shell, and not a WebView wrapper.

## Run

```bash
npm install
EXPO_PUBLIC_API_BASE=http://127.0.0.1:4000/api npm run start -w @alistore/mobile
```

Use a LAN API URL instead of `127.0.0.1` when testing on a physical phone.

## Native scope

- Client app: catalog, search, favorites, cart, promo/bonus toggles, checkout,
  online payment intent, and sandbox payment confirmation.
- Staff/POS app: staff JWT login, SecureStore token persistence, order queue,
  POS ticket, discount/method selection, and `POST /pos/sale`.
- Shared backend contracts stay server-owned: RBAC, stock reservation, approval
  thresholds, payment status, and audit ledger rules remain in the API.
