# Feature-flag mutation cutover

This is the executable retirement procedure for the six supply feature-flag
overrides. It is an explicitly approved exception to transparent old-image
mutation compatibility. Reads and effective evaluation remain compatible, but
after the cutover migration a previous image's feature-flag PATCH/DELETE path is
intentionally rejected by PostgreSQL. Do not describe that rollback as fully
mutation-compatible.

## Why this boundary exists

The durable generation and exact audit binding cannot safely accept the old
missing-row/null concurrency contract. The database therefore rejects every
unmarked INSERT, UPDATE, and DELETE after cutover, including zero-row reset
statements. This prevents a drained or rolled-back image from resurrecting an
override with stale intent.

Gate 0 approves this as a separately staged control-plane retirement release,
not as an ordinary expand migration. It may run only through
`npm run db:deploy -w @alistore/api`; direct `prisma migrate deploy` is not the
production procedure for this boundary.

## Operator procedure

1. Record the exact 40-character candidate SHA. Complete the backup, PostgreSQL
   16 rehearsal, populated-data probe, reconciliation, and rollback-image
   inventory required by `DATA-MIGRATION-COMPATIBILITY.md`.
2. Announce and begin an owner-control freeze. Close the ERP feature-flag view,
   stop automation that calls `/api/feature-flags`, and tell owners not to submit
   flag changes until the new API is healthy. Ordinary supply reads and domain
   work may continue; this freeze is only for the six control-plane mutations.
3. If a rehearsal reports ambiguous current-row evidence, use the currently
   deployed feature-flag API to PATCH the intended boolean with a new unique
   reason, or DELETE it to restore deploy fallback. Never edit `AuditEvent` and
   never infer intent order from event timestamps or IDs.
4. In the API service's secret-managed deployment environment set:

   ```text
   FEATURE_FLAG_CUTOVER_ACK=drain-and-fence-v1
   FEATURE_FLAG_CUTOVER_ACK_SHA=<exact candidate SHA>
   ```

   Render supplies `RENDER_GIT_COMMIT`; other production-mode runners must set
   `ALISTORE_RELEASE_SHA`. Both production and the production-mode staging
   rehearsal declare these one-release variables in their Render blueprints.
   A missing, malformed, or different SHA stops before Prisma runs.
5. Trigger the API deploy. The predeploy command acquires all six existing
   per-key advisory locks before Prisma starts. Acquiring them drains any
   cooperative in-flight owner mutation and keeps later mutations queued while
   the migration barrier verifies history and installs the fail-closed database
   contract. The bounded transaction also briefly fences generation changes and
   AuditEvent writes while it makes the exact evidence references durable. The
   Prisma subprocess is hard-stopped after 15 minutes, the application cutover
   wait expires 30 seconds later, and PostgreSQL releases an otherwise orphaned
   idle gate transaction after another 30 seconds. The deploy fails if it cannot
   establish that boundary or record the migration. SIGINT, SIGTERM, and SIGHUP
   cancel the full detached migration process group before the wrapper propagates
   the signal and releases its database session. A synchronous process-exit guard
   also kills that group if an uncaught wrapper failure terminates predeploy.
6. Route the current API image, verify `GET /api/feature-flags`, perform one
   owner set/reset smoke with a unique reason, verify its Ledger event and
   generation, then release the announced owner-control freeze. Remove the two
   one-release acknowledgement values after the migration is recorded.

## Current control during image rollback

A previous image may continue reading override rows and evaluating fallback,
but its feature-flag mutations are no longer supported. During an emergency
application rollback, keep the owner UI read-only and run the reviewed current
control script from the candidate image or a trusted checkout with the
secret-managed direct database connection.

List state first. Database-backed rows include their boolean and revision. A
missing row is reported as `enabled: null, source: unverified-fallback`: a
checkout cannot authenticate the rolled-back service's separate deployment
environment, so the script never guesses that effective fallback boolean.

```bash
node apps/api/scripts/feature-flag-control.mjs list
```

Set an override using the revision returned by `list` (`none` means the key has
never had a generation):

```bash
node apps/api/scripts/feature-flag-control.mjs set \
  --key supply.to_order_checkout \
  --enabled false \
  --reason "Incident rollback: pause to-order checkout" \
  --actor "operator:<change-reference>" \
  --expected-revision 7 \
  --confirm-current-image-control
```

The script uses `DIRECT_DATABASE_URL` before `DATABASE_URL`, takes the same
per-key lock, requires optimistic concurrency, sets the current mutation marker,
and appends exact correlated audit evidence in the same transaction. It accepts
only explicit database `set` mutations; it deliberately has no direct `reset`
operation because a checkout cannot prove the deployment fallback it would
restore. To remove an override, route the current API in its authentic deployment
environment or deploy a reviewed current image, then use its owner reset path.
Resetting a row that is already absent is an idempotent current-API no-op: it
returns the current fallback state and retained generation without appending a
false change event.
Advisory lock acquisition is bounded by a 10-second lock timeout, statements by
15 seconds, and client queries by 20 seconds, so the incident path rolls back and
escalates instead of hanging. It never prints connection strings or raw
environment values.

## Failure and rollback rules

- If predeploy fails before the boundary commits, do not clear the operational
  freeze and guess. Inspect the secret-safe migration detail, reconcile through
  the live current-compatible API, resolve only the named failed Prisma attempt
  as rolled back, and retry the same reviewed SHA.
- If the current image fails after cutover, roll back application traffic only.
  Do not reverse the schema or remove the database guard. Previous-image reads
  remain available; use the direct current control script only to set an explicit
  database boolean. Restoring deployment fallback requires the current API in its
  authentic deployment environment.
- If the control script cannot prove the expected revision or exact audit write,
  it rolls back. Preserve the evidence and escalate; never bypass the marker or
  deferred evidence constraint with ad-hoc SQL.
