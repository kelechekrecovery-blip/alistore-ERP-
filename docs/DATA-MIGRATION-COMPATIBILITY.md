# Data Migration Compatibility Contract

This is the authoritative migration and application-rollback contract for
AliStore. It applies to every PostgreSQL/Prisma schema change, data backfill,
index change, and release that depends on one. It supplements the deploy
mechanics in `apps/api/scripts/deploy-database.mjs`; it does not authorize a
different deployment path.

## Non-negotiable rule

Migrations are additive and forward-only. Application rollback means deploying
the previous **compatible** application image and running `prisma migrate deploy`,
which must be a no-op for an already-migrated database. Do not run reverse,
down, or destructive schema migrations during an incident or image rollback.
Correct a bad schema/data change with a later, forward migration after the
service is stable.

This rule is intentionally stricter than the historical conditional wording in
`infra/RUNBOOK.md`: no release plan may designate a production schema rollback
as allowed. The Render CD workflow and `docs/GO-LIVE-RUNBOOK.md` already follow
this rule.

## Required lifecycle

Every change follows this lifecycle; combine releases only when the evidence
shows that every deployed image can safely use the intermediate state.

1. **Additive schema/index.** Add tables, nullable columns, optional relations,
   non-breaking indexes, or an expansion representation. Existing reads and
   writes remain valid.
2. **Compatible deploy.** Deploy code that tolerates both old and new rows and
   does not require the new field/value to exist. The production command remains
   `npm run db:deploy -w @alistore/api`, which uses `DIRECT_DATABASE_URL` in
   production, runs `prisma migrate deploy`, validation, post-deploy indexes,
   and reference data.
3. **Backfill or dry-run.** Run an idempotent, bounded, observable backfill only
   after the compatible image is live. First dry-run it with production-shaped,
   populated data; record the intended count, actual count, errors, duration,
   batches, and restart behavior. Throttle/pause it if it harms production.
4. **Reconcile.** Compare source and target counts, required-value/null counts,
   duplicates, referential integrity, business totals, and affected audit/event
   records. Investigate every mismatch before enforcing a new invariant.
5. **Dual read/write when needed.** For representation or semantic changes,
   write both forms and read with a defined precedence/fallback until
   reconciliation proves the new form complete. Reads must remain compatible
   with rows written by the previous image.
6. **Later retirement release.** Only after an agreed observation window and
   evidence that no supported image, worker, job, integration, or report reads
   the old shape may a separate forward release remove old reads/writes and
   retire data. Retirement is never part of the expansion release or rollback.

## Release gates and evidence

Before production deployment, the release owner must retain the following in
the release evidence (without credentials or connection strings):

- A fresh named backup identifier, timestamp, checksum/size, storage location,
  and a successful restore-verification result. A scheduled backup alone is not
  sufficient. The existing production-bucket restore gap remains a launch gate;
  do not claim it passed without that evidence.
- A disposable PostgreSQL 16 rehearsal of the exact candidate revision and
  pending migrations. The CD workflow supplies an ephemeral PG16 rehearsal;
  manual paths must achieve the same result. It must run the same database
  deployment chain, including post-deploy checks/indexes and reference data.
- A populated-data probe using a disposable, access-controlled production-shaped
  restore or representative populated dataset. It must exercise legacy rows,
  new writes, backfill/dry-run behavior, affected queries, constraints, and
  reconciliation queries; synthetic empty-schema success is insufficient.
- The compatibility matrix naming the prior image, candidate image, workers and
  integrations, their schema assumptions, and the image approved for rollback.

After deployment, retain migration status/output, deployed image/revision,
backfill result (or explicit `not applicable`), reconciliation query results,
health/smoke results, and the rollback decision/result. Fail health, validation,
or reconciliation closed: stop subsequent phases, preserve evidence, and use a
compatible image rollback or forward fix. Never conceal a mismatch by editing
the expected totals.

## Change-specific rules

### Enums and constrained values

Do not remove or rename an enum value in place. Expand accepted values first;
code must tolerate both old and new values. For a semantic rename, introduce a
new value/representation, dual-read/write and reconcile before a later
retirement release. Treat database enum operations as compatibility-sensitive:
rehearse them on PG16 and populated data because application/library support and
transaction behavior can differ.

### Unique indexes and uniqueness constraints

First probe duplicates and define their owner-approved resolution. Build large
indexes outside Prisma migration transactions with `CREATE [UNIQUE] INDEX
CONCURRENTLY`; verify `indisvalid`, `indisready`, and `indislive` before relying
on them. The existing `postdeploy-indexes.mjs` pattern uses a direct URL,
advisory locking, and verification; follow that pattern or an equally strict
one. Only attach/enforce the uniqueness after duplicate reconciliation passes.
An invalid or partial concurrent index is a failed deployment condition, not a
reason to bypass the constraint.

### Required columns and relations

Add a nullable column/relation first. Ship tolerant code, backfill and reconcile
all historical rows, then enforce `NOT NULL` or the required relation in a later
forward migration. A default does not waive the populated-data probe or prove
business correctness. Do not deploy code that assumes a required field before
the database evidence establishes it.

### Table and field retirement

Retirement requires a documented consumer inventory, dual-read/write or a
compatibility view where needed, a completed reconciliation, and an observation
window covering scheduled jobs and integrations. Remove readers/writers first;
drop a table, column, index, constraint, or enum value only in a later forward
release with a fresh backup and the same rehearsal/probe evidence. Never use a
drop as rollback.

### Long-running or locking indexes

Classify index size and lock risk before release. Use concurrent operations
where PostgreSQL permits, outside a transaction, with explicit lock/statement
timeouts, single-run/advisory-lock coordination, monitoring, and post-build
validity checks. Schedule a maintenance window or split the release when a
non-concurrent operation cannot meet the service lock budget. Do not cancel and
silently ignore an invalid index; repair it forward and re-verify.

## Incident rollback procedure

1. Freeze backfills and record the current migration/image state and symptoms.
2. Select the pre-approved image that is compatible with the expanded schema;
   do not select an image that rejects new enum values or assumes the old
   required/retired shape.
3. Deploy that image through the normal platform path. `prisma migrate deploy`
   may run but must apply no reverse schema change.
4. Verify health, affected critical flows, migration status, data preservation,
   and reconciliation indicators. Record the result and then prepare a forward
   repair release.

`git checkout`, direct SQL, Prisma commands, and Render controls do not override
this contract. Secrets stay deploy-owned and are never placed in evidence.

## Authoritative links

- [Master plan](MASTER-PLAN.md) — authoritative planning index.
- [Production activation](PRODUCTION-ACTIVATION.md) — operator release gate.
- [Go-live rollback](GO-LIVE-RUNBOOK.md#rollback) — Render image rollback.
- [Infrastructure runbook](../infra/RUNBOOK.md#9-rollback) — historical
  self-hosted command shape; this policy controls any schema conflict.
