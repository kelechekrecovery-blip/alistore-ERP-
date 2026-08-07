# Gate 0 final integration fix — 2026-08-07

## Status and immutable boundary

**LOCALLY ACCEPTED.** The final source and evidence tree passed the committed trusted bootstrap
and every strict ecosystem contract. This replaces the earlier blocked result caused by a stale
toolchain lock and stale pre-fix visual/native evidence.

- Candidate base: `da0bc7e12d011d735ea19994bfc58af39cb69199`.
- Final integration implementation: `764ded8aa75bd5f8f2f37ecf28b803517417515e`.
- Final source change covered by evidence: `7ac3cb43eede743eee5ea42672bf630a40216cac`.
- Final committed evidence tip before this report: `6b4db2a858027c9e109fa4c6c6b2b66b5a2eb795`.
- Audited source-tree digest: `425fdaa357435fbc158a925c75d7d73d7a10fa24ce2471406b134b22da6a41f6`.
- Trusted strict audit: **PASS (exit 0), 16/16 contracts**, from the clean evidence tip above.
- Unrelated preserved worktree change: `apps/web/tsconfig.json` (not staged or modified by this work).

This is local software acceptance only. No production database was migrated by this work, and no
live provider, hardware, physical-device, production restore, owner signoff, first-store UAT, or
pilot certification is claimed.

## Findings closed

1. **Exact feature-flag evidence.** The forward-only
   `20260807_feature_flag_override_evidence_binding` migration accepts a surviving override only
   when exactly one row-fingerprint event proves the exact JSON boolean state. Missing, malformed,
   opposite, duplicate, conflicting, precommitted, superseded, or cross-transaction evidence is
   rejected. Generation and event retention remain fail closed.
2. **Executable cutover and rollback boundary.** Production database deployment requires the
   SHA-bound `drain-and-fence-v1` acknowledgement while the migration is pending and holds all six
   per-key mutation locks. The direct control script is allowlisted, OCC-bound, explicitly
   confirmed, audited, and secret-safe.
3. **Authoritative supply release state.** The release gate evaluates
   `database override > environment alias > disabled default`; strict release PASS requires
   explicit database `false` overrides for all six keys. Missing, unreachable, malformed,
   conflicting, or fallback-sourced state fails.
4. **Trusted worktree and toolchain identity.** The bootstrap pins the selected worktree, common
   Git directory, Node/npm/runtime libraries, dependency tree, Playwright/Jest shims, browser, and
   package lock. Generated absolute tool paths are normalized without weakening digest checks.
5. **Disposable evidence database.** Trusted recording rejects ambient `DATABASE_URL` and
   `E2E_DATABASE_URL`, requires an explicitly confirmed canonical loopback
   `alistore_evidence_*_test` URL, and passes that URL to API and browser tests. Automatic browser
   preparation refuses non-local or non-test database names.
6. **Trusted Android execution.** Android UI evidence binds the literal SDK, adb, Gradle wrapper,
   Gradle distribution, and Gradle home; runs without a shell, daemon, or configuration cache; and
   sandboxes project/user/distribution initialization surfaces. A concurrent hostile writer test
   proves injected `local.properties` and distribution `init.d` scripts are not consumed.
7. **Truthful acceptance semantics.** The acceptance manifest binds each required result to its
   command, toolchain, exact source tree, and content hash. The strict audit refuses dirty source,
   dirty evidence, broken design links, skipped visual tests, stale native results, or partial
   reconciliation.

## Final verification evidence

