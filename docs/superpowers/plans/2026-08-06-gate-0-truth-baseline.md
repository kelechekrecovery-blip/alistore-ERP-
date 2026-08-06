# Gate 0 Truth and Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reproducible, source-controlled truth baseline for every AliStore surface and introduce one audited, fail-closed server feature-flag registry without changing existing business behavior.

**Architecture:** Extend the existing ecosystem evidence/audit tooling and human traceability document with a validated JSON surface manifest. Add a dedicated FeatureFlagsModule beside the numeric SettingsModule; database overrides take precedence over legacy environment aliases, which take precedence over safe registry defaults, so rollout does not silently change current deployments.

**Tech Stack:** Node.js ESM scripts/tests, NestJS, Prisma/PostgreSQL, Jest/Supertest, Next.js ERP UI, existing AuditService/Event Ledger and readiness tooling.

## Global Constraints

- Work only in `/Users/alistore/.codex/worktrees/80b1/alistore-erp` on `codex/fix-otp-auth-confirmation`.
- Preserve unrelated user changes; the two new master/plan documents are expected Gate 0 inputs.
- Do not claim provider, hardware, physical-device, production restore or pilot evidence that was not executed.
- Keep `SettingsModule` numeric financial/business parameters unchanged.
- Feature flags are allowlisted; unknown keys fail closed and are never persisted.
- Existing supply environment flags remain compatible during migration.
- Evaluation precedence is active database override, then legacy environment alias, then registry default.
- Every new flag defaults to disabled; existing aliases retain their current effective value.
- Provider credentials and certification markers remain deploy-owned environment/readiness state, not mutable feature flags.
- Feature-flag mutations are owner-only, atomic with `feature_flag.changed`, and require a non-empty reason.
- Public routes receive no feature-flag projection in Gate 0; only staff reports/owner management are exposed.
- Source manifests are reviewed truth; derived reports live under ignored `.artifacts/`.
- Migrations are additive and forward-only; application rollback must remain compatible with the new table.
- Every task follows failing test → implementation → focused verification → self-review → atomic commit.

---

### Task 1: Reproducible Gate 0 Baseline Capture

**Files:**
- Create: `scripts/gate0-baseline.mjs`
- Create: `scripts/__tests__/gate0-baseline.test.mjs`
- Modify: `package.json`
- Create: `docs/acceptance/gate-0-baseline-2026-08-06.md`

**Interfaces:**
- Produces CLI `npm run gate0:baseline`.
- Produces ignored `.artifacts/gate-0/baseline.json` with `capturedAt`, `git.sha`, `git.branch`, `git.changedPaths`, runtime/tool versions and command availability.
- The acceptance Markdown records current SHA `c4963477395b091726fbd587f3f523d46408e24e` as the pre-program code baseline and explicitly lists the two new plan documents as program inputs, not pre-existing code.

- [ ] Write Node tests for clean JSON shape, deterministic changed-path sorting, graceful unavailable-tool reporting and secret-free output.
- [ ] Run `node --test scripts/__tests__/gate0-baseline.test.mjs` and confirm failure because the module does not exist.
- [ ] Implement the collector with `execFileSync`/`spawnSync` argument arrays only; never interpolate shell strings or print environment values.
- [ ] Capture Node/npm, PostgreSQL client/server when available, Java, Gradle wrapper, Xcode, Swift, XcodeGen and Playwright versions. Missing optional tools produce `{status:"unavailable"}` rather than failing the collector.
- [ ] Add `"gate0:baseline": "node scripts/gate0-baseline.mjs"`.
- [ ] Run the script and write the acceptance Markdown with exact command/result summaries; distinguish offline checks from owner/external checks.
- [ ] Run focused tests and `git diff --check`.
- [ ] Commit as `chore(gate0): capture reproducible ecosystem baseline`.

### Task 2: Forward-Only Migration and Rollback Contract

**Files:**
- Create: `docs/DATA-MIGRATION-COMPATIBILITY.md`
- Modify: `docs/MASTER-PLAN.md`
- Modify: `docs/PRODUCTION-ACTIVATION.md`

**Interfaces:**
- Produces the canonical lifecycle: additive nullable schema/index → compatible deploy → backfill/dry-run → reconciliation → dual-read/write when needed → later retirement release.
- Defines application rollback as previous compatible image plus no-op `prisma migrate deploy`; destructive schema rollback is forbidden.

