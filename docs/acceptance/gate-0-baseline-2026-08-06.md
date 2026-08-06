# Gate 0 baseline — 2026-08-06

## Scope and truth boundary

The pre-program code baseline is commit
`c4963477395b091726fbd587f3f523d46408e24e` (`feat(auth): add native Google sign-in`).

The following documents were introduced after that code baseline as Gate 0 program
inputs; they are not pre-existing product code:

- `docs/superpowers/plans/2026-08-06-alistore-full-ecosystem-master-program.md`
- `docs/superpowers/plans/2026-08-06-gate-0-truth-baseline.md`

The reproducible local capture at this stage was written to the ignored file
`.artifacts/gate-0/baseline.json`. Its Git identity was
`2a0d5f49fd8ed02b1910903b65d1fc02e3fbcdcc` on
`codex/fix-otp-auth-confirmation`; its changed paths were this task's in-progress
collector, tests, and package script. The timestamp and tool availability are
machine-local evidence, not a claim of production readiness or provider,
hardware, physical-device, restore, or pilot certification.

## Offline checks executed

| Command | Result |
| --- | --- |
| `node --test scripts/__tests__/gate0-baseline.test.mjs` before implementation | Expected failure: `ERR_MODULE_NOT_FOUND` for `scripts/gate0-baseline.mjs`. |
| `node --test scripts/__tests__/gate0-baseline.test.mjs` | Passed: 3 tests, 0 failures. Covers JSON shape, deterministic changed-path ordering, unavailable optional tools, and secret-free output. |
| `npm run gate0:baseline` | Passed: wrote `.artifacts/gate-0/baseline.json`. Node, npm, PostgreSQL client, Xcode, Swift, XcodeGen, and Playwright were available. PostgreSQL server, Java, and the Android Gradle wrapper were reported as unavailable without failing capture. |
| `git diff --check` | Passed: no whitespace errors. |

## Owner/external checks not executed

No owner-operated or external checks were performed for this baseline. In
particular, no PostgreSQL server connection, provider validation, hardware or
physical-device test, production restore, or pilot verification is represented
by this document.
