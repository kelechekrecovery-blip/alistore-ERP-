# Gate 0 final integration fix — 2026-08-07

## Status and immutable boundary

**Candidate implemented and independently approved; Gate 0 acceptance is pending the exact
clean-SHA strict audit.** This record intentionally does not inherit the former accepted label
from the superseded Task 6 document.

- Candidate base: `da0bc7e12d011d735ea19994bfc58af39cb69199`.
- Final integration implementation SHA: pending commit.
- Strict trusted-audit SHA and result: pending commit and clean-worktree run.
- Unrelated preserved worktree change: `apps/web/tsconfig.json` (excluded from this work).

No production database was migrated. No provider, hardware, physical-device, production
restore, owner signoff, first-store UAT, or pilot certification is claimed.

## Findings closed by the candidate

1. **Exact feature-flag evidence.** The new forward-only
   `20260807_feature_flag_override_evidence_binding` migration accepts a surviving override
   only when exactly one row-fingerprint event proves the exact JSON boolean state. Missing,
   malformed, opposite, duplicate, or conflicting evidence aborts without using event order.
   Backfilled v1 evidence is immutable; every later write requires one mutation-ID- and
   revision-bound v2 event in the same transaction. Set evidence is retained on the override
   and generation; reset evidence is retained on the row-absent generation and deferred until
   the exact fallback event exists. Generation delete/truncate is rejected, both anchors retain
   their event through deferred restrictive references, and binding-critical event fields cannot
   be changed while referenced. Override truncation fails, and only the nested override trigger
   may advance a generation; direct generation inserts/updates fail even with fabricated evidence.
   A permanent single-use consumption row is created before the application inserts its event,
   so precommitted or superseded events cannot authorize a later mutation. Feature-flag events
   remain immutable after supersession. The consumption claim records PostgreSQL transaction
   identity; the AuditEvent insert trigger and deferred verifiers require the event's creating
   transaction to match, so an uncommitted event from a competing transaction cannot satisfy it.
2. **Executable cutover and rollback boundary.** Production database deployment requires a
   SHA-bound `drain-and-fence-v1` acknowledgement while the migration is pending and holds all
   six per-key mutation locks across Prisma deployment. Previous-image reads remain compatible;
   previous-image mutations are deliberately retired. The current direct control script is
   allowlisted, OCC-bound, explicitly confirmed, audited, and secret-safe. It only sets an
   explicit database boolean; missing rows are reported as unverified fallback and direct reset
   is rejected because a checkout cannot authenticate the deployment environment it would restore.
3. **Authoritative supply release state.** The release gate queries the declared target database
   and evaluates `database override > environment alias > disabled default`. Because a local
   runner cannot authenticate a separate target's environment, strict release PASS requires
   explicit database `false` overrides for all six keys. Missing, unreachable, malformed,
   conflicting, or fallback-sourced state fails.
4. **Trusted worktree identity.** Strict-audit bootstrap resolves the selected main or linked
   worktree while pinning the canonical common Git directory as repository identity. A matching
   hostile alternate repository fails before Node execution.
5. **Truthful acceptance semantics.** Backlog, Task 3/6 reports, executive traceability, and the
   former acceptance document no longer call a candidate accepted while its strict audit is
   missing or blocked. Warehouse output remains the approved least-privilege boolean projection;
   owner administration is the authoritative registry state/source surface.

## Test-first and verification evidence

| Gate | Result on the uncommitted candidate |
|---|---|
| Focused feature-flag API RED | Expected RED: 2 failed, 12 passed before mutation ID/revision evidence was implemented. |
| Focused feature-flag API GREEN | 1 suite, 15/15 passed, including absent-row idempotent reset at null and retained generations. |
| Broader supply/API regression | 8 suites, 70/70 passed. |
| Recorded-old → additive evidence migration harness | PASS through real Prisma deploy; historical migration checksums, missing/malformed/opposite/conflicting evidence, rollback, explicit reconciliation, durable backfill, immutable v1 evidence, deferred v2 bypass rejection, destructive/direct generation-write rejection, override TRUNCATE rejection, precommitted-event rejection, deterministic concurrent claim-stealing rejection with exact transaction-ID binding, superseded-event replay rejection, and permanent retention verified. |
| Cutover gate unit contract | 8/8 passed, including production-mode staging blueprint wiring, bounded hang release, signal-safe cancellation, and uncaught-exit detached-child cleanup. |
| Current rollback-control integration | 4/4 passed on a fresh isolated database after all 163 migrations, including bounded lock-timeout rollback; temporary database removed. |
| Supply release-gate tests | 24/24 passed, including all-six database authority, fallback rejection, credential isolation, and unavailable/malformed/conflicting fail-closed cases. |
| Trusted bootstrap and surface tests | 32/32 passed; main/linked own-HEAD selection, pinned common Git identity, malformed metadata, alternate-repository redirect, divergent-bootstrap mismatch, and same-byte dependency symlinks covered. |
| Strict surface matrix / API contract matrix | 51/51 surfaces; 421 contracts generated. These are structural gates, not the final trusted audit. |
| API build / Prisma validation | PASS after Prisma generation and schema validation on the final uncommitted candidate. |
| Independent code, TypeScript/JavaScript, security, and database reviews | APPROVED with no remaining Critical/Important findings. |
| Committed-HEAD strict bootstrap from `docs/TRUSTED-ECOSYSTEM-GATE.md` (final argument `scripts/ecosystem-contract-audit.mjs --strict`) | Pending an exact clean committed SHA. Direct npm, worktree-bootstrap, dirty-worktree, or bootstrap-only attempts are not acceptance evidence. |

## Acceptance rule

Gate 0 may be called locally accepted only if the final candidate is committed without the
unrelated worktree change, independent reviews have no open Critical/Important findings, and
the trusted strict audit actually runs from that exact clean SHA. Any real strict-audit gap is
recorded as a blocker rather than relabeled as an environment success.