- [ ] Write the policy with exact pre-deploy backup, disposable PG16 rehearsal, populated-data probe, post-deploy reconciliation, rollback and evidence requirements.
- [ ] Add explicit rules for enum changes, unique indexes, required columns, table/field retirement and long-running indexes.
- [ ] Link the policy from the authoritative master plan and production activation runbook without reviving superseded phase documents.
- [ ] Scan for contradictions with `apps/api/scripts/deploy-database.mjs`, `.github/workflows/cd-production.yml`, `docs/GO-LIVE-RUNBOOK.md` and `infra/RUNBOOK.md`; resolve the new document to the stricter existing behavior.
- [ ] Run `rg -n "TBD|TODO|reverse migration|rollback.*schema" docs/DATA-MIGRATION-COMPATIBILITY.md` and `git diff --check`.
- [ ] Commit as `docs(gate0): define migration compatibility contract`.

### Task 3: Executable Ecosystem Surface Matrix

**Files:**
- Create: `docs/acceptance/ecosystem-surface-matrix.json`
- Create: `scripts/ecosystem-surface-matrix.mjs`
- Create: `scripts/__tests__/ecosystem-surface-matrix.test.mjs`
- Modify: `package.json`
- Modify: `docs/ECOSYSTEM-TRACEABILITY-MATRIX.md`

**Interfaces:**
- Source row shape: `{id, contour, owner, surface, api, models, rbac, ledger, acceptance, status, blockers}`.
- Allowed contours: `storefront`, `client`, `erp`, `staff`, `warehouse`, `pos`, `courier`, `service`, `business`, `platform`.
- Allowed statuses exactly: `accepted`, `partial`, `placeholder`, `external`, `blocked`.
- CLI `npm run ecosystem:matrix` writes `.artifacts/ecosystem/surface-matrix-report.json`.
- CLI `npm run ecosystem:matrix:strict` exits non-zero on validation or coverage gaps.

- [ ] Write tests for duplicate IDs, invalid status/contour, empty owner, missing blocker on `external`/`blocked`, missing acceptance on `accepted`, unknown API route/model/event/package command, orphaned web/native surface and critical mutation without required Ledger.
- [ ] Run tests and confirm failure because the validator does not exist.
- [ ] Implement manifest parsing and validation by reusing the controller matrix and exact-set coverage primitives; inventory `apps/web/app/**/page.tsx`, four iOS targets and four Android application modules.
- [ ] Validate model names from Prisma schema and event values from `apps/api/src/audit/event-types.ts`; keep RBAC as source/policy references instead of copied role lists.
- [ ] Populate one reviewed row per operational surface so every web route and native target is owned; use honest `partial`/`external`/`blocked` statuses where evidence is incomplete.
- [ ] Add `ecosystem:matrix` and `ecosystem:matrix:strict` package scripts without inserting the new strict gate into `mvp:verify` until the initial manifest passes.
- [ ] Link human traceability rows to manifest IDs and keep the human document as the executive view.
- [ ] Run unit tests, `npm run api:contract:matrix`, `npm run ecosystem:matrix:strict` and `git diff --check`.
- [ ] Commit as `test(gate0): make ecosystem surface ownership executable`.

### Task 4: Audited Server Feature-Flag Registry

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260806_feature_flag_overrides/migration.sql`
- Create: `apps/api/src/feature-flags/feature-flags.registry.ts`
- Create: `apps/api/src/feature-flags/feature-flags.service.ts`
- Create: `apps/api/src/feature-flags/feature-flags.controller.ts`
- Create: `apps/api/src/feature-flags/feature-flags.module.ts`
- Create: `apps/api/src/feature-flags/feature-flags.dto.ts`
- Create: `apps/api/test/feature-flags.e2e-spec.ts`
- Modify: `apps/api/src/audit/event-types.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- `FeatureFlagKey` allowlists the six existing supply/to-order flags.
- Registry metadata: `{key, description, owner, defaultEnabled:false, legacyEnv}`.
- Prisma model `FeatureFlagOverride`: unique `key`, `enabled`, required `reason`, `updatedBy`, `createdAt`, `updatedAt`.
- `FeatureFlagsService.isEnabled(key): Promise<boolean>` uses DB override → legacy env alias → default.
- `FeatureFlagsService.list(): Promise<FeatureFlagState[]>` reports value and source `database|environment|default` without exposing environment contents.
- Staff `GET /feature-flags` requires `reports:read`.
- Owner `PATCH /feature-flags/:key` accepts `{enabled:boolean, reason:string}`.
- Owner `DELETE /feature-flags/:key` accepts `{reason:string}` and restores env/default evaluation.

