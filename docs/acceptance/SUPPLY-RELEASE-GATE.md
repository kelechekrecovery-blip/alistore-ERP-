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

The release-sensitive feature-flag check is a read-only query against the target
database selected by `SUPPLY_GATE_TARGET_DATABASE_URL`, then
`DIRECT_DATABASE_URL`, then `DATABASE_URL`. It evaluates each allowlisted key
with the production rule **database override → legacy environment alias → safe
false default**. Environment/default fallback is reported only after a successful
database query proves that the key has no override, but it cannot authenticate a
separately deployed target's environment. The strict release row therefore passes
only when all six keys have explicit disabled database overrides. A missing row or
URL, unreachable database, absent table, malformed/duplicate result, or query failure
is `FAIL`; the gate can never pass from environment values alone. Evidence contains only
allowlisted keys, effective booleans and `database|environment|default` source,
never a URL or raw environment value. Target/direct/test database variables are
removed from the base environment of build, web, native, scanner, and test
subprocesses; only commands that explicitly require a scoped database receive one.

Evidence is written to
`docs/acceptance/artifacts/supply-release-gate-<timestamp>.json` and to
`supply-release-gate-latest.json`. `PASS` means every technical and external
gate passed. `BLOCKED` means code checks may have passed but at least one
tool/certification is unavailable. `FAIL` means an executed technical check
failed.

External certification PASS requires the pinned Ed25519 evidence artifact
described by `config/supply-release-cert-policy.json`; legacy environment
booleans cannot certify a provider. The covered capability names are:

- `PAYMENT_PROVIDER_CERTIFIED`
- `REFUND_WEBHOOK_CERTIFIED`
- `SMTP_CERTIFIED`, `SMS_PROVIDER_CERTIFIED`
- `FCM_CERTIFIED`, `APNS_CERTIFIED`
- `OBJECT_STORAGE_CERTIFIED`
- `FISCAL_OFD_CERTIFIED`
- `MONITORING_CERTIFIED`
- `POS_HARDWARE_CERTIFIED`

The script never reads or prints provider credentials. Until separate cutover
approval, all six supply flags must have explicit database `false` overrides. A database `false`
override safely wins over an environment `true`; a database `true` fails even
when the environment says `false`.
