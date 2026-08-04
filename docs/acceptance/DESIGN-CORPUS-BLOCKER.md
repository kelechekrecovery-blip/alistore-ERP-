# Design corpus blocker

Status: `owner-action-required`

Date: 2026-07-17

## Finding

The committed handoff graph contains 23 tracked `.dc.html` files and links to 74
distinct design files. Only 10 linked targets are present in
`design_handoff_alistore/screens`; 64 linked targets are absent. The graph has 104
link occurrences, 70 of them broken.

This is a real acceptance blocker. A related implementation, a screenshot, or a
similar local screen cannot be treated as the missing original reference. No missing
original was found in the local workspace, duplicate project directories, or Git
history during the 2026-07-17 audit.

## Source of truth

Recalculate the exact list from the committed HEAD:

```bash
npm run ecosystem:audit -- --json --output /tmp/alistore-ecosystem-audit.json
jq '.designCorpus.missingFiles' /tmp/alistore-ecosystem-audit.json
```

The strict release gate is:

```bash
npm run ecosystem:audit:strict
```

It must remain fail-closed while unresolved missing files exist.

## Required owner decision

For every missing file, the owner must choose exactly one disposition:

1. `restore`: provide the original `.dc.html` and add it to
   `design_handoff_alistore/screens` without changing its content;
2. `retire`: approve removal of the link with an approval reference and ISO timestamp;
3. `replace`: provide the new approved handoff and document the superseded file.

The audit accepts retirement only when `docs/acceptance/ecosystem-evidence.json`
contains a `designRetirements` entry with `file`, non-empty `ownerApprovalRef`, and
`approvedAt`. No such approval is invented by the engineering process.

## Engineering action while blocked

Engineering may continue implementation for routes whose API, RBAC, Ledger, E2E and
visual evidence are available. Those routes may be marked `partial` or `accepted`
according to their own evidence, but they cannot inherit visual acceptance from a
missing handoff. The traceability matrix must retain the missing-reference status
until the owner decision is recorded.

## Gate interpretation

This blocker is independent of local software evidence. The current native UI,
reconciled ecosystem and Web visual artifacts are hash-bound and can pass their own
gates. Full ecosystem acceptance remains unavailable until this design decision is
resolved, and production readiness also requires external credentials, physical-device
tests, live provider certification, staging UAT and backup/restore evidence.