- [ ] Write failing registry/service/controller tests for fail-closed defaults, env compatibility, DB precedence, reset, unknown-key rejection, RBAC, required reason, exact response projection and one Ledger event per mutation.
- [ ] Run focused tests and confirm failure.
- [ ] Add the additive Prisma model/migration with no update/drop of existing data.
- [ ] Implement typed registry and service; cache only within one request or invalidate immediately after mutation.
- [ ] Implement owner mutations inside `AuditService.transaction` with `EventType.FeatureFlagChanged = 'feature_flag.changed'` and before/after/source metadata containing no secrets.
- [ ] Register module/controller and exact Swagger DTOs.
- [ ] Run Prisma validation, migration safety scan, focused tests, API build and `git diff --check`.
- [ ] Commit as `feat(platform): add audited feature flag registry`.

### Task 5: Migrate Supply Flags and Add ERP Control

**Files:**
- Modify existing flag call sites in catalog, orders and procurement services.
- Modify: `apps/api/src/procurement/supply-operations.service.ts`
- Create: `apps/web/lib/api/feature-flags.ts`
- Create: `apps/web/components/erp/FeatureFlagsView.tsx`
- Modify the existing ERP administration/readiness navigation.
- Modify: `apps/api/src/orders/supply-feature-flags.spec.ts`
- Create: `e2e/erp-feature-flags.spec.ts`

**Interfaces:**
- All six supply/to-order decisions call `FeatureFlagsService.isEnabled()`.
- Supply operations reports the same evaluated state/source as the registry.
- ERP supports list, enable/disable with mandatory reason, and reset-to-deploy-default.
- No customer/public client receives flag state in Gate 0.

- [ ] Update tests first to require central evaluation, exact legacy env parity and immediate DB override/reset behavior.
- [ ] Run focused API tests and confirm failure against direct environment reads.
- [ ] Inject FeatureFlagsService into each flag-owning service and remove duplicate truthy parsers for migrated aliases.
- [ ] Preserve behavior for deployments that only set legacy env aliases.
- [ ] Add typed web client and owner UI with loading, error, permission, confirmation and mutation-failure states.
- [ ] Add Playwright coverage proving a non-owner cannot mutate and an owner change is reflected without restart.
- [ ] Run focused API/Web tests, TypeScript/build gates and `git diff --check`.
- [ ] Commit as `feat(platform): centralize supply feature flags`.

### Task 6: Gate 0 Readiness, Evidence and Integration Gate

**Files:**
- Modify: `apps/api/src/health/external-readiness.ts`
- Modify readiness tests and ERP readiness view as needed.
- Modify: `docs/LAUNCH-BLOCKERS.md`
- Modify: `docs/READINESS.md`
- Modify: `BACKLOG.md`
- Create: `docs/acceptance/gate-0-final-2026-08-06.md`

**Interfaces:**
- Readiness adds explicit rows for APNs, Outbox health/DLQ age, Meilisearch, native links, backup/restore certification and partner payout provider.
- External/live rows remain honest `missing|configured|certified|blocked`; code must not infer certification from an adapter or credential alone.

- [ ] Add failing readiness tests for the missing rows and secret-safe output.
- [ ] Implement the readiness additions without moving provider certifications into mutable feature flags.
- [ ] Update owner/blocker docs with exact close criteria and evidence locations.
- [ ] Run Gate 0 commands: `git diff --check`, focused Node/Jest/Web tests, `npm run api:contract:matrix`, `npm run ecosystem:matrix:strict`, `npm run web:route-audit`, and the strongest practical ecosystem audit.
- [ ] Run production builds for API/web and record exact results; run native builds only if the pinned local toolchain is available, otherwise record the external/tool blocker honestly.
- [ ] Write final evidence with baseline SHA, resulting SHA, commits, test counts, known blockers and no unverified production claims.
- [ ] Update readiness/backlog and commit as `docs(gate0): record truth baseline acceptance`.

## Gate 0 Completion Criteria

- All six tasks have reviewed commits.
- The executable surface matrix has no unknown owner or orphaned route/target.
- Feature flags are typed, audited, server-owned and backward-compatible with legacy supply env aliases.
- Migration and rollback policy is explicit and linked from authoritative runbooks.
- Baseline and final evidence are SHA-bound and distinguish local software from external certification.
- No provider, hardware, physical-device, production restore or pilot claim is marked accepted without live evidence.
