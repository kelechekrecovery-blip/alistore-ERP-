# Supply Release Gate

Run the complete, non-deploying gate from the repository root:

```bash
npm run release:gate:supply
```

Use `npm run release:gate:supply:plan` only to verify orchestration and produce a
`BLOCKED` evidence manifest without executing expensive checks.

The gate validates Prisma, runs the full API suite twice on separately isolated
and migrated PostgreSQL databases, tests and builds Web, creates another clean
database for Playwright Chromium/Firefox/WebKit, runs security and native hooks,
runs strict production preflight/readiness, and records external certification
status. It never deploys or submits a store release. A full run requires an
explicit test database URL plus `ALISTORE_TEST_DATABASE_CONFIRMED=1`; it refuses
to use the same URL as `DATABASE_URL`.

Evidence is written to
`docs/acceptance/artifacts/supply-release-gate-<timestamp>.json` and to
`supply-release-gate-latest.json`. `PASS` means every technical and external
gate passed. `BLOCKED` means code checks may have passed but at least one
tool/certification is unavailable. `FAIL` means an executed technical check
failed.

External readiness is attested only by explicit boolean markers:

- `PAYMENT_PROVIDER_CERTIFIED`
- `REFUND_WEBHOOK_CERTIFIED`
- `SMTP_CERTIFIED`, `SMS_PROVIDER_CERTIFIED`
- `FCM_CERTIFIED`, `APNS_CERTIFIED`
- `OBJECT_STORAGE_CERTIFIED`
- `FISCAL_OFD_CERTIFIED`
- `MONITORING_CERTIFIED`
- `POS_HARDWARE_CERTIFIED`

The script never reads or prints provider credentials. Until separate cutover
approval, `TO_ORDER_CHECKOUT_ENABLED`, `SUPPLY_CANCELLATION_ENABLED`, and
`SUPPLY_AUTO_REFUND_ENABLED` must remain false or unset.