| Gate | Final result |
|---|---|
| Node runner/toolchain contracts | 230/230 passed; `node scripts/regenerate-toolchain-lock.mjs --check` passed. |
| Toolchain binding | Package lock `fa99e785934cf73375844e58f7463926ad9e9a4ea43832b5510fce72809d366d`; node_modules tree `338d922b82543f57b311edd56a282c1701c6ac062da3ac6ac3fa55bea68c99e9`; full lock digest `4e48e11a0426fbe57a5e6c95d8468a649a30dd4932dde7641ad9d2aef93ec86f`. |
| Web visual acceptance | 3/3 exact screenshot comparisons passed. |
| iOS app UI | Client 28/28, Staff 11/11, Courier 3/3, POS 5/5; 47/47 total, `TEST SUCCEEDED`. |
| Android app UI | Core 55/55, Client 1/1, Staff 2/2, Courier 1/1, POS 2/2; 61/61 total, `BUILD SUCCESSFUL`. |
| POS/refund reconciliation | Browser 1/1 passed. |
| Courier/COD reconciliation | Browser 1/1 passed. |
| Service/loaner reconciliation | API 11/11 and browser 3/3 passed. |
| Procurement/sale reconciliation | API 12/12 and browser 1/1 passed. |
| Combined reconciled ecosystem | All 4/4 verticals passed unchanged and fail fast. |
| Independent reviews | Trusted Android code and security reviews approved with zero findings; Android Kotlin and general code reviews approved with zero findings; original implementation code, TypeScript/JavaScript, security, and database reviews had no remaining Critical/Important findings. |
| Committed trusted strict audit | Exit 0 with all 16 contracts PASS: clean source/evidence, visual, iOS, Android, four individual reconciliations, combined reconciliation, design links, native build gates, and truthful native-limit disclosure. |

## Hash-bound accepted artifacts

| Gate | Artifact |
|---|---|
| Visual | `visual-14b2c2fdad12bfa5c916de7200319eaa6261379a15f8b6d4ddecceda6cccc6be.json` |
| iOS app UI | `ios-app-ui-00cf9eb1487fdeb4ab60260537039ae237c6dd671ace894dc8c77deb22f2a7de.json` |
| Android app UI | `android-app-ui-7fb099bf675c30b0f03f0ca5d0d3efd99b8b4debb56d78652655c541a778ab99.json` |
| POS/refund | `pos-refund-reconciliation-3bb87c003228b0ffabb4036f9bb625a19a12d7cbd3c1871e077591fa48cccf67.json` |
| Courier/COD | `courier-cod-reconciliation-555d4828425a182632c5d30bf4f83e99ab7d21bd5e6e5dcdf146ac6dba532a27.json` |
| Service/loaner | `service-loaner-reconciliation-55aad45a0f0334f3590c1ab12a4af145c879b9a9118dc15a9c7381b19185e39f.json` |
| Procurement/sale | `procurement-sale-reconciliation-3e5ff9d6db0d018536e98361689efd9f72f93fcc42098b52f4d2e9ea2c2e54c7.json` |
| Combined | `reconciled-e2e-c3f1014f827e6cafdc9459d1d07aaa18258547cbe19a89c37149677c2fe700c4.json` |

Every artifact above records the same source-tree digest and the exact disposable identity
`postgresql://127.0.0.1:5432/alistore_evidence_gate0_f4758d7b_test`. The database had zero active
sessions at disposal and was dropped successfully after evidence and audit completion.

## Shared test-database safety observation

Before isolation, the protected shared `alistore_test` sentinels were recorded as 1 verified phone
and 1 refresh-token family. At final read-only recheck they were 0/0. Recording was paused and the
disposable database preserved while provenance was checked.

- All refreshed artifacts identify only the disposable database.
- The shared database contained 166 migrations, including three authentication migrations from a
  separate production-auth branch/worktree that are absent from this evidence branch; the
  disposable database contained the evidence branch's 163 migrations.
- The shared database had one customer, no refresh tokens, and no audit events; the disposable had
  no customer, refresh-token, or audit-event rows and did not contain the out-of-branch columns.
- Three long-lived shared sessions belonged to `test-feature-flag-control.mjs` processes in the
  requested branch worktree and showed `ROLLBACK` as their last query. PostgreSQL statement and
  connection logging were disabled, so the exact external writer cannot be reconstructed.

These facts establish concurrent external shared-database drift rather than recorder leakage. No
shared row, session, schema, or migration was changed or restored during this investigation. The
exact disposable database alone was removed.

## Acceptance rule

Gate 0 is locally accepted because the final implementation and all required evidence are
committed, independent reviews have no open Critical/Important findings, every required result is
hash-bound to the same final source tree, and the committed trusted strict audit exits successfully.
Production/provider/hardware readiness remains a separate release decision.
