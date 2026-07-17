# PROGRESS

# 2026-07-17 — ECOSYSTEM-AUDIT-STRICT-004

- Iteration ID: `ECOSYSTEM-AUDIT-STRICT-004`.
- Task: rerun strict ecosystem audit after refreshing visual, native UI and reconciliation evidence under the restored audit npm aliases.
- Files changed: `PROGRESS.md`.
- Result: `npm run ecosystem:audit:strict` now passes every software/evidence gate: durable visual, clean source/design evidence, iOS app UI, Android app UI, POS/refund reconciliation, courier COD reconciliation, service/loaner reconciliation, procurement/sale reconciliation and composite reconciled E2E. The strict audit exits `1` with exactly one remaining blocker: the design corpus still has 23 tracked handoffs, 74 linked handoffs, 10 present linked files and 64 missing linked `.dc.html` files.
- Checks run: `npm run ecosystem:audit:strict`; `git status --short`; `git diff --check`.
- Acceptance: accepted as current state evidence. Local software gates are green in strict audit; full ecosystem acceptance remains blocked until the 64 missing design references are restored or explicitly retired with owner approval.
- Next step: resolve `ECO-001` by restoring the missing `.dc.html` files from the design source or recording owner-approved retirements, then rerun strict audit.

# 2026-07-17 — RECONCILED-E2E-EVIDENCE-003

- Iteration ID: `RECONCILED-E2E-EVIDENCE-003`.
- Task: refresh trusted composite reconciled ecosystem software matrix evidence after restoring ecosystem audit npm aliases.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/reconciled-e2e-b8db0368b1ecdb8d0b40ec47f6bbac42fcc71c4a19c2cc774c2795dbd7c48dd3.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run ecosystem:e2e` with `exitCode: 0` for source tree `6b3989bc1c2c52f0ebdb72a888c21fa117852874941252c25c3b9752e46bc790`. The reconciled matrix passed `4/4` verticals: POS refund/quarantine, courier COD/handover, service/loaner and procurement-to-sale.
- Checks run: `sh scripts/run-trusted-ecosystem-node.sh scripts/record-ecosystem-evidence.mjs reconciled-e2e`; `git diff --check`.
- Acceptance: accepted for committed local composite software reconciliation evidence. Physical devices, live providers, deep native journeys, staging certification and missing visual handoffs remain separate release gates.
- Next step: rerun `npm run ecosystem:audit:strict`; if only design-corpus gaps remain, restore the missing `.dc.html` files from owner/design source or record owner-approved retirements.

# 2026-07-17 — PROCUREMENT-SALE-EVIDENCE-003

- Iteration ID: `PROCUREMENT-SALE-EVIDENCE-003`.
- Task: refresh trusted partial procurement receiving, supplier liability, serialized stock and subsequent POS sale reconciliation evidence after restoring ecosystem audit npm aliases.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/procurement-sale-reconciliation-db0763f3ab310017538083a2e6e7aa5b908fbc56e059082438c63313c011120e.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run ecosystem:procurement-sale:e2e` with `exitCode: 0` for source tree `6b3989bc1c2c52f0ebdb72a888c21fa117852874941252c25c3b9752e46bc790`. Procurement API Jest passed `10/10`, and Playwright passed the procurement-to-sale reconciliation scenario `1/1`.
- Checks run: `sh scripts/run-trusted-ecosystem-node.sh scripts/record-ecosystem-evidence.mjs procurement-sale-reconciliation`; `git diff --check`.
- Acceptance: accepted for committed local procurement/sale software reconciliation evidence. Staging-shaped supplier accounting validation, live providers and first-store receiving/sale UAT remain open.
- Next step: refresh composite reconciled E2E evidence and rerun `npm run ecosystem:audit:strict`.

# 2026-07-17 — SERVICE-LOANER-EVIDENCE-003

- Iteration ID: `SERVICE-LOANER-EVIDENCE-003`.
- Task: refresh trusted warranty repair, paid service collection and loaner custody reconciliation evidence after restoring ecosystem audit npm aliases.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/service-loaner-reconciliation-75eb1d5bf95460e78206580568f380ca52b6239813202ef035b46ebf79b78e7d.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run ecosystem:service-loaner:e2e` with `exitCode: 0` for source tree `6b3989bc1c2c52f0ebdb72a888c21fa117852874941252c25c3b9752e46bc790`. API Jest passed service-center, service-loaner and warranty RBAC suites `3/3` with `9/9` tests, and Playwright passed service-center UI `3/3`.
- Checks run: first recorder attempt passed API but hit a flaky Playwright `page.goto('/erp')` load timeout on the first UI scenario while the other two UI scenarios passed; the clean-tree retry `sh scripts/run-trusted-ecosystem-node.sh scripts/record-ecosystem-evidence.mjs service-loaner-reconciliation` passed and recorded evidence; `git diff --check`.
- Acceptance: accepted for committed local service/loaner software reconciliation evidence. Physical service desk/device evidence capture, live customer/provider notifications and first-store UAT remain external gates.
- Next step: refresh procurement/sale and composite reconciled E2E evidence.

# 2026-07-17 — COURIER-COD-EVIDENCE-003

- Iteration ID: `COURIER-COD-EVIDENCE-003`.
- Task: refresh trusted Web COD checkout, warehouse picking, courier delivery and cash handover reconciliation evidence after restoring ecosystem audit npm aliases.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/courier-cod-reconciliation-19885b9adf726ae7dda47fd095f55ccae307a80331ed02cdb4585c720251c3df.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run ecosystem:courier-cod:e2e` with `exitCode: 0` for source tree `6b3989bc1c2c52f0ebdb72a888c21fa117852874941252c25c3b9752e46bc790`. Playwright passed `1/1` COD checkout, warehouse, courier delivery and cash handover reconciliation scenario.
- Checks run: `sh scripts/run-trusted-ecosystem-node.sh scripts/record-ecosystem-evidence.mjs courier-cod-reconciliation`; `git diff --check`.
- Acceptance: accepted for committed local courier COD software reconciliation evidence. Live courier/device GPS, physical cash handover and first-store financial close remain external release gates.
- Next step: refresh service/loaner, procurement/sale and composite reconciled E2E evidence.

# 2026-07-17 — POS-REFUND-EVIDENCE-003

- Iteration ID: `POS-REFUND-EVIDENCE-003`.
- Task: refresh trusted POS sale, customer return, approved refund and warehouse quarantine reconciliation evidence after restoring ecosystem audit npm aliases.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/pos-refund-reconciliation-c5221b90881db05008308f54bbc660c812b39fdefaf0a4e6b1dfe1b29a6d815c.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run ecosystem:pos-refund:e2e` with `exitCode: 0` for source tree `6b3989bc1c2c52f0ebdb72a888c21fa117852874941252c25c3b9752e46bc790`. Playwright passed `1/1` POS sale, customer return, approved refund and warehouse receipt reconciliation scenario.
- Checks run: `sh scripts/run-trusted-ecosystem-node.sh scripts/record-ecosystem-evidence.mjs pos-refund-reconciliation`; `git diff --check`.
- Acceptance: accepted for committed local POS/refund software reconciliation evidence. Live provider refund certification, physical POS hardware and first-store UAT remain external release gates.
- Next step: refresh courier COD, service/loaner, procurement/sale and composite reconciled E2E evidence.

# 2026-07-17 — ANDROID-APP-UI-EVIDENCE-003

- Iteration ID: `ANDROID-APP-UI-EVIDENCE-003`.
- Task: refresh trusted Android packaged-app UI evidence after restoring ecosystem audit npm aliases.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/android-app-ui-56684fc58209d98f663b8f487fea1c5e2029de8badee78d80a6b9c45be666c8a.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run android:ui` with `exitCode: 0` for source tree `6b3989bc1c2c52f0ebdb72a888c21fa117852874941252c25c3b9752e46bc790`. Android instrumentation passed core `30/30` plus packaged Client, Staff, Courier and POS connected smoke tests on `savio_api36_arm64(AVD)`.
- Checks run: `sh scripts/run-trusted-ecosystem-node.sh scripts/record-ecosystem-evidence.mjs android-app-ui`; `git diff --check`.
- Acceptance: accepted for emulator packaged-app UI evidence. Physical-device biometric/push/camera/maps/scanner/printer/payment-terminal smoke, release signing, Play Internal credentials and live providers remain external release gates.
- Next step: refresh POS/refund, courier COD, service/loaner, procurement/sale and reconciled E2E evidence in separate commits.

# 2026-07-17 — IOS-APP-UI-EVIDENCE-003

- Iteration ID: `IOS-APP-UI-EVIDENCE-003`.
- Task: refresh trusted all-iOS-app UI evidence after restoring ecosystem audit npm aliases.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/ios-app-ui-18dad8dfd3a6c4304423e385f1c21da5ac69a879c86e0732f6f472bb5e5e654d.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run ios:ui` with `exitCode: 0` for source tree `6b3989bc1c2c52f0ebdb72a888c21fa117852874941252c25c3b9752e46bc790`. XCUITest passed Client `21/21`, Staff `9/9`, Courier `2/2`, and POS `2/2` on the iPhone 17 Pro simulator.
- Checks run: `sh scripts/run-trusted-ecosystem-node.sh scripts/record-ecosystem-evidence.mjs ios-app-ui`; `git diff --check`.
- Acceptance: accepted for simulator UI evidence across all four iOS apps. Physical-device Face ID/APNs/camera/maps/scanner/printer/payment-terminal smoke, production API values, signing/provisioning and TestFlight/App Store review remain external release gates.
- Next step: refresh Android packaged-app UI evidence and the four reconciliation/E2E evidence gates under the same current source hash.

# 2026-07-17 — VISUAL-EVIDENCE-003

- Iteration ID: `VISUAL-EVIDENCE-003`.
- Task: refresh trusted durable Web/ERP visual acceptance evidence after restoring the ecosystem audit npm aliases.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/visual-b7464628cbcef430a74513a99759081dcd2264e87b0f50b55a68010c21d850e4.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run visual:e2e` with `exitCode: 0` for source tree `6b3989bc1c2c52f0ebdb72a888c21fa117852874941252c25c3b9752e46bc790`. The visual runner passed `3/3` exact screenshot tests for ERP desktop, storefront desktop and storefront mobile.
- Checks run: `sh scripts/run-trusted-ecosystem-node.sh scripts/record-ecosystem-evidence.mjs visual`; `git diff --check`.
- Acceptance: accepted for the current committed Web/ERP visual baseline. Remaining strict-audit blockers are native/reconciliation evidence refresh under the new source hash plus the 64 missing or unretired linked handoff files.
- Next step: refresh `ios-app-ui`, `android-app-ui`, POS/refund, courier COD, service/loaner, procurement/sale and reconciled E2E evidence in separate commits, then rerun `npm run ecosystem:audit:strict`.

# 2026-07-17 — ECO-AUDIT-COMMAND-001

- Iteration ID: `ECO-AUDIT-COMMAND-001`.
- Task: restore the executable npm aliases used by the master plan and progress log for strict ecosystem contract audits.
- Files changed: `package.json` and `PROGRESS.md`.
- Result: added `ecosystem:audit`, `ecosystem:audit:strict`, and `ecosystem:audit:json` aliases through the trusted ecosystem bootstrap using `sh scripts/run-trusted-ecosystem-node.sh`, matching the current non-executable script mode. The strict audit now runs from npm instead of failing with a missing script.
- Checks run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`; `npm run ecosystem:audit:strict` now executes and fails with the current release blockers instead of a package-script error; `npm run ecosystem:audit:json` writes `.artifacts/ecosystem-audit.json`.
- Current blockers from the restored strict audit: 64 linked design handoffs are still absent or not retired; the source tree was dirty during this iteration; and the hash-bound visual/native/reconciliation evidence must be refreshed again after the audit-command commit because `package.json` is part of the audited source set.
- Next step: commit this command restoration, rerun `npm run ecosystem:audit:strict` on a clean tree, then refresh the evidence gates whose source-tree hash is invalidated by the package-script change.

# 2026-07-17 — IOS-STORE-PREFLIGHT-006

- Iteration ID: `IOS-STORE-PREFLIGHT-006`.
- Task: align the native iOS Client release preflight with the actual local Xcode provisioning profile storage used by the prior Savio/Manas releases.
- Files changed: `apps/ios/scripts/store-preflight.sh`, `apps/ios/store/release-runbook.md`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: `--strict-signing` now searches both `~/Library/MobileDevice/Provisioning Profiles` and `~/Library/Developer/Xcode/UserData/Provisioning Profiles`. Local Savio profiles are present in Xcode UserData for `kg.kelechek.savio` and `kg.kelechek.savio.business`, but no local profile currently matches `kg.alistore.client`; the preflight therefore fails closed with a precise AliStore-profile message unless `IOS_ALLOW_PROVISIONING_UPDATE=true` is explicitly set on a protected, authenticated Xcode release machine.
- Checks run: `bash -n apps/ios/scripts/store-preflight.sh`; temporary-env `npm run ios:store-preflight -- --env-file <tmp>` passed; temporary-env `--strict-signing` with `IOS_ALLOW_PROVISIONING_UPDATE=false` failed closed on missing `kg.alistore.client` profile; temporary-env `--strict-signing` with `IOS_ALLOW_PROVISIONING_UPDATE=true` passed; `git diff --check`.
- Acceptance: accepted for release tooling accuracy only. Real App Store publication still requires protected `apps/ios/.env.production`, real `ASC_ISSUER_ID`, App Store Connect verification, an AliStore provisioning profile or authenticated auto-provisioning, physical iPhone smoke, archive upload and TestFlight/App Review.
- Next step: create/download the `kg.alistore.client` App Store provisioning profile or enable authenticated Xcode automatic provisioning, then run `npm run ios:store-preflight -- --env-file apps/ios/.env.production --strict-asc --strict-signing`.

# 2026-07-17 — RECONCILED-E2E-EVIDENCE-002

- Iteration ID: `RECONCILED-E2E-EVIDENCE-002`.
- Task: refresh trusted composite reconciled ecosystem software matrix evidence for the current source tree.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/reconciled-e2e-082b9f6bf6fc7b9848641f05fe4ae1b96e8ba7e9bdbcae3e5cbcb214ed57d1a1.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run ecosystem:e2e` with `exitCode: 0` for source commit `b860956617ac00a5fcc61ee871e598794e2fbbbd` and source tree `363734057e5ef8ea45548f6c379bf07826ee6a912e39fed25c898fa2da42779c`. The composite matrix passed `4/4` verticals: POS refund/quarantine, courier COD/handover, service/loaner and procurement-to-sale.
- Checks run: trusted ecosystem recorder for `reconciled-e2e`; `git diff --check`.
- Acceptance: accepted for committed local software matrix evidence. Physical devices, live providers, deep native journeys, staging certification and missing visual handoffs remain separate release gates.
- Next step: rerun strict ecosystem audit. If only design-corpus gaps remain, restore the missing handoff `.dc.html` files from owner/design source or record owner-approved retirements.

# 2026-07-17 — PROCUREMENT-SALE-EVIDENCE-002

- Iteration ID: `PROCUREMENT-SALE-EVIDENCE-002`.
- Task: refresh trusted partial procurement receiving, supplier liability, serialized stock and subsequent POS sale reconciliation evidence.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/procurement-sale-reconciliation-c9445942c50136c1e84ff7266bc0e8f0e069da665d614210c1bf779320d7cbcb.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run ecosystem:procurement-sale:e2e` with `exitCode: 0` for source commit `b860956617ac00a5fcc61ee871e598794e2fbbbd` and source tree `363734057e5ef8ea45548f6c379bf07826ee6a912e39fed25c898fa2da42779c`. Procurement API Jest passed `10/10`, and the Playwright procurement-to-sale reconciliation scenario passed `1/1`.
- Checks run: trusted ecosystem recorder for `procurement-sale-reconciliation`; `git diff --check`.
- Acceptance: accepted for committed local software reconciliation evidence. Staging-shaped supplier accounting validation, live providers and first-store receiving/sale UAT remain open.
- Next step: refresh composite reconciled ecosystem evidence and rerun strict audit.

# 2026-07-17 — SERVICE-LOANER-EVIDENCE-002

- Iteration ID: `SERVICE-LOANER-EVIDENCE-002`.
- Task: refresh trusted warranty repair, paid service collection and loaner custody reconciliation evidence.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/service-loaner-reconciliation-084c3eec40ee6e3bcee8fc1d309679062371400fce104e5c22c57a05e8d4af38.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run ecosystem:service-loaner:e2e` with `exitCode: 0` for source commit `b860956617ac00a5fcc61ee871e598794e2fbbbd` and source tree `363734057e5ef8ea45548f6c379bf07826ee6a912e39fed25c898fa2da42779c`. API Jest passed service-center, service-loaner and warranty RBAC suites `3/3` with `9/9` tests, and Playwright passed service-center UI `3/3`.
- Checks run: trusted ecosystem recorder for `service-loaner-reconciliation`; `git diff --check`.
- Acceptance: accepted for committed local software reconciliation evidence. Physical service desk/device evidence capture, live customer/provider notifications and first-store UAT remain open.
- Next step: refresh procurement/sale and composite reconciled ecosystem evidence.

# 2026-07-17 — COURIER-COD-EVIDENCE-002

- Iteration ID: `COURIER-COD-EVIDENCE-002`.
- Task: refresh trusted Web COD checkout, warehouse picking, courier delivery and cash handover reconciliation evidence.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/courier-cod-reconciliation-cffef7d5e1df7cbef5f232753bf5c7c9d37d21e4f036a6aa34a1725e260f82c6.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run ecosystem:courier-cod:e2e` with `exitCode: 0` for source commit `b860956617ac00a5fcc61ee871e598794e2fbbbd` and source tree `363734057e5ef8ea45548f6c379bf07826ee6a912e39fed25c898fa2da42779c`. The Playwright COD reconciliation scenario passed `1/1`.
- Checks run: trusted ecosystem recorder for `courier-cod-reconciliation`; `git diff --check`.
- Acceptance: accepted for committed local software reconciliation evidence. Live courier/device GPS, physical cash-handover UAT and first-store financial close remain open.
- Next step: refresh service/loaner, procurement/sale and composite reconciled ecosystem evidence.

# 2026-07-17 — POS-REFUND-EVIDENCE-002

- Iteration ID: `POS-REFUND-EVIDENCE-002`.
- Task: refresh trusted POS sale, customer return, approved refund and warehouse quarantine reconciliation evidence.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/pos-refund-reconciliation-02478ee14f930689021ef7115dcd02518f94191f2458e5bb834646cf3b73845f.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run ecosystem:pos-refund:e2e` with `exitCode: 0` for source commit `b860956617ac00a5fcc61ee871e598794e2fbbbd` and source tree `363734057e5ef8ea45548f6c379bf07826ee6a912e39fed25c898fa2da42779c`. The Playwright reconciliation scenario passed `1/1`.
- Checks run: trusted ecosystem recorder for `pos-refund-reconciliation`; `git diff --check`.
- Acceptance: accepted for committed local software reconciliation evidence. Live provider certification, physical POS hardware and first-store UAT remain open.
- Next step: refresh courier COD, service/loaner, procurement/sale and composite reconciled ecosystem evidence.

# 2026-07-17 — VISUAL-EVIDENCE-002

- Iteration ID: `VISUAL-EVIDENCE-002`.
- Task: refresh the trusted durable Web/ERP visual acceptance artifact for the current source tree.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/visual-526e471dc8e0be7890266ea8f1a87e96470781c8af95e60634fc35605ba25ee3.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run visual:e2e` with `exitCode: 0` for source commit `b860956617ac00a5fcc61ee871e598794e2fbbbd` and source tree `363734057e5ef8ea45548f6c379bf07826ee6a912e39fed25c898fa2da42779c`. The visual runner passed exactly three screenshot baselines: ERP desktop, storefront desktop and storefront mobile.
- Checks run: trusted ecosystem recorder for `visual`; `git diff --check`.
- Acceptance: accepted for the committed durable visual baseline evidence. This still does not replace the 64 missing linked design references or owner sign-off for unavailable handoff screens.
- Next step: rerun strict ecosystem audit and continue the remaining reconciliation/design-corpus gaps.

# 2026-07-17 — ANDROID-APP-UI-EVIDENCE-002

- Iteration ID: `ANDROID-APP-UI-EVIDENCE-002`.
- Task: refresh trusted Android packaged-app UI evidence on the connected API 36 emulator.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/android-app-ui-79a135d16eece8aae399b1b2f3c6d92c98b0398770121a420787a8d559551063.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run android:ui` with `exitCode: 0` for source commit `b860956617ac00a5fcc61ee871e598794e2fbbbd` and source tree `363734057e5ef8ea45548f6c379bf07826ee6a912e39fed25c898fa2da42779c`. The run covered core connected tests `30/30` plus packaged Client, Staff, Courier and POS connected smoke tests on `savio_api36_arm64(AVD)`.
- Checks run: trusted ecosystem recorder for `android-app-ui`; `git diff --check`.
- Acceptance: accepted for committed Android emulator packaged-app UI evidence. Physical-device biometric/push/camera/maps/scanner/printer/payment-terminal smoke, release signing, Play Internal/App Store credentials and live providers remain open.
- Next step: rerun strict ecosystem audit and continue the remaining reconciliation/visual/design-corpus gaps.

# 2026-07-17 — IOS-STORE-PREFLIGHT-STATUS-001

- Iteration ID: `IOS-STORE-PREFLIGHT-STATUS-001`.
- Task: inspect the current native iOS Client App Store preflight/signing blockers after refreshing all-iOS-app simulator UI evidence.
- Files changed: `BACKLOG.md` and `PROGRESS.md`.
- Result: local Apple Distribution signing identity for team `ZYU3F8W56P` and the protected App Store Connect key file `AuthKey_47XTPVKBDS.p8` are present. `apps/ios/.env.production` is intentionally absent and ignored by Git, so the default store preflight fails closed before release checks with `ALISTORE_API_BASE_URL is required`. A temporary production-shaped env passes the non-strict native Client store preflight, proving metadata, privacy manifest, HTTPS API injection, bundle id, AppIcon and production APNs resolution. Strict signing fails closed without a local App Store provisioning profile for `kg.alistore.client`; with `IOS_ALLOW_PROVISIONING_UPDATE=true`, the same strict signing gate verifies the Apple Distribution identity and reaches a pass. Strict App Store Connect remains blocked until the real `ASC_ISSUER_ID`/account authorization is supplied.
- Checks run: `npm run ios:store-preflight` failed closed as expected without `apps/ios/.env.production`; temporary-env `npm run ios:store-preflight -- --env-file <tmp>` passed; temporary-env `--strict-signing` failed closed without a provisioning profile; temporary-env `--strict-signing` with explicit Xcode auto-provisioning allowance passed; `git diff --check` passed.
- Acceptance: accepted as release-blocker evidence only. It does not certify App Store readiness because real production API configuration, verified App Store Connect issuer, provisioning/profile or authenticated Xcode account, physical iPhone smoke, TestFlight upload and App Store review remain open.
- Next step: fill the ignored `apps/ios/.env.production` with real protected values and run `npm run ios:store-preflight -- --env-file apps/ios/.env.production --strict-asc --strict-signing`, or continue the next software-only ecosystem gap while owner-controlled Apple/provider/device gates remain external.

# 2026-07-17 — IOS-APP-UI-EVIDENCE-002

- Iteration ID: `IOS-APP-UI-EVIDENCE-002`.
- Task: refresh the trusted all-iOS-app UI evidence after aligning the Client App Store screenshot gate to `AliStore Клиент App 2.0`.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/ios-app-ui-a015efe4ef53164473af9f6981dc7f642073f1789e9b72b258e91afe460eb499.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run ios:ui` with `exitCode: 0` for source commit `b860956617ac00a5fcc61ee871e598794e2fbbbd` and source tree `363734057e5ef8ea45548f6c379bf07826ee6a912e39fed25c898fa2da42779c`. The run covered Client `21/21`, Staff `9/9`, Courier `2/2`, and POS `2/2` simulator UI tests.
- Checks run: trusted ecosystem recorder for `ios-app-ui`; `git diff --check`.
- Acceptance: accepted for committed simulator UI evidence across all four iOS apps. Physical-device Face ID/APNs/camera/maps/scanner/printer/payment-terminal smoke, production API, signing/provisioning, TestFlight upload and App Store review remain open.
- Next step: rerun the strict ecosystem audit and refresh the next stale evidence gate that does not require external credentials.

# 2026-07-17 — IOS-CLIENT-VISUAL-018-EVIDENCE

- Iteration ID: `IOS-CLIENT-VISUAL-018-EVIDENCE`.
- Task: refresh trusted `ios-client-visual` acceptance evidence from the committed handoff-aligned iOS Client screenshot gate.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/ios-client-visual-9feb5194dbcfef85dba5592aa649575418d051d176f40533d013f8cbdd69408a.json`, and `PROGRESS.md`.
- Result: trusted recorder captured `npm run ios:visual` with `exitCode: 0` for source commit `b860956617ac00a5fcc61ee871e598794e2fbbbd` and source tree `363734057e5ef8ea45548f6c379bf07826ee6a912e39fed25c898fa2da42779c`.
- Checks run: trusted ecosystem recorder for `ios-client-visual` executed the XCUITest screenshot gate and recorded accepted evidence; JSON parse check passed; `git diff --check` passed. The outer zsh wrapper reported `read-only variable: status` after evidence was already written, so the recorded artifact is the authoritative gate result.
- Acceptance: accepted for committed simulator visual evidence only. Physical-device smoke, owner pixel sign-off, production API, signing/provisioning, TestFlight upload and App Store review remain open.
- Next step: continue the remaining release gaps, starting with native physical-device/release blockers or the next ERP/finance/core backlog item depending on available credentials.

# 2026-07-17 — IOS-CLIENT-VISUAL-018

- Iteration ID: `IOS-CLIENT-VISUAL-018`.
- Task: realign native iOS Client visual/App Store screenshot evidence with the 17 review screens listed inside `AliStore Клиент App 2.0.dc.html`.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, `apps/ios/scripts/visual-capture.sh`, `apps/ios/store/client-metadata.json`, `apps/ios/store/release-runbook.md`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the visual gate now captures the handoff-declared set: home, catalog, product detail, favorites, compare, cart, checkout, order status, account, devices, warranty, returns, support, Trade-in, loyalty, addresses and search. DEBUG visual evidence seeds deterministic favorites/compare state without changing production behavior, and `ios:visual` now reads the expected attachment count from screenshot metadata.
- Checks run: `node scripts/validate-ios-store-metadata.mjs apps/ios/store/client-metadata.json`; `bash -n apps/ios/scripts/visual-capture.sh`; `npm run ios:visual` passed with 17 PNG attachments; `npm run ios:store-screenshots` packaged 17 handoff-aligned screenshots; `npm run ios:build` passed all 10 iOS targets.
- Acceptance: accepted for the local simulator visual/App Store screenshot software gate. This does not certify App Store readiness: physical-device Face ID/APNs/camera/offline smoke, owner pixel sign-off, production HTTPS API, signing/provisioning, verified App Store Connect values, TestFlight upload and review submission remain open.
- Next step: commit this source gate, then refresh trusted `ios-client-visual` evidence on the committed SHA or continue the next native/ERP gap while release credentials and physical-device gates remain external.

# 2026-07-17 — IOS-POS-UI-001

- Iteration ID: `IOS-POS-UI-001`.
- Task: add signed-in simulator coverage for the native iOS POS sale/split/receipt shell instead of only proving the login screen.
- Files changed: `apps/ios/Shared/Models.swift`, `apps/ios/POS/POSSaleView.swift`, `apps/ios/UITests/POS/AliStorePOSUITests.swift`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: DEBUG UI-test mode now loads deterministic POS catalog/open shift for cashier role and returns a deterministic receipt after split cash/card tender; production path remains API-backed with idempotency. POS UI test covers catalog sync, cart add, split amount, paid Event Ledger message, receipt markup and hardware-certification warning.
- Checks run: targeted POS sale/split XCUITest passed; full `AliStorePOSUITests` passed `2/2`; `npm run ios:build` passed all 10 targets; `git diff --check` passed. Note: one concurrent Xcode run failed from a simulator bundle race while `ios:build` was running in parallel; rerun alone passed.
- Acceptance: accepted for the local POS sale/split/receipt simulator gate. Physical scanner/printer/bank terminal certification, live provider capture/reconciliation, production signing and first-store POS UAT remain open.
- Next step: continue Android parity, Staff/Courier/POS physical gates, ERP/CMS handoff completion, staging/provider certification and strict ecosystem E2E.

# 2026-07-17 — EXCH-002A

- Iteration ID: `EXCH-002A`.
- Task: unblock local non-cash exchange surcharge execution without pretending live provider certification is complete.
- Files changed: `apps/api/src/exchanges/exchanges.service.ts`, `apps/api/test/exchange.e2e-spec.ts`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: exchanges with card/QR/POS surcharges now require a confirmed provider/terminal `externalReference` before any stock or money mutation. The service serializes the reference, rejects duplicate references already used by a payment or active exchange request, stores the accepted reference as `Payment.txnId`, posts the normal `exchange.surcharge` accounting entry and preserves idempotent replay. Missing references fail closed with `exchange_provider_reference_required`.
- Checks run: `npm install` repaired a local invalid `otplib` install without package file changes; `npm run api:test -- --runInBand test/exchange.e2e-spec.ts` passed `13/13`; `npm run api:test -- --runInBand test/returns-exchanges-rbac.e2e-spec.ts` passed `2/2`; `npm run api:build` passed.
- Acceptance: accepted for the local provider-reference software contour. Live provider intent/callback/retry, daily statement reconciliation, production credentials and certification flags remain open under `EXCH-002B`.
- Next step: continue `EXCH-002B` only after provider contract/credentials are available, otherwise keep moving on locally unblockable ERP/native/E2E gaps.

# 2026-07-17 — IOS-STAFF-VISUAL-001

- Iteration ID: `IOS-STAFF-VISUAL-001`.
- Task: improve the native Staff app shell against `AliStore Сотрудник App 2.0` and prove the signed-in Staff landing state.
- Files changed: `apps/ios/Staff/AliStoreStaffApp.swift`, `apps/ios/Shared/StaffAuthStore.swift`, `apps/ios/Shared/Models.swift`, `apps/ios/UITests/Staff/AliStoreStaffUITests.swift`, and `BACKLOG.md`.
- Result: Staff now opens to a prototype-style dark home after sign-in with Azizbek identity, store/role subtitle, shift status, camera shift CTA, quick actions, AI task card and bottom navigation for `Главная`, `Заказы`, `KPI` and `Скупка`. A Debug-only signed-in Staff fixture makes UI acceptance deterministic, while the existing shared `QuickUnlockView`/Keychain PIN/biometric mechanism remains the production quick-access path after real login.
- Checks run: `npm run ios:build` passed all 10 iOS targets; targeted Staff XCUITest passed `2/2`; `npm run ios:ui` passed Client `17/17`, Staff `2/2`, Courier `1/1`, POS `1/1`.
- Acceptance: accepted for the local Staff home-shell visual/packaged simulator gate. This does not certify physical-device Face ID/APNs/scanner/camera behavior, release signing, production API URL, TestFlight/App Store review, or complete Staff inner-screen pixel parity.
- Next step: continue Staff inner flows and POS/Courier visual parity, then physical-device quick-unlock/push/scanner smoke when devices and production credentials are available.

# 2026-07-17 — ANDROID-CLIENT-NOTIFICATIONS-001

- Iteration ID: `ANDROID-CLIENT-NOTIFICATIONS-001`.
- Task: request the Android 13+ notification permission in the packaged Client app and make its connected smoke permission-aware.
- Files changed: Client `MainActivity`, packaged Client UI test, backlog/progress documentation.
- Result: Client requests `POST_NOTIFICATIONS` only on Android 13+ when it is not already granted; older Android versions keep the existing path. The smoke test grants the permission before launch, matching the existing Staff test contract.
- Checks run: `npm run android:test` passed unit tests and `lintDebug`; `npm run android:ui` passed 30 shared/core tests plus packaged Client, Staff, Courier and POS smoke tests; `npm run android:build` passed all four debug APKs; `git diff --check`.
- Acceptance: accepted for the local Android Client notification-permission software vertical. Denied-permission UX, FCM provider delivery, physical-device push and production credentials remain external.
- Next step: continue the next locally unblocked Android Staff/Courier/POS or ERP vertical while keeping provider, device and design-corpus gates explicit.

# 2026-07-17 — ANDROID-CLIENT-PUSH-001

- Iteration ID: `ANDROID-CLIENT-PUSH-001`.
- Task: add the Android Client push registration and notification deep-link contour using the same server token endpoint as the other native apps.
- Files changed: client Gradle/manifest/activity, optional Firebase messaging service and registrar, shared client push route contract, Android parser regression, backlog/progress documentation.
- Result: Client registers an FCM token only after a signed-in customer session and only when app-owned Firebase configuration exists; token refresh uses the customer session from Keystore. Notification payloads accept only `alistore-client://orders/:id`, `alistore-client://warranty/:id` and `alistore-client://account/:route`, while arbitrary schemes/hosts are dropped. Client Release now fails closed without `google-services.json`; Debug has no credential dependency.
- Checks run: `npm run android:test` passed unit tests and `lintDebug`; `npm run android:ui` passed 30 shared/core tests plus packaged Client, Staff, Courier and POS smoke tests; `npm run android:build` passed all four debug APKs; `git diff --check`.
- Acceptance: accepted for the local Android Client push/routing software vertical. FCM provider delivery, Android 13 notification permission, physical-device push/deep-link smoke, release signing and production credentials remain external.
- Next step: continue the next locally unblocked Android Staff/Courier/POS or ERP vertical while keeping provider, device and design-corpus gates explicit.

# 2026-07-17 — ANDROID-CLIENT-STATE-001

- Iteration ID: `ANDROID-CLIENT-STATE-001`.
- Task: preserve Android Client favorites and cart quantities across process recreation without making local data authoritative for money or stock.
- Files changed: `apps/android/core/src/main/java/kg/alistore/core/ClientLocalState.kt`, `AliStoreApp.kt`, `apps/android/core/src/androidTest/java/kg/alistore/core/ClientLocalStateTest.kt`, `BACKLOG.md`.
- Result: Client state is restored from an application-scoped JSON-backed local store, writes are deterministic, invalid/non-positive quantities are discarded, and catalog/cart mutations persist immediately. Checkout still caps against server-derived availability and server-owned prices; logout and payment flows do not treat local state as proof of authorization or payment.
- Checks run: `npm run android:test` passed unit tests and `lintDebug`; `npm run android:ui` passed 30 shared/core tests plus packaged Client, Staff, Courier and POS smoke tests; `npm run android:build` passed all four debug APKs; `git diff --check`.
- Acceptance: accepted for the local Android Client persistence software vertical. The emulator test recreates the store and verifies deterministic favorites/cart recovery and invalid-quantity filtering; physical process-restart/device smoke, storage corruption recovery and complete 17-screen parity remain open.
- Next step: continue the next locally unblocked Android Staff/Courier/POS or ERP vertical while keeping physical, provider and design-corpus gates explicit.

# 2026-07-17 — ANDROID-CLIENT-PAYMENT-RETURN-001

- Iteration ID: `ANDROID-CLIENT-PAYMENT-RETURN-001`.
- Task: close the Android Client payment-return state and retry gap without giving the deep link authority over money or order status.
- Files changed: `apps/android/core/src/main/java/kg/alistore/core/ClientPaymentReturn.kt`, `AliStoreApp.kt`, `ClientAuthScreen.kt`, `ClientOrdersScreen.kt`, `CheckoutManager.kt`, Android Client unit/Compose tests and `CheckoutManagerTest.kt`.
- Result: only the trusted `alistore://payment-return` route is accepted; query values are decoded consistently on JVM/device, the Client refreshes orders from the API, and the account view distinguishes failed, confirmed and still-pending outcomes. Retry requires the matched server order plus an explicit payment method, sends a provider-neutral intent through the API, reuses one idempotency key after a 401 refresh, and opens only the API-returned payment URL. Checkout return URLs now preserve both order and method for provider callbacks. No client status, amount or payment confirmation authority was introduced.
- Checks run: `npm run android:test` passed unit tests and `lintDebug`; `npm run android:ui` passed 29 shared/core tests plus packaged Client, Staff, Courier and POS smoke tests; `npm run android:build` passed all four debug APKs; `git diff --check`.
- Acceptance: accepted for the local Android Client payment-return software vertical. Live provider callback/status behavior, physical-device payment/network smoke, release signing, production credentials and complete 17-screen parity remain open; production readiness remains `RED`.
- Next step: continue Android Client account/warranty/returns parity or take the next unblocked ERP/native vertical while preserving the explicit provider, device and design-reference blockers.

# 2026-07-17 — ANDROID-CLIENT-MEDIA-001

- Iteration ID: `ANDROID-CLIENT-MEDIA-001`.
- Task: connect Android Client catalog media to the existing server product attributes contract.
- Files changed: `apps/android/core/src/main/java/kg/alistore/core/Models.kt`, `ApiClient.kt`, `ProductMedia.kt`, `AliStoreApp.kt`, `ClientCatalogScreen.kt`, `ClientProductDetailScreen.kt`, `ClientProductDetailScreenTest.kt`, `BACKLOG.md`.
- Result: Android now parses `attrs.imageUrl`, `attrs.image` and `attrs.media`, validates only HTTP(S) or same-origin relative candidates, resolves relative URLs against the configured API base, and renders the first available product image in catalog cards and product detail. Missing media, invalid schemes and failed downloads keep the deterministic product fallback; no client-side price, stock or status authority was introduced.
- Checks run: `npm run android:build` passed all four debug APKs; `npm run android:test` passed unit tests and `lintDebug`; `npm run android:ui` passed 28 shared/core tests plus packaged Client, Staff, Courier and POS smoke tests; `git diff --check`.
- Acceptance: accepted for the local Android Client media software vertical. Real CDN/storage assets, image delivery monitoring, physical-device visual review, signing and complete 17-screen parity remain open; production readiness remains `RED`.
- Next step: continue Android Client account/payment state parity or move to the next unblocked native/ERP vertical while preserving explicit external release blockers.

# 2026-07-17 — ANDROID-CLIENT-DETAIL-001

- Iteration ID: `ANDROID-CLIENT-DETAIL-001`.
- Task: close the Android Client catalog-to-product-detail gap against the existing server contract.
- Files changed: `apps/android/core/src/main/java/kg/alistore/core/AliStoreApp.kt`, `apps/android/core/src/main/java/kg/alistore/core/ApiClient.kt`, `apps/android/core/src/main/java/kg/alistore/core/ClientCatalogScreen.kt`, `apps/android/core/src/main/java/kg/alistore/core/ClientProductDetailScreen.kt`, `apps/android/core/src/main/java/kg/alistore/core/Models.kt`, `apps/android/core/src/androidTest/java/kg/alistore/core/ClientProductDetailScreenTest.kt`, `BACKLOG.md`.
- Result: Client catalog cards now open a server-backed product detail route, load variants and related products through `GET /catalog/products/:id`, preserve server-derived price/stock, and expose favorite/cart/back actions. The detail content has a deterministic Compose test; no client-side status or price authority was added. Product media is consumed from the existing `attrs` contract by the follow-up `ANDROID-CLIENT-MEDIA-001`; physical-device visual review remains open.
- Checks run: `npm run android:build` passed all four debug APKs; `npm run android:test` passed unit tests and `lintDebug`; `npm run android:ui` passed 28 shared/core tests plus packaged Client, Staff, Courier and POS smoke tests; `git diff --check`.
- Acceptance: accepted for the local Android Client product-detail software vertical. Full 17-screen Android parity, product media, physical-device biometric/push/camera/network smoke, signing and store submission remain open; production readiness remains `RED`.
- Next step: continue Android Client account/payment visual parity or move to the next unblocked ERP/native slice while keeping trusted evidence and external release blockers explicit.

# 2026-07-17 — STORE-OPS-001 verification follow-up

- Iteration ID: `STORE-OPS-001` verification follow-up.
- Result: the complete Playwright suite passes `58/58`, including the Store Operations ERP journey and the refreshed ERP desktop visual golden for the intentional sidebar addition.
- Checks run: Store Operations API `2/2`; targeted Staff session suite `12/12`; complete Playwright `58/58`; Store Operations ERP visual test `1/1`; `git diff --check`.
- Full-gate note: the long `mvp:verify` Jest process completed `147/148` suites and `665/670` tests; five existing `staff-session-ops.e2e-spec.ts` tests exceeded the 30-second timeout in that resource-heavy aggregate run, while the same suite passes independently. The overall MVP gate therefore remains `RED` pending a repeatable long-run Jest/resource fix.
- Commit: `b03450a` (`feat(erp): add store operations controls`); visual verification follow-up is pending in this commit.
- Next step: isolate the aggregate Jest timeout/resource behavior or proceed with the next locally unblocked ERP/native slice; external production gates remain open.

# 2026-07-17 — STORE-OPS-001

- Iteration ID: `STORE-OPS-001`.
- Task: add the opening/closing checklist and incident register vertical to ERP Store Operations.
- Files changed: Store Operations Prisma models/migration, API module/DTO/service/controller, RBAC and Event Ledger event types, typed web API, ERP operations view, browser helpers and API/Playwright acceptance suites.
- Result: the API creates server-owned opening and closing templates per point/date, accepts only the staff identity from the active JWT, rejects incomplete or completed checklist mutations, records incidents and restricts resolution to the `resolve` permission. Every mutation has a stable `Idempotency-Key`, replay/conflict protection in `StoreOperationCommand` and Event Ledger evidence. `/erp` renders point/date-scoped summaries, checklist progress, completion state and incident resolution controls.
- Checks run: Prisma format/validation, dev migration deploy, isolated test database migration reset, Store Operations API `2/2`, API production build, Web production build with 39 routes, Store Operations Playwright `1/1`, `git diff --check`.
- Acceptance: `accepted` for the local Store Operations software vertical. Evidence attachment, safety/security escalation, physical opening/closing UAT, live provider certification, staging/restore and full ecosystem visual/native gates remain open; production readiness remains `RED`.
- Next step: continue the next locally unblocked ERP/native parity slice while keeping external launch blockers explicit.

# 2026-07-17 — ACC-003H

- Iteration ID: `ACC-003H`.
- Task: add a server-authoritative open foreign-currency exposure report and connect it to ERP Finance.
- Files changed: Finance DTO/controller/service, typed web Finance client, ERP `FinanceView`, Finance API integration coverage and Finance Playwright coverage.
- Result: `GET /finance/fx-exposure` accepts an as-of date, currency and point filter, includes only submitted/approved non-KGS expenses, selects the latest registered KGS rate at the as-of boundary, recalculates the tax-aware current base amount and returns per-currency totals. Missing-rate and overflow states are explicit; paid expenses are excluded. ERP renders the report with a clear statement that the delta is informational and does not create a journal entry.
- Checks run: API Finance integration `15/15`; API production build; Web production build; Finance Playwright `3/3`; `git diff --check`.
- Acceptance: `accepted` for the local FX exposure reporting contour. Posted FX revaluation/gain-loss, supplier/payment foreign-currency balances, accountant/tax validation, staging/production deployment, live providers, physical devices and missing design references remain open. Production readiness remains `RED`.
- Next step: define and implement the approved revaluation aggregate only after the gain/loss account policy is confirmed; otherwise continue staging-independent ERP/native parity work without posting an unapproved accounting treatment.

# 2026-07-17 — INV-VAL-001I (local benchmark)

- Iteration ID: `INV-VAL-001I`.
- Task: add a reproducible performance harness for the database-side valuation roll-forward.
- Files changed: root/API benchmark commands, temporary test-only database benchmark script, backlog/progress evidence.
- Result: the harness applies the complete migration history to an isolated database, generates 36 months of synthetic product/location valuation history with 27,648 layer/issue rows, executes the production roll-forward twice under `RepeatableRead`, compares the complete summary and rows, and removes the database even after failure. Default budgets are 5,000 ms and 256 MB RSS delta and can be overridden for staging without changing code.
- Checks run: `npm run inventory:valuation:benchmark` passed with `81ms`, `4MB` RSS delta, `48` report rows, `complete=true`, `consistent=true`, `repeatableReadStable=true`; `git diff --check`.
- Acceptance: `partial` for local performance/correctness evidence. `INV-VAL-001I` still requires the same command against a production-shaped staging database with an agreed latency/memory budget; no staging or production readiness claim is made.
- Next step: run this harness against staging-shaped data when staging access is available, then continue `ACC-003`/`AP-001` or the next locally unblocked ERP slice.

# 2026-07-17 — INV-VAL-001H

- Iteration ID: `INV-VAL-001H`.
- Task: close the inventory valuation location contract after the rolling roll-forward migration.
- Files changed: `InventoryValuationIssue.location` Prisma contract, fail-closed contract migration, database deployment preflight, inventory migration-upgrade fixture and API package script.
- Result: deployment now blocks before post-deploy work when any owned valuation issue or reversal has a `NULL`, empty or `UNKNOWN` location. A clean database applies `NOT NULL` to issue locations and CHECK constraints to both issue and reversal locations; new/legacy ambiguous rows cannot re-enter the valuation subledger. The migration remains intentionally fail-closed for rolling deployments and does not guess a location from incomplete history.
- Checks run: Prisma schema validation; Prisma Client generation; dev `prisma migrate deploy`; location preflight (`unknownIssueLocations=0`, `unknownReversalLocations=0`); inventory roll-forward clean/rolling upgrade test; `git diff --check`.
- Acceptance: `accepted` for the local schema/deployment software gate. Staging/production still require draining all pre-roll-forward API instances, executing the same migration against a production-shaped snapshot and observing the preflight; `INV-VAL-001I` performance certification, provider/device gates and overall production readiness remain open.
- Next step: run the committed valuation performance harness, then repeat it against a staging-shaped database before accepting `INV-VAL-001I`.

# 2026-07-17 — ACC-003G

- Iteration ID: `ACC-003G`.
- Task: add approval-gated manual accounting adjustments and protect the ERP Finance boundary.
- Files changed: Approval idempotency/document fields and migration, Finance DTO/controller/service, approval RBAC/four-eyes policy, accounting action executor, Ledger event catalogue and dedicated API integration coverage.
- Result: Finance users submit a frozen balanced snapshot with a unique document number and stable idempotency key. No journal entry exists before approval; replay returns the same approval, conflicting reuse fails closed, requester self-approval is rejected, and a separate owner/admin approval posts a server-validated `finance.manual_adjustment` journal entry through the shared period/account/balance checks. The ERP can list pending/approved/rejected snapshots with linked journal provenance.
- Checks run: `npx prisma validate`; Prisma Client generation; API production build; dev migration deploy; manual-adjustment API integration 2/2; full API Jest `147/147` suites and `667/667` tests; `git diff --check`. The isolated test database has pre-existing migration drift (`20260717030000_supplier_invoice_payments` is unmarked although its table exists), so only the new columns/indexes were applied there for this targeted run.
- Acceptance: `accepted` for the local manual-adjustment approval software contour. Accountant/tax validation, broader FX controls, staging/production deployment, physical hardware, provider certification and first-store reconciliation remain open. Production readiness remains `RED`.
- Commit: `981cfc2` (`feat(finance): gate manual adjustments`); test isolation follow-up `03da9be` (`test(finance): isolate ar aging fixtures`).
- Next step: continue the next open high-value ecosystem slice while keeping external launch gates explicit.

# 2026-07-17 — ACC-003F

- Iteration ID: `ACC-003F`.
- Task: add protected primary-document journal export and connect it to ERP Finance.
- Files changed: Finance CSV endpoint/service, API export integration suite, typed web blob client, Finance controls download action and browser acceptance.
- Result: `GET /finance/journal/export` reuses the bounded server journal query and emits UTF-8 CSV rows with entry/source/document/tax/account/timestamp/point provenance. CSV escaping neutralizes formula-prefixed text. `/erp` downloads the selected period/point journal with the same Finance RBAC boundary; no client-side financial values are generated.
- Checks run: API production build; web production build with 39 routes; journal export API integration 2/2; Finance Playwright 2/2; `git diff --check`.
- Acceptance: `accepted` for the local journal export software contour. Manual adjustment approval, accountant/tax validation, staging/production deployment, physical hardware and first-store reconciliation remain open. Production readiness remains `RED` because external credentials, devices, provider certification, staging soak and missing design references are not available.
- Commit: dedicated implementation commit created after this gate (`feat(finance): export journal documents`).
- Next step: implement the remaining manual-adjustment approval boundary, then run the broader Finance/ERP regression before taking the next ecosystem module.

# 2026-07-17 — ERP-FIN-002

- Iteration ID: `ERP-FIN-002`.
- Task: connect Finance AR aging to the authenticated ERP Finance workspace.
- Files changed: typed Finance web client, `FinanceControlsPanel` and Finance browser acceptance.
- Result: `/erp` now loads the server-authoritative AR report next to AP, shows an as-of date selector, AR outstanding metric, current/1-30/31-60/61-90/90+ bucket totals and customer drill-down summaries. The UI never accepts or edits balances; it only renders the finance API response and preserves existing loading/error/permission behavior.
- Checks run: Next production build with 39 routes; Finance Playwright 2/2; `git diff --check`.
- Acceptance: `accepted` for the local ERP AR visibility contour. Deep document navigation, export, accountant/tax validation, staging/production deployment, physical hardware and first-store reconciliation remain open. Production readiness remains `RED` because external credentials, devices, provider certification, staging soak and missing design references are not available.
- Commit: dedicated implementation commit created after this gate (`feat(erp): surface AR aging`).
- Next step: implement primary-document export or manual-adjustment approval, then connect those controls to Finance before broadening the 95-screen ERP scope.

# 2026-07-17 — ACC-003E

- Iteration ID: `ACC-003E`.
- Task: add server-derived Finance AR aging and primary-document drill-down for customer debt/installment balances.
- Files changed: Finance AR query DTO/controller/service and a dedicated `accounting-ar-aging.e2e-spec.ts` integration suite.
- Result: `GET /finance/ar-aging` supports an as-of date plus customer/status filters, exposes current/1-30/31-60/61-90/90+ and paid buckets, and returns principal/paid/outstanding totals. Historical balances are reconstructed from the authoritative current `DebtPlan.balance` plus installment payments after the selected date; only server-owned customer/order summaries and journal-backed debt/payment documents are exposed. `GET /finance/ar-aging/:id` returns the full primary-document drill-down. Finance RBAC remains enforced and no client-supplied balance/status is accepted.
- Checks run: API production build; targeted AR aging integration 2/2; full API Jest gate passed; `git diff --check`.
- Acceptance: `accepted` for the local AR aging/drill-down software contour. Manual adjustment approval, primary-document export, accountant/tax validation, staging/production deployment, physical hardware and first-store reconciliation remain open. Production readiness remains `RED` because external credentials, devices, provider certification, staging soak and missing design references are not available.
- Commit: dedicated implementation commit created after this gate (`feat(finance): add AR aging drilldown`).
- Next step: implement primary-document export or close the manual-adjustment approval boundary after reviewing the existing journal/export contracts.

# 2026-07-17 — ACC-003D

- Iteration ID: `ACC-003D`.
- Task: add accountable-person advances with issue, expense settlement, unused-balance return and overspend reimbursement.
- Files changed: accountable-advance Prisma models/migration, `1250` accounting account seed, Finance DTO/controller/service, Ledger event catalogue and a dedicated API integration suite.
- Result: finance users can issue an advance only to an active staff member, post `1250` debit against cash/bank, settle approved expense account lines against `1250`, return positive balances or reimburse negative balances. The aggregate locks its own mutation boundary, derives balance/status on the server, rejects closed/over-limit operations, replays identical idempotency keys and records one accounting plus one domain Ledger event per committed action.
- Checks run: `npm run prisma:generate`; `npx prisma validate`; API production build; `prisma migrate deploy` on `alistore_dev`; direct SQL migration on `alistore_test`; accountable-advance integration 2/2; full API Jest 144/144 suites, 661/661 tests; `git diff --check`.
- Acceptance: `accepted` for the local accountable-advance software contour. Write-offs, manual adjustment approval, AR aging, primary-document exports, accountant/tax validation, staging/production deployment, physical hardware and first-store reconciliation remain open. Production readiness remains `RED` because external credentials, devices, provider certification, staging soak and missing design references are not available.
- Commit: dedicated implementation commit created after this gate.
- Next step: implement the next bounded `ACC-003` slice, prioritizing write-off/manual-adjustment approval boundaries or AR aging/primary-document drill-down.

# 2026-07-17 — ACC-003C

- Iteration ID: `ACC-003C`.
- Task: add a server-authoritative fixed-asset register and sequential depreciation journals.
- Files changed: fixed-asset Prisma models/migration, accounting chart, Finance DTO/controller/service, Ledger event catalogue and Finance integration coverage.
- Result: owner-approved acquisitions persist inventory number, cost, useful life, dates, funding account and immutable acquisition journal provenance. The API posts balanced `1400`/`1000|1010|1020` entries, protects asset-number and idempotency boundaries, and replays the same aggregate only for an identical payload. Monthly straight-line depreciation is sequential from the service month, posts at the end of each calendar period to balanced `6700/1410` entries, applies deterministic final-month rounding, blocks over-depreciation/disposed assets and records acquisition/depreciation plus accounting Ledger events.
- Checks run: `npm run prisma:generate`; `npx prisma validate`; API production build; `prisma migrate deploy` on `alistore_dev`; direct SQL migration on `alistore_test`; Finance integration 14/14; full API Jest 143/143 suites, 659/659 tests; `git diff --check`.
- Acceptance: `accepted` for the local fixed-asset/depreciation software contour. Accountable advances, write-offs, manual adjustment approval, AR aging, primary-document exports, accountant/tax validation, staging/production deployment, physical hardware and first-store reconciliation remain open. Production readiness remains `RED` because external credentials, devices, provider certification, staging soak and missing design references are not available.
- Commit: dedicated implementation commit created after this gate.
- Next step: implement the next bounded `ACC-003` slice, prioritizing accountable-person advances and their settlement/reconciliation rules.

# 2026-07-17 — ACC-003B

- Iteration ID: `ACC-003B`.
- Task: bind the existing attendance-derived HR payroll snapshot to immutable accounting accrual and payout journals.
- Files changed: payroll journal relations/migration, HR service/controller/DTO, typed ERP payroll client, HR integration cleanup and accounting assertions.
- Result: payroll posting now rejects zero totals and atomically creates a `6100` debit / `2100` credit accrual at the period end, linked to the immutable payroll run. Payout requires that accrual, accepts an optional server-validated `1000`/`1010`/`1020` funding account (default `1010` for compatibility), creates a `2100` debit / funding credit settlement at execution time, binds both entries to the run and records separate HR and accounting Ledger events. Existing snapshot/replay and period locks remain authoritative.
- Checks run: `npm run prisma:generate`; `npx prisma validate`; API production build; `prisma migrate deploy` on `alistore_dev`; direct SQL migration on `alistore_test`; HR integration 4/4 after one transient socket/HTTP parser rerun; full API Jest 143/143 suites, 658/658 tests; `git diff --check`.
- Acceptance: `accepted` for local attendance-derived payroll accounting. Fixed assets/depreciation, accountable advances, AR aging, primary-document exports, live payment/bank settlement, staging/production deployment and first-store accountant/device validation remain open. Production readiness remains `RED`.
- Commit: pending.
- Next step: implement the next bounded `ACC-003` slice, prioritizing fixed-asset acquisition and depreciation journals or accountable-person advances after reviewing the existing domain contracts.

# 2026-07-17 — ACC-003A

- Iteration ID: `ACC-003A`.
- Task: add immutable opening-balance documents to the Finance accounting control plane.
- Files changed: `AccountingOpeningBalance` and line Prisma models/migration, Finance DTO/controller/service, replay validation and Finance integration cleanup/regression.
- Result: owner-approved `YYYY-MM` opening balances require unique active chart-of-account lines with exactly one debit or credit side per line and equal non-zero totals. The API posts one balanced journal entry dated at the period start, binds the document and lines to that entry, locks the period/idempotency boundary, exposes read access and records Event Ledger evidence. Replays return the same document; changed payloads and duplicate periods fail closed.
- Checks run: `npm run prisma:generate`; `npx prisma validate`; API production build; `prisma migrate deploy` on `alistore_dev`; direct SQL migration on `alistore_test`; targeted Finance integration 13/13; full API Jest 143/143 suites, 658/658 tests; `git diff --check`.
- Acceptance: `accepted` for the local opening-balance software contour. Payroll journals, fixed assets/depreciation, accountable advances, AR aging, primary-document exports, staging/production deployment and first-store accountant validation remain open. Production readiness remains `RED` because external credentials, devices, provider certification, staging soak and missing design references are not available.
- Commit: pending.
- Next step: implement the next bounded `ACC-003` ledger lifecycle slice, prioritizing payroll accrual and payout with immutable journal/Ledger provenance.

## 2026-07-15 — ACC-002G

- Iteration ID: `ACC-002G`.
- Task: make foreign-currency expenses and recoverable input tax reproducible in the KGS accounting journal.
- Files changed: expense/currency Prisma schema and migration, deterministic accounting helper, Finance DTO/controller/service, journal snapshot metadata, Ledger event type, typed web client, ERP Finance controls and integration regression.
- Result: owner/admin can register an immutable dated currency rate; an expense stores source amount/currency/rate and included/excluded tax snapshots while its authoritative payable amount remains KGS. Payment posts the tax base to the expense account, recoverable input tax to `1210` and the gross amount to the funding account in one balanced entry.
- Checks run: clean test-DB migration reset through `20260716080000`; physical schema assertion; Finance integration suite 12/12 (one transient `ECONNRESET` run, immediate clean rerun passed); API production build; Next production build with 39 routes; browser flow registered USD 87.5, created a 1,000 USD expense with 12% included tax, and verified the server snapshot `87,500 / 78,125 / 9,375 KGS`; desktop horizontal-overflow check passed.
- Acceptance: `accepted` for expense FX/input-tax accounting. Mobile ERP visual acceptance is not claimed: the existing fixed desktop shell clips at 390px, recorded as `ERP-RESP-001`. Output tax/settlement, supplier/payment currency, FX revaluation/gains, opening balances, AR aging and exports remain open.
- Next step: implement sales/refund output-tax liability and period tax settlement, then fix the narrow-screen ERP shell.

## 2026-07-15 — ERP-ADMIN-002

- Iteration ID: `ERP-ADMIN-002`.
- Task: connect storefront administration modules to the ERP shell.
- Files changed: `apps/web/app/erp/page.tsx` and `apps/web/components/erp/AdminView.tsx`.
- Result: role-authorized users can open CMS storefront and campaigns directly from the ERP Administration hub; the internal navigation preserves the current staff session and does not bypass server RBAC.
- Checks run: production Next.js build completed; targeted `git diff --check` passed for changed files. Full diff check remains blocked by an unrelated pre-existing trailing blank line in `apps/api/src/ai/grading.ts`.
- Acceptance: `accepted` for ERP administration navigation integration. CMS and campaign business capabilities retain their own functional/API acceptance gates.
- Commit: `b3ff416`.

## 2026-07-15 — ERP-FIN-001

- Iteration ID: `ERP-FIN-001`.
- Task: expose the accounting control plane inside ERP Finance.
- Files changed: typed finance web API clients, `FinanceControlsPanel`, and the Finance workspace integration.
- Result: Finance now shows journal-backed P&L, cash movement, AP outstanding, incassation totals, journal count/balance, accounting-period statuses, bank statement statuses and recent deposits. Period and point filters are sent to the API; the UI preserves server-authoritative values and surfaces unavailable/empty states.
- Checks run: production Next.js build passed with 39 routes; `git diff --check`. Browser visual smoke remains unverified because Playwright Chromium is not installed locally.
- Acceptance: `accepted` for Finance control-plane integration. Mutation controls for period close, bank import/reconciliation and deposit creation still need dedicated ERP forms and role-specific browser coverage.
- Next step: add tax/currency snapshots and opening-balance controls, then complete Finance mutation forms and export/drilldown.

## 2026-07-15 — ERP-ADMIN-001

- Iteration ID: `ERP-ADMIN-001`.
- Task: bring the website administration entry points into the ERP shell.
- Files changed: `apps/web/app/erp/page.tsx` and `apps/web/components/erp/AdminView.tsx`.
- Result: `/erp` now has an Administration section. The current staff role sees only permitted links to products/catalog, approvals and 2FA, warehouse/IMEI, POS, Staff operations and the public storefront; links reuse the existing server-authenticated routes and do not grant permissions client-side.
- Checks run: production Next.js build passed with 39 routes; `git diff --check`; HTTP smoke `GET /erp` returned 200. Playwright screenshot smoke was not run because the local Chromium executable is not installed.
- Acceptance: `accepted` for the ERP navigation/admin hub. The underlying modules still require their own functional, RBAC and visual acceptance gates.
- Next step: wire Finance controls (journal, AP aging, bank statements and cash incassations) into the ERP Finance workspace instead of leaving them API-only.

## 2026-07-15 — ACC-002F

- Iteration ID: `ACC-002F`.
- Task: close the cash-to-bank reconciliation loop.
- Files changed: Finance reconciliation service and cash-incassation integration regression.
- Result: matching a bank statement line to a `cash.incassation` journal now marks the originating deposit `reconciled` with a timestamp; journal, source document and bank-line links remain immutable and replay-safe.
- Checks run: clean test DB push and Finance integration suite 11/11.
- Acceptance: `accepted` for cash deposit reconciliation. Tax/currency snapshots, opening balances and export formats remain open.
- Next step: add tax/currency snapshots to primary documents and journal lines.

## 2026-07-15 — ACC-002E

- Iteration ID: `ACC-002E`.
- Task: add closed-shift cash incassation with accounting and Ledger provenance.
- Files changed: CashIncassation Prisma model/migration, Finance DTO/controller/service and Finance integration regression.
- Result: only a closed and counted shift can be deposited; total deposits cannot exceed the counted drawer cash. Each deposit moves `1000` cash to `1010` bank in one immutable balanced journal entry, is protected by a stable `Idempotency-Key`, and is queryable with its source shift and journal link.
- Checks run: Prisma validate/generate, API build, clean reset plus full migration deploy through `20260716079000_cash_incassations`, Finance integration suite 11/11.
- Acceptance: `accepted` for cash incassation software contour. Bank-format adapters, reconciliation status for deposits, tax/currency snapshots, opening balances and export formats remain open.
- Next step: add tax/currency snapshots to primary documents and journal lines, then expose finance controls in the ERP workspace.

## 2026-07-15 — ACC-002D

- Iteration ID: `ACC-002D`.
- Task: add bank statement import and journal reconciliation.
- Files changed: bank statement/line Prisma models and migration, Finance DTO/controller/service, reconciliation fixture cleanup and integration tests.
- Result: imported statements require unique external IDs and opening-plus-movements equals closing; each line can be matched once to a journal entry only when account, period and signed amount agree. Statement status becomes reconciled only when all lines match, with Ledger evidence for import and matching.
- Checks run: Prisma generate/validate, API build, reset Finance integration suite 10/10.
- Acceptance: `accepted` for bank statement software reconciliation. Live bank format adapters, cash incassation, tax/currency and production provider certification remain open.
- Next step: add tax/currency snapshots and cash-order reconciliation, then connect the controls to the ERP Finance workspace.

## 2026-07-15 — AP-001D

- Iteration ID: `AP-001D`.
- Task: add supplier credit notes as immutable AP documents.
- Files changed: credit-note Prisma model/migration, procurement DTO/controller/service, AP aging credit-note totals and procurement regression.
- Result: a credit note is created, approved and applied independently of the original invoice. Application posts `2000/1200` for unpaid invoices or `1100/1200` after payment, links the journal and Ledger event, and prevents total credits from exceeding the invoice.
- Checks run: Prisma generate/validate, API build, reset procurement suite 6/6.
- Acceptance: `accepted` for supplier credit-note software contour. Partial supplier payments/advances, landed-cost allocation and bank reconciliation remain open.
- Next step: add tax/currency snapshots and bank/cash reconciliation; then expose AP controls in the ERP finance workspace.

## 2026-07-15 — ACC-002C

- Iteration ID: `ACC-002C`.
- Task: add journal-backed financial statements.
- Files changed: Finance statements endpoint and reconciliation regression.
- Result: `/finance/statements` returns P&L, balance sheet, cash account movement, journal debit/credit totals, period/point scope and explicit balance flags. No operational table is used as a second accounting truth.
- Checks run: Prisma generation, API build, reset Finance integration suite 9/9.
- Acceptance: `accepted` for software statements slice. Opening balances, bank import/reconciliation, tax, currency and export formats remain open.
- Next step: add currency/tax snapshots and bank/cash reconciliation workflows.

## 2026-07-15 — ACC-002B

- Iteration ID: `ACC-002B`.
- Task: add immutable accounting reversal documents.
- Files changed: journal self-reversal relation/migration, permissioned reversal API and Finance regression.
- Result: a posted journal entry can be corrected only through a balanced opposite entry; the original remains unchanged, one reversal is allowed, reversal-of-reversal is rejected, and repeated requests return the same linked entry.
- Checks run: Prisma format/generate/validate, API build, reset Finance integration suite 8/8.
- Acceptance: `accepted` for journal reversal software contour. Tax, currency, bank reconciliation and full financial statements remain open.
- Next step: add credit notes and tax-aware supplier adjustments, then expose statement slices in ERP.

## 2026-07-15 — AP-001C

- Iteration ID: `AP-001C`.
- Task: expose supplier AP aging and statement drill-down in Finance API.
- Files changed: supplier aging DTO/controller/service and Finance integration regression.
- Result: approved and paid supplier invoices are reported as current, overdue buckets or paid as of a requested date, grouped with supplier/PO/journal references. Draft and cancelled documents are excluded; paid invoices never inflate outstanding liability.
- Checks run: Prisma generation, API build, reset Finance integration suite 7/7.
- Acceptance: `accepted` for read-only AP aging software contour. Credit notes, advances/partial payments, landed cost allocation and supplier statement reconciliation remain open.
- Next step: implement credit notes and reversal documents, then add the first P&L/balance-sheet statement slices.

## 2026-07-15 — AP-001B

- Iteration ID: `AP-001B`.
- Task: add supplier invoice approval, exact three-way matching and idempotent payment.
- Files changed: `SupplierInvoice` Prisma model/migration, procurement DTO/controller/service and procurement regression assertions.
- Result: invoices cannot be created before receipt, invoice amount must equal received PO value, approval rechecks the match, and payment clears supplier liability `2000` into the selected funding account with stable replay protection and journal/Ledger links.
- Checks run: Prisma generate/validate, API build, reset procurement suite 6/6, clean migration deploy through 77 migrations.
- Acceptance: `accepted` for receipt/invoice/AP payment contour. Credit notes, advances/partial payments, landed cost, supplier statement and AP aging remain open.
- Next step: add credit notes and reversal documents; AP aging is covered by `AP-001C`.

## 2026-07-15 — ACC-002A

- Iteration ID: `ACC-002A`.
- Task: introduce server-enforced accounting period controls.
- Files changed: `AccountingPeriod` Prisma model/migration, journal posting guard, finance period list/close API, DTO and finance integration regression.
- Result: periods are created lazily as open, owners/admins can soft-close or hard-close a `YYYY-MM` period, repeated close requests are idempotent, and new journal entries dated in a hard-closed period fail with a conflict. Existing idempotent replays remain readable and do not create a second entry.
- Checks run: Prisma generate/validate, API production build, reset Finance integration suite 6/6, clean migration deploy through 77 migrations.
- Acceptance: `accepted` for hard-close posting protection. Reversal entries, taxes, currencies, bank reconciliation, statements and AP/AR aging remain open.
- Next step: add reversal/adjustment documents and AP aging/statement drill-down without mutating posted journal rows.

## 2026-07-15 — AP-001A

- Iteration ID: `AP-001A`.
- Task: make purchase receiving create authoritative supplier payable accounting instead of only stock movements.
- Files changed: `PurchaseReceipt` journal relation/migration, procurement receiving service, procurement regression assertions.
- Result: every non-zero partial or full PO receipt posts `1200` inventory debit / `2000` supplier liability credit, links the receipt to its journal entry and emits `AccountingEntryPosted`. The receipt id is the source/idempotency boundary, so replay cannot duplicate either stock or AP.
- Checks run: Prisma schema generation, API build, reset test database, procurement API/RBAC suite 5/5 tests.
- Acceptance: `accepted` for receipt-to-AP posting. Supplier invoice matching/payment is now covered by `AP-001B`; credit notes, landed cost and AP aging remain open.
- Next step: add supplier statement/AP aging and credit-note controls.

## 2026-07-15 — FIN-003C

- Iteration ID: `FIN-003C`.
- Task: close the accounting gap for consignment returns before and after owner payout.
- Files changed: consignment return journal helper, serialized/quantity return reconciliation, and regression assertions.
- Result: an unpaid consignment return reverses the owner payable reclassification (`2000` debit / `4000` credit); a return after payout creates an owner receivable (`1100` debit / `4000` credit) alongside the existing compensation obligation. Both paths are scoped by return and line and emit `AccountingEntryPosted` Ledger evidence, so reconciliation cannot silently change business tables without a journal consequence.
- Checks run: Prisma reset/schema push; API build; serialized, quantity-consignment and return-reconciliation suites passed, 12/12 tests; `git diff --check` for the iteration files.
- Acceptance: `accepted` for the consignment-return accounting contour. Settlement of owner receivables and payroll/AP/period controls remain open.
- Next step: implement authoritative supplier AP documents and three-way matching, then expose journal balances in ERP reports.

## 2026-07-15 — FIN-003B

- Iteration ID: `FIN-003B`.
- Task: extend the accounting journal to COD handover, debt instalment receipts and consignment owner settlement.
- Files changed: courier COD handover, debt payment DTO/service, consignment sale/payout accounting and related idempotency namespaces.
- Result: COD handover posts cash/debt and records shortage or overage in `6990`; debt payments post cash/provider to receivables; serialized and quantity consignment sales reclassify the owner share from revenue to liability `2000`; payout clears that liability through the funding account. Replays use stable, domain-scoped keys and cannot be confused with payment keys.
- Checks run: Prisma schema push on a reset test database; API build; targeted consignment, quantity-consignment, courier-handover and debt suites passed after isolating the accounting key namespace. A full post-change `mvp:verify` remains pending.
- Acceptance: `accepted` for COD/debt/consignment settlement journal posting. Remaining `FIN-003` scope is payroll payouts, return compensation/reversal journals and broader settlement controls; production certification is not claimed.
- Next step: expose valuation/COGS and settlement journals in ERP reports, then close payroll and consignment return compensation gaps.

## 2026-07-15 — INV-VAL-001A

- Iteration ID: `INV-VAL-001A`.
- Task: establish immutable inventory cost provenance and COGS for serialized and quantity stock.
- Files changed: Prisma valuation models/migrations, acquisition-cost snapshots on IMEI receiving, quantity inventory-value/FIFO layers, procurement cost propagation, serialized and quantity sale COGS posting, movement value fields and valuation helper.
- Result: new receipts retain their acquisition cost independently of later catalog-cost edits. PO receiving stores each PO line cost on the IMEI; quantity receiving creates FIFO layers and updates balance value. Completed serialized and quantity sales issue immutable valuation rows and balanced `5000` COGS / `1200` inventory journal entries. Consignment rows with zero owned cost remain outside owned-stock COGS and continue through owner-liability accounting.
- Checks run: Prisma schema validation/generation; local migration deploy through 73 migrations; API build; Next production build; mobile typecheck; isolated quantity-consignment regression 3/3. A clean full `mvp:verify -- --skip-e2e` run reached API Jest with the previous code and exposed only the expected zero-cost consignment case plus unrelated HR/rate-limit fixture flakiness; after the fix, the focused affected suite and all earlier clean API suites remain green. The final full post-fix gate is still pending.
- Acceptance: `accepted` for receipt provenance and sale COGS software contour. Remaining `INV-VAL-001`: return issue reversal/quarantine disposition, valuation-aware write-offs/transfers/count adjustments, quantity PO receiving and reconciliation/reporting evidence.
- Next step: implement return-cost reversals and valuation-aware stock adjustments, then rerun the complete clean gate.

## 2026-07-15 — FIN-003A

- Iteration ID: `FIN-003A`.
- Task: bind order/service payment receipts and approved refunds to the accounting journal and cashier provenance.
- Files changed: Payment/Accounting Prisma contract and migration, receipt/refund journal posting, payment idempotency and cash-shift guards, refund settlement guards, POS/controller context propagation, payment and accounting regressions.
- Result: every service-created non-pending receipt now records account, point, actor, stable idempotency and a balanced journal entry. Cash can only be accepted by the staff member who owns an open shift at the order point. Approved cash refunds require that same shift; non-cash refunds require a provider/bank settlement reference at execution. Refunds post compensating journal entries and preserve approval/Event Ledger history. Serialized orders may derive a missing legacy point from the authoritative IMEI location; new checkout still remains point-bound.
- Checks run: test database reset with current Prisma schema; focused payment/POS/refund/shift/consignment suites 10/10 suites, 62/62 tests; full API Jest 107/107 suites, 399/399 tests; Prisma migrate deploy with no pending migrations; API build; Next production build; `git diff --check` was blocked only by an unrelated pre-existing blank line in `apps/api/src/ai/grading.ts`.
- Acceptance: `accepted` for receipt/refund accounting provenance and cash/provider settlement guards. Accounting remains incomplete until COD handover, debt receipts, payroll/consignment payouts, inventory valuation/COGS, supplier AP and period controls are implemented and reconciled.
- Next step: `INV-VAL-001` immutable inventory valuation and COGS, while continuing the remaining `FIN-003` settlement contours.

## 2026-07-15 — AUT-001 autonomous multi-lane coordination

- Started five disjoint lanes: Web 1:1, iOS Client, Android Client, ERP/CMS integration and QA/E2E.
- Accepted commits: `45f8383` Web compare count, `2a42877` logistics availability E2E, `906cfea` iOS Client support inbox, `5d6d4d6` campaign creative moderation, `5627a60` Android catalog filters, `5eae32c` API review moderation boundary.
- Shared gate after conflict repair: API/Web builds pass; API Jest `133/133 suites`, `528/528 tests`; targeted logistics E2E passed three repeats; iOS XCTest `33/33` and all iOS targets passed; Android unit/compile/lint/app build passed.
- One Android connected Compose gate remains unexecuted because no emulator/device was available.
- External readiness remains blocked by provider/storage/monitoring credentials and manual POS hardware certification. No production readiness or store-release claim is made.
- OpenRouter was configured locally through the ignored `apps/api/.env` (`AI_PROVIDER=openrouter`); readiness reports the AI provider configured, provider tests pass, and the key is intentionally absent from Git and client bundles.
- Coordination note: the initial Web commit also contained pre-staged parallel campaign files already in the index; subsequent lane commits used explicit file ownership and `git diff --cached` control.

## 2026-07-15 — MKT-007

- Iteration ID: `MKT-007`.
- Task: turn the advertiser cabinet from immediate send plus assumed budget spend into an approved, measurable operational lifecycle.
- Files changed: campaign lifecycle/creative/spend/outbox Prisma schema and migration; campaign DTO/controller/service, attribution eligibility, Approval executors, four-eye rule, RBAC and Ledger events; typed web client and ERP Campaigns controls; campaign/attribution/browser fixtures and acceptance; backlog/readiness/phase/traceability documents.
- Result: campaign creation is now draft-only and cannot affect delivery. A separate owner/admin approves the exact submitted budget before activation; rejection returns an editable draft with reason. Activation re-evaluates current consent and audience, creates campaign-linked Outbox rows and exposes only active/paused attribution. Pause/completion cancel pending messages. Owner-only idempotent spend entries drive ROAS and automatically pause an active campaign at its budget cap. ERP separates budget, actual spend and delivery states and exposes valid lifecycle actions.
- Checks run: Prisma format/generation; clean isolated PostgreSQL migration deploy 68/68; targeted lifecycle/attribution API 2 suites and 3 tests; API and Next production builds. Browser checkout verification in the broad worktree was compile-blocked by unrelated parallel unstaged AI work and is rerun from the committed detached worktree before acceptance.
- Acceptance: pending detached committed full API/browser verification. Live ad-platform spend import and channel/provider certification remain `MKT-008`; no production-provider readiness is claimed.
- Next backlog ID: `MKT-008` live provider linkage after credentials; otherwise continue `ECO-001` design evidence recovery.

## 2026-07-15 — MKT-006

- Iteration ID: `MKT-006`.
- Task: connect privacy-safe acquisition funnel facts and approved refund compensation to net campaign economics in ERP.
- Files changed: campaign funnel/refund Prisma schema and migration, public hashed journey tracking, checkout/payment/refund domain integration, Ledger catalogue, typed storefront attribution, ERP Campaigns net/funnel presentation and API/browser acceptance.
- Result: the storefront creates one opaque journey UUID and records replay-safe click and visit facts through a rate-limited public endpoint; the API stores only its SHA-256 hash. Order creation records checkout and the first fully received payment records conversion. Approved refunds append one adjustment per refund payment, restore exact return-item cost when available or bounded proportional cost otherwise, and never rewrite historical paid revenue/gross profit. ERP now separates paid revenue from refunds and shows net revenue, net gross profit, paid/net ROAS, contribution ROI and click-to-paid conversion. Unknown tracking codes fail closed without exposing campaign existence.
- Checks run: Prisma generation; clean isolated PostgreSQL migration deploy 67/67; targeted campaign attribution/campaign/refund/return API 4 suites and 12 tests; API and Next production builds; targeted campaign → storefront → checkout → payment → refund → ERP browser acceptance 1/1; full current Playwright 44/44; detached committed API regression on a fresh 67-migration database passed 127/127 suites and 499/499 tests. The broad current worktree additionally passed all 502 runnable tests, with four unrelated suites compile-blocked only by parallel unstaged AI moderation work.
- Acceptance: `accepted` for software-side funnel and net campaign economics. Raw journey identifiers and customer PII are absent from funnel rows; payment, refund and campaign conversion remain server-authoritative and replay-safe. Production ad-channel spend import, creative publication and provider credentials remain separate work.
- Next backlog ID: `MKT-007` advertiser cabinet lifecycle and channel-controlled activation.

## 2026-07-15 — MKT-005

- Iteration ID: `MKT-005`.
- Task: connect consent-safe campaign acquisition on the customer storefront to authoritative paid-order economics in ERP.
- Files changed: campaign/recipient/order-attribution Prisma schema and migration, first/last-touch capture, campaign and order/payment services, server product-cost snapshot, Ledger events, typed web clients, root attribution capture, checkout payload, ERP Campaigns workspace and API/browser acceptance.
- Result: campaign launch receives a server-generated tracking code and queues only consented recipients. The storefront retains bounded first/last UTM facts for 30 days; checkout sends them as untrusted attribution input, while the API resolves campaign identity and canonical source/medium from the server campaign or applied promotion. A fully received payment converts the order once in the same transaction, snapshots revenue and gross profit, and updates campaign orders/revenue/gross profit. Partial payment and replay do not convert twice. ERP now shows tracking URL, spend, orders, paid revenue, gross profit, ROAS and contribution ROI; manual order assignment was removed from the operator UI and remains only as a permissioned locked backfill endpoint.
- Checks run: Prisma generation; clean isolated PostgreSQL migration deploy 66/66; targeted campaigns/attribution API 2 suites and 3 tests; API and Next production builds; targeted full campaign → storefront → checkout → sandbox payment → ERP browser acceptance 1/1; full Playwright 43/43; detached committed baseline 127/127 suites and 499/499 tests on a freshly migrated database. The broad current worktree additionally passed all 501 runnable tests, with four unrelated suites compile-blocked only by parallel unstaged AI moderation work. Detached build attempts were intentionally not counted because the temporary worktree's external `node_modules` symlink is rejected by TypeScript portable declaration paths and Turbopack filesystem-root validation; the normal-worktree production builds are the build evidence.
- Acceptance: `accepted` for paid gross campaign attribution and ERP/site integration. Revenue and ROAS are deliberately gross of approved refunds; refund compensation and privacy-safe visit/click funnel metrics are tracked as `MKT-006` rather than being falsely included here.
- Next backlog ID: `MKT-006` net campaign economics and funnel measurement.

## 2026-07-15 — MKT-004

- Iteration ID: `MKT-004`.
- Task: let Marketing CMS control the actual storefront composition without a developer or code release.
- Files changed: StorefrontBlock schema/migration, dedicated DTO/service/controller/module, RBAC and Ledger catalogue, typed web API, ERP banner/block composer, desktop/mobile renderer, database reset and API/browser acceptance.
- Result: marketer/admin/owner can create hero, promo, info and product-collection blocks, target all/desktop/mobile, publish or archive, schedule non-overlapping hero campaigns and reorder every live block. Public clients read only effective published blocks in server order; collection products are canonical catalog projections, unsafe assets/links and archived products fail closed, and the legacy storefront revision remains a safe fallback when no block is published.
- Checks run: Prisma generation; clean isolated PostgreSQL migration deploy 65/65; targeted block API 1 suite and 2 tests; API and Next production builds; targeted ERP-to-desktop/mobile browser acceptance 4/4 plus repeated exact MKT-004 flow 1/1; full Playwright 42/42; detached committed baseline API 126/126 suites and 498/498 tests. The broader current worktree executed 130 suites: 126 suites and all 500 runnable tests passed, while four suites were compile-blocked only by a parallel unstaged `ProductsService` moderation constructor change.
- Acceptance: `accepted` for the full committed Marketing CMS handoff: banners/blocks, managed promotion codes and review moderation now have authoritative API, RBAC, Ledger and storefront consequence evidence. Real production media/channel credentials and campaign ROI remain separate launch work.
- Next backlog ID: `MKT-005` closes campaign attribution and ROAS rather than adding more decorative CMS controls.

## 2026-07-15 — MKT-003

- Iteration ID: `MKT-003`.
- Task: remove hard-coded checkout promo behavior and make discounts an authoritative Marketing CMS workflow.
- Files changed: promotion/redemption schema and migration, typed DTO/service/controller/module, RBAC and Ledger events, atomic order redemption, typed web client, server-quoted cart behavior, ERP promotion workspace and API/browser acceptance.
- Result: marketer/admin/owner can create, activate and pause fixed or percentage codes with schedules, product/category eligibility, minimum subtotal, maximum discount and total/per-customer limits. Public cart quotes canonical server prices; order creation row-locks the promotion, rechecks limits and records order, redemption and Ledger atomically. Replays and demo orders do not consume a second redemption; seller management is denied.
- Checks run: Prisma generation; clean isolated PostgreSQL migration deploy (64/64); targeted promotions/orders API 2 suites and 12 tests; API and Next production builds; targeted ERP promo → cart → guest checkout browser acceptance plus checkout regression 9/9; full Playwright 41/41; detached committed baseline API 125/125 suites and 496/496 tests. The broader current worktree executed 129 suites: 125 suites and all 498 runnable tests passed, while four suites were compile-blocked only by a parallel unstaged `ProductsService` moderation constructor change.
- Acceptance: `accepted` for managed promotion codes. Banner/content-block entities remain open, so Marketing CMS is still partial.
- Next backlog ID: `MKT-004` implements authoritative banner and content-block composition.

## 2026-07-15 — MKT-002

- Iteration ID: `MKT-002`.
- Task: stop unmoderated customer reviews from changing public trust signals and give Marketing CMS a real moderation queue.
- Files changed: ProductReview moderation schema/migration, approved-only public/catalog projections, customer submission and staff decision Ledger events, RBAC endpoints, typed web client, ERP moderation workspace, customer confirmation copy and API/browser acceptance.
- Result: verified purchasers submit `pending` reviews; pending/rejected rows never affect public count or average. Marketer/admin/owner can approve or reject with a reason, seller is denied, repeated same decisions are idempotent, and the approved review appears on the product page immediately.
- Checks run: clean PostgreSQL migration deploy (63/63); targeted review/catalog/storefront API 3 suites and 12 tests; full current worktree API 127/127 suites and 513/513 tests (includes parallel unstaged AI suites); detached committed baseline 123/124 suites and 493/494 tests in one run with one transient HTTP parser failure in `support-rbac`, followed by an isolated 2/2 green rerun; API and Next production builds; ERP CMS + storefront + checkout Playwright 14/14; `git diff --check` passed.
- Acceptance: `accepted` for review moderation. Promotion-code management and banner/block entities remain open; no full Marketing CMS completion is claimed.
- Next backlog ID: `MKT-003` replaces hard-coded promo behavior with an ERP-managed, server-authoritative promotion lifecycle.

## 2026-07-15 — MKT-001

- Iteration ID: `MKT-001`.
- Task: turn the first Marketing CMS slice into an authoritative ERP-to-storefront workflow.
- Files changed: Storefront revision schema/migration, scheduling API/RBAC/Ledger events, ordered catalog projection, ERP CMS product selector and scheduling controls, desktop/mobile storefront consumption, API and Playwright regression coverage.
- Result: marketer/admin/owner can select and order up to 12 active products, publish immediately or schedule a bounded campaign, cancel it and automatically fall back to the baseline publication after expiry. Missing/archived products and overlapping campaign windows fail closed. The customer home reads the exact server-owned title and product order; the browser test proves the ERP consequence end to end.
- Checks run: clean PostgreSQL migration deploy (62/62); targeted Storefront API 5/5; full API 124/124 suites and 493/493 tests; API and Next production builds; targeted ERP-to-storefront Playwright 1/1; broad Playwright 36 passed with three unrelated Next dev navigation timeouts, followed by isolated 3/3 green reruns; `git diff --check` passed.
- Acceptance: `accepted` for scheduled product collections. Banner/block ordering, review approval and promo/review moderation remain partial and are not claimed complete.
- Next backlog ID: complete the remaining Marketing CMS handoff without changing the MKT-001 publication contract.

## 2026-07-15 — MER-001

- Iteration ID: `MER-001`.
- Task: make the customer storefront commercially truthful and complete while connecting owner-managed merchandising to ERP.
- Files changed: versioned Storefront CMS Prisma model/migration, API/RBAC/Ledger module, catalog categories/exact detail/reviews/sort contracts, typed web clients, ERP CMS editor, desktop/mobile storefront/product/catalog/cart/info surfaces and API/browser regressions.
- Result: marketer/admin/owner can draft and publish one canonical storefront revision; the public site reads its hero, about, delivery, contacts and benefits alongside active ERP store points. Guessed product photos, synthetic ratings/review counts and hard-coded financing/warranty/delivery/return claims were removed. Product media and commercial terms render only from explicit product/CMS data. `/about` and `/delivery` are real routes, desktop/mobile catalog pagination reaches products beyond the former 100-item ceiling, exact product reads no longer scan a page, and cart quantity/price are refreshed and clamped to server availability.
- Checks run: Prisma generation; clean isolated PostgreSQL with all 61 migrations; targeted CMS/catalog API 7/7; API and Next production builds; full API regression 124/124 suites and 490/490 tests; full Playwright 38/38 plus repeated storefront/CMS acceptance 6/6 including 1440/863/402 px, information links, 105-product pagination, no fabricated claims, server stock cap and stock-first sorting; `git diff --check`.
- Defects found and disposition: `stock_desc` previously accepted the UI request but used category/name order unless `stockOnly` was also set; Postgres now computes availability before sorting and an integration test fixes the contract. Internal media/commercial attributes are excluded from visible product specifications. The first full regression command was overridden by Jest's configured stale `TEST_DATABASE_URL`; the migrated isolated URL was then supplied explicitly through both environment variables and the complete suite passed.
- Acceptance: `accepted` for commercial-truth software integration. Real product photography/content population, live provider terms and legal approval remain owner-controlled production data/certification, not code readiness.
- Commit association: commit subject/body contains `MER-001`.
- Remaining gaps: `ECO-001`, `ECO-002`, production accounts/providers, physical-device/hardware and legal certification.
- Next backlog ID: `ECO-001` restores or explicitly retires missing design evidence before broad 95-screen visual acceptance.

## 2026-07-15 — FUL-002

- Iteration ID: `FUL-002`.
- Backlog / journey IDs: guest web/Telegram checkout → private order status → paid receipt → refresh/restart recovery.
- Branch / base commit: `codex/open-source-integrations` / `5d08ae2`.
- Changed files: order-scoped guest capability claims/TTL, safe guest order and receipt endpoints, storefront access persistence and `/order/[id]` status surface, checkout/Telegram handoff, security/rate-limit/API/browser tests, backlog/readiness/completion evidence.
- Exact checks: targeted guest capability/order API 2/2 suites and 4/4 tests; API and Next production builds; targeted checkout/Telegram Playwright 7/7; full API 123/123 suites and 487/487 tests on a fresh 60-migration database; full Playwright 37/37; `git diff --check`.
- Durable evidence: `guest-order-access.e2e-spec.ts` proves narrow scope, customer/order ownership, expiry, tamper and cross-order rejection, paid-only safe receipt output and no capability in Ledger. Checkout and Telegram Playwright prove fragment stripping, private status/receipt access and clean-URL reload recovery.
- Defects found and disposition: guests previously lost the only safe post-checkout route and could not reopen an order without OTP. Access is now shareable only through a short-lived scoped fragment, persisted per order and never accepted from a broad checkout capability. Full validation also exposed a missing `ReceiptsService` mock in the isolated public rate-limit harness; production behavior was unchanged and the harness now compiles.
- Acceptance: `accepted` for guest post-checkout software recovery. Device loss/cleared browser storage requires OTP account recovery; live provider receipt/fiscal certification remains external.
- Commit association: commit subject/body contains `FUL-002`.
- Remaining gaps: `MER-001`, `ECO-001`, `ECO-002`, owner-controlled production/device/provider certification.
- Next backlog ID: `MER-001` removes fabricated merchandising claims and closes catalog/storefront commercial truth.

## 2026-07-15 — FIN-001

- Iteration ID: `FIN-001`.
- Backlog / journey IDs: website/provider payment + POS cash shift + Courier COD + refund → owner Finance settlement → Event Ledger.
- Branch / base commit: `codex/open-source-integrations` / `c20aeb7`.
- Changed files: Finance settlement Prisma enums/models/command journal and migration; Finance DTO/controller/service and Ledger events; typed web client and ERP reconciliation workspace; API/browser acceptance and shared E2E reset/config; consign­ment-return invariant repair; backlog/readiness/completion/traceability documentation.
- Exact checks: Prisma generate; clean-database deploy of all 60 migrations; targeted Finance API 5/5 and browser 2/2; isolated return reconciliation 5/5; full API 122/122 suites and 485/485 tests; API and Next production builds; full Playwright 37/37; `git diff --check`.
- Independent review fixes: observed POS/COD/provider amounts remain immutable; discrepancies close only through explicit compensating entries recorded in Event Ledger; COD uses `handedOverAt`; UI retries retain the same command key; cross-run idempotency races return deterministic conflict instead of 500.
- Durable evidence: `finance-settlements.e2e-spec.ts` proves exact provider/POS/COD/refund settlement, negative refund amounts, disputed close rejection, reasoned resolution, command replay and atomic rollback. `finance-ui.spec.ts` proves an owner discovers a website payment, creates and closes the settlement, changes the payment to `reconciled` and records Ledger evidence through ERP.
- Defects found and disposition: Finance previously showed channel totals without a durable proof that a source was reconciled. Settlement runs/lines now bind each source once and close only at zero unexplained variance. The full gate exposed a paid consign­ment return that violated its existing DB check by retaining `saleOrderId`; the same transaction now detaches the withdrawn item while preserving payout adjustment and Ledger history. Playwright login throttling is disabled only under explicit `E2E_TEST=true`, and a checkout test now follows the configured API port; production rate-limit tests remain active.
- Acceptance: `accepted` for first-store Finance software reconciliation. Live merchant statement import/certification, provider callbacks, fiscal reconciliation, currency/cashflow/export and first-store accounting UAT remain external/later scope.
- Commit association: commit subject/body contains `FIN-001`.
- Remaining gaps: `FUL-002`, `MER-001`, `ECO-001`, `ECO-002`, owner-controlled production/device/provider certification.
- Next backlog ID: `FUL-002` closes guest post-checkout recovery before the commercial-truth `MER-001` storefront pass.

## 2026-07-15 — FUL-001

- Iteration ID: `FUL-001`.
- Backlog / journey IDs: first-store ERP → storefront/Telegram/POS/native checkout → point-local stock allocation.
- Branch / base commit: `codex/open-source-integrations` / `9cb6528`.
- Changed files: StorePoint/command/order snapshot Prisma schema and migration; Logistics, Orders, POS and Units services/DTOs/controllers; checkout, Telegram and ERP Logistics web surfaces; SwiftUI and Compose checkout/offline contracts; deterministic Jest/Playwright fixtures and cross-surface tests; backlog/readiness/traceability documentation.
- Exact checks: Prisma schema validation, fresh-database deploy/status for all 59 migrations and `git diff --check`; targeted store-point/POS/quantity/fulfillment Jest 4/4 suites and 25/25 tests plus final POS/store-point regression 16/16; full API 121/121 suites and 480/480 tests; API and Next production builds; targeted Logistics Playwright 2/2, procurement 2/2 and customer/Telegram/checkout Playwright 8/8; full Playwright 36/36; four iOS target build and 31/31 XCTest; Android all-module JVM tests and Lint.
- Durable evidence: `store-points-fulfillment.e2e-spec.ts` proves unknown/disabled point rejection, immutable snapshots, exact address and no cross-location serialized reservation; `logistics-ui.spec.ts` proves an ERP active toggle immediately changes public checkout options; checkout/Telegram browser tests prove canonical point snapshots and exact delivery address.
- Defects found and disposition: client-owned pickup strings, synthetic guest delivery fallback and cross-location allocation were replaced by server-owned StorePoint identity and inventory location. POS now rejects an authenticated cashier attempting to sell from another active point. Legacy queued pickup mutations without a point are marked conflict for explicit reselection. Full-suite validation exposed and fixed an unrelated Service Center payment cleanup ordering defect, auth-throttle-dependent procurement setup and stale browser expectations.
- Acceptance: `accepted` for first-store fulfillment software integration. Route optimization/live tracking, guest receipt recovery (`FUL-002`), Finance settlement (`FIN-001`), physical devices/providers and full ecosystem visual acceptance remain outside this gate.
- Commit association: commit subject/body contains `FUL-001`.
- Remaining gaps: `FIN-001`, `FUL-002`, `MER-001`, `ECO-001`, `ECO-002`, owner-controlled production/device/provider certification.
- Next backlog ID: `FIN-001` is the next highest-impact ERP/site integration vertical; `FUL-002` then closes guest post-checkout recovery.

## 2026-07-14 — GOV-001

- Iteration ID: `GOV-001`.
- Backlog / journey IDs: ecosystem governance; unblocks evidence for `ECO-001` and `ECO-002`.
- Branch / base commit: `codex/open-source-integrations` / `0cdd7e4`.
- Changed files: root `CODEX_PROMPT.md`; Git-backed ecosystem audit, acceptance manifest and npm commands; archived handoff warning; master prompt pointer; README/backlog/readiness/completion/traceability documentation; suite-owned Customer 360 cleanup; temporary Playwright media lifecycle.
- Exact checks: `node --check scripts/ecosystem-contract-audit.mjs` (exit 0); JSON assertions for 23 tracked / 74 linked / 64 missing (exit 0); `npm run ecosystem:audit` (exit 0); pre-commit `npm run ecosystem:audit:strict` (expected exit 1: missing corpus plus four acceptance-evidence gaps and dirty manifest/source); targeted Service Center + loaner + Customer 360 regression 3/3 suites and 11/11 tests; isolated Customer 360 3/3; Service Center Playwright 3/3 with temporary media cleanup; final `npm run ecosystem:verify` (exit 0: 120/120 API suites, 478/478 tests, 35/35 Playwright, four iOS targets, 31/31 XCTest, four Android APKs, JVM tests and Lint); `git diff --check` (exit 0).
- Durable evidence: `CODEX_PROMPT.md`, `scripts/ecosystem-contract-audit.mjs`, `docs/acceptance/ecosystem-evidence.json`, `docs/ECOSYSTEM-TRACEABILITY-MATRIX.md` and machine output reproducible at `.artifacts/ecosystem-audit.json` with `npm run ecosystem:audit:json`.
- Defects found and disposition: canonical root prompt was absent; archived prompt referenced stale Next/Core Data/Kubernetes choices and wrong root paths; README overstated software-MVP completion; exact visual acceptance lacked durable evidence requirements; native and reconciled E2E prose exceeded executable gates; pickup/store identity is client text, guest checkout can submit a synthetic address and stock can be reserved outside the promised point; `PaymentStatus.reconciled`/`payment.reconciled` exist without an authoritative Finance settlement workflow. The full gate also exposed unsafe global Customer 360 test cleanup and repository-local E2E uploads; cleanup is now suite-owned and uploads use a removed temporary directory. Root precedence and fail-closed checks were added, readiness claims were corrected and `FUL-001`/`FIN-001` were recorded; four software acceptance-evidence gaps and 64 absent handoffs remain explicitly open.
- Acceptance: `accepted` for the governance/audit vertical after its GOV-001 commit; full ecosystem remains `partial`.
- Commit association: the commit subject/body contains `GOV-001`.
- Remaining gaps: `ECO-001`, `ECO-002`, `FUL-001`, `FIN-001`, owner-controlled production/device/provider certification.
- Next backlog ID: `FUL-001` is the highest-impact software-owned first-store integration vertical; `FIN-001` follows, while `ECO-001` source handoffs can be recovered in parallel.

## 2026-07-13

- Task: complete Android Courier Evidence and push/deep-link routing against the shared API/ERP contracts.
- Files changed: Courier route/Evidence Compose UI; courier Firebase registrar/service/manifest/release guard; scoped deep-link parser; transactional assignment outbox; API/JVM/Compose tests; backlog and readiness documentation.
- Result: an ERP courier assignment now commits its Order/CourierRun/Event Ledger changes and durable push notification in one transaction. Android Courier registers its FCM token under the stored courier staff JWT, routes only `alistore-courier://deliveries/{orderId}` notifications, focuses the assigned delivery and uploads camera/gallery proof to the private order Evidence Vault without trusting a client actor or status.
- Checks run: targeted courier/Evidence/RBAC Jest 14/14; full `npm run mvp:verify` (Prisma, API/Web production builds, mobile typecheck, API Jest 110/110 suites and 423/423 tests, Playwright 22/22, secret-safe external readiness report); four-APK Android build; all-module JVM tests and Lint; existing Android API 36 connected Compose suite 23/23; targeted Courier Compose login/Evidence suite 2/2; `git diff --check`.
- Outcome: Android Courier software/emulator parity is complete for assignment, route, Evidence, delivery/failure, COD, offline replay and push routing. Live FCM delivery and physical maps/camera/network certification remain external device/credential gates.
- Next step: close the next software-owned gap, server-authoritative loyalty earning/redemption, while live cloud/provider/device certification waits for owner credentials and hardware.

## 2026-07-13

- Task: complete the native Android POS software vertical against the shared ERP/API contracts.
- Files changed: Android POS/core sale, shift, scanner, offline queue, receipt and after-sale screens; POS/unit/exchange API services and DTOs; integration/unit tests; backlog/readiness/gap-map documentation.
- Result: the cashier now opens and reconciles a server-owned shift, scans SKU or exact IMEI through keyboard/camera input, sells only the API-validated serialized unit, recovers queued approvals without changing the original sale key, loads the canonical server receipt/ESC-POS payload, inspects payments, advances returns, requests approval-gated refunds and executes an atomic idempotent exchange. A repeated exchange returns the original result and cannot create a second order or stock movement.
- Checks run: targeted POS/exchange/RBAC Jest 19/19; full `npm run mvp:verify` (Prisma, API/Web production builds, mobile typecheck, API Jest 110/110 suites and 423/423 tests, Playwright 22/22, secret-safe external readiness report); four-APK Android build; all-module JVM tests and Lint; Android API 36 connected Compose suite 23/23; `git diff --check`.
- Outcome: Android POS software parity is complete for the implemented MVP contracts. Physical ESC/POS printing, scanner focus/recognition and bank-terminal integration remain device/provider certification gates and are not claimed complete.
- Next step: add Courier Evidence and push/deep-link routing, then perform physical Android device certification when hardware and credentials are available.

## 2026-07-13

- Task: replace the Android POS placeholder with the first integrated native counter-sale vertical and define the ERP App/site completion plan.
- Files changed: POS actor DTO hardening and server-canonical catalog validation; Android POS typed gateway/models, cashier-only Keystore session, catalog/cart/split-payment/approval UI, isolated offline queue/WorkManager replay and JVM/Compose tests; API test isolation; ERP/site integration plan and readiness tracking.
- Result: the native POS now reads the same catalog used by the storefront, writes sales through the same NestJS Order/Payment/Shift/Inventory/Event Ledger services visible in ERP, and never trusts a client actor, SKU or price. Cash/card/MBank split tender, discount approval retry and stable offline replay are implemented; a queued approval is retained as a conflict rather than converted into a sale.
- Checks run: targeted POS/staff-JWT API 22/22; full API Jest 110/110 suites and 420/420 tests; API production build; all four Android Debug APKs; all-module JVM tests and Android Lint; Android API 36 Compose 23/23; `git diff --check`.
- Outcome: Android POS counter sale is accepted at software/emulator level. Scanner/IMEI, explicit shift UI, queued-approval recovery, receipt printing, refund/exchange and physical terminal certification remain required, so full POS/store readiness is not claimed.
- Next step: complete the remaining POS operational cycle, then execute the ERP App/site plan starting with the shared integration contract matrix and cross-surface E2E.

## 2026-07-13

- Task: replace the Android Courier role placeholder with the owner-bound assignment, delivery and COD vertical shared with ERP/API.
- Files changed: courier/order Prisma ownership and command schema plus migration; dedicated Nest courier list/start/deliver/fail/COD contracts; generic courier transition bypass guard; integration/RBAC regressions; Android typed gateway/models, courier-only Keystore session, route/COD/profile Compose UI, map/call intents, isolated SQLite/WorkManager replay, JVM/UI tests; backlog and readiness tracking.
- Result: ERP dispatch can assign eligible courier orders only to an active courier and the API derives outstanding COD from settled payments. A courier JWT lists and mutates only its own assignments; start, deliver and fail commands persist exact idempotency responses in the same transaction as status/Event Ledger changes. Android Courier now supports login/session restore, route/address/slot/items, navigation and calling, online/offline start/deliver/fail, COD collection and handover, retry visibility and profile/logout without locally assigning authoritative status.
- Checks run: Prisma format/validate/generate; migration on development DB and schema sync on isolated test DB; targeted courier integration/RBAC 10/10; full API Jest 110/110 suites and 419/419 tests; API production build; Android core JVM tests and Lint; all four Debug APK builds; Android all-module unit/Lint gate; Android API 36 Compose 22/22; `git diff --check`.
- Outcome: Android Courier assignment/delivery/COD is accepted at software/emulator level and integrates with the same PostgreSQL Order, Payment, CourierRun and Event Ledger records used by ERP/web. Evidence photo, courier push/deep links and physical maps/camera/network smoke remain release gates; full Courier store readiness is not claimed.
- Next step: replace the Android POS placeholder with catalog/ticket, split tender, approval/2FA, shift, receipt and isolated offline replay using the existing POS API invariants.

## 2026-07-13

- Task: complete authenticated Android Staff FCM registration, delivery and deep-link routing.
- Files changed: FCM HTTP v1 outbox transport and readiness contract; transactional Staff task notification; native token registry validation; Android Firebase wiring, notification service/permission/channel, secure staff-session registration and route parser; API/JVM/Compose tests; release fail-fast and readiness documentation.
- Result: creating an assigned Staff task now writes its Ledger mutation and durable push outbox message atomically. The worker resolves enabled Android tokens by staff/customer ownership, authenticates to FCM HTTP v1 with a short-lived service-account OAuth assertion, sends string-only scoped data, disables `UNREGISTERED` tokens and returns temporary provider failures for outbox retry. Staff registers only under an active stored staff JWT and notification taps route to Tasks, Orders, Customer 360, warranty or support without trusting a client status mutation.
- Checks run: production dependency audit 0 vulnerabilities; API build; API Jest 110/110 suites and 417/417 tests; Playwright 22/22; Android unit/Lint; four Debug APK builds; API 36 Compose 21/21; deliberate Staff Release rejection without ignored `google-services.json`; `git diff --check`.
- Outcome: Android Staff FCM is complete at software/emulator level. Live delivery is deliberately not certified until owner-provided Firebase service account/app config and a physical Android device pass token rotation, background/terminated delivery and tap-routing smoke.
- Next step: implement the Android Courier assignment → route → delivery/failure → COD handover vertical with durable offline replay.

## 2026-07-13

- Task: replace Android/web Staff task placeholders with one server-authoritative operational task workflow.
- Files changed: StaffTask Prisma model/migration; NestJS task DTO/service/controller/RBAC/Event Ledger; Android typed gateway, Compose task screen and JVM/API 36 regressions; web task client/error states; isolated Next E2E build directory; Playwright task lifecycle; backlog and readiness documentation.
- Result: an admin/owner can assign a task to an active employee; only that authenticated employee can list or advance it through `open → in_progress → completed`. Foreign, revoked and stale-role access is rejected, illegal/repeated transitions conflict, and completion writes one Ledger event. Web Staff and Android Staff read and update the same PostgreSQL record, with loading, empty, error and retry states.
- Checks run: Prisma format/generate and migration on development/test databases; API production build; targeted Staff task API 2/2; full API Jest 109/109 suites and 411/411 tests; web production build for 37 routes; targeted Staff Playwright lifecycle 1/1; full Playwright 22/22; Android Staff APK/JVM gate; full API 36 Compose 20/20; MediaStore visual `/tmp/alistore-staff-tasks-valid.png` inspected; `git diff --check`.
- Outcome: shared Staff tasks are complete at software/emulator/browser level. iOS task parity, FCM/APNs routing and physical-device certification are not claimed.
- Next step: add authenticated Android FCM token registration and push/deep-link routing for Staff, then begin Courier assignment/delivery/COD.

## 2026-07-13

- Task: complete Android Staff Customer 360 with guarded warranty/support operations and close the remaining active-staff read gap.
- Files changed: customer API authorization/module/security test; Android typed models/API/gateway; Customer 360 Compose screen/navigation; JVM and API 36 UI tests; backlog, gap map and Android readiness docs.
- Result: Staff can search an internal customer ID and inspect server-masked profile data, LTV, purchases, debt, recent orders, warranties and support tickets. Warehouse/admin roles can advance warranty cases; admin/owner roles can transition or escalate support. Every action sends the stored staff JWT, reloads server-authoritative state and surfaces permission/error/empty/loading states. Revoked staff and stale-role tokens now fail Customer 360 reads.
- Checks run: `npm run api:build`; targeted customer PII/IDOR Jest 4/4; full API Jest 108/108 suites and 409/409 tests; four-APK `npm run android:build`; Android unit/Lint; API 36 Compose 18/18; targeted visual regression and manual screenshot inspection; `git diff --check`.
- Outcome: Android Staff Customer 360, warranty and support vertical is complete at emulator level. Physical camera/push certification is not claimed.
- Next step: implement Android Staff general tasks and FCM routing, then begin the Courier assignment/delivery/COD vertical.

## 2026-07-13

- Task: complete Android Staff barcode/IMEI scanning and Evidence Vault capture/upload.
- Files changed: Android CameraX/ML Kit dependencies and camera permission; Staff scanner/Evidence Compose screen; staff-specific multipart gateway; JVM and API 36 Compose/camera regressions; Android readme, architecture gap map and backlog tracking.
- Result: Android Staff now scans EAN-8, EAN-13, Code128 and QR through a lifecycle-bound CameraX analyzer with a bundled offline ML Kit model, accepts manual IMEI/reader input, and maps the value into an Evidence entity. Staff can choose all seven supported entity types, add a label, capture/select a photo and upload it with the stored staff JWT; the existing API validates the entity, derives the actor and writes `evidence.attached` to Event Ledger.
- Checks run: targeted Staff APK compile; scanner JVM test; targeted Compose upload and API 36 camera open/close smoke; all four Debug APK builds; all-module Android unit tests and Lint; full API 36 Compose suite 16/16; original-resolution `/tmp/alistore-staff-scanner-fixed2.png` inspected, with keyboard and dark-theme contrast defects fixed; `git diff --check`.
- Outcome: feature commit `20b4615`; Android Staff scanner/Evidence is accepted at software/emulator level and shares the same NestJS/PostgreSQL Evidence contract as iOS/web operations. Physical-device camera focus, real barcode recognition and photo quality remain a release certification gate; Customer 360, support/warranty actions, tasks and push remain open.
- Next step: implement Android Staff Customer 360 plus guarded warranty/support actions, then tasks and push routing.

## 2026-07-13

- Task: replace the Android Staff placeholder with the first authenticated ERP App operational vertical.
- Files changed: cash-shift Prisma idempotency migration and Nest controller/service; concurrent shift regressions; Android staff session models/manager/Keystore binding; typed staff/shift/order API; Compose login, home, order queue and shift reconciliation screens; JVM/Compose tests and readiness/backlog documentation.
- Result: Android Staff now restores an encrypted staff JWT only after `/staff-auth/me` confirms an active employee, loads RBAC-filtered server order queues, performs guarded fulfillment transitions and opens/closes the same cash shifts used by web POS/ERP. Exact shift retries preserve one idempotency key, concurrent commands create one shift and one Event Ledger event, and discrepancies require a reason. Scanner is deliberately marked pending rather than simulated.
- Checks run: Prisma format/generate, dev migration and isolated test DB sync; targeted shift integration 7/7; API production build; full API 108/108 suites and 408/408 tests; Next production build for 37 routes; Playwright 22/22; four Android APK builds; Android unit/Lint; API 36 Compose UI 13/13; original-resolution Staff queue visual `/tmp/alistore-staff-orders-safe.png` inspected and status-bar overlap corrected; `git diff --check`.
- Outcome: feature commit `ff1a2dc`; the website, ERP and Android Staff share PostgreSQL/NestJS order and shift contracts for this vertical. Android Staff scanner, tasks, Customer 360, support/warranty, Evidence and push remain open; Courier/POS Android apps remain foundations, so full ERP App readiness is not claimed.
- Next step: add Android Staff scanner plus Evidence Vault capture using the existing staff JWT/RBAC APIs, then Customer 360 and support/warranty actions.

## 2026-07-13

- Task: synchronize customer loyalty, addresses and settings across API, web checkout/account and the native Android Client.
- Files changed: customer-account Prisma models/migration, owner-scoped NestJS customer endpoints and Event Ledger types, typed web/Android clients and screens, checkout address integration, API/Playwright/Compose regressions, architecture/backlog/readme documentation.
- Result: loyalty balance/coupons/history, address CRUD/primary rotation and profile/consent/channel preferences now use PostgreSQL-backed customer JWT endpoints. Web and Android share the same contracts; signed-in web checkout loads the server primary address, while guest checkout retains its local fallback. Address creation preserves one idempotency key through access-token refresh and concurrent exact replay creates one row.
- Checks run: Prisma development migration and test schema sync; API production build; targeted account E2E 3/3; full API 108/108 suites and 406/406 tests; Next production build for 37 routes; full Playwright 22/22; four Android APK builds; Android unit/Lint; API 36 Compose UI 10/10; Android bonus screen visual capture; `git diff --check`.
- Outcome: feature commit `92d3a5b`; account data is now demonstrably shared by ERP/API, web and Android. Live provider/device certification is still external, and loyalty redemption remains in `BACKLOG.md` because the current web cart discount is not yet server-authoritative.
- Next step: implement the Android Staff operational parity wave, starting with authenticated shift and order queues using existing staff JWT/RBAC contracts.

## 2026-07-13

- Task: execute Master Plan Android iteration 5, owner-scoped support and idempotent returns with Evidence Vault hooks.
- Files changed: support/return idempotency schema and migration; customer-owned `mine` controllers, DTOs and race-safe services; RBAC/idempotency/Event Ledger regressions; Android support/return models, typed API, account routing, Evidence photo picker, Compose loading/empty/error/submission states and UI tests; architecture/backlog/readme tracking.
- Result: Android Client now lists and creates only the authenticated customer's support tickets and return requests, starts a return from signed-in order history, preserves one command key across 401 refresh/retry, and uploads optional photos through the authenticated Evidence Vault. The API derives ownership from JWT, rejects changed-payload key reuse, exact-replays concurrent duplicates and emits one critical Ledger event.
- Checks run: Prisma generate, dev migration and isolated test DB sync; focused support/returns API 4/4; full API sequential 107/107 suites and 403/403 tests; API production build; Web production build across 37 routes; four Android APK builds; all-module unit tests and Android Lint; Compose instrumentation 7/7 on API 36 after final UI polish; original-resolution Compose render `/tmp/alistore-android-support-render.png` inspected; `git diff --check`.
- Outcome: Android support and returns vertical is accepted at software/emulator level. Live camera/provider behavior still requires physical-device certification; Client bonuses, addresses and settings are the next native slice.
- Commit: `6cf61ad feat(android): add support and returns self-service`.
- Next step: implement Android Client bonuses, addresses and settings with owner-scoped typed contracts and Compose state coverage, then move to Staff parity.

## 2026-07-13

- Task: execute Master Plan Android iteration 4, owned devices and idempotent warranty opening.
- Files changed: warranty ownership/idempotency domain model and migration; warranty controller/service and web client key propagation; API ownership/RBAC/notification regressions; Android device/warranty models, typed API, account routing, Compose loading/empty/error/detail/submission states and device test; architecture/backlog/readme tracking.
- Result: Android Client now loads only the authenticated customer's sold devices, displays warranty coverage and current case, and opens a new case while preserving one key across 401 refresh/retry. The API now proves `DeviceUnit.orderId → Order.customerId`, rejects cross-customer IMEIs and a second active case, exact-replays one persisted command and rejects changed-payload key reuse. Case creation and `warranty.created` remain atomic in the Event Ledger.
- Checks run: Prisma validate/generate, dev migration and test DB sync; focused warranty/RBAC/notification API 8/8 including changed-payload replay and concurrent-open serialization; API production build; full API sequential 107/107 suites and 401/401 tests (one earlier parallel protection transport parse failure passed isolated and in both full sequential gates); Web production build across 37 routes; Android core compile/JVM tests; four APK builds; all-module unit tests and Android Lint; Compose instrumentation 5/5 on API 36; original-resolution screenshot `/tmp/alistore-android-device-warranty-fixed.png` inspected, exposing and then confirming the fix for status-bar overlap; `git diff --check`.
- Outcome: Android owned-device and warranty vertical is accepted. Live physical-device/provider certification remains external; bonuses, addresses, support, returns and settings remain the next Client account slice.
- Commit: `fd8bc47 feat(android): add owned devices and warranty`.
- Next step: implement Android support and returns with customer JWT ownership, evidence hooks and retry-safe commands, then bonuses/addresses/settings.

## 2026-07-13

- Task: execute Master Plan Android iteration 3, idempotent payment handoff/return and protected order history.
- Files changed: provider-neutral payment-intent command persistence and migration; deterministic sandbox payment page/confirmation; customer payment API idempotency; Android payment models, checkout methods, deep-link lifecycle, token refresh and order-history UI; API/native regressions and architecture/backlog documentation.
- Result: Android Client now creates card, MBank, O!Деньги and installment intents with a stable payment idempotency key, opens the server-returned provider handoff, routes `alistore://payment-return` to Orders and reloads JWT-owned server statuses without assigning `paid` locally. The API persists exact owner/payload responses for replay, rejects key reuse with another command, derives sandbox confirmation from trusted stored data and blocks arbitrary redirect targets. Order history has loading, empty, error, retry and one-shot refresh-on-401 states.
- Checks run: Prisma validate/generate and dev/test migration; payment/sandbox API 11/11; full API 107/107 suites and 399/399 tests; API and Web production builds; focused checkout Playwright 2/2; Android core JVM 14/14; Compose instrumentation 4/4 on API 36; all four APK builds; all-module unit tests and Android Lint; live OTP → order → repeated payment intent → sandbox confirmation → repeated confirmation HTTP smoke; live Nest health and Socket.IO handshake; Android cold-start payment-return deep-link smoke and inspected screenshot `/tmp/alistore-android-payment-return.png`; `git diff --check`.
- Outcome: the Android payment and order-history vertical is accepted by API, native and live local transport gates. Live merchant applications, production credentials and physical-device push/provider smoke remain external release gates; bonuses, addresses, devices, warranty, support and returns remain the next Client parity slice.
- Commit: `0ff1ea2 feat(android): add payment return and order history`.
- Next step: implement Android account/self-service data beginning with devices and warranty, then support and returns.

## 2026-07-13

- Task: execute Master Plan Android iteration 2, native cart and durable customer checkout.
- Files changed: Android cart/checkout models and Compose UI, typed order transport, SQLite mutation states, token-refreshing WorkManager replay, server-authoritative customer order quoting, order security/invariant tests, Android architecture/readme/backlog tracking.
- Result: Client quantities are capped by live catalog availability and pickup/courier checkout uses the customer JWT with a stable idempotency key. `/orders/mine` now ignores client price, total and IMEI, recalculates current catalog prices and available serialized stock, and preserves idempotent replay after inventory changes. Network failures queue the exact command; replay stores queued/syncing/conflict/failed states, refreshes an expired access token and does not automatically retry conflicts. The account conflict-list/manual-retry UI remains open.
- Checks run: focused order/account API 6/6; API production build; Android core JVM 10/10; Compose instrumentation 3/3 on API 36; four debug APK builds; all-module unit tests and Android Lint; cart/checkout emulator screenshot `/tmp/alistore-android-client-cart.png`; `git diff --check`. Full API regression reached 103/106 suites and 391/394 tests; two transient HTTP socket failures passed immediately in isolation, while the pre-existing realtime socket suite still cannot connect in this local run and remains an explicit infrastructure follow-up.
- Outcome: Android cart and order-creation vertical is accepted by its targeted API/native gates. Payment handoff, payment-return reconciliation, order history and remaining account data are still open; full baseline certification is not claimed while realtime is red.
- Commit: `3bd8344 feat(android): add idempotent client checkout`.
- Next step: implement Android payment intent/handoff/return and server-refreshed order history, then continue Staff parity.

## 2026-07-13

- Task: execute Master Plan Android iteration 1, native Client OTP and durable customer session.
- Files changed: typed Android auth models/gateway, API client auth endpoints, Keystore access/refresh storage, session manager, Compose OTP/signed-in account UI, JVM and instrumentation tests, Android architecture/readme/backlog tracking.
- Result: the Compose Client requests and verifies phone OTP, persists both tokens using AES-GCM/Android Keystore, restores the customer through `/auth/me`, refreshes once after access-token 401, clears revoked/corrupt sessions and performs best-effort server logout before local removal. The cabinet now shows the server-derived phone instead of a static guest list; dev-code autofill depends solely on API `devCode`.
- Checks run: core JVM auth tests 5/5; Client Kotlin compilation; Compose instrumentation 2/2 on `savio_api36_arm64`; four debug APK builds; all-module unit tests and Android Lint; real emulator OTP request/verify against `10.0.2.2:4000`; signed-in account screenshot `/tmp/alistore-android-client-account.png`; process `force-stop/start` session-restore smoke; `git diff --check`.
- Outcome: Android Client OTP/session parity is accepted. Real SMS remains an external provider certification; cart quantity, checkout/payment, orders and account data are the next native Client vertical.
- Next step: implement Android cart quantities and JWT-owned idempotent pickup/courier checkout, then payment handoff and order history.

## 2026-07-13

- Task: execute Master Plan iteration 4, complete the custom desktop customer account contour.
- Files changed: shared responsive account-detail frame; devices, order detail, Event Ledger status and warranty certificate routes; Next 16 dynamic route wrappers; seeded desktop/mobile Playwright regression; design/backlog tracking.
- Result: customer-owned devices, order details, order timeline and warranty certificates now use the exact gray/white storefront system on desktop and retain the fixed dark Client App shell at 402px. The browser regression exposed that three Next 16 routes still treated `params` synchronously; all now await server route params, restoring actual order/status/warranty data loading.
- Checks run: focused Playwright 1/1 with a real customer, paid order, payment and sold IMEI; isolated full Playwright 21/21; Next production build; 1440px and 402px computed theme/overflow assertions; `git diff --check`.
- Outcome: the complete desktop customer purchase and account contour is accepted. No custom customer route remains on the obsolete mobile-only desktop shell.
- Next step: begin Android Client OTP/session parity, then cart/checkout/payment/orders.

## 2026-07-12

- Task: execute Master Plan iteration 3, shared account and customer self-service desktop shell.
- Files changed: responsive `MobileAppFrame`, desktop storefront compatibility rules and expanded customer-route Playwright coverage.
- Result: addresses, bonuses, notifications, settings, returns, device protection, support and trade-in now render as gray/white storefront workspaces at desktop widths while preserving their existing storage, API, evidence and authorization behavior. Phone widths keep the dark Client App frame and tokens.
- Checks run: focused customer-route Playwright 1/1 across five representative destinations; isolated full Playwright 21/21; Next production build; 1440x1000 full-page Chrome screenshot `/tmp/alistore-account-bonuses-desktop.png`; direct visual inspection; computed background and horizontal-overflow checks; `git diff --check`.
- Outcome: the shared self-service route family is accepted for desktop. Custom devices, order detail/status and device-warranty pages still use independent shells and remain tracked.
- Next step: align those custom account screens, then begin Android Client OTP/session parity.

## 2026-07-12

- Task: execute Master Plan iteration 2, remaining desktop storefront entry routes.
- Files changed: desktop favorites, compare, login and account overview surfaces; shared responsive login styling; storefront route Playwright regression; design/readiness/backlog tracking.
- Result: search routes into the aligned catalog, while favorites, compare, OTP login and authenticated account overview now use the exact `alistore-shop.html` gray canvas, white surfaces, line borders, black primary actions and coral accents on desktop. Existing storage, comparison, authentication and account behavior is preserved; phone views retain the dark Client App handoff.
- Checks run: Next production build; focused route Playwright 1/1; full Playwright 21/21; browser failure-state inspection exposed and removed a test dependency on the global OTP request budget; `git diff --check`.
- Outcome: all main desktop customer entry and purchase routes are accepted. Account subroutes and support/trade-in/warranty still require the exact desktop pass and remain explicitly tracked.
- Next step: align account subroutes and self-service pages, then start Android Client OTP/session parity.

## 2026-07-12

- Task: execute Master Plan iteration 1, exact desktop customer purchase vertical.
- Files changed: shared desktop ProductCard, catalog, product, cart and desktop checkout tokens; storefront and checkout Playwright regressions; design/readiness/backlog tracking.
- Result: desktop `catalog → product → cart → checkout` now uses the archived `alistore-shop.html` system: `#f5f5f7` canvas, white surfaces, `#e5e5e7` borders, Manrope-compatible density, compact four-column cards, ratings/spec tags, stock/credit rows, real product images, black cart actions and coral checkout CTA. Existing data hooks, filters, favorites, compare, quantity, promo/bonus and sandbox payment behavior remain intact. Phone routes retain the dark Client App handoff.
- Checks run: Next production build; targeted storefront Playwright 4/4; full Playwright 20/20; seeded development catalog; 1440x1000 full-page Chrome screenshot `/tmp/alistore-catalog-exact.png`; direct visual inspection for palette, header, grid, image loading, footer, clipping and overflow; `git diff --check`.
- Outcome: exact catalog/product/cart/checkout browser vertical is accepted at desktop and the phone checkout regression remains green. Search, favorites, compare, login and account still require the same desktop pass.
- Next step: complete remaining desktop customer routes, then start Android Client OTP/session parity.

## 2026-07-12

- Task: close the Android Client visual-shell gap against `AliStore Клиент App 2.0`.
- Files changed: shared Android Compose application shell, architecture gap map, backlog and progress tracking.
- Result: Client now opens on a dark AliStore home with coral/lime service offers, category rail, iPhone hero, responsive two-column product presentation, interactive favorites/cart collections, account destinations and the exact five-tab map. Staff, Courier and POS retain their independent role shells.
- Checks run: four-app `npm run android:build`; all-module `npm run android:test` including unit and Lint; install/explicit launch on Android API 36 emulator; physical screenshot `/tmp/alistore-android-client-home.png` inspected for blank rendering, framing, overlap and navigation fit; `git diff --check`.
- Outcome: four APKs and Android Lint are green; Client home and account render without clipping or overlap at the emulator viewport. Product rows were not visible in this smoke because the current development catalog is empty; live-catalog data rendering remains covered by the typed API/build path and needs seeded visual regression coverage.
- Next step: implement Android customer OTP/session and checkout/payment/account vertical parity, then add Compose UI tests with seeded catalog fixtures.

## 2026-07-12

- Task: complete Phase 0 residual IDOR closure and certify the full baseline.
- Files changed: guest capability contract; support, warranty, trade-in and Evidence controllers/services; web customer/staff Evidence clients; security/rate-limit regressions; readiness, gap-map and backlog documentation.
- Result: anonymous self-service writes now require a signed 30-minute capability bound to the customer and requested action. Customer JWT ownership and active Staff JWT paths are preserved. Evidence uploads resolve the target entity owner server-side; customer/guest access to another customer or staff-only inventory/shift evidence is rejected, and ledger actors are derived from JWT/capability rather than body input.
- Checks run: clean baseline and post-fix `npm run mvp:verify`; API/web production builds; targeted 5-suite/9-test security gate; all-target iOS build plus XCTest 17/17; four-APK Android build plus unit/Lint; `git diff --check`.
- Outcome: API 106/106 suites and 392/392 tests; Playwright 19/19; iOS and Android gates green. Phase 0 software gate is complete with zero known Critical/High IDOR defects. Production remains blocked only by external cloud/provider credentials, legal approval and physical-device/hardware certification.
- Next step: import the managed staging Blueprint when owner accounts exist; meanwhile continue the autonomous software path with Android Client visual/feature parity and exact desktop customer-route styling.

## 2026-07-12

- Task: implement the repository-controlled portion of the public managed-cloud Web MVP launch plan.
- Files changed: production/staging Render Blueprints, API/web Dockerfiles, CI infrastructure job, production config and health/security, Order demo migration/invariants, R2 backup operation, Sentry web instrumentation, demo UI/receipt, managed-cloud runbook, tests and readiness tracking.
- Result: public demo orders are marked only by the server and cannot reserve IMEI, move through operations, create Payment rows, mark paid, sell stock or send transactional notices. Sandbox intents remain demonstrable. API/web reject unknown production hosts except health probes; Next exposes `/healthz`, API exposes `/api/health/live` and `/api/health/ready`. Render Frankfurt definitions cover web, API, BullMQ worker, authenticated private Redis, private Meilisearch, paid PostgreSQL/PITR and daily R2 backup; production auto-deploy is disabled for manual approval.
- Checks run: Prisma validate/generate and migration on dev/test DB; API/web production builds; mobile typecheck; full API Jest 106/106 suites and 391/391 tests; focused demo/security/readiness tests 24/24; Playwright 18/19 followed by corrected checkout 2/2; Render YAML parser; dependency audit 0 vulnerabilities. Docker image build/scan is configured in GitHub Actions but not run locally because Docker is unavailable.
- Outcome: repository launch contour is ready for staging account activation. External creation of Cloudflare/Render/R2/Sentry/domain accounts, Render Blueprint validation/import, authenticated Key Value activation, DNS/Access/WAF, live R2 backup/restore and container smoke remain genuine external gates and are not claimed complete.
- Next step: owner creates the external accounts with 2FA, then import `infra/render.staging.yaml` and execute `docs/MANAGED-CLOUD-LAUNCH.md` from staging through production demo.

## 2026-07-12

- Task: audit and correct the real native mobile Client after the storefront visual correction.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `BACKLOG.md`, `PROGRESS.md`.
- Result: the SwiftUI Client no longer opens on a generic system catalog list. It now follows `AliStore Клиент App 2.0.dc.html` with a dark branded home, coral/lime service cards, horizontal categories, iPhone hero, product grid, working local favorites and the exact `Главная / Каталог / Избранное / Корзина / Кабинет` tab map. Orders remain reachable from Account and payment-return reconciliation routes there.
- Checks run: `npm run ios:generate`; all-target `npm run ios:build`; `npm run ios:test`; install and launch in iPhone 17 Pro Simulator; native screenshot `/tmp/alistore-ios-client-new.png`.
- Outcome: Client, Staff, Courier and POS targets built; AliStoreCore XCTest passed 17/17; the physical simulator screenshot has no visible clipping or overlap. Android Client visual parity remains the next native UI iteration.
- Next step: implement the same prototype-aligned Client home/catalog/favorites navigation in Kotlin Compose and run four-APK + emulator gates.

## 2026-07-12

- Task: correct the public desktop storefront against the complete AliStore shop prototype after the user identified the design mismatch.
- Files changed: `apps/web/app/page.tsx`, `apps/web/components/SiteHeader.tsx`, `apps/web/app/layout.tsx`, `e2e/storefront-motion.spec.ts`, `docs/DESIGN-CONFORMANCE.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: `/` now follows the exact `alistore-shop.html` composition with a black utility strip, white catalog/search header, category rail, dark iPhone hero, trade-in and installment offers, eight quick categories, compact trust strip and live catalog hits. The mobile Client shell remains separate below 768px and `/warranty` remains an internal operational screen.
- Checks run: web production build; 1440x1000 Chrome screenshot; horizontal overflow assertion (`1440/1440`); focused Playwright storefront suite at desktop, 863px and mobile widths.
- Outcome: production build passed; Playwright passed 3/3; the visual screenshot matches the discovered prototype structure. Catalog and remaining inner customer pages are explicitly queued for the same pixel pass.
- Next step: extend the exact storefront visual system through catalog, product, favorites, compare, cart, checkout and account.

## 2026-07-12

- Task: complete the adaptive checkout portion of the canonical customer design migration.
- Files changed: checkout semantic surface classes, responsive design-system overrides, desktop/mobile checkout E2E, backlog and progress.
- Result: one checkout implementation now renders as light Sand/white/Coral on desktop and dark warm-black/Lime on phone, preserving the same delivery, pickup, contacts, gift card, payment intent and confirmation logic. Native account subpages remain intentionally dark because they map to Client App screens rather than wide web pages.
- Checks run: Next production build; desktop product/cart/checkout token assertions; full sandbox card order to paid; 402x858 dark-theme and overflow assertion; `git diff --check`.
- Outcome: production build passes and checkout browser coverage passes 2/2. The local storefront was restored on port 3000 after isolated testing.
- Next step: align POS 2.0 against its exact prototype, then Staff and ERP module shells.

## 2026-07-12

- Task: continue the canonical handoff migration through the desktop customer purchase path.
- Files changed: product detail, cart, account overview, checkout browser flow assertions, backlog and progress.
- Result: product media/specs/reviews, cart lines/promo/bonus/summary, and account identity/services/order history now use Sand/Tint, white cards, Coral actions, Ink text and the handoff radius/type hierarchy. Mobile components and business behavior remain unchanged.
- Checks run: Next production build; product/cart token assertions inside the sandbox-card checkout E2E; `git diff --check`.
- Outcome: production build passes. The E2E gate verifies both redesigned screens before continuing through delivery, customer details, payment intent and successful paid order.
- Next step: migrate the desktop checkout visual shell and account subpages, then start the POS/Staff/ERP pixel passes.

## 2026-07-12

- Task: adopt the complete desktop `design_handoff_alistore` as the exclusive design source and begin ecosystem-wide conformance with the customer storefront.
- Files changed: synchronized 23-screen handoff package and engineering docs, design conformance contract, desktop storefront header/home/catalog/product cards/footer, responsive Playwright assertions, backlog and progress.
- Result: the repository no longer uses the older truncated handoff. Desktop web follows the handoff's light Sand/Tint storefront with Coral actions, Ink typography, Sora/Golos hierarchy and 14-22px card geometry; the 402px Client App remains the separate dark Coral/Lime prototype. Business/API behavior was preserved.
- Checks run: handoff inventory/checksum comparison; live reference screenshots for Client App and ERP; Next production build; live desktop screenshot at 863x954; live phone screenshot at 402x858; computed token and horizontal-overflow checks; targeted Playwright; `git diff --check`.
- Outcome: production build passes, both responsive shells render without horizontal overflow, and automated tests lock desktop light vs native-style mobile dark behavior. Remaining screens are explicitly queued for reference-by-reference migration rather than visual invention.
- Next step: align product detail, cart, checkout and account to the same handoff, then POS/Staff/ERP and native screens.

## 2026-07-12

- Task: introduce the target BullMQ boundary and separate worker without moving business truth out of PostgreSQL.
- Files changed: BullMQ outbox producer/worker lifecycle, standalone Nest worker entrypoint, legacy scheduler role guards, production env/preflight, focused tests, dependencies/lockfile, infrastructure docs, architecture/backlog/readiness/progress.
- Result: `JOB_BACKEND=bullmq` makes the API register an idempotent minute scheduler with five exponential retries while `PROCESS_ROLE=worker` exclusively consumes outbox jobs. The worker fails fast without Redis; API startup can degrade but production preflight blocks missing/non-authenticated Redis configuration. Reservation/debt schedulers stay on pg-boss until parity migration and are suppressed inside the worker process.
- Checks run: API TypeScript build; 3 focused relay tests; production preflight tests; password-protected local Redis 8.6 smoke with real BullMQ scheduler and worker delivery; full sequential API regression; production dependency audit; `git diff --check`.
- Outcome: live scheduled delivery executed once through the separate worker; API build passes; dependency audit reports 0 vulnerabilities; full regression passes 105/105 suites and 378/378 tests. A deliberately parallel Jest attempt exposed the known rate-limit socket race, then the required sequential gate passed completely.
- Next step: add idempotent catalog reindex jobs and automatic Meilisearch bootstrap, then migrate reservation/debt schedulers with parity tests.

## 2026-07-12

- Task: add the missing Redis and Meilisearch runtime layer from the target architecture.
- Files changed: Docker Compose services/volumes/healthchecks, API development and production env contracts, infrastructure runbook, architecture map, backlog and progress.
- Result: Redis 7.4 is password-protected with AOF persistence and health probing; Meilisearch v1.37 is pinned with a master key, persistent data, disabled analytics and health probing. The API contract now exposes matching Redis/search variables while documenting PostgreSQL as authoritative and catalog fallback behavior.
- Checks run: Ruby/Psych Compose YAML parse; required-service and required-healthcheck assertions; `git diff --check`.
- Outcome: the Compose contract parses and contains all six expected services with healthchecks on stateful runtimes. Live containers remain unverified because Docker is not installed on this host and stay an explicit staging gate.
- Next step: introduce the BullMQ queue port and separate worker process, then attach automatic idempotent catalog reindex jobs.

## 2026-07-12

- Task: establish the native Android half of the requested Swift/Kotlin application architecture.
- Files changed: Android Gradle workspace, shared Kotlin core, four Compose app modules, typed REST client, Android Keystore token encryption, SQLite offline queue, WorkManager replay, deep links, unit test, root scripts, architecture/backlog/readiness/progress docs.
- Result: Client, Staff, Courier and POS are separate installable Android applications with independent package IDs. Client reads the real catalog through the shared API core; every app uses the same role-aware UI foundation. Offline mutations persist stable idempotency keys, encrypted token material stays inside Android Keystore, Debug alone permits the emulator-local API, and Release cleartext is disabled.
- Checks run: four-module Debug and release-configured APK builds; deliberate missing-release-URL rejection; JVM unit tests; Android Lint across every module; install/cold-launch of Client, Staff, Courier and POS on an Android API 36 ARM64 emulator; foreground Activity and crash-log inspection; Client screenshot; live API health; `git diff --check`.
- Outcome: all four APKs build and cold-launch successfully, the API URL fail-closed unit/release gates pass, and Lint reports no errors. Client renders its native catalog empty state against the live local API, all four package IDs become the foreground Activity, and no AliStore fatal exception appears in logcat. Complete business-flow parity and store signing remain tracked work.
- Next step: implement Client OTP/cart/checkout/account as the first matching iOS/Android vertical, then Staff, Courier and POS operational parity.

## 2026-07-12

- Task: adopt the new Codex architecture requirement and replace the Expo-only release assumption with a real native iOS foundation.
- Files changed: architecture gap map, generated Xcode project/spec, AliStoreCore REST/Keychain/SwiftData/UI foundation, four SwiftUI application targets, native API tests, root iOS scripts, backlog/readiness/progress docs.
- Result: Client, Staff, Courier and POS are separate iOS applications with independent bundle IDs and deep links. Shared code provides typed server-error handling, secure device-only token storage and persistent idempotent offline commands. Client loads the real catalog API; role apps have real staff authentication and task-specific navigation shells. Debug uses the local API while Release requires injected `ALISTORE_API_BASE_URL`.
- Checks run: XcodeGen project generation; all-target iOS Simulator build; two API contract unit tests; install/launch on iPhone 17 Pro Simulator; live process/log inspection and screenshot; `git diff --check`.
- Outcome: all five native targets build successfully, tests pass 2/2, and `kg.alistore.client` remains running in Simulator with the native catalog empty state. Android Kotlin, complete native feature parity, Redis/BullMQ and Kubernetes are explicitly tracked as required work rather than being described as ready.
- Next step: create the Android Kotlin multi-application workspace and prove all four debug apps compile before implementing the first shared checkout vertical on both platforms.

## 2026-07-12

- Task: restore the full desktop customer storefront in the actual 863px-wide in-app desktop browser.
- Files changed: responsive shell boundaries for home/catalog/product/favorites/cart/account/search, compact desktop header actions, storefront responsive Playwright coverage, backlog/readiness/progress docs.
- Result: customer routes now select the complete desktop storefront from 768px upward instead of incorrectly showing the native-style mobile shell until 1024px. At narrow desktop widths the header hides secondary search/favorites icon buttons while preserving navigation, cart and account access; `/search` redirects into desktop catalog on the same breakpoint.
- Checks run: live in-app browser DOM and viewport inspection at 863x954; horizontal overflow element audit; web production build; targeted storefront Playwright at normal and 863px viewports; full Playwright regression; `git diff --check`.
- Outcome: the visible browser now renders the desktop hero/navigation at 863px with `scrollWidth=863`; production build passes and Playwright passes 16/16.
- Next step: continue Wave 1 with product variants and bundles.

## 2026-07-12

- Task: start the post-MVP ecosystem wave with the Finance 2.0 operating-expense lifecycle.
- Files changed: Prisma expense status/model/migration, finance DTO/service/controller/module, RBAC and Event Ledger catalogue, dashboard P&L aggregation, ERP finance API/UI, integration/browser tests, deterministic E2E staff fixture, backlog/readiness/progress docs.
- Result: admin/owner staff can submit an idempotent categorized expense, approve or reject it, and pay only an approved request. Review/payment transitions lock the expense row, replayed payments are idempotent, changed payloads conflict, and every mutation commits with an immutable expense Ledger event. P&L now deducts paid expenses and displays operating profit; the ERP provides the complete working queue.
- Checks run: Prisma format/validate/generate and dev migration deploy; targeted finance/reports API tests; API/web production builds; targeted Finance Playwright; full API gate; repeated full 15-flow Playwright after removing fixture login pressure; final `mvp:verify`; `git diff --check`.
- Outcome: 104/104 API suites with 375/375 tests and 15/15 Playwright flows pass together with API/web builds and native typecheck. The real staff login rate limit remains unchanged; API-only browser fixtures now sign the known E2E JWT instead of consuming anti-bruteforce quota.
- Next step: implement product variants/bundles as the next Wave 1 vertical, then quantity/consignment warehouse and HR schedules.

## 2026-07-12

- Task: audit native iOS/Android software and store-release readiness after the stabilized MVP gate.
- Files changed: readiness snapshot and progress record only; application code required no repair.
- Result: the Expo package, icons/splash, bundle/package IDs, runtime/update settings, notification plugin, EAS profiles, store metadata, privacy/review docs and release workflow satisfy the local preflight. Strict mode remains fail-closed until the ignored production env and external credentials exist.
- Checks run: mobile TypeScript check through `mvp:verify`; `mobile:store-preflight`; Expo config render; `expo-doctor`; strict production store preflight; local Xcode/Simulator, ADB/Android Emulator and Java availability probe.
- Outcome: local preflight passed with 0 failures and 2 expected production-env warnings; Expo Doctor passed 20/20. Strict preflight correctly reported 6 external/configuration failures. Binary smoke QA is blocked on this machine because only Apple Command Line Tools are installed, no iOS Simulator is available, no Android AVD/emulator is installed, and no Java runtime is present.
- Next step: continue software expansion with the first post-MVP ecosystem wave; perform TestFlight/Play Internal and physical-device checkout/push/crash smoke after the operator supplies accounts, credentials and native SDK hosts.

## 2026-07-12

- Task: make the full MVP/UAT release gate deterministic and prevent accidental destructive tests against the development database.
- Files changed: MVP verification runner, seven FK-sensitive API test cleanups, Telegram Mini App browser navigation, backlog and progress records.
- Result: `mvp:verify` now requires `TEST_DATABASE_URL`/`E2E_DATABASE_URL`, refuses the active development database or a database without a test marker, resets the isolated schema before Jest, and runs API tests sequentially. Test cleanups delete inventory movements before products, and the Telegram shell waits for DOM readiness instead of an unrelated late load event.
- Checks run: deliberate same-database refusal; isolated schema reset; targeted 7 suites / 22 tests; full `mvp:verify`; second `mvp:verify -- --skip-e2e`; `git diff --check`.
- Outcome: the full gate passed API/web production builds, native typecheck, 103/103 API suites with 373/373 tests, and 14/14 Playwright flows. The second clean-database server run again passed 103/103 suites and 373/373 tests.
- Next step: run native Expo/store preflights and separate software readiness from external signing, push, provider, device and store-account blockers.

## 2026-07-12

- Task: add the production SMS/OTP provider boundary while preserving safe local authentication.
- Files changed: OTP sender contract, noop/production adapters and selector, AuthService/AuthModule wiring, sender/selector/auth/readiness tests, API env templates, readiness/activation/backlog/progress docs.
- Result: login and recovery OTP now deliver through `OtpSender`. Local/test noop never logs or persists plaintext codes; production requires an explicit complete provider config and the unimplemented live adapter fails before challenge creation. Runtime delivery failure removes the just-created challenge, preventing an undelivered usable OTP from remaining in the database.
- Checks run: targeted OTP selector/sender/auth/readiness Jest; API build; full `mvp:verify -- --skip-e2e`; `git diff --check`.
- Outcome: targeted 4 suites / 17 tests passed. Full gate passed API/web builds, mobile typecheck and 103/103 API suites with 373/373 tests. External readiness now blocks until provider credentials, sender ID, real-phone delivery, and outage cleanup are certified.
- Next step: run native store/release preflights and close every software-only warning before external Apple/Google/EAS credentials are supplied.

## 2026-07-12

- Task: close the unblocked G0 production runtime security gate.
- Files changed: runtime CORS/Helmet configuration, application bootstrap preflight assertion, production preflight checks/tests, API env templates, Helmet dependency/lockfile, readiness/activation/backlog/progress docs.
- Result: production startup now fails before Nest/DB initialization when core settings are missing or unsafe. `CORS_ORIGINS` is an exact HTTP(S) origin allowlist in production; wildcard/empty values are rejected. Helmet supplies CSP and baseline headers, with HSTS/upgrade-insecure-requests enabled only in production and API media explicitly allowed cross-origin.
- Checks run: targeted runtime-security, production-preflight and health Jest; API build; deliberate unsafe production startup; live dev API header/CORS curl; dependency audit; full `mvp:verify -- --skip-e2e`; `git diff --check`.
- Outcome: unsafe production exited with code 1 before listening; live API returned CSP/CORP/nosniff and reflected the dev origin; audit found 0 vulnerabilities. Full gate passed API/web builds, mobile typecheck and 101/101 API suites with 368/368 tests.
- Next step: audit native iOS/Android store gates and close every software-only warning while external signing/push credentials remain blocked.

## 2026-07-12

- Task: add the production-shaped payment gateway port without provider secrets or speculative network endpoints.
- Files changed: payment gateway contract, sandbox adapter, production fail-visible adapter, env selector and DI wiring, intent orchestration, selector/intent/readiness tests, API env templates, external readiness, backlog/progress/activation docs.
- Result: `PaymentIntentsService` now delegates create-intent and raw-request webhook verification through `PaymentGatewayProvider`; absent or explicit sandbox env keeps the existing sandbox behavior. Unknown modes and incomplete production configuration fail closed during startup. A complete `PAYMENT_PROVIDER=production` configuration selects a server-only adapter that refuses transactions before stock/order mutation until the chosen provider's signed contract is implemented. The port defines refund semantics while readiness remains manual until external refund reconciliation is certified.
- Checks run: targeted Jest for selector, payment intents, gift cards, production preflight and external readiness; API TypeScript build; full `mvp:verify -- --skip-e2e`; final full API Jest; targeted Playwright web checkout; `git diff --check`.
- Outcome: full API regression passed 100/100 suites with 364/364 tests; API/web builds and mobile typecheck passed; sandbox checkout passed Playwright 1/1. External readiness reports payment merchant credentials plus signed webhook/refund certification as a blocking production dependency without exposing secret values.
- Next step: make the production runtime fail fast when `CORS_ORIGINS` is empty and expose that requirement in core preflight.

## 2026-07-12

- Task: complete the first extended-ecosystem gap with Purchase Order procurement and ERP receiving.
- Files changed: Prisma procurement schema/migration, `apps/api/src/procurement/`, AppModule, RBAC, Event Ledger types, procurement integration tests, web procurement API/UI, ERP reorder integration, Playwright DB reset and procurement UI flow, readiness/backlog/progress docs, and the Nest realtime test type boundary exposed by the final regression gate.
- Result: owners/admins can create, send and cancel supplier POs; warehouse/admin/owner staff can receive serialized IMEIs partially or completely into stock. Receipt idempotency, PO row locking, quantity limits, IMEI uniqueness, inventory movements, device units and immutable ledger events commit atomically. Concurrent receipts cannot exceed ordered quantity.
- Checks run: Prisma migration deploy and test schema sync; targeted procurement Jest (3/3); API TypeScript build; Next production build (35 routes); full API Jest sequentially; targeted realtime Jest; browser Playwright owner login → create PO → send → receive IMEI; `git diff --check`.
- Outcome: full `mvp:verify` passed: Prisma validation/generation, API/web builds, mobile typecheck, 99/99 API suites with 359/359 tests, and 14/14 Playwright flows. Both owner and warehouse completed the ERP receiving flow. Review findings were closed for stale-role JWTs, create/receive idempotency payload conflicts, empty inputs, batch limits, concurrent over-receipt and form preservation. External readiness reports the expected credential/hardware blockers.
- Next step: add the provider-neutral payment gateway port and production configuration selector without real secrets, keeping sandbox as the default.

## 2026-07-10

- Task: install a reusable Skiper UI skill and introduce polished, accessible motion across the AliStore customer ecosystem.
- Files changed: local `~/.codex/skills/skiper-ui`, desktop storefront home/header/product cards, global motion tokens/keyframes, shared MotionConfig/primitives, preserved mobile home at `/app`, mobile card image/micro-interactions, web dependencies, motion Playwright coverage, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the desktop storefront at `/` now has a staged hero, finite product float, animated promo hierarchy, native scroll-progress indicator, card lift/tap feedback, and safe section motion. The parallel mobile prototype work was preserved at `/app` instead of being overwritten. All motion starts from a fully visible frame because the embedded browser can suspend `requestAnimationFrame` and lacks `IntersectionObserver`; reduced-motion disables all decorative animation.
- Checks run: skill `quick_validate.py`; web production build; dependency audit; browser DOM/computed-style QA; targeted storefront motion Playwright; full Playwright suite; `git diff --check`.
- Outcome: skill validation passed; web build passed; audit reports 0 vulnerabilities; browser QA confirmed visible animated elements and no horizontal overflow; targeted motion test passed 1/1; full Playwright passed 12/12 including reduced-motion and `/app` preservation.
- Commit: `3c59e8d`.
- Next step: extend the same motion language to product gallery transitions and account/order state changes while keeping POS/ERP motion restrained and task-focused.

## 2026-07-10

- Task: restore the full desktop customer storefront from the archived `AliStore-Экосистема.zip` prototype instead of serving the mobile app shell at `/`.
- Files changed: customer home/catalog/product/favorites/compare/cart/checkout/login/account routes, shared customer frame, storefront header/footer/product card, product visual assets, web dependencies, `BACKLOG.md`, and `PROGRESS.md`.
- Result: `/` now matches the prototype's dark wide marketplace composition with desktop navigation, search hero, category promos, real catalog cards and product imagery. The real API powers catalog/product/reviews; favorites, comparison, cart quantities, promo/bonus pricing, checkout, account and customer service flows remain functional. The Next.js 16 dynamic product route was also fixed by awaiting `params`, eliminating false “Товар не найден” screens.
- Checks run: two production web builds; browser QA on `/`, `/catalog`, a real `/product/:id`, `/cart`, `/checkout`, and `/login`; live add-to-cart navigation; full Playwright suite on isolated ports after the final shared-frame change.
- Outcome: web production build passed; Playwright passed 11/11; browser QA confirmed loaded product images, no horizontal overflow, desktop main widths, and a working catalog → product → cart → checkout flow. Local web was restarted on `http://127.0.0.1:3000/` with the desktop storefront open.
- Commit: `50698a1`.
- Next step: replace the two remaining test catalog rows with the production assortment and real product media supplied by the owner.

## 2026-07-10

- Task: implement the Phase 12 device protection / insurance policy flow.
- Files changed: Prisma schema/migration, new `apps/api/src/protection/` module and API test, Event Ledger/RBAC/AppModule wiring, web protection API, `/account/protection`, account navigation, Staff App protection queue, Playwright protection flow, E2E reset, roadmap/readiness/backlog docs.
- Result: authenticated customers can request 12/24-month accidental damage, extended warranty, or full protection only for an IMEI bought on their own AliStore order. The server calculates a baseline premium from the trusted product price. Sales staff can read the queue; senior/admin/owner roles review, offer or reject; the customer activates an offer into dated coverage. All lifecycle moves are ledgered.
- Checks run: Prisma validate/generate; dev migration deploy; test DB schema sync; targeted protection API test; API/web production builds; native typecheck; targeted Playwright protection flow; full API Jest sequentially; full Playwright suite; audits and whitespace check.
- Outcome: targeted protection API passed 1 suite / 2 tests; full API passed 98 suites / 350 tests; Playwright passed 11/11 including purchased-IMEI protection; API/web builds and native typecheck passed; root/mobile audits report 0 vulnerabilities and whitespace check passed.
- Commit: `9ff131f`.
- Next step: implement the next unblocked Phase 12 block — franchise partner point audit and scorecards.

## 2026-07-10

- Task: implement the Phase 12 B2B/wholesale quote request flow end to end.
- Files changed: Prisma schema/migration, new `apps/api/src/b2b/` module and API test, Event Ledger/RBAC/AppModule wiring, new web B2B API client and `/b2b` cabinet, account/header navigation, Staff App B2B queue, Playwright B2B flow, E2E reset, roadmap/readiness/backlog docs.
- Result: authenticated customers can save company requisites, request an invoice or bank-transfer wholesale quote using trusted current catalog prices, track the request, and accept a quoted offer. Sales staff can read the queue; senior/admin/owner roles can move requests to review, issue a priced proposal, or reject it. Every creation and transition is written to the append-only Event Ledger.
- Checks run: Prisma validate/generate; dev migration deploy; test DB schema sync; targeted B2B API test; API/web production builds; native typecheck; targeted Playwright B2B flow; full API Jest sequentially; full Playwright suite; root/mobile audits; `git diff --check`.
- Outcome: targeted B2B API passed 1 suite / 2 tests; full API passed 97 suites / 348 tests; Playwright passed 10/10 including OTP→B2B invoice quote; API/web builds and mobile typecheck passed; root and mobile audits report 0 vulnerabilities; whitespace check passed.
- Commit: `a6ba4e7`.
- Next step: implement the next unblocked Phase 12 block — device protection / insurance policy scaffold.

## 2026-07-10

- Task: launch the complete local AliStore stack and repair native Metro startup.
- Files changed: `apps/mobile/package.json`, `apps/mobile/package-lock.json`, `apps/mobile/tsconfig.json`, `apps/mobile/.gitignore`, `PROGRESS.md`.
- Result: PostgreSQL, the current Nest API, Next Site 2.0, and Expo Metro now run together locally. Added the missing SDK-compatible `babel-preset-expo`, accepted Expo's typed-route TypeScript includes, and applied the existing patched `uuid@11.1.1` override to the isolated mobile lockfile.
- Checks run: API health and Swagger HTTP checks; Site 2.0 home/ERP HTTP checks; Expo iOS and Android Hermes bundle compilation; mobile typecheck; mobile store preflight; mobile dependency audit; listening-port verification; `git diff --check`.
- Outcome: API and web return HTTP 200, Expo manifest and both platform bundles return HTTP 200, mobile typecheck passed, store preflight passed with 0 failures and 2 expected production-credential warnings, and mobile audit reports 0 vulnerabilities. Expo Go is available on LAN; local iOS Simulator launch still requires a working full Xcode `simctl` installation.
- Commit: `44b4998`.
- Next step: keep the local stack available for hands-on QA, then continue with the B2B/wholesale quote scaffold after the completed Emergency P0 work.

## 2026-07-10

- Task: close the auth-hardening portion of the Emergency P0 handoff.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260710063722_staff_totp_last_token/`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/staff-auth/staff-auth.service.ts`, `apps/api/test/auth.e2e-spec.ts`, `apps/api/test/staff-auth.e2e-spec.ts`, `apps/api/test/customer-pii-guard.e2e-spec.ts`, `apps/api/test/debts.e2e-spec.ts`, `e2e/helpers.ts`, `docs/CODEX-EMERGENCY-P0.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: refresh rotation now locks the presented token row, detects sequential and concurrent reuse, commits revocation of every live customer refresh token before returning `refresh_reused`, and cannot leave a replacement session alive after a replay. Staff TOTP step-up codes are consumed with an atomic conditional update, so the same code cannot authorize two concurrent dangerous actions. OTP lockout and the tightened authenticated Customer 360 policy now have explicit regression coverage.
- Checks run: Prisma validate/generate; dev migration deploy; test DB schema sync; targeted auth/staff/approval/throttle tests; API build; full API Jest sequentially; web production build; native TypeScript check; Playwright E2E; `npm audit`; `git diff --check`.
- Outcome: targeted auth gate passed 4 suites / 18 tests. Full API regression passed 96 suites / 343 tests; web/API builds and native typecheck passed; Playwright passed 9/9; dependency audit reports 0 vulnerabilities. The first full runs exposed one stale Customer 360 expectation, one shared-test cleanup ordering issue, and E2E bootstrap throttling; all three test-harness regressions were corrected before the green final gate.
- Commits: `973830a` (auth core, committed concurrently); `d5c998a` (validation and regression-gate stabilization).
- Next step: close Emergency P0 E8 (passport visibility in trade-in PDF), then M-4/M-5 and the remaining webhook race test before returning to the B2B/wholesale feature scaffold.

## 2026-07-08

- Task: add click-and-collect fulfillment metadata across the ecosystem.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260708232000_add_order_fulfillment/`, `apps/api/prisma/migrations/20260708233000_drop_order_pickup_code_unique/`, `apps/api/src/orders/*`, `apps/api/test/orders-fulfillment.e2e-spec.ts`, web checkout/account/staff/warehouse/Telegram order surfaces, mobile order client/account history, `e2e/web-checkout.spec.ts`, readiness/docs, `BACKLOG.md`, `PROGRESS.md`.
- Result: orders now persist `fulfillmentType`, pickup point/address/slot, and pickup code. Web checkout, native checkout, and Telegram Mini App create pickup orders; account order detail/status, staff app, and warehouse queue show pickup metadata for click&collect execution.
- Checks run: `npm exec -w @alistore/api -- prisma validate`; `npm run prisma:generate -w @alistore/api`; `npm run db:deploy -w @alistore/api`; test DB `prisma db push --skip-generate`; `npm run test -w @alistore/api -- orders-fulfillment fulfillment orders-account public-rate-limit --runInBand`; `npm run api:build`; `npm --prefix apps/mobile run typecheck`; `npm run build -w @alistore/web`; `npx playwright test e2e/web-checkout.spec.ts`; `npm run mvp:verify`; `npm audit`; `git diff --check`.
- Outcome: Prisma schema/client/database sync passed; targeted API tests passed 4 suites / 10 tests; API build passed; mobile typecheck passed; web build passed; targeted Playwright checkout passed 1/1. Full MVP verification passed: API Jest 95 suites / 336 tests, Playwright 9/9, readiness report generated. `npm audit` reports 0 vulnerabilities and whitespace check passed.
- Commit: `0492d30`.
- Next step: continue with the next unblocked Phase 12 item: B2B/wholesale quote request scaffold.

## 2026-07-08

- Task: add AI photo grading and market price scout scaffolding.
- Files changed: `apps/api/src/ai/grading.*`, `apps/api/src/ai/price-scout.*`, `apps/api/src/ai/ai.module.ts`, `apps/api/test/ai-grading.spec.ts`, `apps/api/test/price-scout.spec.ts`, `apps/api/test/reports-ai-rbac.e2e-spec.ts`, `docs/PHASES.md`, `docs/CODEX-HANDOFF.md`, `docs/READINESS.md`, `docs/CODEX-BACKLOG-V2.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: added staff-only `POST /ai/grade-photos` and `POST /ai/price-scout`. Both endpoints work without keys via deterministic rules, try OpenRouter when `AI_PROVIDER_KEY`/`OPENROUTER_API_KEY` is configured, and fall back safely to rules on provider failure. RBAC coverage now includes the new `/ai/*` endpoints.
- Checks run: `npm run mvp:verify`; `npm audit`; `git diff --check`.
- Outcome: full MVP verification passed: Prisma validate/generate, API build, web build, mobile typecheck, API Jest 94 suites / 334 tests, Playwright 9/9, and external readiness report. `npm audit` reports 0 vulnerabilities. Strict production readiness still waits on real AI/provider/store/push credentials and physical POS hardware.
- Commit: `aac3059`.
- Next step: activate real AI provider with reference photo/listing datasets and offline eval thresholds when credentials/data are available; otherwise continue external production/store/hardware readiness.

## 2026-07-08

- Task: remediate dependency audit blockers after full release test.
- Files changed: `apps/api/package.json`, `apps/api/src/catalog/catalog.dto.ts`, `apps/api/src/products/products.dto.ts`, `apps/web/next.config.mjs`, `apps/web/package.json`, `apps/web/tsconfig.json`, root `package.json`, `package-lock.json`, readiness/docs, `BACKLOG.md`, `PROGRESS.md`.
- Result: upgraded the web stack from Next 14 to Next 16.2.10, upgraded NestJS runtime/testing/swagger/config packages to the 11.x/4.x compatible line, removed the vulnerable Nest CLI build chain from the API build path, switched API builds to deterministic `tsc`, added the required otplib presets, added audited transitive overrides for `postcss` and `uuid`, and allowed `127.0.0.1` as a Next 16 dev origin so Playwright hydration works.
- Checks run: `npm audit`; `npm run api:build`; `npm run test -w @alistore/api -- dangerous-endpoint-rbac --runInBand`; `npm run api:test`; `npm run e2e`; `npm run mvp:verify`; `npm run mobile:store-preflight`; `npm --prefix apps/mobile run expo:config`; `cd apps/mobile && EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS=1 npx expo-doctor`; `npm --prefix apps/mobile run store:preflight:production` (expected failure without real store credentials); `npm run launch:check` (expected failure without `apps/api/.env.production`).
- Outcome: dependency audit is clean with 0 vulnerabilities; API build passed; API Jest passed 92 suites / 326 tests; Playwright passed 9/9; full MVP verification passed end to end including readiness report; mobile store preflight passed with 0 failures and the expected 2 warnings; Expo config rendered; Expo Doctor passed 20/20. Strict production gates still fail only on missing real API/mobile production env, EAS, Apple, Google Play, provider credentials, and physical POS hardware certification.
- Commit: `80c9f72`.
- Next step: provision real production/store credentials and complete physical-device/TestFlight/Play Internal/POS hardware QA.

## 2026-07-08

- Task: run full MVP, mobile, release, and security verification.
- Files changed: `package-lock.json`, `BACKLOG.md`, `PROGRESS.md`.
- Result: recovered the web test environment from Next's accidental local `apps/web` pnpm install, removed the generated `apps/web/node_modules`/`pnpm-lock.yaml`, restored npm workspace resolution, and synced the root lockfile with the optional Next SWC packages needed for stable web builds.
- Checks run: `npm run mvp:verify`; `npm run mobile:store-preflight`; `npm --prefix apps/mobile run expo:config`; `cd apps/mobile && EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS=1 npx expo-doctor`; `npm audit --audit-level=critical`; `npm --prefix apps/mobile run store:preflight:production`; `npm run launch:check`; `git diff --check`.
- Outcome: functional MVP gate passed end to end: Prisma validate/generate, API build, web build, mobile typecheck, API Jest 92 suites / 326 tests, Playwright 9/9, and readiness reporting. Mobile store preflight passed with 0 failures and 2 expected production warnings; Expo config rendered; Expo Doctor passed 20/20. Release/security gates are not green yet: production mobile preflight fails until real `.env.production`, EAS, Apple, and Google Play credentials exist; `launch:check` fails until `apps/api/.env.production` exists; `npm audit --audit-level=critical` fails with 31 vulnerabilities including a critical Next advisory that requires planned dependency remediation rather than a blind force upgrade.
- Commit: `d02fb38`.
- Next step: remediate dependency audit blockers, then rerun the full MVP/browser/mobile/security gate before store submission; external provider credentials and physical POS hardware QA remain required for production launch.

## 2026-07-08

- Task: add native customer return request opening.
- Files changed: `apps/mobile/src/api-client.ts`, `apps/mobile/src/screens/client-screen.tsx`, `apps/mobile/src/types.ts`, `apps/mobile/store/review-checklist.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: signed-in native customers can now choose an eligible order from account history, select or type a return reason, and open a return request through the existing customer-JWT protected `POST /returns` flow.
- Checks run: `npm run mobile:typecheck`; `npm run test -w @alistore/api -- returns-exchanges-rbac --runInBand`; `npm run api:build`; `npm run test -w @alistore/api -- returns exchange returns-exchanges-rbac --runInBand`; `npm run mobile:store-preflight`; `npm --prefix apps/mobile run expo:config`; `git diff --check`.
- Outcome: mobile typecheck passed; targeted returns/exchanges RBAC test passed 1/1; API build passed; return/exchange regressions passed 2 suites / 3 tests; store preflight passed with 0 failures and the expected 2 production warnings for missing local API/EAS project env; Expo config rendered; whitespace check passed.
- Commit: `5e1891b`.
- Next step: continue native customer account surfaces or move to physical TestFlight/Play Internal QA when credentials/devices are available.

## 2026-07-08

- Task: add native notification preference consent toggle.
- Files changed: `apps/api/src/customers/customers.controller.ts`, `apps/api/test/customer-pii-guard.e2e-spec.ts`, `apps/mobile/src/api-client.ts`, `apps/mobile/src/screens/client-screen.tsx`, `apps/mobile/src/types.ts`, `apps/mobile/store/review-checklist.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: the signed-in native account cabinet now reads the customer profile, shows marketing consent, and toggles it with the customer JWT. The customer consent endpoint now rejects a customer JWT trying to change another customer's consent while preserving existing staff/ERP compatibility.
- Checks run: `npm run test -w @alistore/api -- customer-pii-guard --runInBand`; `npm run mobile:typecheck`; `npm run api:build`; `npm run test -w @alistore/api -- customers customer-pii-guard transactional-notifications campaigns --runInBand`; `npm run mobile:store-preflight`; `npm --prefix apps/mobile run expo:config`; `git diff --check`.
- Outcome: customer PII/consent guard test passed 3/3; mobile typecheck passed; API build passed; customer/consent/campaign regressions passed 4 suites / 10 tests; store preflight passed with 0 failures and the expected 2 production warnings for missing local API/EAS project env; Expo config rendered; whitespace check passed.
- Commit: `480386c`.
- Next step: continue native account surfaces or move to physical TestFlight/Play Internal QA when credentials/devices are available.

## 2026-07-08

- Task: add native warranty case opening from device cards.
- Files changed: `apps/api/src/warranty/warranty.controller.ts`, `apps/api/src/warranty/warranty.module.ts`, `apps/api/test/warranty-rbac.e2e-spec.ts`, `apps/mobile/src/api-client.ts`, `apps/mobile/src/screens/client-screen.tsx`, `apps/mobile/src/types.ts`, `apps/mobile/store/review-checklist.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: signed-in native customers can now open a warranty case directly from a purchased device card. The mobile app sends the customer JWT, updates the device warranty state after creation, and the warranty open endpoint now rejects a customer JWT trying to submit another customer's id.
- Checks run: `npm run test -w @alistore/api -- warranty-rbac --runInBand`; `npm run mobile:typecheck`; `npm run api:build`; `npm run test -w @alistore/api -- warranty --runInBand`; `npm run mobile:store-preflight`; `npm --prefix apps/mobile run expo:config`; `git diff --check`.
- Outcome: targeted warranty RBAC test passed 1/1; mobile typecheck passed; API build passed; warranty regression passed 3 suites / 8 tests; store preflight passed with 0 failures and the expected 2 production warnings for missing local API/EAS project env; Expo config rendered; whitespace check passed.
- Commit: `13025f0`.
- Next step: continue native account surfaces or move to physical TestFlight/Play Internal QA when credentials/devices are available.

## 2026-07-08

- Task: add native customer support tickets and secure owner-scoped support reads.
- Files changed: `apps/api/src/support/support.controller.ts`, `apps/api/test/support-rbac.e2e-spec.ts`, `apps/mobile/src/api-client.ts`, `apps/mobile/src/screens/client-screen.tsx`, `apps/mobile/src/types.ts`, `apps/mobile/store/review-checklist.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: native signed-in customers can now list and open support tickets from the account cabinet with priority/SLA/status visibility. The support ticket list endpoint no longer exposes `customerId` filtered reads anonymously; customer JWTs can read only their own tickets, while staff still need `support/read`.
- Checks run: `npm run test -w @alistore/api -- support-rbac --runInBand`; `npm run mobile:typecheck`; `npm run api:build`; `npm run test -w @alistore/api -- support public-rate-limit --runInBand`; `npm run mobile:store-preflight`; `npm --prefix apps/mobile run expo:config`; `git diff --check`.
- Outcome: targeted support RBAC test passed 1/1; mobile typecheck passed; API build passed; support/rate-limit regression passed 3 suites / 11 tests; store preflight passed with 0 failures and the expected 2 production warnings for missing local API/EAS project env; Expo config rendered; whitespace check passed.
- Commit: `c4eab0b`.
- Next step: continue native account surfaces or move to external TestFlight/Play Internal QA when credentials/devices are available.

## 2026-07-08

- Task: add native customer devices and warranty state.
- Files changed: `apps/mobile/src/api-client.ts`, `apps/mobile/src/screens/client-screen.tsx`, `apps/mobile/src/types.ts`, `apps/mobile/store/review-checklist.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: signed-in native customers now load purchased devices from `GET /customers/me/devices`, see product, IMEI, device status, warranty expiry, days-left state, and active warranty-case status in the account cabinet. Account data loading now refreshes the customer session once before fetching orders/devices, avoiding refresh-token reuse races.
- Checks run: `npm run mobile:typecheck`; `npm run mobile:store-preflight`; `npm --prefix apps/mobile run expo:config`; `npm run test -w @alistore/api -- exchange --runInBand`; `git diff --check`.
- Outcome: mobile typecheck passed; store preflight passed with 0 failures and the expected 2 production warnings for missing local API/EAS project env; Expo config rendered; targeted exchange/device API tests passed 2 suites / 3 tests; whitespace check passed.
- Commit: `96364a4`.
- Next step: add the next native account surface backed by existing API or move to external TestFlight/Play Internal QA when credentials/devices are available.

## 2026-07-08

- Task: add native customer order history.
- Files changed: `apps/mobile/src/api-client.ts`, `apps/mobile/src/screens/client-screen.tsx`, `apps/mobile/src/types.ts`, `apps/mobile/store/review-checklist.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: signed-in native customers now load their own order history from `GET /orders/mine`, see status/channel/items/total in the account cabinet, can refresh the list manually, and the app refreshes expired customer access tokens before loading history.
- Checks run: `npm run mobile:typecheck`; `npm run mobile:store-preflight`; `npm --prefix apps/mobile run expo:config`; `npm run test -w @alistore/api -- orders-account --runInBand`; `git diff --check`.
- Outcome: mobile typecheck passed; store preflight passed with 0 failures and the expected 2 production warnings for missing local API/EAS project env; Expo config rendered; targeted API account-order test passed 1/1; whitespace check passed.
- Commit: `3d01597`.
- Next step: add the next native account surface that is already backed by existing API, then verify on physical TestFlight/Play Internal builds once credentials/devices are available.

## 2026-07-08

- Task: add native customer OTP account session.
- Files changed: `apps/mobile/src/api-client.ts`, `apps/mobile/src/native-shell.tsx`, `apps/mobile/src/screens/client-screen.tsx`, `apps/mobile/src/secure-session.ts`, `apps/mobile/src/types.ts`, `apps/mobile/store/review-checklist.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: the native client cabinet now restores a SecureStore customer session, refreshes expired access tokens on app start, supports phone OTP login/logout, creates signed-in checkout orders with the authenticated `customerId`, and registers client push tokens as `scope=customer` with the customer JWT instead of anonymous tokens.
- Checks run: `npm run mobile:typecheck`; `npm run mobile:store-preflight`; `npm --prefix apps/mobile run expo:config`; `git diff --check`.
- Outcome: mobile typecheck passed; store preflight passed with 0 failures and the expected 2 production warnings for missing local API/EAS project env; Expo config rendered; whitespace check passed.
- Commit: `b07ed48`.
- Next step: verify the OTP/push flow on real TestFlight/Play Internal builds once EAS project id, push credentials, SMS provider, and store test devices are available.

## 2026-07-08

- Task: bind native staff push registration to staff JWT.
- Files changed: `apps/mobile/src/native-shell.tsx`, `apps/mobile/src/screens/staff-screen.tsx`, `apps/mobile/store/review-checklist.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: `StaffScreen` now reports restored/login/logout staff sessions to the native shell, and the Push control sends the staff access token when the app is in staff/POS mode. Staff-mode push registration no longer saves an anonymous token; it waits for staff login and then binds to `scope=staff` on `POST /notifications/push-tokens`.
- Checks run: `npm run mobile:typecheck`; `npm run mobile:store-preflight`.
- Outcome: mobile typecheck passed; store preflight passed with 0 failures and the expected 2 production warnings for missing local API/EAS project env.
- Next step: verify staff push binding on a physical TestFlight/Play Internal build once EAS project id, push credentials, and staff demo account are available.

## 2026-07-08

- Task: add direct Expo Push delivery for outbox notifications.
- Files changed: `apps/api/src/outbox/transports/expo-push.transport.ts`, `apps/api/src/outbox/transports/channel.transport.ts`, `apps/api/src/outbox/outbox.module.ts`, `apps/api/src/outbox/customer-notifications.ts`, `apps/api/src/health/external-readiness.ts`, `apps/api/.env.production.example`, `apps/api/test/expo-push-transport.spec.ts`, `docs/PRODUCTION-ACTIVATION.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: `NOTIFICATION_TRANSPORT=channels` can now route `channel=push` outbox messages directly to Expo Push Service using registered `PushToken` rows. Customer/staff ids resolve to enabled Expo tokens, direct Expo token recipients still work, immediate `DeviceNotRegistered` tickets disable dead tokens, and HTTP/provider failures still throw so the durable outbox retries.
- Checks run: `npm run test -w @alistore/api -- expo-push-transport channel-transport notifications-push-tokens external-readiness --runInBand`; `npm run api:build`; `npm exec -w @alistore/api -- prisma validate`; `npm run readiness -w @alistore/api -- --env-file .env.production.example`; `npm run test -w @alistore/api -- external-readiness --runInBand`.
- Outcome: targeted transport/readiness/token tests passed 4 suites / 13 tests; API build and Prisma validation passed; readiness reports Expo Push as a valid campaign delivery provider while `native_push` remains blocked until real EAS/push credentials are configured.
- Next step: live physical-device push QA after real `EXPO_PUBLIC_EAS_PROJECT_ID`, `EXPO_TOKEN`, EAS push credentials, and store test builds are available.

## 2026-07-08

- Task: add native push token readiness for App Store / Google Play builds.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260708152000_add_push_tokens/migration.sql`, `apps/api/src/notifications/*`, `apps/api/src/health/external-readiness.ts`, `apps/api/.env.production.example`, `apps/api/test/notifications-push-tokens.spec.ts`, `apps/api/test/external-readiness.spec.ts`, `apps/mobile/*`, `apps/mobile/store/*`, `docs/READINESS.md`, `docs/PRODUCTION-ACTIVATION.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: native app now uses `expo-notifications`/`expo-device` to request push permission from an in-app control, create the Android notification channel, fetch an Expo push token from the EAS project id, and register it through `POST /notifications/push-tokens`. Backend stores tokens as anonymous/customer/staff-bound records without trusting owner ids from the request body, and readiness/preflight now exposes the `native_push` production blocker.
- Checks run: `npm run prisma:generate -w @alistore/api`; `npm run db:deploy -w @alistore/api`; test DB `prisma db push --skip-generate`; `npm run test -w @alistore/api -- notifications-push-tokens external-readiness --runInBand`; `npm run api:build`; `npm run mobile:typecheck`; `npm run mobile:store-preflight`; `npm --prefix apps/mobile run store:preflight:production` (expected failure without real ignored `apps/mobile/.env.production`); dummy strict mobile store preflight with temporary Apple/Google credentials and EAS project id; `npm exec -w @alistore/api -- prisma validate`; `npm run readiness -w @alistore/api -- --env-file .env.production.example`; `npm run readiness -w @alistore/api -- --env-file .env.production.example --json`; `cd apps/mobile && npx expo config --json`; `git diff --check`.
- Outcome: targeted API tests passed 2 suites / 6 tests; API build, mobile typecheck, Prisma validation, store preflight, dummy strict store preflight, readiness text/json, and whitespace check passed. Production templates now report `native_push` as blocked until real `EXPO_PUBLIC_EAS_PROJECT_ID`, `EXPO_TOKEN`, and EAS/APNs/FCM credentials are configured.
- Next step: account-bound native release still needs real Apple/Google/EAS accounts, production env files, physical-device push QA, and TestFlight/Play Internal submissions.

## 2026-07-08

- Task: add native production release credential gate.
- Files changed: `.gitignore`, `apps/mobile/.env.production.example`, `apps/mobile/eas.json`, `apps/mobile/package.json`, `apps/mobile/scripts/store-preflight.mjs`, `apps/mobile/store/release-runbook.md`, `apps/mobile/store/review-checklist.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: mobile release now has an ignored production env template, a release runbook, a strict `store:preflight:production` gate that loads local release env values, validates Apple/App Store Connect and Google Play credential paths or base64 secrets, and verifies the Android submit profile points at the expected service account JSON.
- Checks run: `npm run mobile:store-preflight`; `npm --prefix apps/mobile run store:preflight:production` (expected failure without real ignored `apps/mobile/.env.production` and store credentials); dummy strict env-file store preflight with temporary Apple/Google credential files; `npm run mobile:typecheck`; EAS workflow schema validator; `git diff --check`.
- Outcome: normal store preflight passed with 0 failures and 1 production API warning; dummy strict production preflight passed with 0 failures and 0 warnings; typecheck, workflow validation, and whitespace check passed. Real production preflight correctly fails until `apps/mobile/.env.production` and Apple/Google/EAS credentials are filled.
- Next step: fill real mobile production secrets, run `npm --prefix apps/mobile run store:preflight:production`, then build and submit TestFlight/Play Internal releases on account-bound credentials.

## 2026-07-08

- Task: package the native mobile app for App Store and Google Play readiness.
- Files changed: `apps/mobile/*`, `apps/mobile/.eas/workflows/release.yml`, `apps/mobile/store/*`, `apps/mobile/package-lock.json`, `.gitignore`, `package.json`, `package-lock.json`, `scripts/mvp-verify.mjs`, `BACKLOG.md`, `PROGRESS.md`.
- Result: native mobile is now isolated from the root web/API workspace with its own lockfile, Metro resolution, store assets, splash/icon config, EAS production build/submit profiles, validated EAS workflow, App Store metadata, Google Play listing draft, privacy/review checklist, and automated store preflight.
- Checks run: `npm run mobile:store-preflight`; `npm run mobile:typecheck`; `cd apps/mobile && EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS=1 npx expo-doctor`; EAS workflow schema validator; `bash -n apps/mobile/script/build_and_run.sh`; `apps/mobile/script/build_and_run.sh --help`; `git diff --check`; expected-fail `npm --prefix apps/mobile run store:preflight:strict`.
- Outcome: mobile store preflight passed with 0 failures and 1 production API warning; typecheck passed; EAS workflow validation passed. Strict store preflight fails only on external release inputs: `EXPO_PUBLIC_API_BASE`, `EXPO_TOKEN`, Apple credentials, and Google Play service account. Local Expo Doctor is 19/20 when root web dependencies are installed because it sees the parent Next 14 React 18 tree; the mobile package now has its own lockfile so clean EAS builds should install from `apps/mobile` without the root web tree.
- Next step: provision production API URL and Apple/Google/EAS credentials, then run strict preflight and EAS internal builds/submits from `apps/mobile`.

## 2026-07-08

- Task: add native iOS/Android app workspace instead of a PWA shell.
- Files changed: `apps/mobile/*`, root `package.json`, `package-lock.json`, `.gitignore`, `scripts/mvp-verify.mjs`, `README.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: added `@alistore/mobile` as an Expo React Native app with native Client and Staff/POS modes, secure staff-token storage, shared catalog fetch, mobile cart/favorites/checkout, online payment intents with sandbox confirmation, staff order queue, POS ticketing, discount/payment selection, and `POST /pos/sale` integration. Codex Run is wired to `apps/mobile/script/build_and_run.sh`.
- Checks run: `npm run typecheck -w @alistore/mobile`; `npm run expo:config -w @alistore/mobile`; `bash -n apps/mobile/script/build_and_run.sh`; `apps/mobile/script/build_and_run.sh --help`; `npm exec -w @alistore/mobile -- expo-doctor`; `npm run mvp:verify -- --skip-e2e`; `git diff --check`.
- Outcome: mobile typecheck passed; Expo config renders; run script syntax/help passed; fast MVP gate passed with Prisma schema validation, Prisma Client generation, API build, web build, mobile typecheck, API Jest 90 suites / 319 tests, and readiness reporting. Expo Doctor is 19/20: the remaining warning is the known monorepo React split (`apps/web` on React 18 for Next 14, `apps/mobile` on React 19 for Expo SDK 57), so store packaging remains a dedicated follow-up rather than forcing an unsafe web React upgrade.
- Next step: use real devices/provider accounts for store signing, TestFlight/Play Internal QA, push credentials, and physical POS hardware certification.

## 2026-07-08

- Task: run prototype visual audit and remove negative letter spacing.
- Files changed: `apps/web/app/globals.css`, `apps/web/components/SiteHeader.tsx`, `BACKLOG.md`, `PROGRESS.md`.
- Result: audited the live UI against the `.dc.html` visual references for Client App 2.0, POS 2.0, Staff App 2.0, and ERP 2.0; removed the remaining negative letter spacing from global headings and the site header so typography follows the project rule that letter spacing stays at 0 unless explicitly positive.
- Checks run: live Playwright visual audit on `/`, `/search`, `/product/[id]`, `/cart`, `/checkout`, `/account`, `/favorites`, `/compare`, `/pos`, `/staff`, `/erp`; `rg -n "letter-spacing:\s*-|tracking-tight|tracking-\[-" apps/web/app apps/web/components apps/web/lib`; `npm run build -w @alistore/web`; post-fix browser smoke on `/`, `/staff`, `/erp` readiness; `git diff --check`.
- Outcome: visual audit found no console errors, request failures, or 4xx/5xx on the full route set; horizontal rail signals on home/compare matched intentional scrollable mobile UI; post-fix smoke passed with no console/network failures and viewport-width layouts on home/staff/ERP.
- Next step: keep future frontend changes under the same browser visual smoke before shipping.

## 2026-07-08

- Task: add production core preflight.
- Files changed: `apps/api/src/health/production-preflight.ts`, `apps/api/scripts/print-production-preflight.ts`, `apps/api/test/production-preflight.spec.ts`, API/root `package.json`, `apps/api/.env.production.example`, `README.md`, `docs/HANDOFF.md`, `docs/READINESS.md`, `docs/PRODUCTION-ACTIVATION.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: added a secret-safe production core preflight that checks `NODE_ENV=production`, `DATABASE_URL`, a non-placeholder 32+ char `JWT_SECRET`, `AUTH_OTP_DEV_ECHO=false`, and required background jobs before external provider readiness runs. Root launch commands now include `launch:preflight`, `launch:preflight:strict`, and `launch:check`.
- Checks run: `npm run test -w @alistore/api -- production-preflight external-readiness --runInBand`; `npm run preflight -w @alistore/api -- --env-file .env.production.example`; `npm run preflight -w @alistore/api -- --env-file .env.production.example --json`; `npm run preflight -w @alistore/api -- --env-file .env.production.example --strict` (expected exit 1 on empty template); `npm run api:build`; `npm run readiness -w @alistore/api -- --env-file .env.production.example`; `npm run mvp:verify -- --skip-e2e`; `git diff --check`.
- Outcome: targeted tests passed 2 suites / 6 tests; preflight example reports `ready=4, missing=2, unsafe=0, blocking=2`; strict mode fails as intended until production DB/JWT are filled; API build passed; fast MVP gate passed with Prisma schema validation, Prisma Client generation, API build, web build, API Jest 90 suites / 319 tests, and default readiness reporting.
- Next step: fill `apps/api/.env.production`, run `npm run launch:check`, then close external provider/hardware QA.

## 2026-07-08

- Task: add production activation pack.
- Files changed: `.gitignore`, `apps/api/.env.production.example`, `apps/api/scripts/print-readiness.ts`, root `package.json`, `docs/PRODUCTION-ACTIVATION.md`, `README.md`, `docs/HANDOFF.md`, `docs/READINESS.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: added a production env template ignored by git, launch readiness npm commands, a `--env-file`/`--json` readiness CLI mode, and a production activation runbook that separates software verification from external provider/hardware activation.
- Checks run: `npm run readiness -w @alistore/api -- --env-file .env.production.example`; `npm run readiness -w @alistore/api -- --env-file .env.production.example --json`; `npm run mvp:verify -- --skip-e2e`; `git diff --check`.
- Outcome: production example reports the expected blocked state without secrets (`ready=0, missing=6, manual=1, optional=2, blocking=7`); JSON output is valid; fast MVP gate passed with Prisma schema validation, Prisma Client generation, API build, web build, API Jest 89 suites / 316 tests, and default readiness reporting.
- Next step: copy `apps/api/.env.production.example` to `apps/api/.env.production`, fill real external credentials, complete physical POS QA, then run `npm run launch:readiness:strict`.

## 2026-07-08

- Task: expose production readiness in ERP.
- Files changed: `apps/web/lib/api/readiness.ts`, `apps/web/lib/api.ts`, `apps/web/app/erp/page.tsx`, `e2e/erp-secure.spec.ts`, `BACKLOG.md`, `docs/HANDOFF.md`, `docs/READINESS.md`, `PROGRESS.md`.
- Result: ERP now has a `Готовность` owner-console tab backed by `GET /health/integrations`, showing blocking provider credentials, manual POS hardware checks, optional production services, and the strict release gate command without exposing secret values.
- Checks run: `npm run build -w @alistore/web`; `npx playwright test e2e/erp-secure.spec.ts`; `npm run mvp:verify`; `git diff --check`.
- Outcome: web build passed; targeted ERP browser smoke passed 1/1; full MVP gate passed with API Jest 89 suites / 316 tests and Playwright 9/9; external readiness report still correctly shows `ready=0, missing=6, manual=1, optional=2, blocking=7`.
- Next step: production launch remains external-only: provider credentials, callback/webhook QA, and physical POS hardware certification.

## 2026-07-08

- Task: add one-command MVP verification gate.
- Files changed: `scripts/mvp-verify.mjs`, `apps/api/scripts/print-readiness.ts`, root/API `package.json`, `README.md`, `docs/HANDOFF.md`, `docs/READINESS.md`, `PROGRESS.md`.
- Result: `npm run mvp:verify` now runs Prisma schema validation, Prisma Client generation, API build, web build, full API Jest, Playwright E2E, and secret-safe external readiness reporting. `--skip-e2e` gives a faster local gate; `--strict-external` turns missing production credentials/hardware markers into a failing release gate.
- Checks run: `npm run mvp:verify`; `git diff --check`.
- Outcome: full gate passed: Prisma schema valid; Prisma Client generated; API build passed; web build passed; API Jest passed 89 suites / 316 tests; Playwright passed 9/9; external readiness report executed and reported `ready=0, missing=6, manual=1, optional=2, blocking=7` without secret values.
- Next step: MVP software gate is complete; production launch still needs external provider credentials and physical POS hardware certification.

## 2026-07-08

- Task: add POS catalog delta-sync.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260708133000_add_catalog_delta_timestamps/migration.sql`, `apps/api/src/catalog/*`, `apps/api/test/catalog-search.e2e-spec.ts`, `apps/web/lib/api/catalog.ts`, `apps/web/app/pos/page.tsx`, `e2e/pos-ui.spec.ts`, `e2e/helpers.ts`, `BACKLOG.md`, `docs/*`, `PROGRESS.md`.
- Result: Product and DeviceUnit now carry `updatedAt`; `GET /catalog/products/delta` returns changed active catalog items plus archived removals, including stock-count changes from DeviceUnit updates. `/pos` keeps a local catalog cache and refreshes via delta on reload/new sale/offline queue sync.
- Checks run: `npm run prisma:generate -w @alistore/api`; `npm run db:deploy -w @alistore/api`; test DB `prisma db push --skip-generate`; `npm run test -w @alistore/api -- catalog-search --runInBand`; `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`; `npx playwright test e2e/pos-ui.spec.ts`; `npm run e2e`; `git diff --check`.
- Outcome: targeted catalog delta test passed 1 suite / 4 tests; API build passed; web build passed; full API Jest passed 89 suites / 316 tests; targeted POS UI browser smoke passed; full Playwright passed 9/9.
- Next step: no unblocked MVP software tasks remain; production closeout requires external provider credentials and physical POS hardware certification.

## 2026-07-08

- Task: add provider-ready Apple/Telegram social login.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260708130500_add_customer_identities/migration.sql`, `apps/api/src/auth/*`, `apps/api/src/health/external-readiness.ts`, `apps/api/test/social-auth.spec.ts`, `apps/web/lib/auth.tsx`, `apps/web/lib/api/auth.ts`, `apps/web/lib/api/campaigns.ts`, `apps/web/app/login/page.tsx`, `BACKLOG.md`, `docs/*`, `PROGRESS.md`.
- Result: added `CustomerIdentity` for stable provider subject linking, `POST /auth/social/telegram` with Telegram Mini App/Login Widget signed initData verification, `POST /auth/social/apple` with Apple identityToken JWKS/RS256 verification, deterministic customer creation for social-only accounts, and Telegram Mini App login handoff in `/login`.
- Checks run: `npm run prisma:generate -w @alistore/api`; `npm run db:deploy -w @alistore/api`; test DB `prisma db push --skip-generate`; `npm run test -w @alistore/api -- social-auth auth external-readiness --runInBand`; `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`; `git diff --check`.
- Outcome: targeted social/auth/readiness tests passed 8 suites / 28 tests; API build passed; web build passed; full API Jest passed 89 suites / 315 tests.
- Next step: production social login activation still needs Apple/Telegram credentials, callback configuration, and live client SDK QA.

## 2026-07-08

- Task: add channel-aware campaign delivery transports.
- Files changed: `apps/api/src/outbox/*`, `apps/api/src/campaigns/*`, `apps/api/src/health/external-readiness.ts`, `apps/api/test/channel-transport.spec.ts`, `apps/api/test/campaigns.e2e-spec.ts`, `apps/api/test/external-readiness.spec.ts`, `BACKLOG.md`, `docs/*`, `PROGRESS.md`.
- Result: `NOTIFICATION_TRANSPORT=channels`/`providers` now routes outbox messages by channel: Novu for `sms`/`push`/`webhook`, SMTP/json email for `email`, Telegram Bot API for `telegram`, WhatsApp Cloud API for `whatsapp`, with log fallback when credentials are absent. Campaigns now accept `whatsapp`, and Telegram campaigns can target `telegram:<chat_id>`/`tg:<chat_id>` customer segment values.
- Checks run: `npm run test -w @alistore/api -- channel-transport campaigns external-readiness --runInBand`; `npm run api:build`; `npm run api:test`.
- Outcome: targeted campaign/transport/readiness tests passed 3 suites / 9 tests; API build passed; full API Jest passed 88 suites / 311 tests.
- Next step: production activation still requires provider accounts/keys/webhook QA; code-side campaign delivery is complete.

## 2026-07-08

- Task: close P0-2 by protecting Reports and AI endpoints.
- Files changed: `apps/api/src/reports/*`, `apps/api/src/ai/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/src/orders/*`, `apps/api/test/reports-ai-rbac.e2e-spec.ts`, `apps/web/lib/reports.ts`, `apps/web/lib/ai.ts`, `apps/web/lib/api/orders.ts`, ERP/admin/AI/order-status web clients, `e2e/erp-secure.spec.ts`, `BACKLOG.md`, `docs/*`, `PROGRESS.md`.
- Result: `/reports/*` and `/ai/*` now require staff JWT + active staff + casbin permission (`reports.read` / `ai.read`, admin/owner only). ERP, AI tools, used-device assessment, and admin product AI enrichment send the shared staff-session token. Customer order status uses `GET /orders/:id/ledger`, scoped to the owning customer or staff queue readers, instead of public owner ledger.
- Checks run: `npm run test -w @alistore/api -- reports-ai-rbac --runInBand`; `npm run api:build`; `npm run build -w @alistore/web`; `npx playwright test e2e/erp-secure.spec.ts e2e/admin-products.spec.ts`; `npm run api:test`; `npm run e2e`; `git diff --check`.
- Outcome: targeted reports/AI RBAC tests passed 1 suite / 2 tests; API build passed; web build passed; targeted browser smoke passed 2/2; full API Jest passed 87 suites / 305 tests; full Playwright passed 8/8.
- Next step: code-side MVP is closed; remaining Next backlog requires external provider accounts/social credentials or physical POS hardware.

## 2026-07-08

- Task: add external integration readiness health report.
- Files changed: `apps/api/src/health/external-readiness.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/src/health/health.module.ts`, `apps/api/test/external-readiness.spec.ts`, `apps/api/test/health.e2e-spec.ts`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/CODEX-NOW.md`, `docs/PARALLEL-LANES.md`, `docs/PHASES.md`, `docs/READINESS.md`, `PROGRESS.md`.
- Result: added `GET /health/integrations` with a secret-safe provider/account/hardware readiness report: AI, Telegram bot/login, WhatsApp, Apple login, campaign delivery, physical POS certification, S3 media storage, and observability checks. `requiredAny` alternatives no longer show false missing envs when one valid option is configured.
- Checks run: `npm run test -w @alistore/api -- external-readiness health --runInBand`; `npm run api:build`; `npm run api:test`; `git diff --check`.
- Outcome: targeted health/readiness tests passed 2 suites / 5 tests; API build passed; full API Jest passed 86 suites / 303 tests; whitespace check passed.
- Next step: remaining unblocked product backlog is empty; P0-2 reports/AI guard remains blocked until web-token handoff lands; provider/social/hardware tasks wait for external accounts/devices.

## 2026-07-08

- Task: add Telegram Mini App shell route.
- Files changed: `apps/web/app/tg/page.tsx`, `apps/web/app/tg/webhook/route.ts`, `e2e/tg-mini-app.spec.ts`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/CODEX-NOW.md`, `docs/PARALLEL-LANES.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: added `/tg` as a Telegram-style mobile storefront and checkout over the shared catalog/customer/order/payment APIs, with optional Telegram WebApp expand/prefill support, `channel=telegram` order creation, MBank QR sandbox intent option, and `/tg/webhook` stub for future bot activation.
- Checks run: `npx playwright test e2e/tg-mini-app.spec.ts`; `npm run build -w @alistore/web`; live API+Next+Chrome screenshots for `/tg` catalog and checkout; `npm run api:build`; `npm run api:test`; `npm run e2e`; `git diff --check`. A first parallel `next build` collided with Playwright `next dev` over `.next`, then passed when rerun alone.
- Outcome: targeted Telegram Mini App Playwright smoke passed and verified an Order with `channel=telegram` in Prisma; API build passed; full API Jest passed 85 suites / 300 tests; full Playwright passed 7/7; web build passed; visual mobile QA passed for catalog and checkout; whitespace check passed.
- Next step: P0-2 reports/AI guard remains blocked until web-token handoff lands; remaining backlog is external/provider/hardware gated.

## 2026-07-08

- Task: build Admin Product Management UI with AI enrichment and approval-gated dangerous actions.
- Files changed: `apps/api/src/products/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/src/audit/event-types.ts`, `apps/api/test/product-management.e2e-spec.ts`, `apps/web/app/admin/products/page.tsx`, `apps/web/lib/api/*`, `e2e/admin-products.spec.ts`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/CODEX-NOW.md`, `docs/PARALLEL-LANES.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: added staff-only product list/create/update for ordinary product fields with ledger events; `/admin/products` now supports search, create/edit, AI auto-category, AI description into `attrs`, price-change requests, archive requests, and Approval Inbox handoff. Price/archive remain approval-gated through existing product endpoints.
- Checks run: `npm run test -w @alistore/api -- product-management.e2e-spec.ts`; `npm run api:build`; `npm run build -w @alistore/web`; `npx playwright test e2e/admin-products.spec.ts`; live API+Next+Chrome screenshots on desktop/mobile; `npm run api:test`; `npm run e2e`; `git diff --check`.
- Outcome: targeted product-management API test passed; API build passed; web build passed; admin-products Playwright smoke passed including mobile viewport; full API Jest passed 85 suites / 300 tests; full Playwright passed 6/6; whitespace check passed.
- Next step: P0-2 reports/AI guard remains blocked until web-token handoff lands; next unblocked greenfield item is Telegram Mini App shell.

## 2026-07-08

- Task: add Playwright E2E smoke pack and CI workflow.
- Files changed: `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `playwright.config.ts`, `e2e/*`, `.gitignore`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/CODEX-NOW.md`, `docs/PARALLEL-LANES.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: added `npm run e2e` with five smoke flows (web checkout, POS discount→approval, customer return→refund approval request, staff exchange, staff trade-in intake), shared Prisma/API helpers pinned to the E2E/test DB, Playwright report/video/screenshot artifacts on failure, and GitHub Actions CI with Postgres, Prisma migrate, API build/test, web build, browser install, and E2E.
- Checks run: `npm run e2e`; `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`.
- Outcome: Playwright passed 5/5 locally using system Chrome; API build passed; web build passed; full API Jest passed 84 suites / 298 tests.
- Next step: P0-2 reports/AI guard remains blocked until web-token handoff lands; next unblocked P2 items are Admin Product Management UI and Telegram Mini App shell.

## 2026-07-08

- Task: add gift cards / store credit to checkout and payments.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260708090000_add_gift_cards/migration.sql`, `apps/api/src/giftcards/*`, payment service/DTO/module/intents, authz/app module, checkout gift-card UI/API clients, gift-card/payment/cleanup tests, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/CODEX-NOW.md`, `docs/PARALLEL-LANES.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: new `GiftCard` store-credit balance supports staff issue, public balance check, atomic checkout/POS redemption as `PaymentMethod.gift_card`, generated idempotency txn per card+order, partial online-payment due, and checkout applies a gift card before creating a sandbox intent for the remaining amount.
- Checks run: `npm run prisma:generate -w @alistore/api`; `npm run db:deploy -w @alistore/api`; test DB `prisma db push --skip-generate`; `npm run test -w @alistore/api -- giftcards payment-intents --runInBand`; `npm run test -w @alistore/api -- fulfillment giftcards --runInBand`; `npm run test -w @alistore/api -- product-reviews --runInBand`; `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`; live API+Next+Chrome/CDP checkout smoke on ports 4105/3105.
- Outcome: targeted Jest passed; API build passed; web build passed; full API Jest passed 84 suites / 298 tests; browser smoke completed gift card 25 000 + card 75 000 checkout and DB showed order paid, card redeemed, and `giftcard.redeemed` ledger event. Also fixed stale `InventoryMovement` cleanup in fulfillment/product-review tests.
- Next step: P0-2 reports/AI guard remains blocked until web-token handoff lands; next unblocked P2 items are E2E+CI, Admin Product Management UI, or Telegram Mini App shell.

## 2026-07-08

- Task: add consent-filtered transactional notification templates.
- Files changed: `apps/api/src/outbox/customer-notifications.ts`, orders/warranty/debts/reservations services and modules, `apps/api/test/transactional-notifications.e2e-spec.ts`, debt/reservation notification tests, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/CODEX-NOW.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: orders now enqueue `order_confirmed` and `order_ready`, warranty cases enqueue `warranty_created` and `warranty_closed`, reservation expiry and debt reminders reuse a shared consent-aware customer notification helper, and opted-out customers are skipped without blocking the underlying business transaction.
- Checks run: `npm run test -w @alistore/api -- transactional-notifications debts reservation-expiry --runInBand`; `npm run api:build`; `npm run api:test`; `npm run build -w @alistore/web`; `git diff --check`.
- Outcome: targeted Jest passed 3 suites / 14 tests; API build passed; full API Jest passed 83 suites / 294 tests; web build passed; whitespace check passed.
- Next step: P0-2 reports/AI guard remains blocked until web-token handoff lands; then continue with P2/E2E+CI or provider/hardware-gated work.

## 2026-07-08

- Task: polish trade-in contract print locale, IMEI, and price formatting.
- Files changed: `apps/api/src/documents/trade-in-contract.ts`, `apps/api/src/documents/documents.service.ts`, `apps/api/test/documents.spec.ts`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/CODEX-NOW.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: trade-in contract content now has a pure line builder, prints optional IMEI/SN, uses `dd.mm.yyyy` issue date, and formats the buyback price with thousands separators in сом.
- Checks run: `npm run test -w @alistore/api -- documents --runInBand`; `npm run api:build`; `npm run api:test`; `git diff --check`.
- Outcome: documents tests passed 1 suite / 12 tests; API build passed; full API Jest passed 82 suites / 290 tests; whitespace check passed.
- Next step: P0-2 reports/AI guard remains blocked until web-token handoff lands.

## 2026-07-08

- Task: add rate limiting to public checkout, OTP, support, and webhook endpoints.
- Files changed: `apps/api/src/rate-limit/*`, auth/customers/orders/payments/support modules/controllers, `apps/api/test/public-rate-limit.e2e-spec.ts`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/CODEX-NOW.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: shared `RateLimitModule` now backs per-route caps on checkout-chain writes (`POST /customers`, `POST /orders`, `POST /payments/intents`), public support ticket creation, sandbox/provider payment webhooks, and existing OTP throttling.
- Checks run: `npm run test -w @alistore/api -- public-rate-limit auth-throttle --runInBand`; `npm run api:build`; `npm run api:test`; `git diff --check`.
- Outcome: targeted rate-limit/auth-throttle tests passed 2 suites / 5 tests; API build passed; full API Jest passed 82 suites / 289 tests; whitespace check passed.
- Next step: P0-2 reports/AI guard remains blocked until web-token handoff lands.

## 2026-07-08

- Task: activate trade-in IMEI capture for `imei_reuse` risk detection.
- Files changed: `apps/api/src/tradeins/*`, `apps/api/test/tradein-rbac.e2e-spec.ts`, `apps/api/test/reports.e2e-spec.ts`, `apps/api/test/warranty-rbac.e2e-spec.ts`, `apps/web/lib/api/tradeins.ts`, `/staff`, `/trade-in`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/CODEX-NOW.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: trade-in DTOs now accept optional IMEI, service stores it on `TradeInDevice.imei`, ledger refs include it, Staff app and customer Trade-in screen can capture it, and Risk Center acceptance proves a sold-device IMEI reused in buyback becomes high-risk `imei_reuse`.
- Checks run: `npm run test -w @alistore/api -- tradein-rbac reports --runInBand`; `npm run api:build`; `npm run build -w @alistore/web`; Chrome/CDP smoke on `/trade-in` through isolated API `4102` + web `3102`; `npm run api:test`.
- Outcome: targeted Jest passed 2 suites / 4 tests; API build passed; web build passed; browser smoke created a trade-in contract and showed the submitted IMEI on the success screen; full API Jest passed 81 suites / 285 tests after fixing stale FK cleanup order in reports/warranty RBAC tests.
- Next step: P0-2 `/reports/*` + `/ai/*` guard remains blocked until the web-token handoff for `lib/reports.ts` and `lib/ai.ts` lands.

## 2026-07-08

- Task: write infra runbook for Caddy/backups deployment.
- Files changed: `infra/RUNBOOK.md`, `infra/README.md`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: added a production operator checklist for host baseline, env values, build/deploy, self-hosted MinIO/Metabase, Caddy validation/reload, backup schedule, restore drill, release smoke and rollback.
- Checks run: `bash -n infra/backup.sh`; `rg "Restore Drill|caddy validate|pg_restore|docker compose" infra/RUNBOOK.md`; `git diff --check -- infra/RUNBOOK.md infra/README.md BACKLOG.md docs/CODEX-HANDOFF.md docs/PHASES.md PROGRESS.md`.
- Outcome: runbook docs are present and parse/check cleanly; Docker/Caddy were not executed on this dev machine.
- Next step: remaining MVP work is external/provider/hardware gated, with the trade-in IMEI intake noted separately for schema-coordinated follow-up.

## 2026-07-07

- Task: complete the customer-facing app to match the AliStore ecosystem/client prototype.
- Files changed: `apps/web/app/*`, `apps/web/components/*`, `apps/web/lib/*`, `docs/PHASES.md`, `BACKLOG.md`.
- Result: added customer routes for search, bonuses, addresses, notifications/preferences, settings, returns, support, and trade-in; wired them into account/home/order navigation; made cart promo/bonus state feed checkout totals.
- Checks run: `npm run build -w @alistore/web`; `npm run api:build && npm run api:test`.
- Outcome: web build passed; API build passed; Jest passed 53 suites / 167 tests.
- Next step: evidence upload flows and external/hardware integrations from `BACKLOG.md`.

## 2026-07-07

- Task: make the app operationally ready by adding Evidence Vault uploads to real flows.
- Files changed: `apps/api/src/evidence/*`, `apps/api/test/evidence.e2e-spec.ts`, `apps/web/components/EvidencePicker.tsx`, evidence wiring in trade-in, returns, warranty, support, and warehouse.
- Result: images are compressed by `MediaService`, stored under `/uploads`, linked to the relevant domain entity through `evidence.attached` Event Ledger entries, and visible flows report uploaded evidence counts.
- Checks run: `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`.
- Outcome: API build passed; web build passed; Jest passed 55 suites / 173 tests.
- Next step: external payment adapters and offline/hardware POS from `BACKLOG.md`.

## 2026-07-07

- Task: add production-shaped online payment adapters for checkout.
- Files changed: `apps/api/src/payments/payment-intents.*`, `apps/api/test/payment-intents.e2e-spec.ts`, `apps/web/lib/api/payments.ts`, `apps/web/app/checkout/page.tsx`.
- Result: card/MBank/O!Деньги/installment checkout creates a payment intent, reserves stock, moves the order to `awaiting_payment`, and confirms through an idempotent sandbox/provider webhook.
- Checks run: `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`.
- Outcome: API build passed; web build passed; Jest passed 56 suites / 175 tests.
- Next step: offline POS queue/sync and hardware adapters from `BACKLOG.md`.

## 2026-07-07

- Task: make POS resilient enough for store operations by adding offline queue/sync and browser hardware fallbacks.
- Files changed: `apps/api/src/pos/*`, `apps/api/src/payments/payments.service.ts`, `apps/api/test/pos-sale.e2e-spec.ts`, `apps/web/app/pos/page.tsx`, `apps/web/lib/pos-offline.ts`, `apps/web/lib/pos-hardware.ts`, `apps/web/components/pos/PosCheckout.tsx`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: POS sales now carry a client-generated idempotency key, offline sales persist locally with conflict/approval states, `/pos` can sync queued sales safely, scan SKU/barcodes through keyboard-wedge/manual input, check terminal readiness, and print local or synced receipts.
- Checks run: `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`.
- Outcome: API build passed; web build passed; Jest passed 57 suites / 180 tests.
- Next step: staff JWT role rollout for PII/2FA dangerous-action gates, then external campaign/provider integrations.

## 2026-07-07

- Task: harden staff JWT authorization for PII reads and approval decisions.
- Files changed: `apps/api/src/auth/*`, `apps/api/src/customers/customers.controller.ts`, `apps/api/src/approvals/*`, `apps/api/test/customer-pii-guard.e2e-spec.ts`, `apps/api/test/approvals-jwt-guard.e2e-spec.ts`, `apps/web/app/approvals/page.tsx`, `apps/web/lib/api/approvals.ts`, `apps/web/lib/api/staff-auth.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: customer phone is masked for anonymous/junior reads and revealed only to self/admin/owner; Approval Inbox requires staff JWT and approve/reject uses JWT role instead of body-supplied `approverRole`.
- Checks run: `npm run api:build`; `npm run build -w @alistore/web`; targeted Jest for PII/approval JWT; `npm run api:test`; headless Chrome screenshot of `/approvals`.
- Outcome: API build passed; web build passed; targeted authz tests passed; Jest passed 59 suites / 184 tests.
- Next step: step-up 2FA and staff-session rollout for POS/warehouse/staff operational endpoints.

## 2026-07-07

- Task: add staff step-up 2FA for dangerous approval decisions.
- Files changed: `apps/api/prisma/*`, `apps/api/src/staff-auth/*`, `apps/api/src/approvals/*`, staff/approval tests, `apps/web/app/approvals/page.tsx`, `apps/web/lib/api/*`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: staff accounts can enroll/enable/disable TOTP; staff login returns `totpEnabled`; Approval Inbox approve requires a valid TOTP code from an active staff row while reject remains available; `/approvals` includes 2FA enrollment and approval-code UI.
- Checks run: `npm run prisma:generate -w @alistore/api`; Prisma migration deploy on dev DB; test DB schema sync with `prisma db push`; `npm run api:build`; targeted Jest for `staff-auth`, `approvals-jwt-guard`, `staff-auth-guard`, `authz-e2e`; `npm run build -w @alistore/web`; `npm run api:test`; headless Chrome mobile QA for `/approvals` login/session → 2FA setup.
- Outcome: API build passed; web build passed; targeted tests passed; Jest passed 59 suites / 187 tests; browser QA showed 2FA setup secret/otpauth, no horizontal overflow, no critical network failures (favicon 404 only).
- Next step: staff-session rollout for POS/warehouse/staff operational endpoints.

## 2026-07-07

- Task: roll out staff sessions to POS, warehouse, and staff operational endpoints.
- Files changed: `apps/api/src/auth/staff-principal.ts`, POS/inventory/shifts/orders controllers and modules, `apps/api/src/staff-auth/staff-auth.service.ts`, `apps/api/test/staff-session-ops.e2e-spec.ts`, shared web staff-session/login components, POS/warehouse/staff/approvals pages, and staff-aware web API clients.
- Result: POS sale, shifts, inventory movement/transfer/count, and order queue/reserve/fulfill/transition now require an active staff JWT; server-side actor/staffId comes from the token instead of body/query spoofing; `/pos`, `/warehouse`, and `/staff` share a persisted staff session, and offline POS sync sends the current staff token.
- Checks run: `npm run api:build`; targeted Jest for `staff-session-ops` and `staff-auth`; `npm run build -w @alistore/web`; `npm run api:test`; browser QA for `/pos` staff login followed by `/warehouse` and `/staff` session reuse.
- Outcome: API build passed; web build passed; targeted tests passed; Jest passed 60 suites / 191 tests; browser QA passed with no failed requests or horizontal overflow.
- Next step: extend the Role Permission Matrix across the remaining operational endpoints, then continue external provider/hardware integrations.

## 2026-07-07

- Task: enforce the Role Permission Matrix on staff-session operational endpoints.
- Files changed: `apps/api/src/authz/authz.model.ts`, POS/inventory/shifts/orders controllers and modules, `apps/api/test/staff-session-ops.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: POS sale, cash-shift open/read/close, inventory movement/transfer/count, and order queue/reserve/fulfill/transition now require both an active staff JWT and the correct role; wrong-role staff tokens return 403 before service execution.
- Checks run: targeted Jest for `staff-session-ops`, `authz-e2e`, and `staff-auth-guard`; `npm run api:build`; `npm run api:test`.
- Outcome: targeted tests passed 3 suites / 14 tests; API build passed; full Jest passed 60 suites / 195 tests.
- Next step: extend the remaining Role Permission Matrix rollout to courier, warranty, support, suppliers, debts, trade-in intake, and admin documents/labels/receipts.

## 2026-07-07

- Task: extend active-staff RBAC to courier and print/export operational endpoints.
- Files changed: `apps/api/src/auth/active-staff.guard.ts`, `apps/api/src/authz/authz.model.ts`, courier/documents/labels/receipts controllers and modules, `apps/api/src/staff-auth/staff-auth.module.ts`, `apps/api/test/courier-print-rbac.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: courier assignment, COD handover, failed-delivery recording, document rendering, label rendering, and receipt rendering now require an active staff JWT plus the correct role; actors for courier ledger events come from the JWT.
- Checks run: targeted Jest for `courier-print-rbac`, `staff-session-ops`, and `authz-e2e`; `npm run api:build`; `npm run api:test`.
- Outcome: targeted tests passed 3 suites / 14 tests; API build passed; full Jest passed 61 suites / 198 tests.
- Next step: split public/customer self-service from staff/admin RBAC gates for warranty, support/CRM, suppliers, debts, trade-in intake, returns/exchanges, products, and payment refunds.

## 2026-07-07

- Task: enforce staff RBAC on product price/archive and refund request endpoints.
- Files changed: `apps/api/src/authz/authz.model.ts`, `apps/api/src/products/*`, `apps/api/src/payments/*`, `apps/api/test/dangerous-endpoint-rbac.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: price changes, product archive requests, and refund requests now require active staff JWT plus the right role; body `requester` spoofing is ignored and Approval/Audit actor comes from the token. Public payment intent/webhook endpoints remain open for checkout/provider flow.
- Checks run: targeted Jest for `dangerous-endpoint-rbac`, `dangerous-actions`, `refund-approval`, and `authz-e2e`; `npm run api:build`; `npm run api:test`.
- Outcome: targeted tests passed 4 suites / 15 tests; API build passed; full Jest passed 62 suites / 201 tests.
- Next step: split public/customer self-service from staff/admin RBAC gates for warranty, support/CRM, suppliers, debts, trade-in intake, and returns/exchanges.

## 2026-07-07

- Task: split warranty customer self-service from staff-console RBAC gates.
- Files changed: `apps/api/src/warranty/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/warranty-rbac.e2e-spec.ts`, `apps/api/test/dangerous-endpoint-rbac.e2e-spec.ts`, `apps/web/app/warranty/page.tsx`, `apps/web/lib/warranty.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: `POST /warranty` remains public customer self-service; warranty list/get/transition now require active staff JWT with warehouse/admin/owner role; transition actor comes from JWT; `/warranty` reuses the shared staff session login.
- Checks run: targeted Jest for `warranty-rbac`, `warranty`, and `authz-e2e`; `npm run build -w @alistore/web`; `npm run api:build`; `npm run api:test`; browser QA on `/warranty` staff login.
- Outcome: targeted tests passed 3 suites / 7 tests; web build passed; API build passed; full Jest passed 63 suites / 202 tests; browser QA passed with no failed requests or horizontal overflow.
- Next step: split public/customer self-service from staff/admin RBAC gates for support/CRM, suppliers, debts, trade-in intake, and returns/exchanges.

## 2026-07-07

- Task: split support/CRM customer self-service from staff/admin RBAC gates.
- Files changed: `apps/api/src/support/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/support-rbac.e2e-spec.ts`, `apps/web/components/erp/CrmView.tsx`, `apps/web/lib/crm.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: `POST /support/tickets` and customer-scoped ticket lookup remain public self-service; CRM inbox list/transition/escalate require active admin/owner staff JWT; body actor spoofing is ignored; `/erp` CRM reuses the shared staff session.
- Checks run: targeted Jest for `support-rbac`, `support`, and `authz-e2e`; `npm run build -w @alistore/web`; `npm run api:build`; `npm run api:test`; browser QA on `/erp` CRM staff login.
- Outcome: targeted tests passed 3 suites / 10 tests; web build passed; API build passed; full Jest passed 64 suites / 203 tests; browser QA passed with no failed requests or horizontal overflow.
- Next step: split public/customer self-service from staff/admin RBAC gates for suppliers, debts, trade-in intake, and returns/exchanges.

## 2026-07-07

- Task: enforce supplier/RMA/scorecard staff RBAC gates.
- Files changed: `apps/api/src/suppliers/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/supplier-rbac.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: supplier create/list, RMA open/list/transition, and supplier scorecard now require active staff JWT plus role permission; warehouse can run RMA operations, admin/owner can manage supplier master data and scorecard, and RMA ledger actors come from the staff token.
- Checks run: targeted Jest for `supplier-rbac`, `supplier-rma`, and `authz-e2e`; `npm run api:build`; `npm run api:test`.
- Outcome: targeted tests passed 3 suites / 10 tests; API build passed; full Jest passed 65 suites / 204 tests.
- Next step: split public/customer self-service from staff/admin RBAC gates for debts, trade-in intake, and returns/exchanges.

## 2026-07-07

- Task: enforce debt/installment staff RBAC gates.
- Files changed: `apps/api/src/debts/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/debt-rbac.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: debt create/list/payment endpoints now require active staff JWT plus role permission; debt ledger actors and over-limit approval requesters come from the staff token instead of body actor spoofing.
- Checks run: targeted Jest for `debt-rbac`, `debts`, and `authz-e2e`; `npm run api:build`; `npm run api:test`; committed-baseline Jest excluding unrelated `categorize.spec.ts` WIP.
- Outcome: targeted tests passed 3 suites / 10 tests; API build passed; current working tree Jest passed 67 suites / 209 tests; committed-baseline Jest passed 66 suites / 205 tests.
- Next step: split public/customer self-service from staff/admin RBAC gates for trade-in intake and returns/exchanges.

## 2026-07-07

- Task: split trade-in customer self-service from staff intake RBAC gates.
- Files changed: `apps/api/src/tradeins/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/tradein-rbac.e2e-spec.ts`, `apps/web/app/staff/page.tsx`, `apps/web/lib/api/tradeins.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: public `POST /tradeins` remains customer self-service but ignores body actor; staff buyback uses `POST /tradeins/intake` with active staff JWT and role permission; trade-in read is staff-guarded; Staff app sends the shared staff token.
- Checks run: targeted Jest for `tradein-rbac`, `tradeins`, and `authz-e2e`; `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`; browser QA on `/staff` buyback intake.
- Outcome: targeted tests passed 3 suites / 6 tests; API build passed; web build passed; full Jest passed 69 suites / 215 tests; browser QA passed with `POST /api/tradeins/intake` 201, no failed requests, no console errors, and no horizontal overflow.
- Next step: split public/customer self-service from staff/admin RBAC gates for returns/exchanges.

## 2026-07-07

- Task: split returns/exchanges customer self-service from staff/cashier RBAC gates.
- Files changed: `apps/api/src/returns/*`, `apps/api/src/exchanges/*`, `apps/api/src/units/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/returns-exchanges-rbac.e2e-spec.ts`, test cleanup fixtures, `apps/web/app/account/returns/page.tsx`, `apps/web/app/exchange/page.tsx`, `apps/web/lib/api/returns.ts`, `apps/web/lib/api/exchanges.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: `POST /returns` now requires a customer JWT and verifies order ownership, staff return list/get/transition require active staff RBAC, unit lookup and exchange creation require active staff RBAC, and `/exchange` uses the shared staff session with server-side actor from the token.
- Checks run: targeted Jest for `returns-exchanges-rbac`, `exchange`, `units-lookup`, `refund-approval`, and `authz-e2e`; `npm run api:build`; `npm run build -w @alistore/web`; `npm run api:test`; browser QA on `/exchange` staff login → unit lookup → exchange.
- Outcome: targeted tests passed 5 suites / 12 tests; API build passed; web build passed; full Jest passed 71 suites / 222 tests; browser QA passed with `GET /api/units/:imei` 200, `POST /api/exchanges` 201, no failed requests, no console errors, and no horizontal overflow.
- Next step: certify physical POS hardware once devices/provider accounts are available, then add campaign delivery integrations.

## 2026-07-07

- Task: enforce POS margin-control approval gate.
- Files changed: `apps/api/src/pos/*`, `apps/api/src/rbac/permissions.ts`, `apps/api/test/pos-sale.e2e-spec.ts`, `apps/api/test/rbac.spec.ts`, `apps/web/components/pos/PosCheckout.tsx`, `apps/web/lib/api/pos.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: POS sale now computes server-side margin from `Product.cost`; a sale whose discounted unit margin falls below `minMarginSom` is parked in Approval Inbox even if the discount percent is within the normal limit, and the approval stores a sale fingerprint so it cannot be reused for a changed product/cost/price/qty mix.
- Checks run: targeted Jest for `pos-sale`, `rbac`, and `staff-session-ops`; `npm run api:build`; `npm run build -w @alistore/web` before revenue-trend integration landed; committed-scope full Jest; browser QA on `/pos` margin-control approval.
- Outcome: targeted tests passed 3 suites / 19 tests; API build passed; web build passed for the margin-control snapshot; full committed-scope Jest passed 72 suites / 231 tests; browser QA passed with `POST /api/pos/sale` 202, margin approval copy visible, no failed requests, no console errors, and no horizontal overflow.
- Next step: physical POS hardware certification and campaign delivery integrations remain dependent on external devices/provider accounts.

## 2026-07-07

- Task: finish ERP revenue trend comparison.
- Files changed: `apps/api/src/reports/*`, `apps/api/test/revenue-trend.spec.ts`, `apps/web/app/erp/page.tsx`, `apps/web/lib/reports.ts`, `BACKLOG.md`, `PROGRESS.md`.
- Result: ERP dashboard now fetches `GET /reports/revenue-trend?days=N` alongside the revenue buckets and shows a compact period-over-period badge for 7/30 day views.
- Checks run: targeted Jest for `revenue-trend`, `revenue-buckets`, and `reports`; `npm run api:build`; `npm run build -w @alistore/web`; full `npm run api:test`; browser QA on `/erp` 7-day revenue trend and 30-day period switch.
- Outcome: targeted tests passed 3 suites / 12 tests; API build passed; web build passed; full Jest passed 73 suites / 237 tests; browser QA passed with `GET /api/reports/revenue?days=7` 200, `GET /api/reports/revenue-trend?days=7` 200, `GET /api/reports/revenue?days=30` 200, `GET /api/reports/revenue-trend?days=30` 200, visible trend badge, no failed requests, no console errors, and no horizontal overflow.
- Next step: physical POS hardware certification and campaign delivery integrations remain dependent on external devices/provider accounts.

## 2026-07-07

- Task: connect owner AI assistant to merchandising signals.
- Files changed: `apps/api/src/ai/insight*`, `apps/api/src/ai/insights.service.ts`, `apps/api/test/insight.spec.ts`, `apps/api/test/insights-service.spec.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: `GET /ai/insights` now enriches the ledger/KPI context with urgent reorder items and overstock pricing recommendations, so the ERP assistant can surface restock warnings and discount hints without an AI provider key.
- Checks run: targeted Jest for `insight`, `insights-service`, `pricing`, and `reorder`; `npm run api:build`; full `npm run api:test`; `npm run build -w @alistore/web` after clearing stale `.next`.
- Outcome: targeted tests passed 4 suites / 19 tests; API build passed; full Jest passed 74 suites / 241 tests; web build passed.
- Next step: physical POS hardware certification and campaign delivery integrations remain dependent on external devices/provider accounts.

## 2026-07-07

- Task: optimize product detail related products.
- Files changed: `apps/web/lib/api/catalog.ts`, `apps/web/app/product/[id]/ProductClient.tsx`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: product detail now derives same-category related products through one storefront catalog helper, ranks in-stock and price-near items first, and avoids the old duplicate full-catalog fetch.
- Checks run: `npm run build -w @alistore/web`; browser QA on `/product/cmr8rbs7t0001h7bzi59xoj2s`.
- Outcome: web build passed; browser QA passed with one `GET /api/catalog/products?limit=100&offset=0` 200, visible related-products section, no failed requests, no console errors, and no horizontal overflow.
- Next step: finish storefront reviews or move to another unblocked backlog item.

## 2026-07-08

- Task: add printable order invoice / waybill PDF.
- Files changed: `apps/api/src/documents/*`, `apps/api/test/documents.spec.ts`, `apps/api/test/courier-print-rbac.e2e-spec.ts`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: staff print/export can now render `GET /documents/order/:id/invoice` as an A4 накладная PDF with customer, channel/status, SKU, product name, qty, IMEI/SN, total and received/reconciled payment lines. The invoice line builder is pure-tested so the required fields are locked, not just PDF bytes.
- Checks run: targeted Jest for `documents` and `courier-print-rbac`; `npm run api:build`; `git diff --check`.
- Outcome: targeted tests passed 2 suites / 14 tests; API build passed; RBAC guard smoke confirms courier is denied and seller reaches domain validation.
- Next step: infra runbook for Caddy/backups is the remaining unblocked MVP polish; social/campaign/hardware/AI provider work still waits for external credentials/devices.

## 2026-07-07

- Task: add OTP access recovery with refresh-session revocation.
- Files changed: `apps/api/src/auth/*`, `apps/api/test/auth.e2e-spec.ts`, `apps/api/test/auth-throttle.e2e-spec.ts`, `apps/web/lib/api/auth.ts`, `apps/web/lib/auth.tsx`, `apps/web/app/login/page.tsx`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: `/auth/recovery/request` issues a recovery OTP without revealing account existence; `/auth/recovery/verify` validates an existing customer, revokes old refresh tokens, and issues a fresh token pair. `/login` now has a recovery mode and no longer presents inert social buttons as active actions.
- Checks run: targeted Jest for `auth`; `npm run api:build`; `npm run build -w @alistore/web`; browser QA on mobile `/login` recovery flow; DB verification query.
- Outcome: auth tests passed 6 suites / 21 tests; API build passed; web build passed; browser QA reached `/account` with recovery request/verify 201 and `/auth/me` 200; DB showed 2 refresh rows for the QA customer with 1 revoked old token and 1 active new token.
- Next step: remaining bounded unblocked work is broader PDF/print polish or infra runbook; real social providers remain blocked on Apple/Telegram credentials.

## 2026-07-07

- Task: print split payment tenders on receipts.
- Files changed: `apps/api/src/receipts/receipts.dto.ts`, `apps/api/src/receipts/receipts.service.ts`, `apps/api/test/receipts.spec.ts`, `apps/api/test/receipts-order.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: receipts now keep backward-compatible `payment` but can render `payments[]`; `renderOrder()` prints every received/reconciled positive tender with method and amount, so POS split payments appear correctly on printed receipts.
- Checks run: targeted Jest for `receipts`; `npm run api:build`; `git diff --check`.
- Outcome: receipts tests passed 2 suites / 7 tests; API build passed; split order receipt includes `cash | 30 000` and `card | 70 000`.
- Next step: remaining bounded unblocked work is auth recovery/social login, broader PDF/print polish for documents, or infra runbook; provider/hardware work still waits for accounts/devices.

## 2026-07-07

- Task: add consent-filtered Campaign Segment Builder and ROI.
- Files changed: `apps/api/src/campaigns/*`, `apps/api/src/app.module.ts`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/campaigns.e2e-spec.ts`, `apps/web/components/erp/CampaignsView.tsx`, `apps/web/app/erp/page.tsx`, `apps/web/lib/api/campaigns.ts`, `apps/web/lib/api.ts`, `BACKLOG.md`, `docs/CODEX-HANDOFF.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: marketer/admin/owner staff can preview consent-filtered audience segments by level/city/tags/spend/ltv, create campaigns that enqueue outbox messages only for consenting customers, and attribute paid orders once for Campaign ROI from received payments. ERP now has a working “Кампании” cockpit tab for preview, launch, and ROI conversion.
- Checks run: targeted Jest for `campaigns`; `npm run api:build`; `npm run build -w @alistore/web`; browser QA on `/erp` campaigns flow; DB verification query.
- Outcome: campaigns e2e passed 1 suite / 1 test; API build passed; web build passed; browser QA passed with `POST /api/campaigns/preview` 200, `POST /api/campaigns` 201, `POST /api/campaigns/:id/conversions` 200, visible ROI 700%, no failed requests/console errors; DB verification showed outbox recipients include the consenting customer and exclude the opted-out customer, with one conversion event for the order.
- Commit: included in the campaign feature commit for this iteration.
- Next step: remaining bounded unblocked work is auth recovery/social login, PDF/print polish, or infra runbook; provider/hardware work still waits for accounts/devices.

## 2026-07-07

- Task: add purchased-product reviews.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260707191500_add_product_reviews/migration.sql`, `apps/api/src/products/*`, `apps/api/test/product-reviews.e2e-spec.ts`, `apps/web/app/product/[id]/ProductClient.tsx`, `apps/web/lib/api/catalog.ts`, `BACKLOG.md`, `PROGRESS.md`, `docs/PHASES.md`.
- Result: product detail now reads live review summary/list from `GET /products/:id/reviews`; authenticated customers can post `POST /products/:id/reviews` only after buying that SKU in a paid/completed order; duplicate reviews for the same product/customer/order are blocked.
- Checks run: targeted Jest for `product-reviews` and `dangerous-endpoint-rbac`; `npm run api:build`; `npm run build -w @alistore/web`; browser QA on product review form submit.
- Outcome: targeted tests passed 2 suites / 4 tests; API build passed; web build passed; browser QA passed with review summary GET 200, review POST 201, refreshed summary GET 200, visible published review, no failed requests, no console errors, and no horizontal overflow; full current-tree Jest passed 76 suites / 248 tests including parallel revenue-range WIP.
- Next step: move to another unblocked backlog item after the parallel revenue-range work is either committed or cleared.

## 2026-07-07

- Task: add POS split payments.
- Files changed: `apps/api/src/payments/payments.service.ts`, `apps/api/src/pos/*`, `apps/api/test/pos-sale.e2e-spec.ts`, `apps/api/test/invariants.e2e-spec.ts`, `apps/web/app/pos/page.tsx`, `apps/web/components/pos/PosCheckout.tsx`, `apps/web/lib/api/pos.ts`, `apps/web/lib/pos-offline.ts`, `apps/web/lib/pos-hardware.ts`, `design_handoff_alistore/reference/api-and-events.md`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: POS now accepts `payments[]` for split tenders, validates the tender sum against the discounted total, records separate payments/ledger events, and only sells IMEI/releases reservations when cumulative received payments cover the order total. Checkout UI supports Split rows; offline payloads and receipts preserve the tender breakdown.
- Checks run: targeted Jest for `pos-sale`; targeted Jest for `invariants`, `payment-intents`, and `refund-approval`; `npm run api:build`; `npm run build -w @alistore/web`; full `npm run api:test`; browser QA on `/pos` split 30000 cash + 70000 card.
- Outcome: POS targeted tests passed 10/10; payment invariant tests passed 3 suites / 9 tests; API build passed; web build passed; full API Jest passed 77 suites / 256 tests; browser QA passed with `POST /api/pos/sale` 201, payload `payments:[cash 30000, card 70000]`, order `paid`, IMEI sold, and screenshot `/tmp/alistore-pos-split-payment.png`. The existing 3000 dev server had stale Next chunks, so browser QA used a clean temporary dev server on 3101.
- Next step: certify physical POS hardware once scanners/receipt printers/bank terminal provider accounts are available, then add campaign delivery integrations.

## 2026-07-07

- Task: add warehouse batch receiving UI/API.
- Files changed: `apps/api/src/inventory/*`, `apps/api/src/authz/authz.model.ts`, `apps/api/test/staff-session-ops.e2e-spec.ts`, `apps/web/components/WarehouseOps.tsx`, `apps/web/lib/api/warehouse.ts`, `design_handoff_alistore/reference/api-and-events.md`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: warehouse/admin/owner staff can call `POST /inventory/receive` to receive an IMEI batch into stock; the mutation creates DeviceUnit rows, one `InventoryMovement(received)`, and `stock.received`/`unit.received` ledger events with actor from the JWT. `/warehouse` now has a batch receiving panel with product, location, grade, and multiline IMEI/SN input.
- Checks run: targeted Jest for `staff-session-ops`; `npm run api:build`; `npm run build -w @alistore/web`; full `npm run api:test`; browser QA on `/warehouse` batch receive.
- Outcome: targeted staff-session test passed 9/9; API build passed; web build passed; full API Jest passed 78 suites / 262 tests; browser QA passed with `POST /api/inventory/receive` 201, payload 2 IMEIs, `received:2`, visible success toast, and screenshot `/tmp/alistore-warehouse-receive.png`.
- Next step: add scanner-assisted inventory count UI, then external POS hardware/campaign integrations when devices/provider accounts are available.

## 2026-07-07

- Task: add scanner-assisted inventory count UI.
- Files changed: `apps/web/components/WarehouseOps.tsx`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: the warehouse inventory panel now accepts scanner-friendly multiline IMEI/SN input, deduplicates scanned values, shows the scan count, and can set the counted quantity from scans before posting the existing `POST /inventory/count` movement.
- Checks run: `npm run build -w @alistore/web`; browser QA on `/warehouse` scanner-assisted count.
- Outcome: web build passed; browser QA passed with duplicate scan input deduped to 2 unique IMEIs, `POST /api/inventory/count` 201, payload `counted:2`, response `expected:2 counted:2 diff:0`, visible success toast, and screenshot `/tmp/alistore-warehouse-scanner-count.png`.
- Next step: remaining backlog is external/provider-gated: physical POS hardware certification and campaign delivery integrations.

## 2026-07-07

- Task: make Excel product import idempotent.
- Files changed: `apps/api/src/import/import.service.ts`, `apps/api/src/import/import.types.ts`, `apps/api/test/import.spec.ts`, `BACKLOG.md`, `docs/PHASES.md`, `docs/CODEX-HANDOFF.md`, `PROGRESS.md`.
- Result: repeated imports of the same product workbook now skip unchanged rows and report `unchanged` instead of re-updating; changed SKUs still update and new SKUs still create, preserving natural-key idempotency by SKU.
- Checks run: targeted Jest for `import`; `npm run api:build`; `git diff --check`.
- Outcome: import tests passed 1 suite / 4 tests; API build passed; repeat workbook produced created 0 / updated 0 / unchanged 1 and kept one Product row.
- Next step: remaining BACKLOG items require external POS hardware/provider accounts; unblocked software polish is PDF/print/auth/social from handoff.

## 2026-07-07

- Task: add shift close photo report.
- Files changed: `apps/web/app/staff/page.tsx`, `apps/web/components/StaffSessionLogin.tsx`, `apps/api/test/evidence.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`, `docs/CODEX-HANDOFF.md`, `PROGRESS.md`.
- Result: Staff app can attach Evidence Vault photos when opening and closing a cash shift; uploads are linked to the shift with `shift_open_photo` / `shift_close_photo` labels. Shared staff login now includes browser autocomplete hints.
- Checks run: targeted Jest for `evidence`; `npm run build -w @alistore/web`; browser QA on `/staff` open/close shift with image uploads; ledger verification query; `git diff --check`.
- Outcome: evidence tests passed 1 suite / 3 tests; web build passed; browser QA passed with `POST /api/shifts/open` 201, two `POST /api/evidence/images` 201 responses, `POST /api/shifts/:id/close` 201, no failed requests/4xx, and ledger `evidence.attached` labels `shift_open_photo` + `shift_close_photo`. Screenshot: `/tmp/alistore-shift-photo-report.png`.
- Next step: remaining unblocked software work is import idempotency/PDF polish; hardware certification and campaign delivery still need external devices/provider accounts.

## 2026-07-07

- Task: add debt reminder notifications.
- Files changed: `apps/api/src/debts/*`, `apps/api/src/audit/event-types.ts`, `apps/api/src/outbox/outbox.relay.ts`, `apps/api/src/reservations/reservations.scheduler.ts`, `apps/api/test/debts.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`, `docs/CODEX-HANDOFF.md`, `PROGRESS.md`.
- Result: open debts due within three days or already overdue can now enqueue idempotent SMS reminders through the transactional outbox, with matching `debt.reminder_queued` ledger events; a pg-boss scheduler can run the sweep daily when `DEBT_REMINDERS_ENABLED=true`. Queue owners now lazy-load `pg-boss`, so disabled schedulers no longer break Jest module imports.
- Checks run: targeted Jest for `debts`, `debt-rbac`, and `reservation-expiry`; `npm run api:build`; `git diff --check`.
- Outcome: targeted Jest passed 3 suites / 11 tests; API build passed; due-soon and overdue reminders produce pending outbox rows and are idempotent on repeat sweep.
- Next step: add shift close photo report.

## 2026-07-07

- Task: build Refund Money Flow / Dispute Center staff UI.
- Files changed: `apps/web/app/approvals/page.tsx`, `apps/web/lib/api/payments.ts`, `apps/web/app/layout.tsx`, `apps/web/app/icon.svg`, `BACKLOG.md`, `docs/PHASES.md`, `PROGRESS.md`.
- Result: Approval Inbox now has a staff refund request form that posts `paymentId`, amount, and reason to the existing approval-gated `POST /payments/:id/refund` endpoint; successful requests reset the form, switch to the requested queue, and show the refund approval row. The app also serves an SVG favicon so browser QA does not report the old `/favicon.ico` 404.
- Checks run: `npm run build -w @alistore/web`; targeted Jest for `refund-approval`; browser QA on `/approvals` refund request.
- Outcome: web build passed; refund approval Jest passed 1 suite / 4 tests; browser QA passed with `POST /api/payments/:id/refund` 202, visible `Возврат денег` row and 25 000 amount, no failed requests, no 4xx responses, and screenshot `/tmp/alistore-refund-request-ui.png`.
- Next step: add debt reminder notifications, then shift close photo report.

## 2026-07-07

- Task: ensure exchanges create visible warranty coverage for the new device.
- Files changed: `apps/api/test/exchange.e2e-spec.ts`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: exchange warranty behavior is now locked by regression coverage: after an exchange, the new sold IMEI appears in `customers.devices()` with warranty coverage derived from the new paid exchange order date.
- Checks run: targeted Jest for `exchange`; `npm run api:build`.
- Outcome: exchange-targeted tests passed 2 suites / 3 tests; API build passed.
- Next step: build Refund Money Flow / Dispute Center staff UI, then debt reminders and shift close photo report.

## 2026-07-10

- Task: align the owner Risk Center with the latest 95-page Claude Design project.
- Files changed: `apps/api/src/reports/{risk-signals,reports.service}.ts`, `apps/api/test/{risk-signals,reports.e2e-spec}.ts`, `apps/web/components/erp/RiskCenterView.tsx`, `apps/web/app/erp/page.tsx`, `BACKLOG.md`, `docs/PHASES.md`.
- Result: Risk Center now derives `repeat_returns` (>3 customer returns in 30 days), `discount_frequency` (>30% discounted POS receipts per staff member), and `write_off_spike` (latest seven-day write-off quantity above the preceding window, minimum 3 units) directly from operational Prisma rows. Command Center routes the signals to CRM, Margin/KPI, and Stock.
- Checks run: targeted Jest `risk-signals` + `reports` (17/17); full API Jest (98 suites / 355 tests); API TypeScript build; Next production build (35 pages); `git diff --check`; live authenticated `GET /api/reports/risks`; browser QA in `/erp` with isolated temporary data and cleanup.
- Outcome: live API returned all three new signals; ERP displayed 2 high + 1 medium with the expected labels/details; clicking repeat returns opened `CRM · Inbox`; temporary owner/customer/orders/returns/write-offs were deleted afterward. Local API was restarted on port 4000 because `start:dev` is a non-watch `ts-node` process.
- Commit: `e2491fc` (`feat(risk): align owner signals with design`).
- Next step: implement the first unblocked extended-module gap from Claude Design, starting with Purchase Order procurement and PO receiving on top of the existing supplier/inventory services.

## 2026-07-12

- Task: align the working POS terminal with `design_handoff_alistore/screens/AliStore POS 2.0.dc.html` without reducing operational behavior.
- Files changed: `apps/web/app/pos/page.tsx`, `apps/web/components/pos/PosCatalog.tsx`, `apps/web/components/pos/PosTicket.tsx`, `e2e/pos-ui.spec.ts`, `BACKLOG.md`, `PROGRESS.md`.
- Result: the terminal now exposes a stable 1180px canonical shell, 420px receipt rail, minimum-safe catalog layout, exact reference scanner prompt, quieter staff action treatment, and durable selectors for visual acceptance. Existing staff login, scanner, catalog sync, offline queue, printing, discounts, split payments, and checkout remain intact.
- Checks run: `git diff --check`; `npm run build -w @alistore/web`; isolated Chromium `npx playwright test e2e/pos-ui.spec.ts` with real staff bootstrap, catalog load, geometry/color/overflow assertions, database rename, reload, and delta-sync verification.
- Outcome: Next production build passed for all 35 routes; POS browser UAT passed 1/1 in 5.0s.
- Next step: continue the handoff-only visual migration with the Staff operational app, then the remaining ERP module screens and native SwiftUI/Compose surfaces.

## 2026-07-12

- Task: align the working Staff application with `design_handoff_alistore/screens/AliStore Сотрудник App 2.0.dc.html` while preserving the extended operational modules.
- Files changed: `apps/web/app/staff/page.tsx`, `e2e/staff-ui.spec.ts`, `BACKLOG.md`, `PROGRESS.md`.
- Result: `/staff` now uses the canonical 402px phone composition, 44px status bar, warm dark shell, four reference primary actions, four-item bottom navigation, back controls on inner views, and the AI task CTA. B2B, device protection, and POS remain reachable as secondary operations; shift evidence, orders, KPI tasks, and trade-in behavior are unchanged.
- Checks run: `git diff --check`; `npm run build -w @alistore/web`; isolated Chromium `npx playwright test e2e/staff-ui.spec.ts` with real staff bootstrap/login, geometry and color assertions, primary/nav count checks, KPI navigation/back flow, and overflow guard.
- Outcome: Next production build passed for all 35 routes; Staff browser UAT passed 1/1 in 3.0s.
- Next step: align the ERP owner shell and module navigation against its canonical desktop handoff, then continue through native SwiftUI/Compose surfaces.

## 2026-07-12

- Task: align the authenticated ERP owner shell with `design_handoff_alistore/screens/AliStore ERP 2.0.dc.html` while retaining post-prototype modules.
- Files changed: `apps/web/app/erp/page.tsx`, `e2e/erp-secure.spec.ts`, `BACKLOG.md`, `PROGRESS.md`.
- Result: `/erp` now uses the canonical centered 1280x820 framed workspace, 230px operational sidebar, 26px top/content alignment, and prototype core navigation order. Pricing, procurement, campaigns, risk, readiness, and Event Ledger remain available in a clearly separated extended-module group.
- Checks run: `git diff --check`; `npm run build -w @alistore/web`; isolated Chromium `npx playwright test e2e/erp-secure.spec.ts` with real owner bootstrap/login, exact shell/sidebar dimensions, module-group presence, protected Reports/AI calls, AI/pricing/readiness navigation, and overflow guard.
- Outcome: Next production build passed for all 35 routes; authenticated ERP browser UAT passed 1/1 in 2.5s with no report/AI 401 or 403 responses.
- Next step: align the first deep ERP module against its dedicated handoff, starting with Finance 2.0, then Warehouse, Product Management, HR, Logistics, CMS, Analytics, Security, Service Center, and Legal.

## 2026-07-12

- Task: close the first App Store-blocking SwiftUI Client parity gap: customer OTP session and authenticated order history.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Shared/{APIClient,CustomerAuthStore,Models}.swift`, `apps/ios/Tests/APIClientTests.swift`, generated `apps/ios/AliStoreNative.xcodeproj/project.pbxproj`, `docs/ARCHITECTURE-GAP-MAP.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: the native Client now requests and verifies SMS OTP, resolves the authenticated principal, persists the complete customer session in device-only Keychain, validates or refresh-rotates it on launch, revokes it on logout, and loads owner-scoped `GET /orders/mine` history with explicit restoring/loading/error/empty states.
- Checks run: `npm run ios:generate`; `npm run ios:build`; `npm run ios:test` on iPhone 17 Pro Simulator; `git diff --check`.
- Outcome: all four SwiftUI application targets and shared framework built successfully; AliStoreCore XCTest passed 4/4 including OTP request contract, bearer-authenticated order contract, ISO-8601 order decoding, catalog decoding, and server-error propagation.
- Next step: implement the native SwiftUI Client cart and signed-in checkout/payment flow, then devices/warranty and push registration.

## 2026-07-12

- Task: implement the native SwiftUI Client cart and authenticated order checkout vertical.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Shared/Models.swift`, `apps/ios/Tests/APIClientTests.swift`, `apps/api/src/orders/orders.controller.ts`, generated iOS project, `docs/ARCHITECTURE-GAP-MAP.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: catalog products can be added to a shared cart, quantities are capped by live availability, the tab displays an item badge, and checkout supports pickup or courier address. Order creation uses the new guarded `POST /orders/mine`; customer ownership and actor come from JWT rather than the submitted customer id, while the request carries an idempotency key and clears the cart only after a decoded server success.
- Checks run: `git diff --check`; `npm run ios:generate`; `npm run ios:build`; `npm run api:build`; `npm run ios:test` on iPhone 17 Pro Simulator.
- Outcome: all four SwiftUI targets built; API TypeScript build passed; AliStoreCore XCTest passed 5/5 including the bearer-authenticated `/orders/mine` request and idempotency header contract.
- Next step: add native online payment-intent selection/reconciliation, then devices/warranty and push registration.

## 2026-07-12

- Task: add provider-neutral online payment intent handoff to the native SwiftUI Client checkout.
- Files changed: `apps/api/src/payments/{payment-intents.service,payments.controller}.ts`, `apps/api/test/payment-intents.e2e-spec.ts`, `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Shared/Models.swift`, `apps/ios/Tests/APIClientTests.swift`, generated iOS project, `docs/ARCHITECTURE-GAP-MAP.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: checkout now offers cash, card, MBank QR, O!Деньги QR, and installment. Online methods call guarded `POST /payments/intents/mine`, which verifies order ownership from JWT before reservation/awaiting-payment transition. The Client displays provider URL/QR and explicitly waits for the signed webhook instead of locally marking the order paid.
- Checks run: `git diff --check`; `npm run api:build`; targeted API Jest `payment-intents.e2e-spec.ts`; `npm run ios:generate`; `npm run ios:build`; `npm run ios:test` on iPhone 17 Pro Simulator.
- Outcome: API build passed; payment integration passed 5/5 including foreign-order rejection and duplicate webhook idempotency; all four SwiftUI targets built; AliStoreCore XCTest passed 6/6 including authenticated intent URL/header/QR decoding.
- Next step: add post-payment order status reconciliation/deep-link refresh, then native devices/warranty and push registration.

## 2026-07-12

- Task: add native SwiftUI Client purchased devices and warranty self-service.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Shared/Models.swift`, `apps/ios/Tests/APIClientTests.swift`, generated iOS project, `docs/ARCHITECTURE-GAP-MAP.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: the signed-in account now lists owner-scoped purchased IMEIs from `GET /customers/me/devices`, shows model/status/coverage days and an existing warranty case, and opens a new problem report through authenticated `POST /warranty`. Loading, network failure, no-device, existing-case, submitting, and success states are explicit.
- Checks run: `git diff --check`; `npm run ios:generate`; `npm run ios:build`; `npm run ios:test` on iPhone 17 Pro Simulator.
- Outcome: all four SwiftUI targets built; AliStoreCore XCTest passed 8/8 including device decoding, bearer-auth transport, warranty request path/idempotency, and case/SLA decoding.
- Next step: finish iOS Client with payment deep-link reconciliation, native APNs registration, and offline command replay before starting the iOS Staff parity wave.

## 2026-07-12

- Task: finish native iOS payment-return routing and server status reconciliation.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Tests/APIClientTests.swift`, generated iOS project, `docs/ARCHITECTURE-GAP-MAP.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: payment intents now carry `alistore://payment-return?orderId=...`; the app routes that callback directly to Orders and reloads owner-scoped status from the API. Returning to foreground from a bank/payment app also triggers reconciliation, so the Client never infers payment success locally.
- Checks run: `git diff --check`; `npm run ios:generate`; `npm run ios:build`; `npm run ios:test` on iPhone 17 Pro Simulator. A brittle raw-body assertion failed twice because URLProtocol does not retain streamed request bodies; it was replaced with structured JSON encoding validation and the full gate was rerun.
- Outcome: all four SwiftUI targets built; final AliStoreCore XCTest passed 8/8, including exact payment return URL encoding. No failed test remains.
- Next step: implement native APNs token registration and offline command replay, then start iOS Staff operational parity.

## 2026-07-12

- Task: add native APNs permission, token capture, and customer-bound registration for the SwiftUI Client.
- Files changed: `apps/ios/Client/{AliStoreClientApp.swift,Client.entitlements}`, `apps/ios/project.yml`, `apps/ios/Shared/Models.swift`, `apps/ios/Tests/APIClientTests.swift`, generated iOS project, `apps/api/src/notifications/push-token.dto.ts`, `apps/api/test/notifications-push-tokens.spec.ts`, `docs/ARCHITECTURE-GAP-MAP.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: the Client requests alert/badge/sound permission, registers with UIApplication/APNs, converts the device token to hex, persists a stable installation id, and binds the token to the signed-in customer through `POST /notifications/push-tokens`. The API accepts native APNs tokens as well as Expo tokens; Expo transport continues filtering only Expo-compatible destinations.
- Checks run: `git diff --check`; `npm run api:build`; targeted notifications registry + Expo transport Jest; `npm run ios:generate`; `npm run ios:build`; `npm run ios:test` on iPhone 17 Pro Simulator.
- Outcome: API build passed; push tests passed 7/7; all four SwiftUI targets built with Client APNs entitlement; AliStoreCore XCTest passed 9/9. Live APNs delivery remains credential/device-gated and is not claimed certified.
- Next step: implement native offline order command replay, then begin iOS Staff operational parity.

## 2026-07-12

- Task: complete native SwiftUI Client offline order persistence and replay.
- Files changed: `apps/api/prisma/{schema.prisma,migrations/20260712171500_add_order_idempotency}`, `apps/api/src/orders/*`, `apps/api/test/orders-account.e2e-spec.ts`, `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Shared/{Models,OfflineQueue}.swift`, `apps/ios/Tests/APIClientTests.swift`, `docs/ARCHITECTURE-GAP-MAP.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: checkout now persists an order command after a network failure with its original idempotency key, exposes queued/syncing/conflict/failed states and manual retry, and replays retryable commands when the authenticated app returns to foreground. The API stores the order idempotency key and returns the original order without emitting a duplicate Event Ledger entry.
- Checks run: development migration; safe test-schema sync because the historical test database predates Prisma migration baselining; API production build; targeted order-account E2E; all-target iOS generation/build; AliStoreCore XCTest on iPhone 17 Pro Simulator.
- Outcome: order E2E passed 3/3, including cross-customer idempotency isolation; all four SwiftUI targets built; XCTest passed 10/10. Live APNs delivery, pixel/device smoke and App Store signing remain external or subsequent gates and are not claimed complete.
- Next step: run the final Client visual/simulator smoke, then implement the iOS Staff operational vertical.

## 2026-07-12

- Task: replace the native SwiftUI Staff shift placeholder with a live cash-shift lifecycle.
- Files changed: `apps/ios/Staff/AliStoreStaffApp.swift`, `apps/ios/Shared/Models.swift`, `apps/ios/Tests/APIClientTests.swift`, `docs/ARCHITECTURE-GAP-MAP.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: authenticated staff can load the server-owned current shift, open a point with starting cash, refresh full payment detail, see expected drawer cash, enter counted cash, supply the mandatory discrepancy reason and close the shift. Loading, unavailable, retry and off-shift states are explicit; server JWT/RBAC ownership and Event Ledger rules remain authoritative.
- Checks run: `git diff --check`; `npm run ios:generate`; all-target `npm run ios:build`; `npm run ios:test` on iPhone 17 Pro Simulator.
- Outcome: Client, Staff, Courier and POS targets built; AliStoreCore XCTest passed 12/12, including shift decoding, bearer transport, expected-cash calculation and open/close payload contracts.
- Next step: implement the native Staff order queue with detail, reserve/fulfill/status actions and role-aware server failures.

## 2026-07-12

- Task: implement the native SwiftUI Staff fulfillment queue and guarded order actions.
- Files changed: `apps/ios/Staff/AliStoreStaffApp.swift`, `apps/ios/Shared/Models.swift`, `apps/ios/Tests/APIClientTests.swift`, `docs/ARCHITECTURE-GAP-MAP.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: Staff now loads server-filtered order queues, displays fulfillment and item/IMEI detail, assigns serialized stock through `fulfill`, and advances paid orders through picking, packed, pickup/courier handoff and completion using the server state machine. Every action uses staff JWT and reloads authoritative state; network, empty, loading and RBAC/domain failures are surfaced without locally assigning order or stock status.
- Checks run: `git diff --check`; `npm run ios:generate`; all-target `npm run ios:build`; `npm run ios:test` on iPhone 17 Pro Simulator.
- Outcome: all four SwiftUI targets built; AliStoreCore XCTest passed 14/14, including authenticated queue query, fulfillment response and transition contracts.
- Next step: add native Staff Customer 360 and warranty/support queues, then scanner and Evidence Vault capture.

## 2026-07-12

- Task: add native SwiftUI Staff Customer 360 and guarded warranty operations.
- Files changed: `apps/ios/Shared/{APIClient,Models}.swift`, `apps/ios/Staff/AliStoreStaffApp.swift`, `apps/ios/Tests/APIClientTests.swift`, `docs/ARCHITECTURE-GAP-MAP.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: Staff can open an authenticated customer aggregate by internal ID and inspect role-masked contact data, LTV, consent, segments, purchases, paid spend, open debt, warranty cases and support tickets. Warranty rows expose SLA/overdue state and only the next permitted server transition; typed PATCH transport submits the action and reloads the authoritative aggregate.
- Checks run: `git diff --check`; `npm run ios:generate`; all-target `npm run ios:build`; `npm run ios:test` on iPhone 17 Pro Simulator.
- Outcome: all four SwiftUI targets built; AliStoreCore XCTest passed 16/16, including Customer 360 masked-PII decoding, authenticated transport and warranty PATCH contract.
- Next step: implement native barcode/IMEI scanner input and Evidence Vault image capture/upload for Staff operations.

## 2026-07-12

- Task: implement native Staff barcode/IMEI scanning and Evidence Vault image upload.
- Files changed: `apps/ios/Staff/{AliStoreStaffApp,StaffScannerView}.swift`, `apps/ios/Staff/Info.plist`, `apps/ios/Shared/{APIClient,Models}.swift`, `apps/ios/Tests/APIClientTests.swift`, `apps/ios/project.yml`, generated Xcode project, `docs/ARCHITECTURE-GAP-MAP.md`, `BACKLOG.md`, `PROGRESS.md`.
- Result: Staff can scan EAN-8, EAN-13, Code128 and QR values through AVFoundation or enter IMEI manually; select the target operation, capture/select a JPEG and upload authenticated multipart evidence. The API derives the ledger actor from Staff JWT, validates the entity and returns the stored WebP asset; simulator-safe manual/photo fallbacks remain available.
- Checks run: `git diff --check`; repeated `npm run ios:generate`; all-target `npm run ios:build`; `npm run ios:test` on iPhone 17 Pro Simulator. Swift 6 initially rejected AVFoundation delegate isolation and the first multipart test relied on unavailable transported `httpBody`; both gates were corrected and fully rerun.
- Outcome: all four SwiftUI targets built; final AliStoreCore XCTest passed 17/17, including multipart fields, file metadata, bearer header and Evidence response decoding. Real camera focus/scanning and photo upload still require physical-device certification.
- Next step: add Staff support queue actions and native push routing, then run the Staff simulator UI smoke and visual pass.

## 2026-07-12

- Task: start Phase 0 with a full release baseline, deterministic browser setup and the first API IDOR closure.
- Files changed: order/customer controllers and security regressions, authenticated account/ERP API calls, Playwright staff seeding helpers/specs, `BACKLOG.md`, `docs/READINESS.md`, `PROGRESS.md`.
- Result: public order detail no longer exposes items/payments; customer access is owner-scoped and staff access requires an active permitted role. Marketing consent now requires JWT, rejects foreign customers and junior staff, and always records the token principal instead of body `actor`. Browser tests seed staff directly in the isolated E2E database, so the one-time production bootstrap throttle remains enabled without order-dependent 429 failures.
- Checks run: targeted order/PII HTTP suites; API build; web production build; full `mvp:verify`; all-target iOS build/XCTest; four-APK Android build and unit/Lint gate; `git diff --check`.
- Outcome: API 105/105 suites and 383/383 tests; Playwright 19/19; iOS 4 targets and XCTest 17/17; Android 4 APK build plus unit/Lint green. External readiness remains blocked by 9 credential groups and one physical POS certification, exactly as reported by the secret-safe readiness gate.
- Next step: finish Phase 0 with scoped guest capability tokens for checkout/support/warranty/trade-in/evidence, then repeat IDOR and full release gates.

## 2026-07-12

- Task: implement the first production-network prerequisite: scoped guest capabilities for web and Telegram checkout.
- Files changed: guest capability signer/verifier, customer/order/payment controllers, storefront/Telegram checkout API clients, capability/rate-limit tests, activation/backlog/progress docs.
- Result: `POST /customers` returns a signed 30-minute capability bound to one customer and checkout-only scopes. Public order creation requires matching `orders:create`, records a guest principal and accepts a stable idempotency key; public payment intent requires `payments:intent` and resolves the order through customer ownership. Customer JWT endpoints remain unchanged.
- Checks run: API build; web production build; capability and public-rate-limit Jest 6/6; Playwright desktop/phone checkout 2/2; Telegram Mini App checkout 1/1; `git diff --check`.
- Outcome: valid checkout and Telegram flows remain green; missing/tampered/wrong-owner capabilities fail closed in the capability contract. Support, warranty, trade-in and Evidence entity ownership remain the next Phase 0 security iteration.
- Next step: extend capability scopes and server-side ownership checks to support, warranty, trade-in and Evidence Vault before generating managed-cloud deployment manifests.

## 2026-07-14

- Task: connect approved paid-repair estimates to an authoritative POS payment boundary.
- Files changed: Payment/ServiceWorkOrder Prisma relation and migrations; Service Center payment DTO/controller/transaction and Ledger event; approval refund provenance; typed web client; ERP-to-POS handoff, reusable split checkout and customer payment state; concurrency/API/browser regressions; shared cleanup, backlog, readiness and traceability documents.
- Result: an authorized cashier pays only an approved positive external-repair estimate through their own open shift at the server-derived intake point. The transaction locks the work order and shift-close boundary, requires an exact one/split tender total, records first-class service-targeted payments, preserves stable idempotency replay and prevents two competing settlements. Refund compensation retains the service target and original tender, is capped per tender under row/work-order locks, and net paid state remains correct after partial/full refund and repayment. ERP links the payable work order to POS without a duplicate paid flag, synthetic order, stock or IMEI mutation.
- Checks run: Prisma validation/generation and 56 clean migrations; executable pre-migration refund/point backfill regression; targeted Service Center/refund suites 6/6; API and Next production builds; Service Center Playwright 2/2; complete `npm run ecosystem:verify` with 119/119 Jest suites, 473/473 API tests, 34/34 Playwright, all four SwiftUI target builds, 31/31 XCTest, four Compose APK builds, JVM tests and Android Lint; independent code review and `git diff --check`.
- Outcome: paid Service Center settlement is integrated across ERP, POS, finance ledger and customer site. Production certification remains blocked by 12 external credential/manual groups; full Service Center still needs parts, technician execution/SLA, loaner custody and 30-day repair warranty.
- Next step: implement Service Center parts reservation/consumption and technician execution transitions with SLA evidence, then add loaner custody and post-repair warranty.

## 2026-07-14

- Task: make loyalty checkout, earning and refund compensation server-authoritative.
- Files changed: Prisma loyalty/order schema and migration, customer loyalty ledger, order/payment/approval services and guards, web cart/account/checkout API clients and session error handling, API/browser regressions, readiness/gap-map/backlog documentation.
- Result: checkout now calculates canonical catalog prices, delivery fees and promo discounts on the API; authenticated orders redeem points atomically under a per-customer PostgreSQL advisory lock, completion earns one percent exactly once, and refunds restore redeemed points while clawing back earned points. Gift-card and payment paths are owner-scoped, the web no longer exposes a fixed demo balance, and zero-total loyalty orders complete without creating a fake payment.
- Checks run: Prisma schema validation/generation and isolated test DB reset; targeted loyalty/payment/IDOR Jest; API and Next production builds; targeted Playwright; full `npm run mvp:verify`; `git diff --check`.
- Outcome: full gate passed with 110/110 API suites and 428/428 tests, 23/23 Playwright flows, API/Web builds and mobile typecheck. External readiness correctly remains blocked by 12 credential/manual certification groups and no certification flag was claimed.
- Next step: close the remaining native iOS Staff support/task/push parity, then implement the complete iOS Courier vertical.

## 2026-07-14

- Task: complete native SwiftUI Staff tasks, support operations and APNs/deep-link routing.
- Files changed: iOS Staff work surface and app delegate, shared native DTOs, APNs entitlement/project generation, API contract tests, backlog and readiness/gap-map documentation.
- Result: authenticated Staff now switches between fulfillment orders, PostgreSQL-assigned tasks and the support queue; task transitions, ticket transitions and escalation always use the stored staff JWT and reload server-authoritative state. The app registers an APNs token with `scope=staff`, routes task/support notifications into the correct work mode and preserves the canonical four-tab shell.
- Checks run: `git diff --check`; `npm run ios:generate`; all-target `npm run ios:build`; `npm run ios:test` on iPhone 17 Pro Simulator; install/launch/screenshot smoke for `kg.alistore.staff` on the booted iPhone 17 Pro Simulator.
- Outcome: Client, Staff, Courier and POS targets built; AliStoreCore XCTest passed 20/20; Staff installed and launched to its login screen without crash or overflow. Live APNs delivery and physical camera/scanner behavior remain device/credential certification gates and are not claimed complete.
- Next step: replace the iOS Courier route/COD shell with the complete owner-bound delivery, Evidence, offline replay and push-routing vertical.

## 2026-07-14

- Task: replace the native SwiftUI Courier shell with the complete owner-bound delivery, Evidence, offline replay, push-routing and COD handover vertical.
- Files changed: iOS Courier app/work surface, shared API/models/SwiftData queue and contract tests; Courier Prisma schema/migration/service/controller, pure replay rules and RBAC regressions; Android Courier handover contract; backlog, readiness, gap-map and API reference.
- Result: Courier now loads only JWT-owned assignments, opens maps/calls, performs server-owned start/deliver/fail transitions, uploads order Evidence, routes APNs deep links, exposes queued/syncing/conflict/failed recovery and submits COD with a stable per-run idempotency key. The API serializes handover by run, persists the canonical key/payload, replays an exact retry once, rejects key reuse and enforces courier ownership before both execution and replay.
- Checks run: Prisma reset/schema validation and API production build; targeted Courier replay/concurrency/RBAC suites 15/15; full API 111/111 suites and 433/433 tests; four Android APK builds, JVM tests and Lint; all four SwiftUI simulator targets; XCTest 23/23 on iPhone 17 Pro; Courier install/launch/screenshot smoke on the same simulator; web production build, mobile typecheck, Playwright 23/23 and full `npm run mvp:verify`; `git diff --check`.
- Outcome: the full Courier software gate is green. The gate found and fixed a real Prisma advisory-lock deserialization error (`$queryRaw` on PostgreSQL `void`), and the full browser run exposed a hydration race in the admin-product login test; both were corrected and the complete gate was rerun successfully. Live APNs delivery and physical-device maps/camera/network behavior remain external certification gates and are not claimed complete.
- Next step: implement the complete iOS POS vertical with server-bound shift, catalog sync, scanning, split tender, approval, receipt, return/exchange and offline replay.

## 2026-07-14

- Task: complete the native SwiftUI POS software vertical and align its simulator shell to the canonical dark POS handoff.
- Files changed: iOS POS application, sale and operations surfaces, camera privacy configuration and generated project; shared API date decoding, POS DTOs and SwiftData queue; AliStoreCore contract tests; backlog, readiness and architecture gap-map documentation.
- Result: cashier-scoped staff can load the live catalog, build a stock-capped cart, scan SKU/barcode or select an exact IMEI, reconcile shifts, accept cash/card/MBank/O!Money split tenders, park and retry approval-gated discounts with the original sale identity, persist/replay offline sales, render and print the server receipt, and perform return, refund and exchange operations. Business status remains server-authoritative and replay retains the original idempotency key.
- Checks run: targeted AliStorePOS build; all-target `npm run ios:build`; `npm run ios:test`; POS install/launch/relaunch and screenshot inspection on iPhone 17 Pro Simulator; full `npm run mvp:verify`; `git diff --check`.
- Outcome: Client, Staff, Courier and POS SwiftUI targets build; AliStoreCore XCTest passes 29/29; POS launches in the prototype-aligned dark shell without crash or visible overflow; API 111/111 suites and 433/433 tests, web/API production builds, mobile typecheck and Playwright 23/23 are green. Live scanner, ESC/POS printer and bank-terminal behavior remain physical certification gates and are not claimed complete.
- Next step: implement the first unblocked ERP Wave A vertical, Finance 2.0 period budgets and plan-vs-actual reporting, while owner-controlled cloud and device certification remain external.

## 2026-07-14

- Task: add Finance 2.0 period budgets and server-authoritative plan-vs-actual reporting to ERP.
- Files changed: Prisma finance budget state/command models and migration; Finance DTO/controller/service and Event Ledger catalogue; API integration/concurrency tests; web Finance API, responsive ERP planning surface and Playwright flow; shared E2E reset helper; backlog/readiness/gap-map documentation.
- Result: owner/admin can set or revise a category budget for a month and optional point using a stable idempotency command. PostgreSQL serializes concurrent changes, increments the budget version and records `finance.budget_set`; the report aggregates only paid expenses incurred in the selected period and returns plan, fact, remaining amount and usage by category. ERP exposes month/point filters, summary totals, progress rows and a budget form without replacing the existing P&L and expense lifecycle.
- Checks run: Prisma format/validation/generation; API and Next production builds; targeted Finance API 4/4 including RBAC, replay and concurrent updates; targeted Playwright Finance flow; browser screenshot inspection at 1280x720; full `npm run mvp:verify`; `git diff --check`.
- Outcome: API 111/111 suites and 435/435 tests, Playwright 23/23, API/Web builds and mobile typecheck are green. This closes period budgets/plan-fact only; cashflow forecast, cash collection, supplier calendar and currency/branch settlement remain later Finance 2.0 scope.
- Next step: implement product variants and bundles with atomic component-stock validation across catalog, checkout and POS.

## 2026-07-14

- Task: implement first-class product variants across ERP, catalog and customer product pages.
- Files changed: Product Prisma schema/migration; product and catalog DTO/services/search indexing; ERP product form/list and typed clients; desktop/mobile product detail; API and Playwright regressions; backlog/readiness/gap-map documentation.
- Result: each sellable variant remains an independent SKU with its own server-authoritative price and DeviceUnit stock, while optional `variantGroup` links sibling colors/storage options and optional `barcode` is globally unique. Owner/admin ERP can create and edit both fields, Postgres/Meilisearch can discover them, and desktop/mobile storefront cards switch to the actual sibling SKU instead of presenting inert attribute chips. Product create/update remains RBAC-protected and Ledger-backed.
- Checks run: Prisma validation/generation and isolated test DB sync; API/Next production builds; targeted product/catalog Jest 6/6; targeted ERP/storefront Playwright 5/5; desktop/mobile screenshot inspection at 1440px and 402px with mobile `scrollWidth=402`; full `npm run mvp:verify`; `git diff --check`.
- Outcome: API 111/111 suites and 435/435 tests, Playwright 24/24, API/Web builds and mobile typecheck are green. External readiness remains blocked by the same 12 credential/manual certification groups. This iteration completes variant families only; bundles still require explicit component expansion, atomic reservation/deduction and bundle-aware returns.
- Next step: implement product bundles with atomic component availability/reservation/sale across checkout and POS, then expose bundle composition in ERP and storefront.

## 2026-07-14

- Task: implement virtual product bundles as an atomic ERP-to-storefront-to-POS vertical.
- Files changed: Product bundle composition and order allocation Prisma schema/migration; product, catalog, order, payment, POS and procurement domain services; ERP product form/list and typed clients; desktop/mobile product detail; API concurrency/idempotency/RBAC regressions; Playwright admin/storefront coverage; backlog/readiness/gap-map documentation.
- Result: owner/admin can define a flat virtual bundle from real component SKUs; catalog and ERP derive its availability from the scarcest component. Checkout and POS retain one customer-facing bundle line while atomically reserving and selling every serialized component, calculating margin from component cost and recording allocation plus unit events. Exact retries remain idempotent, concurrent final-stock fulfillment has one winner, and nested bundles, direct-stock conversion and direct PO procurement are rejected.
- Checks run: Prisma schema validation/generation and isolated test DB reset; targeted bundle/procurement/product API 10/10 followed by strengthened bundle/procurement 9/9; targeted ERP/storefront Playwright 6/6; API and Next production builds; isolated PII flake confirmation 4/4; repeated full `npm run mvp:verify`; `git diff --check`.
- Outcome: repeated full gate passed with 112/112 API suites and 440/440 tests, 25/25 Playwright flows, API/Web production builds and mobile typecheck. External readiness remains correctly blocked by 12 credential/manual groups. Serialized return/restock of ordinary and bundled units remains explicit follow-up scope rather than being claimed complete.
- Next step: implement quantity/consignment warehouse foundations and serialized return/restock invariants before extending HR schedules and logistics capacity.

## 2026-07-14

- Task: perform a proof-oriented whole-ecosystem audit and establish one repeatable web/API/iOS/Android verification gate.
- Files changed: 23-handoff completion audit, reusable master engineering prompt, root ecosystem verifier and package scripts, synchronized ERP/readiness/backlog documents, and stable loopback listeners for two intermittently failing Nest/Supertest RBAC suites.
- Result: every tracked handoff and human role now has an explicit implemented/partial/missing/external status with required evidence. The new verifier composes `mvp:verify`, all-target SwiftUI build, AliStoreCore XCTest, four Compose APK builds, JVM/Lint and optional connected Compose tests. It explicitly refuses to present shared-core/native software checks as XCUITest, physical-device or provider certification.
- Checks run: script syntax and package JSON parse; `git diff --check`; two historically flaky RBAC suites repeated five times (35/35 request scenarios); first `ecosystem:verify:ui` exposed missing connected-test `JAVA_HOME`; corrected standalone Android API 36 connected gate 24/24; complete repeated `npm run ecosystem:verify:ui`.
- Outcome: final whole-software gate passed: API/Web production builds, 112/112 Jest suites and 440/440 tests, 25/25 Playwright flows, four iOS targets, 29/29 XCTest contracts, four Android APKs, JVM/Lint and 24/24 connected Compose tests. External readiness remains blocked by 12 owner credential/manual groups; iOS app-specific XCUITest and physical hardware/device certification remain explicit gaps.
- Next step: implement the highest-priority functional gap in the audit, quantity/consignment warehouse with mixed serialized/quantity checkout and POS reconciliation, then add app-specific native E2E targets.

## 2026-07-14

- Task: implement authoritative quantity inventory across ERP, storefront checkout and POS.
- Files changed: Product/InventoryBalance/OrderQuantityAllocation Prisma models and migrations; product, inventory, catalog, order, payment, reservation and POS domain services; Event Ledger catalogue; ERP product and warehouse interfaces; typed web clients; API concurrency/RBAC/idempotency regressions; Playwright warehouse role flow; readiness/audit/backlog documents.
- Result: owner/admin selects `serialized` or `quantity` per product; warehouse receiving atomically increments one location balance; catalog availability sums `onHand - reserved`; web fulfillment and POS reserve the same rows with one concurrent winner; full payment consumes quantity once; cancellation and expiry compensate the reservation; an unstocked serialized SKU can no longer bypass inventory as an accessory. ERP automatically switches receiving between IMEI batch and quantity input, while inventory count reads the correct source.
- Checks run: Prisma validation/generation and dev/test schema synchronization; targeted API 28/28 plus reservation expiry 4/4; API and Next production builds; warehouse Playwright desktop/mobile flow; isolated checkout load-race regressions repeated 4/4; repeated full `npm run ecosystem:verify`; `git diff --check`.
- Outcome: the first ecosystem run exposed two existing Playwright navigations waiting indefinitely for the browser `load` event after the page had rendered; both were bound to `domcontentloaded`, repeated in isolation and then verified by the complete rerun. Final gate passed with 113/113 API suites and 448/448 tests, 26/26 Playwright flows, four iOS target builds, 29/29 XCTest contracts, four Android APK builds, JVM tests/Lint, API/Web builds and mobile typecheck. Android connected UI was not repeated because this vertical changes backend/web only; the previous ecosystem baseline remains 24/24. Production external readiness remains blocked by the same 12 credential/manual groups. Quantity transfer/write-off/restock, consignment ownership/payout, completeness, missort and markdown remain explicit follow-up work.
- Next step: implement consignment stock ownership, commission and payout reconciliation, then complete quantity transfer/adjustment/returns and serialized bundle restock.

## 2026-07-14

- Task: implement serialized consignment ownership, commission accrual and owner payout reconciliation across warehouse, storefront checkout and POS.
- Files changed: Prisma consignment item/payout schema and migration; inventory DTO/controller/service and RBAC; shared sale-accrual domain helper; payment and zero-total order completion paths; Event Ledger catalogue; responsive warehouse consignment UI and typed client; API/RBAC/browser regressions; readiness/audit/backlog documentation.
- Result: warehouse staff can idempotently receive a third-party-owned serialized unit with owner, contact and basis-point commission while the unit remains ordinary sellable IMEI stock. The web/POS payment transaction changes the IMEI to sold and accrues immutable sale, commission and owner amounts exactly once. Owner/admin can batch only one owner's completed, return-free sales, then mark the payout paid with a globally stable external key; warehouse staff can receive/read but cannot pay. Virtual-bundle products/components are rejected until fair component revenue allocation exists.
- Checks run: Prisma format/validation/generation and isolated test DB reset; API and Next production builds; consignment domain plus staff RBAC suites 16/16; warehouse owner Playwright receive-to-payout flow including 390px overflow; full API gate 114/114 suites and 453/453 tests; affected browser flows repeated 4/4; complete Playwright 27/27; `git diff --check`.
- Outcome: the first complete run exposed two test-infrastructure defects rather than domain failures: health readiness observed the cumulative Jest process heap, and a new browser login consumed the shared staff brute-force budget while checkout raced its address fetch. The health test now mocks only the process-memory indicator while asserting the unchanged 1.5 GiB production threshold; browser setup uses a seeded signed staff session and waits for the successful owner-address response. Repeated affected and complete gates are green. Quantity consignment, return reversal after accrued sale, quantity transfer/adjustment/return and serialized bundle restock remain explicit follow-up scope.
- Next step: implement quantity transfer/adjustment/return and compensating consignment return accounting before serialized bundle restock.

## 2026-07-14

- Task: make quantity transfer, write-off and adjustment authoritative across ERP, approvals and storefront stock.
- Files changed: inventory movement schema/migration, DTO/controller/service, approval executors, warehouse typed client and responsive operations UI, API/browser regressions, readiness/backlog documents.
- Result: quantity stock moves between locations once under a stable idempotency key; retries cannot duplicate or mutate a different command. Warehouse write-off/adjustment requests include location and direction, remain owner-approved, and now atomically change `InventoryBalance` without consuming reserved stock. ERP exposes receive, transfer, adjustment and count in one responsive surface.
- Checks run: Prisma format/generate and test DB sync; API and Next production builds; dangerous-action and quantity inventory integration suites; Playwright warehouse receive → transfer → approval-request flow at desktop and 390px; complete `npm run mvp:verify`; `git diff --check`.
- Outcome: full gate is green with 114/114 API suites and 455/455 tests plus 27/27 Playwright flows. Browser QA found and fixed a real four-column overlap. The full verifier also exposed and fixed shared-DB fixture cleanup and stale `.next-e2e` chunk reuse. External readiness remains correctly blocked by 12 credential/manual groups. Return restock and consignment compensation remain the next isolated transaction boundary.
- Next step: implement refund-bound return reconciliation that restores quantity/IMEI exactly once and records consignment owner compensation.

## 2026-07-14

- Task: implement refund-bound full-order return reconciliation across customer request, ERP approval/refund, warehouse stock and consignment accounting.
- Files changed: Return/consignment Prisma schema and migration; return state machine, payment refund binding and approval executor; inventory adjustment visibility; Event Ledger catalogue; ERP Return Desk and Refund Money Flow; warehouse compensation UI; API and Playwright regressions; backlog, master plan/prompt and completion audit.
- Result: staff can no longer assign `paid` or skip return states. A refund may bind only to a processing return for the same order; the approved executor records the compensating payment and sets `paid` only when the order is fully refunded. Warehouse reconciliation is row-locked and replay-safe, restores quantity stock plus direct and virtual-bundle IMEIs exactly once, reverses unpaid consignment liabilities, and creates a visible owner compensation obligation without erasing paid payout history.
- Checks run: Prisma format/validate/generate and isolated test DB reset; API and Next production builds; targeted return/refund/consignment suites 11/11; targeted ERP Playwright flow; complete `npm run mvp:verify`; `git diff --check`.
- Outcome: final repeated full gate is green with 115/115 API suites and 458/458 tests plus 27/27 Playwright flows. The repeat exposed order-dependent test cleanup between trade-in and consignment suites; dependent rows are now explicitly removed and the complete gate was rerun. Production readiness remains blocked by the same 12 external credential/manual groups. This iteration supports full-order returns; line-level partial returns require an explicit allocation model and remain tracked.
- Next step: implement quantity-tracked consignment, then close HR schedules and logistics zones/slots/dispatch before ERP Waves B/C.

## 2026-07-14

- Task: implement quantity-tracked consignment as a complete ERP-to-storefront accounting vertical.
- Files changed: Prisma quantity consignment lots/allocations/adjustments and migration; inventory DTO/controller/service and shared accounting helpers; order reserve/cancel/sale, payment, reservation expiry, transfer, approved write-off protection and return reconciliation; typed warehouse client and responsive ERP operations; API/browser regressions; backlog, completion audit, master plan and engineering prompt.
- Result: warehouse staff can idempotently receive a homogeneous third-party-owned lot while `InventoryBalance` remains the only customer availability source. Customer/POS reservations atomically attribute owner quantities FIFO, cancellation/expiry releases them, payment accrues commission and owner liability once, inter-location transfer moves ownership with stock, and owner/admin payout supports serialized and quantity positions. Full refund restores aggregate stock, creates a returned owner lot, reverses an unpaid batch or records a paid-owner compensation obligation. Ordinary write-off/decrease cannot silently consume owner-owned availability.
- Checks run: Prisma format/validation/generation, clean-database application of all 44 migrations and isolated test DB sync; API and Next production builds; quantity/serialized consignment, quantity inventory and return suites 17/17; warehouse Playwright desktop/mobile flow; repeated complete `npm run mvp:verify`; `git diff --check`.
- Outcome: complete gate is green with 116/116 API suites and 460/460 tests plus 27/27 Playwright flows. Production readiness remains blocked by the same 12 external credential/manual groups. Native builds were not repeated because no native contract or source changed; their previously verified software baseline remains recorded separately.
- Next step: define and implement line-level partial-return allocation/refund/restock, then complete HR schedules and logistics zones/slots/dispatch.

## 2026-07-14

- Task: implement line-level partial-return pricing, refund binding and selected-stock reconciliation across customer web and ERP.
- Files changed: Return/ReturnItem and allocation Prisma models plus migrations; return quote/reconciliation service, payment and approval refund rules, quantity-consignment payout accounting; customer return selector and ERP refund preparation UI; API/browser regressions; backlog and completion audit.
- Result: customers select concrete order lines and quantities while the API alone calculates the refund. Merchandise discounts and loyalty are allocated deterministically, cumulative rounding cannot leak value, delivery is refunded only when all order quantities have cumulatively returned, and active returns cannot exceed purchased quantities. ERP receives the exact quote and original payment automatically; approval rejects any altered amount. A partial refund marks its Return paid without falsely marking the whole Order refunded. Warehouse reconciliation restores only selected quantity, direct IMEI and bundle components, tracks cumulative returned allocation quantities and proportionally reverses unpaid or already-paid quantity-consignment owner liability.
- Checks run: Prisma format/validation/generation; clean-database application of all 47 migrations, dev migration application and isolated test schema reset; API and Next production builds; targeted return/consignment/RBAC tests 10/10; targeted browser customer-to-ERP refund flow; full API 116/116 suites and 463/463 tests; repeated full `npm run mvp:verify` with 27/27 Playwright; `git diff --check`.
- Outcome: the full web/API MVP gate is green. The first complete run exposed cleanup dependencies introduced by the new relational ReturnItem model; cascade semantics were made explicit and the complete gate was rerun successfully. External readiness remains blocked by 12 credential/manual groups and no production certification is claimed.
- Next step: implement HR schedules/absence workflow and logistics zones/slots/dispatch capacity, then continue ERP Waves B/C.

## 2026-07-14

- Task: implement the first authoritative HR scheduling, attendance and absence vertical across API, ERP and staff identity.
- Files changed: HR Prisma schema/migration, NestJS DTO/controller/service/module, RBAC and Event Ledger catalogue, typed web client, prototype-aligned ERP HR view, API integration tests, browser E2E, shared test cleanup, backlog and completion audit.
- Result: owner/admin can assign one planned shift per staff/day and review a seven-day point schedule; active staff sees only their own plan, opens/closes only their own attendance with stable idempotency keys, and requests an absence. Owner/admin decisions are server-authoritative; an approved absence blocks conflicting attendance and schedule creation. The weekly timesheet derives completed shifts, worked minutes, lateness and overtime from immutable plan/attendance timestamps without reusing financial `CashShift` as a second attendance truth.
- Checks run: Prisma validation/generation; 48 migrations applied to dev and isolated test schema synchronization; targeted HR API 2/2; API and Next production builds; targeted owner/staff Playwright; complete `npm run mvp:verify`; `git diff --check`.
- Outcome: full web/API gate is green with 117/117 API suites and 465/465 tests plus 28/28 Playwright flows. Production readiness remains blocked by the same 12 external credential/manual groups. HR is still partial: schedule edit/cancel, cash-shift handover, payroll posting and native Staff attendance controls remain explicit follow-up work.
- Next step: implement logistics zones, delivery slots/capacity and the owner dispatch board, then return for the remaining HR handover/payroll contour.

## 2026-07-14

- Task: integrate authoritative delivery capacity from ERP through the customer checkout and courier dispatch flow.
- Files changed: logistics Prisma schema/migration; NestJS logistics DTO/controller/service/module, order capacity locking, RBAC and Event Ledger; ERP logistics workspace and typed client; customer checkout zone/slot selection and server tariff binding; API and browser regressions; backlog/readiness/completion audit.
- Result: owner/admin can create priced delivery zones and dated capacity slots, while the public site shows only current availability, submits the selected zone/slot and uses the server-owned tariff. Order creation locks the slot before counting active reservations, rejects over-capacity races and releases capacity through normal cancellation status. The dispatch board groups paid/packed courier orders, assigns an active courier and creates the existing native-compatible Courier run.
- Checks run: Prisma validation/generation and dev/test schema application; targeted logistics API and ERP browser flows; customer checkout capacity/reservation browser flow; API and Next production builds; complete `npm run mvp:verify`; `git diff --check`.
- Outcome: full web/API gate is green with 118/118 API suites and 466/466 tests plus 30/30 Playwright flows. ERP-to-site delivery pricing, capacity and order linkage are now executable and tested. Production readiness remains blocked by the same 12 external credential/manual groups; route optimization, exception rescheduling and live tracking remain later logistics scope.
- Next step: complete HR schedule edit/cancel, cash-shift handover and attendance-derived payroll posting before ERP Wave B service-center work.

## 2026-07-14

- Task: make planned HR schedules safely editable and cancellable from ERP.
- Files changed: HR schedule Prisma fields and immutable command journal migration; HR DTO/controller/service and Ledger events; typed web client and ERP schedule controls; API/browser regressions and shared database cleanup; backlog/readiness/completion audit.
- Result: owner/admin can edit point/date/time or cancel an unstarted planned shift. Every command has a stable replay record and exact response snapshot, RBAC rejects staff edits, started shifts cannot change, approved absences and same-day conflicts remain enforced, and cancelled shifts cannot be opened by the employee. ERP exposes edit/save/cancel states and keeps cancelled plans visible for audit.
- Checks run: Prisma format/validation/generation and dev/test schema application; targeted HR API 3/3; API and Next production builds; full owner edit/cancel/attendance Playwright journey; complete `npm run mvp:verify`; `git diff --check`.
- Outcome: full web/API gate is green with 118/118 API suites and 467/467 tests plus 30/30 Playwright flows. Production readiness remains blocked by the same 12 external credential/manual groups. Cash-shift handover, attendance-derived payroll posting and native Staff attendance remain explicit follow-up work.
- Next step: implement cash-shift handover as a CashShift-owned transaction without creating a second drawer source of truth.

## 2026-07-14

- Task: replace the empty ERP HR handover tab with an authoritative cash-shift transfer flow.
- Files changed: CashShiftHandover Prisma model/migration; shift DTO/controller/service and RBAC; typed HR web client and operational ERP handover UI; shift concurrency and owner browser E2E; shared cleanup, backlog/readiness/completion audit and master plan.
- Result: a handover never rewrites the old shift owner. One PostgreSQL transaction locks the command/source/recipient, reconciles expected versus counted cash, closes the source shift, opens the recipient shift with the counted drawer, persists an immutable handover and appends `shift.closed`, optional `cash.shortage`, `cash.handover` and `shift.opened`. Exact retries return one result; changed reuse fails. Non-manager staff can transfer only their own shift, while owner/admin can supervise the operation.
- Checks run: Prisma format/validation/generation and 51 migrations applied; targeted shift integration 8/8 including concurrent replay and historical payment attribution; API and Next production builds; ERP owner handover browser E2E; complete `npm run mvp:verify`; `git diff --check`.
- Outcome: full web/API gate is green with 118/118 API suites and 468/468 tests plus 31/31 Playwright flows. The ERP HR handover screen is now functional rather than a placeholder. Production readiness remains blocked by the same 12 external credential/manual groups.
- Next step: implement attendance-derived payroll adjustments and immutable payroll posting, then expose attendance controls in native Staff apps.

## 2026-07-14

- Task: replace the advisory all-history payroll report with authoritative period payroll inside ERP HR.
- Files changed: payroll Prisma schema/migration and immutable command journal; HR DTO/controller/service and Ledger events; typed web client and ERP payroll workspace; API/browser regressions, deterministic staff-session E2E setup, shared cleanup, backlog/readiness/completion audit and master plan.
- Result: owner/admin can preview one point/month from planned shifts, completed attendance, approved paid absence, lateness, overtime and received/reconciled shift sales. Posting snapshots formula inputs and per-staff lines immutably; payout requires an external document. Advisory locks, unique period/point and stable idempotency keys prevent duplicate posting/payment, while `hr.payroll_posted` and `hr.payroll_paid` preserve the accounting trail. Later attendance edits change a new preview but never rewrite a posted run.
- Checks run: Prisma format/validation/generation and test schema sync; targeted HR API 4/4; API and Next production builds; targeted ERP HR Playwright 3/3; repeated complete `npm run mvp:verify`; `git diff --check`.
- Outcome: full web/API gate is green with 118/118 API suites and 469/469 tests plus 32/32 Playwright flows. The first full run correctly exposed shared staff-login throttling in two late UI tests; they now use signed seeded sessions and the complete gate was rerun successfully. Production readiness remains blocked by the same 12 external credential/manual groups.
- Next step: expose the verified schedule/attendance contract in native SwiftUI and Compose Staff apps with durable offline replay, then continue ERP Wave B service-center work.

## 2026-07-14

- Task: complete native Staff HR schedule and attendance on SwiftUI and Compose.
- Files changed: shared iOS/Android HR models and API contracts; SwiftUI Staff shift workspace and SwiftData replay controls; Compose Staff shift workspace, attendance manager, isolated SQLite queue and WorkManager worker; APNs/FCM deep-link routing; XCTest/JVM/Compose regressions; backlog/readiness/completion audit.
- Result: an authenticated staff member sees only the schedule returned by `GET /hr/me/week`, opens or closes only that schedule through server-authoritative attendance endpoints, and retains the exact idempotency key when connectivity fails. iOS stores the command in SwiftData and replays it on foreground/manual retry; Android stores it in a Staff-only SQLite database and schedules network-constrained WorkManager replay. Rejected ownership/domain commands are not queued, while queued/failed/conflict states remain visible. Attendance notifications route directly to the Shift tab.
- Checks run: all-target iOS simulator build; 31/31 XCTest; four-APK Android build; Android JVM tests and Lint; 25/25 connected Compose tests on the API 36 emulator; complete `npm run ecosystem:verify` with 118/118 Jest suites, 469/469 API tests and 32/32 Playwright; `git diff --check`.
- Outcome: the native Staff attendance software contour is complete on both platforms. Physical APNs/FCM delivery, camera/scanner checks and first-store payroll/shift reconciliation remain external device/UAT gates; no production certification is claimed.
- Next step: run the complete ecosystem gate, then start ERP Wave B with the service-center work-order/diagnostics vertical.

## 2026-07-14

- Task: implement the first authoritative Service Center vertical across ERP and the customer account.
- Files changed: ServiceWorkOrder and immutable command Prisma models/migration; Service Center DTO/controller/service/module and Ledger events; typed web API; ERP queue, intake and diagnostics/estimate workspace; customer-owned estimate approval; deterministic API/browser fixtures and regressions; backlog/readiness/completion audit and integration master plan.
- Result: authorized staff can accept a warranty case, assign a technician and publish a diagnostic estimate without creating a second warranty status source. Only the owning customer can read and approve the estimate. Intake, diagnostics and approval keep stable idempotency keys, reject changed replay/cross-customer access and append atomic Event Ledger events. Paid external repair, parts, payment/POS linkage, full technician lifecycle and the loaner fund remain explicitly tracked Wave B scope.
- Checks run: Prisma validation/generation and dev/test schema application; targeted Service Center API and browser tests; API and Next production builds; complete `npm run ecosystem:verify` with 119/119 Jest suites, 471/471 API tests, 33/33 Playwright, four SwiftUI target builds, 31/31 XCTest, four Android APK builds, JVM tests and Android Lint; production external-readiness report; `git diff --check`.
- Outcome: the ERP-to-customer diagnostics and estimate-approval flow is executable and fully covered. Production readiness remains blocked by the same 12 owner-controlled credential/manual groups; no complete Service Center or production certification is claimed.
- Next step: run the complete native ecosystem gate, commit this vertical, then implement paid repair, parts/technician execution and loaner custody.

## 2026-07-14

- Task: extend Service Center with authoritative third-party paid repair intake and replace broad ecosystem-ready claims with a traceable completion plan.
- Files changed: paid service case Prisma enum/fields/migration; Service Center DTO/controller/domain events and immutable command flow; ERP paid-intake/diagnostics UI; customer account external-device estimate UI; API/browser regressions; backlog, readiness, master prompt, historical handoff corrections and a new 23-row ecosystem traceability matrix.
- Result: owner/admin/service roles can accept an external device without creating sellable `DeviceUnit` stock, reuse or create the customer by phone, assign only an active technician, diagnose it and publish a customer-owned estimate. Exact retries return one command result, changed reuse and duplicate active serials fail, and paid cases emit only `service.*` events rather than misleading `warranty.*` events. The account shows the paid repair even when the customer has no purchased devices. The audit now records that 23 committed handoffs reference 74 design files while 64 linked files are absent and therefore cannot yet receive visual acceptance.
- Checks run: Prisma validate/generate and all 54 migrations applied to dev; API/Next production builds; isolated full API 119/119 suites and 472/472 tests; targeted Service Center Playwright 2/2; complete `npm run ecosystem:verify` with 34/34 Playwright, all four SwiftUI target builds, 31/31 XCTest contracts, four Compose APK builds, JVM tests and Android Lint; `git diff --check`.
- Outcome: paid intake through customer estimate approval is integrated between ERP, API and storefront account. Full Service Center, ERP ecosystem and production readiness are not claimed: POS-linked service payment, parts/execution/SLA, loaner custody, 30-day repair warranty, packaged-app native E2E, 64 missing design references and 12 external credential/manual groups remain.
- Next step: implement a service-work-order payment boundary linked to an open cashier shift and exact approved estimate, with split tender, idempotency/concurrency, Ledger reconciliation and ERP/POS/customer status surfaces.

## 2026-07-14

- Task: settle approved paid Service Center estimates through the authoritative POS and finance boundary.
- Files changed: service-payment and refund-provenance Prisma schema/migrations; Service Center payment API, point ownership, RBAC, approval/refund integration and Ledger events; staff point provisioning; POS split-tender workspace and ERP handoff; customer payment/refund status; migration/API/browser regressions; backlog, readiness and traceability documentation.
- Result: an approved external repair can be paid only at a cashier's open shift for the work order point, for the exact unpaid estimate, using one or multiple supported tenders. Work-order locks plus stable idempotency keys prevent duplicate settlement; refunds remain linked to their original tender and preserve the service target. ERP opens the exact work order in POS, the customer account shows net paid/refunded state, and service payments do not create synthetic orders or inventory movements.
- Checks run: service-payment legacy migration regression; targeted Service Center/Trade-in API 5/5; isolated full API 119/119 suites and 473/473 tests; API and Next production builds; repeated complete `npm run mvp:verify` with 34/34 Playwright; independent code review with no actionable findings; `git diff --check`.
- Outcome: the paid-repair POS settlement vertical is green across API, ERP, POS and customer web. Production readiness remains blocked by 12 owner-controlled credential/manual groups. Parts consumption, technician execution/SLA, loaner custody and the 30-day post-repair warranty remain the next Service Center Wave B scope.
- Next step: implement server-authoritative repair parts reservation/consumption and technician execution transitions before loaner custody and post-repair warranty.

## 2026-07-14

- Task: complete the authoritative Service Center parts, technician execution, SLA and post-repair warranty vertical.
- Files changed: service/technician Prisma roles and repair lifecycle schema/migration; store-owned ServicePart reservation/consumption model; Service Center execution API, RBAC and dual BullMQ/pg-boss SLA sweep; generic warranty/refund guards; ERP work-order UI and typed client; API/browser regressions; deployment env, runbook, backlog and traceability documentation.
- Result: an eligible technician at the work-order point reserves only store-owned quantity stock, starts a funded approved repair, explicitly consumes installed parts into one inventory movement, resolves unused reservations, completes the repair and closes issuance with a 30-day repair warranty. Exact command replay is idempotent, foreign/unassigned technicians and generic warranty transitions are rejected, paid repairs cannot race the normal refund path after work starts, and overdue SLA cases escalate once into Event Ledger plus the transactional notification outbox. ERP exposes the same lifecycle in a prototype-aligned workbench.
- Checks run: Prisma format/validation/generation; legacy repaired-work-order migration regression; targeted Service Center/Warranty API 8/8; API and Next production builds; full `npm run mvp:verify` with 119/119 suites, 477/477 API tests and 34/34 Playwright; independent review and `git diff --check`.
- Outcome: the parts/execution/SLA/post-repair contour is complete at web/API software level, including customer-safe part projection, serialized diagnosis/approval, explicit technician assignment, same-model replacement custody and legacy closure compatibility. Service Center is not fully complete while loaner-device custody and the missing linked work-order detail handoffs remain open; no physical or production certification is claimed.
- Next step: implement loaner-device issue/return/evidence/overdue custody, then continue exact handoff restoration and ERP Wave B acceptance.

## 2026-07-14

- Task: complete authoritative Service Center loaner-device custody across ERP and the customer site.
- Files changed: DeviceUnit loaner states and custody Prisma models/migration; Service Center loaner DTO/controller/service/RBAC/Ledger and overdue scheduler; Evidence Vault entity ownership; repair-close invariant; typed web API; prototype-aligned ERP fund/issue/return UI; customer account status; API/browser regressions; checkout time-stable E2E; backlog/readiness/traceability documentation.
- Result: a free serialized IMEI becomes a loaner without creating another inventory source, is prepared for exactly one active work order, requires staff-authorized issue Evidence before custody changes, appears only to the owning customer, escalates overdue once through Ledger/outbox, blocks repair closure until return/cancel and requires trusted return Evidence. A damaged return enters `in_repair` until an explicit resolution returns it to the fund or the owner alone writes it off. Replay authorization is point-scoped, and advisory locks on stable idempotency keys serialize concurrent mutations.
- Checks run: Prisma validate/generate and isolated test schema sync; targeted loaner API with customer-evidence, foreign-point replay, concurrent resolution and owner-only write-off regressions; full API 120/120 suites and 478/478 tests; API/Next production builds; targeted ERP→customer loaner Playwright; repeated complete `npm run mvp:verify` with 35/35 Playwright; independent code review with no remaining Critical/High/Medium findings; `git diff --check`.
- Outcome: the Service Center web/API software lifecycle now includes custody-safe loaner issue, cancellation, return and dispute resolution integrated between ERP, Evidence Vault, authoritative inventory and the customer website. The complete gate exposed an old clock-dependent delivery-slot fixture and stale broad-cleanup fixtures; they are now deterministic and relation-safe, and the final complete gate passes. Exact case-detail pixel acceptance remains blocked by missing linked handoffs, and physical/production certification remains blocked by devices plus 12 external credential/manual groups.
- Next step: restore or explicitly retire missing handoff files, then execute the all-role reconciled ecosystem E2E and packaged native-app acceptance.
## 2026-07-15

- Task: improve native Staff UX and add quick unlock across native apps.
- Files changed: shared SwiftUI Staff shell/login/auth restoration; iOS LocalAuthentication Face ID/Touch ID and salted six-digit PIN fallback; iOS privacy declarations; Android shared biometric/PIN gate, encrypted session restore integration for Client/Staff/Courier/POS, biometric permissions and FragmentActivity hosts; Compose Staff home metrics and operational visual polish.
- Result: Staff no longer requires username/password on every launch when a server-valid session is present. The app validates the stored token with `staff-auth/me`, then gates local access with biometrics or a device-local salted PIN. Passwords are never stored and PINs are never sent to the API. The same quick-unlock contour is wired into all native app roles.
- Checks run: `npm run ios:generate`; `npm run ios:build` (all four targets, passed); `npm run ios:test` (33/33 passed); `git diff --check`. Android compilation could not run because this machine has no Java runtime; Android code remains unverified until JDK/Android Studio runtime is installed.
- Outcome: iOS native build/test gate is green. Physical Face ID/Touch ID, Android build/emulator, and production signing remain release gates; no App Store/Google Play certification is claimed.
- Next step: install/configure JDK and run four Android builds, Lint and connected Compose smoke; then verify biometric fallback on physical iOS/Android devices.

## 2026-07-15

- Task: audit ERP accounting completeness and implement the first balanced journal vertical for operating-expense payment.
- Files changed: accounting architecture audit; Prisma chart-of-accounts/journal schema and migration; Finance posting helper, DTO, controller, service and Event Ledger type; expense and trial-balance web API; ERP funding-source/payment-reference controls and ОСВ; integration fixtures/tests; backlog.
- Result: an approved expense can no longer become paid without an explicit cash, bank or provider-funds account. The API locks the expense, validates active accounts and exact integer debit/credit equality, creates a source-unique and idempotency-bound journal entry, updates the expense and appends both domain and accounting AuditEvents in one transaction. Exact replay returns the original entry; a changed account/reference conflicts. ERP shows the payment account and a period/point trial balance with a visible balance gate.
- Checks run: Prisma format/validate/generate; both migrations deployed to local development and schema-synced isolated test DB; an intentionally unbalanced direct SQL journal write rejected by the deferred database trigger; targeted Finance integration 5/5; full API 133/133 suites and 530/530 tests; API and Next production builds; Playwright 45/45 plus a lost-response → reload → same-key payment replay; on the final repeated `mvp:verify`, three unrelated long-run navigation timeouts passed 3/3 immediately in isolation; authenticated owner browser smoke at 1440 px and 863 px with no horizontal overflow or console errors; screenshots under `.artifacts/accounting-p0/`; independent review; `git diff --check`.
- Outcome: `FIN-002` is complete, but AliStore accounting is not complete. Coverage is explicitly marked partial in the API and ERP. Payment keys survive a page reload until success is confirmed, journal cleanup respects the deferred balance invariant, and independent re-review found no remaining P0 finding. Read-only audits found P0 gaps in cash-shift attribution, refunds, COD revenue, immutable inventory valuation/COGS, quantity PO receiving and exchange reconciliation, plus missing supplier AP and period close. These are now explicit `FIN-003`, `INV-VAL-001`, `AP-001` and `ACC-002` gates.
- Next step: implement `FIN-003` as the authoritative cash receipt/refund/COD vertical, then build valued PO receipt to sale/return and supplier AP matching on the same journal.

## 2026-07-15

- Task: move the customer-site administration surface fully inside ERP.
- Files changed: reusable product-management workspace; ERP website overview and role-aware tabs; ERP navigation/administration hub; legacy `/admin/products` wrapper; ERP-to-storefront browser regression; backlog status.
- Result: `/erp` now contains one website administration workspace for catalog products, banners, content and curated collections, promotion codes, review moderation and storefront preview links. Owner/admin can edit products in place; marketer never receives the product-management tab and remains limited by the existing server-side permissions. The standalone product URL reuses the same component instead of maintaining a second implementation.
- Checks run: Next production build; targeted Playwright 7/7 covering embedded product changes, CMS publication, blocks, reviews and checkout promo redemption; authenticated in-app browser smoke at 1280 px with the embedded catalog visible, no document overflow and zero console errors; temporary browser account removed after verification.
- Outcome: `ERP-ADMIN-003` is complete at local web/API software level. Cloudflare Access, production credentials and live owner UAT remain external launch gates; no production certification is claimed.
- Next step: return to `ACC-002` output VAT/settlement and `ERP-RESP-001` narrow-screen ERP navigation after this bounded administration phase.

## 2026-07-15

- Task: add immutable output-tax accounting and tax-period settlement across storefront orders, split payments, refunds and paid Service Center work.
- Files changed: product/order/service tax snapshots and migration; deterministic BigInt sales-tax allocation; receipt/refund journal posting; payment, approval and service accounting integration; tax-period API and close gates; ERP product-tax controls and Finance tax workspace; unit, integration and browser regressions; backlog/progress accounting gap map.
- Result: tax classification is copied from the server-owned product into immutable order lines, discounts reduce tax deterministically, split tenders and partial refunds allocate cumulative rounding without drift, and paid services freeze their own estimate tax snapshot. Receipts post funding debit against net revenue plus output-tax liability `2200`; refunds reverse the same proportions. A period must be soft-closed, globally settled against input tax `1210`, and checked for a current settlement before hard close. Product edits cannot rewrite historical tax, and late reversals after settlement are blocked.
- Checks run: Prisma validate/generate and migration apply on the local test database; sales-tax unit 3/3; targeted Finance tax integration 12/12 repeated three times after one transient TCP reset; targeted order/payment/refund/service integration 32/32; final full API 135/135 suites and 545/545 tests; API and Next production builds; Playwright ERP admin/Finance 4/4, including ERP product publication to the storefront and visible tax-period controls; targeted `git diff --check`.
- Outcome: `ACC-002H` is accepted at local software level, but complete store accounting is not claimed. The audit leaves explicit next gates for COD/debt revenue origination, multi-tender return allocation, exchange accounting, payroll accrual, opening balances, fixed assets, AR aging/export and live Kyrgyz accountant validation.
- Commit: `d8c9cc3` (`feat(finance): add immutable output tax accounting`).
- Next step: implement `FIN-003D` so COD and instalment sales originate AR, net revenue and output tax before later collections clear receivables; then close split-tender return allocation under `FIN-003E`.

## 2026-07-15

- Task: recognize COD and instalment sales before cash collection and keep the website administration inside ERP verified.
- Files changed: DebtPlan idempotency/accounting linkage and migration; shared order-receivable journal posting; debt creation/approval validation; courier delivery and handover accounting; Event Ledger payloads; debt/COD integration tests; deterministic accounting, Ledger and promotion test cleanup; backlog/progress.
- Result: one order can originate one debt only, the API derives the unpaid cap from settled payments, exact retries return the same debt and changed key reuse conflicts. Debt origination and COD delivery post customer receivable `1100`, net revenue `4000` and output tax `2200` from immutable order snapshots; partial prepayment uses cumulative tax allocation. Debt receipts and order-bound COD handover clear `1100`, while handover fails when collection or receivable recognition is incomplete. The existing ERP website-administration flow still publishes catalog changes to the client storefront.
- Checks run: Prisma validate/generate and migration deploy; related Finance/Debt/Courier suites 49/49; final full API 135/135 suites and 548/548 tests; API and Next production builds; ERP website-administration Playwright 2/2; targeted `git diff --check`.
- Outcome: `FIN-003D1` is accepted at local software level. Full `FIN-003D` is deliberately still open because COD delivery stock/COGS and exchange reversal/replacement accounting are not yet complete. Live tax/payment/COD policy still requires first-store accountant/provider UAT.
- Commit: `d157596` (`feat(finance): recognize COD and debt receivables`).
- Next step: make COD delivery consume reserved stock and post immutable COGS once, then implement exchange reversal/replacement accounting before starting multi-tender refund allocation.

## 2026-07-15

- Task: finalize authoritative stock consumption and COGS when a courier completes a COD delivery.
- Files changed: shared order-inventory sale transaction helper; prepaid payment and courier delivery integration; courier module dependency; serialized and quantity COD integration regressions; backlog/progress.
- Result: payment and COD delivery now use the same atomic inventory boundary. Active serialized reservations become sold units, quantity allocations consume FIFO valuation and reduce on-hand/reserved/value, consignment accrual remains channel-independent, reservations close, and COGS posts to `5000`/`1200`. Replaying the same courier command returns the recorded result without a second stock issue, valuation change or journal entry.
- Checks run: focused Courier integration 8/8; final full API 135/135 suites and 549/549 tests; API and Next production builds; ERP website-administration Playwright 2/2.
- Outcome: `FIN-003D2` is accepted at local software level for both serialized and quantity stock. `FIN-003D` remains open only for exchange return/replacement revenue, tax and COGS accounting; live COD and accountant UAT remain external gates.
- Commit: `02b65f3` (`feat(finance): finalize COD inventory and COGS`).
- Next step: implement exchange reversal of the returned sale/tax/COGS and authoritative posting of the replacement without duplicate revenue.

## 2026-07-15

- Task: restore the missing committed baseline for return valuation and make owned-stock returns accounting-complete.
- Files changed: `InventoryValuationIssue.reversedQty` schema/migration; serialized and quantity cost-reversal helpers; return reconciliation value/Ledger integration; serialized and FIFO quantity regressions; backlog/progress.
- Result: a return reverses only unreversed immutable sale issues, debits inventory `1200`, credits COGS `5000`, restores quantity value through a new return FIFO layer, records exact movement value and emits atomic AccountingEntryPosted evidence. Repeated reconciliation creates no second stock/value/journal effect, and legacy orders with no valuation issues remain zero-value compatible rather than borrowing cost from unrelated return stock.
- Checks run: Prisma validate/generate; targeted return reconciliation 7/7; API production build; first full API 134/135 suites and 550/551 tests with one unrelated transient CMS HTTP parse error; isolated CMS rerun 5/5; final full API 135/135 suites and 551/551 tests; targeted `git diff --check`.
- Outcome: `INV-VAL-001B` is accepted at local software level and the branch no longer relies on uncommitted return-valuation functions. Quarantine disposition, valuation-aware adjustments/transfers and inventory-to-GL reconciliation remain open. Local dev migration history also has pre-existing drift and must be normalized before staging.
- Commit: `beb45ab` (`feat(inventory): reverse return valuation and COGS`).
- Next step: complete exchange accounting on this now self-contained return valuation boundary, then add the inventory valuation subledger reconciliation report.

## 2026-07-15

- Task: complete atomic exchange accounting across customer credit, replacement sale, surcharge, serialized inventory and COGS.
- Files changed: exchange DTO/module/service; exchange and RBAC integration fixtures; backlog/progress.
- Result: the API locks the original order, verifies exact sold/new IMEI ownership and location, rejects consignment ambiguity and cheaper replacement, creates a reconciled return line, restores the returned unit and its immutable cost, freezes replacement tax/cost snapshots, sells the replacement through the shared inventory boundary and posts balanced `exchange.return`, `exchange.sale`, `exchange.surcharge`, `inventory.return` and `inventory.cogs` journals. Cash surcharge requires the actor's open shift; non-cash surcharge requires a provider reference. The customer credit plus surcharge clears exchange AR exactly, equal-price exchange creates no synthetic payment, and exact command replay creates no duplicate order, return, payment, journal or valuation issue.
- Checks run: exchange integration 5/5; exchange/RBAC integration 7/7; related exchange/return/payment-race/expense suites 24/24; API production build; final full API 135/135 suites and 553/553 tests; targeted `git diff --check`.
- Outcome: `FIN-003D` is complete at local software level for debt/COD/exchange accounting. The broader accounting goal remains open: multi-tender refund allocation, opening balances/payroll/fixed assets/advances/AR aging, inventory-to-GL reconciliation and supplier AP lifecycle remain. Prototype-required exchange approval, Evidence and quarantine/diagnosis are now explicit `EXCH-001`; live accountant/provider/POS UAT remains external.
- Next step: implement `FIN-003E` multi-tender refund allocation, then `EXCH-001` approved evidence-backed exchange execution and `INV-VAL-001` inventory-to-GL reconciliation.

## 2026-07-16

- Task: implement `ECO-002G`, the fail-fast reconciled local-software matrix.
- Files changed: structured reconciliation profile and runner; trusted npm resolver; root package command; fail-closed evidence recorder/audit contract; backlog/progress records.
- Result: `ecosystem:e2e` runs the four accepted vertical profiles sequentially and stops at the first failure. The runner rejects partial-run arguments, invalid/duplicate profile entries and missing package scripts. Audit and recorder have no npm entrypoint: the authoritative command uses locked system Git with an empty environment, explicit repository paths and disabled replacement/config overrides to materialize the bootstrap blob from committed `HEAD` into a secure temporary file; Git failure aborts before shell execution. The committed bootstrap then compares the selected JS entrypoint plus both local imported trust modules byte-for-byte with their `HEAD` blobs before Node can load them. Before Node starts, `/usr/bin/shasum` verifies a pinned manifest of the recursively resolved executable/dylib closure and the manifest's own digest; `/usr/bin/env -i` clears ambient Node/macOS loader variables. The bootstrap passes the verified manifest as fd 3, which JS checks as defense in depth; `lockf` explicitly preserves only that descriptor and an allowlisted environment. The audit requires the exact runner command, ordered JSON profile and all four exact child commands. Recording invokes the runner directly through the current absolute Node path, uses a tracked concrete `npm-cli.js`, and executes the hash-locked `/usr/bin/git` against the explicit repository `.git` directory and worktree. Git receives an allowlisted environment without ambient `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` or config overrides, disables replacement objects and rejects `refs/replace`. Every scoped source, manifest and artifact is compared byte-for-byte with its real `HEAD` blob, and `assume-unchanged`/`skip-worktree` index flags are rejected. The test process likewise uses a restricted PATH, empty node-options and fixed system shell. The complete npm installation, Node keg plus transitive non-system Mach-O libraries, and complete Chrome application bundle are hash-locked rather than trusting launchers alone. `CI` is excluded so acceptance always uses the locked local Chrome, while `E2E_REUSE_EXISTING_SERVER=false` independently forces servers from the current source tree. Evidence mode ignores `apps/api/.env`, refuses ignored Next `.env*` inputs, replaces ambient database variables with the fixed local `alistore_test` endpoint and binds its non-secret identity into the result. Evidence also binds the actual execution command, Git, npm/shell plus the executed Playwright/Jest shim targets and CLI digests; lifecycle-local `node`/`npm` shadows are rejected across every root and API ancestor npm can add. A tracked toolchain lock binds Git, Node, npm, Chrome, `package-lock.json`, package versions and deterministic runtime/dependency hashes; snapshots are recalculated after execution before evidence can be written. This is one current local-software matrix, not a claim that every flow shares one order or that native deep journeys, devices, providers and missing visual handoffs are certified.
- Checks run: final fixed-database composite passed all four verticals, API `4/4` suites with `15/15` tests and Playwright `6/6`; partial-run argument rejected with exit `2`; hostile Git/database/Node/loader environment could not bypass the bootstrap or hide the dirty source tree; direct unbootstrapped audit and a forged descriptor marker were rejected; `assume-unchanged` and a temporary Git replacement ref were detected and rejected; the pre-commit authoritative command failed closed when the bootstrap was absent from `HEAD`; Node/npm/Chrome runtime locks, JSON, shell/Node syntax and `git diff --check` pass. Final independent review reports `APPROVE` with zero actionable Critical, High or Medium findings.
- Outcome: implementation is accepted for commit; the broad audit gate remains GAP only until the clean-tree recorder reruns and commits immutable `reconciled-e2e` evidence.
- Next step: commit implementation, then invoke the committed-HEAD recorder and commit its evidence separately.

## 2026-07-16

- Task: complete `EXCH-001` as an immutable, evidence-backed and four-eyes approved serialized exchange workflow.
- Files changed: ExchangeRequest Prisma aggregate and three staged migrations; approval/TOTP transaction boundary; exchange reservation/expiry scheduler; Evidence authorization and failed-upload cleanup; exchange API and ERP Approval Inbox; iOS/Android POS evidence-and-approval contract; native biometric dependencies/privacy declarations; migration, RBAC, concurrency, native-build and browser regressions; backlog/progress evidence.
- Result: creating an exchange now parks the exact old/new IMEI, customer credit, surcharge, tender, shift/provider reference and requester in an append-only snapshot, reserves the replacement for 30 minutes and creates an approval instead of mutating money or stock. Only requester-owned exchange evidence can be attached, and rejected database validation compensates the uploaded object instead of leaving orphan media. iOS and Android POS select and upload condition evidence, decode the 202 request response and show the pending approval handoff. A different owner with atomic TOTP approval executes the frozen snapshot once through the existing accounting, inventory, valuation, quarantine and Ledger transaction; rejection or expiry releases the exact reservation. Database guards block direct legacy exchange orders and snapshot mutation/deletion. Non-cash surcharge remains fail-closed until a certified provider-backed capture is added under `EXCH-002`.
- Checks run: Prisma validation/generation; populated rolling migration upgrade plus immutable/expiry guards; clean deployment of 96 migrations; API and Next production builds; mobile TypeScript check; full API 142/142 suites and 614/614 tests; Playwright exchange 2/2; XcodeGen plus all-target iOS build; iOS XCTest 33/33; four Android debug APK builds, unit tests and all `lintDebug` tasks with a 4 GB Gradle heap; `git diff --check`. Independent database/security review found populated-upgrade blocking, permanent reservations, decision-boundary expiry, Evidence/rejection races, inverse lock order, direct-exchange bypass, mutable snapshots, missing reservation/concurrency coverage, stale native POS contracts, a missing native response expiry, unsafe cleanup-scheduler rejection handling, pre-upload/finalization/late-upload media crash windows and non-atomic TOTP; all Critical/High findings and bounded Medium correctness gaps were fixed before the final gate. Evidence completes Sharp transformation in memory before creating the cleanup lease, then persists the uploader intent immediately before the timeout-bounded object-store `put` and consumes it in the audited transaction. Cleanup uses a committed claim before external deletion, stale-claim retry and row-conditional finalization. Failed or abandoned uploads retain a durable two-pass deletion tombstone: the second delete runs after the maximum in-flight upload window and therefore removes an object published after the first delete even if the uploader process crashed. Tests cover cleanup-before-upload, crash-safe late-upload tombstones, retention/cleanup concurrency, crash after deletion, transaction failure, intent-persistence failure, queue isolation, queue recovery, successful retry, backoff and database failure containment. The first post-change all-suite run had two isolated Supertest `socket hang up` failures in the pre-existing public rate-limit suite; that suite then passed 4/4 alone and the immediate complete reruns passed 142/142 suites and 614/614 tests. A pre-existing Finance Supertest collision regression was made deterministic by removing unrelated parallel expense setup; the payment-key conflict assertion is unchanged.
- Outcome: `EXCH-001` is accepted at local software level. A final independent re-review reported no actionable Critical, High or Medium findings after verifying the preprocessing-before-lease rule, timeout-bounded upload, two-pass tombstone, migration and test isolation. Production readiness remains RED with 11 external credential/hardware groups. Live card/QR exchange surcharge capture, provider callback/reconciliation and physical first-store exchange UAT are not claimed.
- Commit: `9958443 feat(exchanges): require approved evidence-backed swaps`.
- Next step: implement `EXCH-002` against the certified payment-provider contract when credentials/specification are available; meanwhile continue `ERP-RESP-001` and native packaged UI gates, which are not externally blocked.

## 2026-07-16

- Task: complete `ERP-RESP-001` so the protected ERP remains usable and accessible at 390 px without changing its canonical desktop handoff.
- Files changed: responsive ERP shell/navigation/header/content layout and protected Finance/Administration browser acceptance.
- Result: mobile ERP now uses the full viewport and an explicit 280 px modal drawer instead of clipping the 230 px desktop sidebar into the content. The drawer closes after navigation, becomes inert while hidden, makes the main workspace inert while open, focuses its close action, traps Tab, supports Escape and restores focus to the labelled trigger. Finance and Administration retain all actions at 390 px; desktop remains a centered 1280x820 shell with a 230 px sidebar.
- Checks run: Next production build with all 39 routes; protected ERP Playwright 2/2; live Chrome screenshots at 390x844 for Finance and Administration plus 1400x900 desktop under `.artifacts/erp-responsive`; mobile document/main widths 390/390 with no horizontal overflow, closed drawer `x=-280`; desktop shell 1280x820 and sidebar 230 px; zero console errors; `git diff --check`. The independent review first found missing dialog focus/inert behavior and an insufficient document-only overflow assertion; both were fixed, and the final re-review reported no actionable Critical, High or Medium findings.
- Outcome: `ERP-RESP-001` is accepted at local web/API software level. Production Cloudflare Access, live roles and physical first-store UAT remain external release certification, not hidden completion claims.
- Commit: `daf2b64` (`feat(erp): add responsive mobile navigation`).
- Next step: implement the missing packaged native UI commands and application-level test targets under `ECO-002`, while provider-backed `EXCH-002` remains externally blocked.

## 2026-07-16

- Task: complete `FIN-003E` as an authoritative, provider-ready multi-tender refund aggregate.
- Files changed: Refund/RefundAllocation/RefundLine/GiftCardTransaction Prisma models and bounded migrations; deferred database consistency triggers; concurrent post-deploy payment provenance index; refund API/worker/approval/payment/shift integration; ERP Refund Money Flow; deployment readiness; API and browser regressions; CI, backlog and readiness evidence.
- Result: a Return creates one idempotent server-priced refund with immutable line-level tax snapshots and deterministic card/QR → gift-card → cash allocations. Four-eyes approval freezes execution, provider allocations progress in strict saga order with safe callback/retry semantics, successful allocations atomically create compensating Payment, Journal and Event Ledger rows, gift-card balances restore through their own journal, and pending cash allocations block shift close/handover. Deferred PostgreSQL constraints reject cross-order payments, foreign ReturnItems and aggregate total drift even under direct writes. The deprecated endpoint cannot create a product refund without Return provenance.
- Checks run: Prisma validate/generate; clean PostgreSQL reset and direct-URL deploy of 87 migrations; deterministic legacy gift-card backfill, rolling negative-payment restoration, ambiguous/orphan blocker rollback, repaired retry and atomic DDL-failure rollback; direct database provenance/capacity/coverage/append-only/tax-dependency/lifecycle regressions; full API 136/136 suites and 582/582 tests; API and Next production builds with 39 routes; mobile TypeScript check; full Playwright 46/46; `npm audit --omit=dev` (0 vulnerabilities); tracked-secret pattern scan and `git diff --check`.
- Outcome: `FIN-003E` is accepted at local software level with bounded provider retry/backoff, automatic relay execution, atomic/resumable provider callbacks, terminal-failure quarantine, mixed-tax legacy bridging, admin/owner reconciliation cancellation and shift release. Independent code/database reviews found destructive-reset, rolling-upgrade, tax-snapshot and pooled-DDL blockers; all were fixed before the final green gate. Production readiness remains RED with 11 external credential/hardware groups: the production refund gateway still fails closed until a real payment provider adapter, signed callback and live certification exist; accountant/provider UAT remains required. Fresh final reviewers could not start because the external subagent service reached its usage limit; this is recorded rather than presented as a completed review.
- Commit: `3d47326` (`feat(finance): add authoritative refund aggregate`).
- Next step: add the missing Git remote/upstream before durable release worktrees; meanwhile start `INV-VAL-001`, then `EXCH-001`, without sharing mutable contracts.

## 2026-07-16

- Task: complete `INV-VAL-001C` by making quantity transfers preserve immutable FIFO valuation and resist competing transfer races.
- Files changed: quantity valuation transfer helper; authoritative quantity transfer transaction; FIFO/value and concurrency integration regressions; backlog/progress evidence.
- Result: a quantity transfer now locks the source balance, moves the physical quantity once, transfers the owned FIFO layers into the destination balance, moves exact `inventoryValue` without creating a GL entry, and records `totalValue` on the movement and Event Ledger payload. Third-party consignment quantities continue through owner lots with zero owned asset value. Two different idempotency keys can no longer both consume the same available source stock.
- Checks run: protected clean reset/deploy of all 87 test migrations plus post-deploy indexes; quantity inventory, quantity consignment, dangerous-action and serialized-transfer integration suites 4/4 with 22/22 tests; API production build; `git diff --check`. The first combined test run correctly failed on stale accounting rows in the shared test database; it passed after the guarded test-only reset. Mandatory independent review was requested but could not start because all subagent slots were already occupied, so no external review is claimed for this iteration.
- Outcome: transfer cost provenance and the remaining quantity-transfer race are accepted at local software level. `INV-VAL-001` remains open for valuation-aware write-offs/adjustments, quarantine disposition and the inventory-subledger-to-GL reconciliation report.
- Next step: make approved write-offs and stock adjustments consume/create immutable valuation layers and balanced `6900`/`1200` journal entries, then expose the reconciliation report.

## 2026-07-16

- Task: complete `INV-VAL-001D` by connecting approved quantity write-offs and adjustments to immutable valuation, GL and Event Ledger.
- Files changed: inventory variance valuation/accounting helper; approval payload/executors; dangerous-action integration regressions; backlog/progress evidence.
- Result: an approved write-off or negative adjustment locks free owned stock, consumes FIFO layers, creates immutable valuation issues, lowers balance value and posts `6900` debit / `1200` credit. A positive adjustment freezes the product cost when approval is requested, creates a new immutable layer on approval, raises balance value and posts `1200` debit / `6900` credit. Movement value and accounting evidence are recorded in the same approval transaction; zero-value legacy stock remains explicitly compatible instead of inventing cost.
- Checks run: targeted dangerous-action integration 8/8; `ALISTORE_TEST_DATABASE_CONFIRMED=1 npm run mvp:verify -- --skip-e2e` with Prisma validation/generation, refund migration upgrade, clean reset/deploy of 87 migrations, API and Next production builds, mobile typecheck and full API 136/136 suites with 586/586 tests; external readiness report remains RED with 11 credential/hardware groups; `git diff --check`. Two independent review agents were started, but neither returned findings before the bounded review window and both were shut down; no external review result is claimed.
- Outcome: valuation-aware transfer, write-off and adjustment software paths are accepted. `INV-VAL-001` remains open only for quarantine/disposition and the product/location quantity/value reconciliation report against journal account `1200`; live accountant and first-store UAT remain external gates.
- Next step: add the inventory valuation reconciliation read model/API/ERP drill-down, then implement quarantine disposition before closing `INV-VAL-001`.

## 2026-07-16

- Task: complete `INV-VAL-001E` with a protected current-state inventory valuation reconciliation and ERP drill-down.
- Files changed: inventory reconciliation API/read model; financial RBAC regression; typed warehouse web client; ERP Stock valuation workspace; API and browser integration tests; backlog/progress evidence.
- Result: owner/admin can compare owned quantity balances with physical quantity after consignment exclusion, active FIFO quantity/value and global GL account `1200`. Owned serialized units are grouped by product/location, third-party IMEI units are excluded and missing acquisition cost makes the report explicitly incomplete. ERP shows quantity and value deltas, GL difference, loading/error/empty states and incomplete-cost warnings; the warehouse role cannot access the financial endpoint.
- Checks run: bounded diff review found and fixed a potential double count of legacy DeviceUnit rows attached to quantity-tracked products and made quantity/value deltas independently visible; targeted API reconciliation/Authz 5/5; full `ALISTORE_TEST_DATABASE_CONFIRMED=1 npm run mvp:verify -- --skip-e2e` with clean deployment of 87 migrations, API/Web builds, mobile typecheck and API 137/137 suites with 588/588 tests; targeted Playwright ERP/RBAC 1/1; `git diff --check`. Production readiness remains RED with 11 external credential/hardware groups. No external reviewer result is claimed for this iteration.
- Outcome: current-state product/location quantity/value and global inventory-to-GL divergence are now observable and tested. `INV-VAL-001` is still open for quarantine/diagnosis disposition and a historical opening-to-closing roll-forward; live accountant and first-store reconciliation remain external gates.
- Next step: implement evidence-backed quarantine disposition for returned/exchanged stock, then add the historical roll-forward before closing `INV-VAL-001`.

## 2026-07-16

- Task: complete `INV-VAL-001F` with evidence-backed serialized inventory quarantine, controlled disposition and service handoff.
- Files changed: quarantine Prisma model and migration; Return/Approval/ServiceWorkOrder relations and database constraints; return/exchange cost snapshot creation; inventory diagnosis/disposition API; owner approval executor; Evidence and Event Ledger integration; ERP quarantine workspace; API/browser regressions and FK-stable test cleanup.
- Result: every owned serialized return or exchange creates one active quarantine case tied to its authoritative Return and recognized immutable cost. Trusted photo evidence and a second employee are mandatory. Restock conditionally returns the IMEI to sale, repair creates and links a real service work order, and write-off remains diagnosed until an owner completes TOTP approval from an immutable snapshot. The approved transaction changes the unit once, creates exact-cost movement/valuation/GL records and emits both canonical stock and quarantine events. PostgreSQL rejects duplicate active cases, invalid state combinations, mismatched disposition, same-actor disposition, invalid provenance and negative cost. ERP shows all active cases, bounded history, owner-approval state and a clear second-employee state.
- Checks run: clean deployment of 88 migrations; Prisma validation/generation; API and Next production builds; mobile TypeScript check; targeted quarantine/return/exchange/RBAC suites; Playwright quarantine and valuation 2/2; final `ALISTORE_TEST_DATABASE_CONFIRMED=1 npm run mvp:verify -- --skip-e2e` with 138/138 API suites and 592/592 tests; `git diff --check`. Two independent reviews found approval bypass, duplicate-case race, mutable cost, missing database invariants, incomplete service handoff and ERP action/listing gaps; all blocking/high and medium findings were addressed before the final gate.
- Outcome: `INV-VAL-001F` is accepted at local software level. `INV-VAL-001` remains open only for the historical opening-to-closing valuation roll-forward. Production readiness remains RED with 11 external credential/hardware groups; live accountant, provider and first-store reconciliation are not claimed.
- Next step: implement the historical valuation roll-forward, then complete `EXCH-001` approval-snapshot execution and Evidence workflow.

## 2026-07-16

- Task: complete `INV-VAL-001G` and close the owned-inventory valuation software lifecycle with a historical roll-forward.
- Files changed: valuation movement/reversal Prisma schema and migration; migration upgrade regression; valuation occurrence/provenance helpers; service-part valuation/COGS; roll-forward read model/API/DTO; ERP Stock roll-forward UI and typed client; API/browser tests; deterministic E2E finance reset; backlog/progress evidence.
- Result: owner/admin can reconcile opening inventory, receipts, returns, transfers, sales/issues, service consumption and adjustments to closing by product/location/quantity/value and compare both opening and closing against GL `1200`. Repeated historical partial returns backfill into append-only per-entry reversals; uncovered old-writer updates fail closed during rollout. Consignment, missing cost/location, legacy quantity balances and service rows without valuation provenance remain explicitly incomplete instead of inventing owned value. Serialized transfers lock and reread the unit, zero-cost owned issues retain quantity provenance, service parts consume FIFO and post `5000`/`1200`, all accounting-backed inventory records share one occurrence timestamp, and the report uses one repeatable-read snapshot with Bishkek day boundaries.
- Checks run: Prisma validate/generate; dedicated rolling-upgrade migration test covering partial returns, negative movement, uncovered legacy update and immutable reversal rejection; clean deployment of 89 migrations; API and Next production builds; mobile typecheck; final full API 139/139 suites and 595/595 tests; targeted ERP Playwright 1/1 with financial RBAC and no horizontal overflow; `git diff --check`. Two final independent reviews found three additional high database/data-integrity defects plus transfer concurrency, exchange location, clock-boundary and service-test gaps; all high findings and the bounded correctness gaps were fixed before the final gates. Lifetime-scan scalability and online large-table migration lock work remain explicit `INV-VAL-001I`/`DEPLOY-MIG-001`, not hidden launch claims.
- Outcome: `INV-VAL-001` is complete at local software level. Production readiness remains RED with 11 external credential/hardware groups; live accountant validation and first-store physical/GL reconciliation are not claimed.
- Next step: implement `EXCH-001` as an approval-snapshot and Evidence-backed exchange aggregate, then resume exact native Client design/store-release work while external credentials and physical devices remain separate certification gates.

## 2026-07-16

- Task: complete `ECO-002A` with packaged cold-launch UI gates for all four native iOS applications.
- Files changed: four XCUITest bundles; aggregate XcodeGen scheme and generated Xcode project; Debug-only launch-argument session-restore bootstrap; Client/Staff/Courier/POS app initialization; root iOS UI command and ecosystem verifier integration; backlog/progress evidence.
- Result: `AliStoreClient`, `AliStoreStaff`, `AliStoreCourier` and `AliStorePOS` are each installed and launched through their real application target. Client asserts its packaged tab shell; the three staff applications assert their role-specific signed-out login surfaces. The deterministic Debug-only argument bypasses stored-session restoration without deleting Keychain data; Release always uses normal secure-session restoration.
- Checks run: XcodeGen generation; all-target Debug and Release iOS simulator builds; shared XCTest 33/33; aggregate packaged XCUITest 4/4 on iPhone 17 Pro simulator after the final Debug-only signed-out guard; ecosystem contract audit recognizes the XCUITest command and native-limit disclosure while correctly retaining GAP until evidence is accepted; tracked-secret scan; `git diff --check`. The simulator emitted an Apple runtime duplicate accessibility-loader warning, but all four tests and the xcodebuild session completed successfully.
- Outcome: `ECO-002A` is accepted as a packaged iOS launch smoke only. It does not prove OTP, checkout, Staff operations, Courier delivery, POS sale, push/camera/maps/hardware or physical-device behavior. `ECO-002` remains open for deeper iOS flows, four packaged Android connected tests, reconciled ecosystem E2E and committed visual evidence.
- Next step: add one real-activity connected smoke to each Android APK module, make `android:ui` execute `core`, `app`, `staff`, `courier` and `pos`, and validate on the available `savio_api36_arm64` AVD.

## 2026-07-16

- Task: complete `ECO-002B` with packaged application connected UI gates for all four Android APK modules.
- Files changed: Client/Staff/Courier/POS instrumentation runners and test dependencies; one real-`MainActivity` Compose smoke per APK; notification permission rules for Staff/Courier; sequential aggregate Android UI commands; backlog/progress evidence.
- Result: the gate now installs and launches each packaged APK instead of treating shared `:core` Compose content as application acceptance. Client proves its real activity dispatches the Client navigation shell; Staff, Courier and POS prove their real activities dispatch the correct role surface. The aggregate command retains the 26 shared behavior tests and runs DEX/test tasks with one worker to avoid the observed five-module parallel merge stall.
- Checks run: `android:ui` on `savio_api36_arm64` API 36 with `core=26/26`, `app=1/1`, `staff=1/1`, `courier=1/1`, `pos=1/1`; four debug APK builds; all Android JVM tests and `lintDebug`; targeted Staff/Courier connected rerun 2/2 after the SDK-aware permission fix; ecosystem contract audit recognizes all four packaged module commands while correctly retaining GAP until hash-verified evidence is accepted; tracked-secret scan; `git diff --check`. Independent review found that unconditional `POST_NOTIFICATIONS` grants would fail on supported API 26–32; both rules now bypass the grant below API 33 and preserve grant-before-launch behavior on API 33+.
- Outcome: `ECO-002B` is accepted as packaged Android cold-launch/role-wiring coverage. It does not prove OTP/checkout, Staff operations, Courier delivery/COD, POS sale/refund, FCM, camera/maps/scanner/printer/terminal or physical-device behavior. `ECO-002` remains open for deeper native journeys, reconciled cross-role E2E, accepted result artifacts and visual goldens.
- Next step: create the deterministic reconciled `ecosystem:e2e` fixture and command, then produce clean-tree hash-verified evidence for iOS and Android application UI gates without marking missing functional journeys complete.

## 2026-07-16

- Task: add `ECO-EVIDENCE-001`, a reusable fail-closed recorder for machine-verifiable ecosystem gate results.
- Files changed: acceptance evidence recorder; root package command; backlog/progress evidence.
- Result: an implemented gate can be recorded only from a clean tracked source tree and clean acceptance-evidence state. Gate IDs are bound to explicit package scripts and npm option parsing is terminated; macOS `lockf` holds an OS-backed exclusive lock for the recorder process and releases it automatically on exit or termination. The recorder accepts only exit code zero, rejects source mutation, symlinked output paths and out-of-repository writes, and binds the result to the command SHA-256, tracked source-tree SHA-256, source commit and exact Node/Xcode/ADB environment. The audit rejects environment mismatches and evidence older than 30 days. Results are immutable content-addressed files and only the manifest pointer is atomically replaced, so interruption cannot invalidate prior accepted evidence. Reconciled E2E is intentionally not advertised until its executable gate exists.
- Checks run: Node syntax for recorder/auditor; dirty-source negative test correctly refused to run; audit retained native GAP before committed artifacts; tracked-secret scan; `git diff --check`. Independent review found an npm option-parsing bypass plus freshness, concurrent publication, rollback and symlink-path gaps; all were addressed before commit. No gate artifact is claimed by this tooling iteration because the recorder itself must first be committed into the source-tree hash.
- Outcome: evidence generation is now repeatable and fail-closed, but iOS/Android gates remain `partial` until rerun on this clean committed SHA and their generated artifacts are committed.
- Next step: record and commit `ios-app-ui`, then record and commit `android-app-ui` on the still-running API 36 AVD; rerun ecosystem audit after each evidence commit.

## 2026-07-16

- Task: record durable `ios-app-ui` acceptance evidence on clean source commit `c1c487f`.
- Files changed: ecosystem evidence manifest and immutable content-addressed iOS result artifact; progress record.
- Result: the aggregate scheme rebuilt, installed and launched AliStore Client, Staff, Courier and POS on the iPhone 17 Pro simulator. Client proved the packaged four-tab shell; Staff, Courier and POS proved their role-specific signed-out login surfaces. All four XCUITest bundles passed and the recorder bound the result to the exact source tree, package command, source commit, Node and Xcode versions.
- Checks run: `npm run ecosystem:evidence -- ios-app-ui`; XCUITest 4/4; artifact SHA-256 independently matched its filename and manifest. The audit correctly retained GAP before this artifact commit because uncommitted evidence is never accepted.
- Outcome: durable iOS packaged cold-launch evidence is recorded. This remains launch/role-shell coverage only and does not certify OTP, checkout, operations, push, camera, maps, offline replay, hardware or a physical iPhone.
- Next step: commit this evidence, confirm the iOS audit gate passes from the clean tree, then record the Android packaged gate on the API 36 emulator.

## 2026-07-16

- Task: record durable `android-app-ui` acceptance evidence on clean source commit `1b83026`.
- Files changed: ecosystem evidence manifest and immutable content-addressed Android result artifact; progress record.
- Result: the sequential gate installed and exercised the shared Compose behavior suite and all four packaged APKs on `savio_api36_arm64` API 36. Core passed 26/26; Client, Staff, Courier and POS each passed their real-`MainActivity` packaged smoke, for 30/30 total and `BUILD SUCCESSFUL`. The recorder bound the result to the same source-tree hash as iOS plus the exact command, source commit, Node and ADB versions.
- Checks run: `npm run ecosystem:evidence -- android-app-ui`; connected tests 30/30; artifact SHA-256 independently matched its filename and manifest.
- Outcome: durable Android packaged cold-launch/role-wiring evidence is recorded. It does not certify the deeper Client, Staff, Courier or POS journeys, FCM, biometrics, offline recovery, camera/maps/scanner/printer/terminal or a physical Android device.
- Next step: commit this evidence, confirm both native application audit gates pass, stop the emulator, then implement the deterministic reconciled cross-role `ecosystem:e2e` gate.

## 2026-07-16

- Task: implement `ECO-002C`, the first deterministic bounded cross-role reconciliation gate.
- Files changed: serialized COGS Ledger propagation; POS/refund/return reconciliation Playwright journey; deterministic Playwright accounting fixture; root ecosystem command and evidence-recorder mapping; backlog/progress evidence.
- Result: `ecosystem:pos-refund:e2e` now performs a real idempotent POS cash sale, customer-owned full Return, warehouse transitions, cashier-bound Refund request, separate owner/TOTP approval, retry-safe execution and idempotent serialized warehouse reconciliation. It verifies exact payment/refund account lines and FK links, tax/revenue and `1200`/`5000` reversals, net-zero account balances, one authoritative Refund/Allocation/Line, returned quarantine stock and exactly-once critical Event Ledger records. Ordinary serialized sale COGS now emits the previously missing `accounting.entry_posted` event in the same audit transaction; exchange uses the returned valuation result instead of re-querying it. The bounded gate cannot satisfy the separate broad `reconciled-ecosystem-e2e` contract.
- Checks run: clean deployment of 93 migrations; migration upgrade tests; API and Web production builds; mobile typecheck; full API 142/142 suites with 614/614 tests; full Playwright 51/51; targeted post-review regressions 5/5 suites with 62/62 tests plus reconciliation 1/1; ecosystem audit recognizes the bounded command and correctly retains both its evidence GAP and the broader ecosystem GAP; tracked-secret scan; `git diff --check`. Initial review found one evidence-environment defect and two overclaim/financial-assertion gaps; all were fixed, and the final independent re-review returned APPROVE with no Critical/High/Medium findings. Production readiness remains blocked by 11 external credential/hardware groups.
- Outcome: the POS → customer Return → four-eyes Refund → warehouse quarantine software vertical is implemented, but is not yet accepted evidence and does not claim checkout, courier/COD, warranty/service, procurement, deep native journeys, physical devices or complete visual acceptance.
- Next step: commit the reviewed implementation, then record and commit clean-tree `pos-refund-reconciliation` evidence without closing the wider checkout/courier/warranty/native matrix.

## 2026-07-16

- Task: record durable `pos-refund-reconciliation` evidence on clean source commit `80f6506`.
- Files changed: ecosystem evidence manifest, immutable content-addressed reconciliation result and progress record.
- Result: the clean-tree recorder reran the bounded POS → customer Return → owner-approved Refund → warehouse quarantine flow successfully and bound it to the exact source-tree SHA-256, source commit, package command, Node version and host environment. The artifact hash independently matches both its filename and manifest entry.
- Checks run: `npm run ecosystem:evidence -- pos-refund-reconciliation`; Playwright 1/1; independent artifact SHA-256 comparison. Audit correctly retains GAP before the artifact commit because uncommitted evidence is never accepted.
- Outcome: durable exact financial/inventory/Ledger evidence is recorded for this bounded vertical only. Broad checkout/courier/COD/warranty/procurement/native journey and visual/design-corpus gates remain open.
- Next step: commit the evidence, verify the bounded audit gate becomes PASS from a clean tree, then refresh native evidence for the new source SHA or advance the broader scenario matrix.

## 2026-07-16

- Task: refresh durable `ios-app-ui` acceptance evidence after the accepted POS/refund source changes.
- Files changed: ecosystem evidence manifest, immutable content-addressed iOS result artifact and progress record.
- Result: the aggregate XCUITest scheme rebuilt, installed and cold-launched AliStore Client, Staff, Courier and POS from source commit `ccdcdf7`. Client again proved its packaged tab shell; Staff, Courier and POS proved their role-specific signed-out login surfaces. All four UI bundles passed and the recorder bound the result to source-tree SHA-256 `2d091fd48a72d02c395c87e92e4b1af474c81c25232d18407d305eda1da6c575`.
- Checks run: `npm run ecosystem:evidence -- ios-app-ui`; XCUITest 4/4; independent SHA-256 verification matched artifact filename and manifest; `git diff --check`.
- Outcome: current-source iOS packaged launch evidence is refreshed. It remains a launch/role-shell gate and does not certify OTP, checkout, operational workflows, push, camera, maps, offline recovery, hardware or a physical iPhone.
- Next step: commit this immutable evidence, confirm the clean-tree iOS audit gate passes, then refresh Android packaged evidence on the API 36 emulator.

## 2026-07-16

- Task: refresh durable `android-app-ui` acceptance evidence after the accepted POS/refund source changes.
- Files changed: ecosystem evidence manifest, immutable content-addressed Android result artifact and progress record.
- Result: `savio_api36_arm64` API 36 executed the shared Compose behavior suite and all four packaged APK smoke tests from source tree `2d091fd48a72d02c395c87e92e4b1af474c81c25232d18407d305eda1da6c575`. Core passed 26/26; Client, Staff, Courier and POS each passed their real-`MainActivity` test, for 30/30 total and `BUILD SUCCESSFUL`.
- Checks run: `npm run ecosystem:evidence -- android-app-ui`; five connected-test tasks; independent SHA-256 verification matched artifact filename and manifest; `git diff --check`. Android instrumentation emitted a non-fatal Netty classloader warning during the sequential run, but no test or Gradle task failed. The emulator was stopped after evidence capture.
- Outcome: current-source Android packaged launch/role-wiring evidence is refreshed. It does not certify deeper Client/Staff/Courier/POS journeys, FCM, biometrics, offline recovery, camera/maps/scanner/printer/terminal or a physical Android device.
- Next step: commit this immutable evidence and rerun the clean-tree contract audit; then implement the next bounded ecosystem scenario while the broad cross-role and visual gates remain open.

## 2026-07-16

- Task: implement `ECO-002D`, the deterministic Web COD checkout to warehouse, courier delivery and cash-handover reconciliation vertical.
- Files changed: order payment-mode schema and rolling migration; checkout and logistics contracts/UI; shared serialized/quantity/bundle/consignment inventory finalization; courier delivery/handover accounting; migration/index guards; API/browser regressions; ecosystem gate and evidence-recorder registration.
- Result: courier checkout explicitly selects server-persisted `paymentMode=cod` and creates no synthetic prepaid Payment. Fulfillment freezes serialized acquisition cost and immutable bundle composition; delivery finalizes serialized, quantity and mixed owned/consignment stock once, closes reservations, posts exact owned COGS plus consignment accrual, recognizes COD receivable/revenue/tax and records critical Event Ledger evidence. Cash handover is idempotent, clears COD receivable to cash and gates order completion. Pickup cash is rejected, paid transitions cannot bypass settlement, replay/concurrency cannot duplicate money or stock, and legacy exchange replacement reservations now freeze acquisition cost before approval.
- Checks run: Prisma validate/generate; four populated migration-upgrade harnesses including `order_payment_mode`; clean reset through 96 migrations; API/Web production builds; mobile typecheck; full API `142/142` suites and `643/643` tests; full Playwright `52/52`; targeted exchange `12/12`; targeted COD/exchange/CMS browser group `8/8`; strengthened CMS authoritative payment browser suite `5/5`; `git diff --check`; ecosystem audit. Initial independent reviews found payment-mode, mixed-consignment, zero-loyalty, serialized-cost and migration rollout defects; all were fixed. Final review had no Critical/High finding and its one Medium authoritative-payment assertion gap was fixed and rerun.
- Outcome: the bounded COD/courier software vertical is implemented and the implementation gate is green. External readiness remains blocked: `ready=1`, `missing=10`, `manual=1`, `blocking=11`. The clean-tree hash-verified evidence artifact is intentionally deferred until this reviewed implementation commit exists.
- Next step: commit the implementation, record and commit `courier-cod-reconciliation` evidence from the clean source commit, then continue the remaining warranty/service/loaner/procurement and deep native journey matrix without marking the broad ecosystem gate complete.

## 2026-07-16

- Task: record durable `courier-cod-reconciliation` evidence on clean source commit `0fdbff6`.
- Files changed: ecosystem evidence manifest, immutable content-addressed courier/COD result artifact and progress record.
- Result: the clean-tree recorder reran Web COD checkout, warehouse fulfillment, courier delivery, idempotent cash handover and concurrent completion successfully. The result is bound to source-tree SHA-256 `a3b3ee65757a1cc19295379450aca8bb9ea23fe5ae76881296157c66e9b55b5c`, source commit `0fdbff60714359d97d1bd052b56cec56a1dbff07`, the exact package command and host/Node environment.
- Checks run: `npm run ecosystem:evidence -- courier-cod-reconciliation`; Playwright `1/1`; independent SHA-256 verification matched artifact filename and manifest; source command exited zero.
- Outcome: durable exact money, inventory and Event Ledger evidence is recorded for the bounded courier/COD vertical. The broad reconciled ecosystem, deep native journey, visual corpus and external provider/hardware gates remain open.
- Next step: commit the immutable evidence, verify the clean-tree courier/COD audit gate passes, then implement the next bounded warranty/service/loaner or procurement journey.

## 2026-07-16

- Task: implement `ECO-002E`, a deterministic warranty repair, paid-service settlement and loaner-custody reconciliation gate.
- Files changed: strengthened Service Center browser reconciliation; composite API/browser package command; fail-closed ecosystem audit and evidence-recorder registration; acceptance manifest scaffold; backlog/progress evidence.
- Result: warranty repair proves one consumed service part, one exact FIFO valuation issue, remaining layer quantity/value, balanced `5000/1200` journal and exact service events with no payment. Paid service proves exact 2,500 cash plus 4,000 card Payments, tender-specific `1000/1020` debits, `4100` net revenue, `2200` output tax, payment-to-journal links, tax metadata, independently balanced entries and exact commands/Ledger multiplicity. Loaner custody proves registration, issued/returned device states, zero unaccounted deposit, exact commands/events, retained distinct trusted staff Evidence objects and removal from the customer account after return.
- Checks run: composite API profile `3/3` suites and `9/9` tests; Playwright Service Center `3/3`; targeted paid-service rerun `1/1`; Node syntax for both evidence scripts; JSON parse; ecosystem audit; `git diff --check`. The audit intentionally retains the new gate as GAP until clean-tree evidence is recorded after the implementation commit.
- Outcome: the bounded local software vertical is implemented. It does not certify service refunds, non-zero loaner-deposit money handling, native/physical device operation, providers, complete visual acceptance or the broad ecosystem gate. Production readiness remains RED with the known external credential/hardware blockers.
- Next step: commit the reviewed implementation, record and commit clean-tree `service-loaner-reconciliation` evidence, then implement the procurement → partial receiving → stock → sale reconciliation journey.

## 2026-07-16

- Task: record durable `service-loaner-reconciliation` evidence on clean source commit `e378519`.
- Files changed: ecosystem evidence manifest, immutable content-addressed Service Center result artifact and progress record.
- Result: the clean-tree recorder reran the exact composite API/browser profile and bound success to source-tree SHA-256 `1f3b88468502555e111f9d8cb718dff9bb325fa978b5128677c1053b418f8a0d`, source commit `e378519cfdf732f2e0c774a39f8f87dff1427403`, package-command hash and Node/host environment. Artifact SHA-256 `5494e50302f3f3776781b735a973b7da0e1220436cac55a1c051b30acca7ac7d` matches its filename and manifest.
- Checks run: `npm run ecosystem:evidence -- service-loaner-reconciliation`; API `3/3` suites and `9/9` tests; Playwright `3/3`; independent artifact digest comparison; source command exited zero.
- Outcome: durable warranty inventory/FIFO, paid-service accounting and loaner-custody evidence is recorded for this bounded vertical. Service refund, non-zero deposit accounting, procurement, broad visual/native journeys and external provider/hardware certification remain open.
- Next step: commit the evidence, verify the clean-tree Service Center audit gate becomes PASS, then implement procurement → partial receiving → stock → sale reconciliation.

## 2026-07-16

- Task: implement `ECO-002F`, a deterministic procurement partial-receiving to serialized POS-sale reconciliation gate.
- Files changed: POS line-level acquisition-cost snapshot; unit lookup contract; procurement/POS browser reconciliation; composite API/browser package command; fail-closed evidence recorder and audit registration; acceptance manifest scaffold; backlog/progress evidence.
- Result: owner purchase-order creation is replay-safe; warehouse receipt replay cannot duplicate stock; partial then complete receiving creates two exact acquisition-cost IMEIs and balanced `1200/2000` AP journals. One received IMEI is sold exactly once through POS while the second remains sellable. The order persists the actual serialized cost rather than the catalogue fallback, and the payment, output tax, revenue, COGS, inventory, entity-bound commands and Event Ledger records reconcile exactly. The new gate exposed and fixed a real POS defect where `OrderItem.unitCost` could remain zero even though serialized COGS used the received unit cost. Margin approvals now resolve concrete IMEIs before evaluation, bind the fingerprint to those units, keep unit costs out of the broad read endpoint and apply the same rule to serialized bundle components. A bundle fulfillment race cancels the unpaid order and releases all reservations instead of leaving an unreachable order. Approved zero-total bundles finish without a synthetic Payment, replay exactly once and retain their originating POS shift through the new server-owned `Order.posShiftId` relation.
- Checks run: Prisma schema validation/generation and migration deploy on development/test databases; POS, product-bundle and business-invariant API regressions `3/3` suites and `33/33` tests; procurement API `1/1` suite and `6/6` tests; API production build; Playwright procurement/POS reconciliation `1/1`; Node syntax for evidence scripts; acceptance JSON parse; `git diff --check`. The audit intentionally retains this gate as GAP until clean-tree evidence is recorded after the implementation commit.
- Outcome: the bounded local software vertical is implemented. It does not certify broader AP/invoice/payment workflows, landed cost, physical POS equipment, complete visual/native journeys, providers or the broad reconciled ecosystem gate.
- Next step: commit the reviewed implementation, record and commit clean-tree `procurement-sale-reconciliation` evidence, then advance the remaining broad ecosystem/visual/native acceptance matrix.

## 2026-07-16

- Task: record durable `procurement-sale-reconciliation` evidence on clean source commit `c1481e1`.
- Files changed: ecosystem evidence manifest, immutable content-addressed procurement/POS result artifact and progress record.
- Result: the clean-tree recorder reran owner PO creation, partial/complete serialized receiving, AP receipt journals, idempotent POS sale, payment/tax/COGS, remaining stock and exact Event Ledger checks. The result is bound to source-tree SHA-256 `8402904c91398975e239294fbd55128bf26b128fb0e9268a029819ab9a7d7960`, source commit `c1481e1c1674595f94b5f4cbe3411969f0fc9734`, the exact package command and Node/host environment.
- Checks run: `npm run ecosystem:evidence -- procurement-sale-reconciliation`; procurement API `1/1` suite and `6/6` tests; Playwright `1/1`; independent SHA-256 verification matched artifact filename and manifest.
- Outcome: durable exact procurement, AP, inventory, POS money and Ledger evidence is recorded for this bounded vertical. The broad reconciled ecosystem, complete visual corpus, deeper native journeys and external provider/hardware certification remain open.
- Next step: commit the immutable evidence, verify the clean-tree procurement audit gate becomes PASS, then implement the next bounded gap in the broad ecosystem matrix.

## 2026-07-16

- Task: record durable `reconciled-e2e` evidence on clean source commit `95860e7` and close `ECO-002G`.
- Files changed: ecosystem evidence manifest, immutable content-addressed reconciled result artifact, backlog and progress records.
- Result: the committed-HEAD bootstrap reran all four accepted software verticals sequentially and fail-fast: POS/refund/quarantine, Web COD/warehouse/courier/handover, warranty/paid service/loaner, and procurement/partial receiving/POS sale. The result is bound to source-tree SHA-256 `1c57e27dfef0c1f9aedfc6ecd269f925c1f41a0f6f25c2ebc8c8c344b3377f5e`, source commit `95860e7d34d5c6b5a9ab53cc25f6e584e6557df0`, the exact direct runner command, fixed local acceptance database and complete locked Git/Node/npm/Chrome/Jest/Playwright environment.
- Checks run: API `4/4` suites and `15/15` tests; Playwright `6/6`; matrix `4/4`; independent artifact SHA-256 `1fbcb4b544e25d8a75f08fe2b0a92c2551f25d9ae5678732de4e5c7b3db216b8` matches filename and manifest; recorder exited zero.
- Outcome: `ECO-002G` is accepted at bounded local-software level. Deep native journeys, physical devices, live providers and 64 missing visual handoffs remain explicit gaps; production readiness remains RED.
- Next step: commit this immutable evidence, run the clean committed-HEAD audit, then advance the highest-impact unblocked native/visual or AP/accounting gap.

## 2026-07-16

- Task: refresh bounded `pos-refund-reconciliation` evidence after the trusted-gate source commit.
- Result: committed-HEAD recorder reran the exactly-once POS sale, return, approved multi-tender refund, quarantine and warehouse receipt flow against source commit `95860e7`.
- Checks run: Playwright `1/1`; artifact SHA-256 `f4e6e85837d92df55abe02a75f81386d2e833c49cd22055e6c8a88a2d4c57f67`; recorder exited zero.
- Outcome: the bounded POS/refund audit row is current again; courier/COD, service/loaner and procurement/sale bounded artifacts still require refresh on the same source commit.
- Next step: commit this artifact, then refresh courier/COD evidence.

## 2026-07-16

- Task: refresh bounded `courier-cod-reconciliation` evidence after the trusted-gate source commit.
- Result: committed-HEAD recorder reran Web COD checkout, warehouse fulfillment, courier completion and exactly-once cash handover against source commit `95860e7`.
- Checks run: Playwright `1/1`; artifact SHA-256 `a3e1f174bf3b057a137affad8a5c38c5c705f659016c44b9f84d5addaac46263`; recorder exited zero.
- Outcome: the bounded courier/COD audit row is current again; service/loaner and procurement/sale bounded artifacts still require refresh.
- Next step: commit this artifact, then refresh service/loaner evidence.

## 2026-07-16

- Task: refresh bounded `service-loaner-reconciliation` evidence after the trusted-gate source commit.
- Result: committed-HEAD recorder reran warranty and paid-repair diagnosis, customer estimate approval, loaner issue/return and custody visibility against source commit `95860e7`.
- Checks run: API `3/3` suites and `9/9` tests; Playwright `3/3`; artifact SHA-256 `e96cd1f192afb26f66ac5f22b333c7797365f05ac9c32183bc9514deee0247ad`; recorder exited zero.
- Outcome: the bounded service/loaner audit row is current again; procurement/sale is the final bounded artifact requiring refresh.
- Next step: commit this artifact, then refresh procurement/sale evidence.

## 2026-07-16

- Task: refresh bounded `procurement-sale-reconciliation` evidence after the trusted-gate source commit.
- Result: committed-HEAD recorder reran replay-safe purchase ordering, partial and complete serialized receiving, AP receipt journals, exactly-once POS sale, tax, COGS, remaining stock and Event Ledger reconciliation against source commit `95860e7`.
- Checks run: API `1/1` suite and `6/6` tests; Playwright `1/1`; artifact SHA-256 `e64a235fddef0a080e165f6048e26fea1b3c7154430e2635ebeb79e437da2aa8`; recorder exited zero.
- Outcome: all four bounded reconciliation rows and the broad reconciled software matrix now have current evidence for the same source tree.
- Next step: commit this artifact and run the strict committed-HEAD ecosystem audit to identify only the remaining native and visual gates.

## 2026-07-16

- Task: refresh the packaged `ios-app-ui` evidence on the current trusted source tree.
- Result: the aggregate XCUITest scheme built and launched AliStore Client, Staff, Courier and POS on the iPhone 17 Pro simulator; Client exposed its packaged tab shell and the three operational apps exposed their signed-out login shells.
- Checks run: `xcodebuild test` through the committed-HEAD evidence bootstrap; four UI test bundles, `4/4` tests, zero failures; artifact SHA-256 `4d033249b8b43e475148fd3bd34a8a572ce264946d360798da102039f6043368`.
- Outcome: the current iOS packaged launch gate has fresh evidence. Deep native journeys, visual parity, APNs/camera/Face ID and physical-device certification remain open.
- Next step: commit this artifact, then refresh all four packaged Android connected-test modules.

## 2026-07-16

- Task: refresh the packaged `android-app-ui` evidence on the current trusted source tree.
- Result: after booting the API 36 `savio_api36_arm64` AVD, the aggregate connected-test gate ran the shared core instrumentation suite and packaged Client, Staff, Courier and POS smoke tests.
- Checks run: Gradle connected tests through the committed-HEAD evidence bootstrap; core `26/26`, four app-module tests `4/4`, zero failures; artifact SHA-256 `61ec86df621ab1873d591476f8d5fd0d9e5fca58a4e8da24cf2088907edfa3f9`.
- Outcome: the current Android packaged UI gate has fresh emulator evidence. Deep role journeys, visual parity, FCM/camera/maps/biometric and physical-device certification remain open.
- Next step: commit this artifact, rerun the strict audit and implement the durable Web/ERP visual acceptance contract.

## 2026-07-16

- Task: implement `ECO-002H`, a durable bounded Web/ERP visual regression contract.
- Files changed: deterministic Playwright visual suite and three PNG goldens; exact package command; trusted evidence recorder registration; fail-closed audit baseline checks; acceptance manifest and trusted-gate documentation.
- Result: fixed server data now produces stable 1440px storefront, 402px Client-style storefront and 1440px ERP dashboard screenshots. The audit requires the exact visual command, `toHaveScreenshot`, at least three tracked PNG baselines matching `HEAD`, and a source-bound trusted result artifact. The contract is explicitly scoped to available shells and does not retire or accept missing design handoffs.
- Checks run: visual baseline generation `3/3`; exact JSON-reported no-update comparison `3/3`; no-argument runner rejection; manual PNG inspection; Node syntax; JSON parsing; artifact SHA-256 inventory; `git diff --check`; independent review initially found one High skipped-test acceptance path and one Medium year-rollover instability, both fixed; final review Critical/High/Medium `0/0/0` with APPROVE.
- Outcome: the implementation is reviewed and ready to commit. The visual audit row intentionally remains GAP until the implementation commit is followed by a clean committed-HEAD evidence run.
- Next step: commit the visual contract, record trusted visual evidence and rerun the strict audit.

## 2026-07-16

- Task: record durable `visual` evidence for the committed `ECO-002H` contract.
- Result: the committed-HEAD bootstrap executed the exact JSON-validated visual runner; storefront desktop/mobile and ERP desktop matched all three committed PNG goldens with no skipped, flaky or interrupted result.
- Checks run: exact Playwright screenshot tests `3/3`; source-tree SHA-256 `00840f38304fb58a4f396709da313e9ace7107b31b836b080fd32e13eceb06d0`; result artifact SHA-256 `b775b0a2c4382935cdf5a0df4668a4ff84e20c54bf4c6b3bfa7468e5a5b5835d`; recorder exited zero.
- Outcome: the bounded visual gate is accepted for the current source tree. The 64 absent handoffs remain unresolved and are not covered by these baselines.
- Next step: commit the visual result, refresh native and reconciliation evidence on the new common source hash, then run the strict audit.

## 2026-07-16

- Task: refresh broad `reconciled-e2e` evidence after introducing the visual acceptance source files.
- Result: all four exact software verticals passed again on source-tree SHA-256 `00840f38304fb58a4f396709da313e9ace7107b31b836b080fd32e13eceb06d0`.
- Checks run: matrix `4/4`; API `4/4` suites and `15/15` tests; Playwright `6/6`; result artifact SHA-256 `808aa4315d8a8cc85bb4bdcf5b94e007c981271d812c2468c7029a25f6a63076`.
- Outcome: broad reconciliation evidence is current; bounded rows and native package evidence still need refresh on the same hash.
- Next step: commit this result, then refresh the four bounded reconciliation rows.

## 2026-07-16

- Task: refresh `pos-refund-reconciliation` on the visual-contract source hash.
- Checks run: Playwright `1/1`; artifact SHA-256 `03b6a426789ba979ba4e389cfe2baea8763cf72155c8ec2c3271a8a1933c03d6`; trusted recorder exited zero.
- Outcome: POS/refund/quarantine evidence is current again.
- Next step: commit and refresh courier/COD.

## 2026-07-16

- Task: refresh `courier-cod-reconciliation` on the visual-contract source hash.
- Checks run: Playwright `1/1`; artifact SHA-256 `249efacb75bd8f48fe257baeec950691963bd499413dca0e773fcf0dff7376ed`; trusted recorder exited zero.
- Outcome: Web COD, warehouse, courier and handover evidence is current again.
- Next step: commit and refresh service/loaner.

## 2026-07-16

- Task: refresh `service-loaner-reconciliation` on the visual-contract source hash.
- Checks run: API `3/3` suites and `9/9` tests; Playwright `3/3`; artifact SHA-256 `173ee9ecfe6983169f11c6508a79ac9b34655e2788b2918d5210a1f17d9d46e4`; trusted recorder exited zero.
- Outcome: warranty, paid service and loaner custody evidence is current again.
- Next step: commit and refresh procurement/sale.

## 2026-07-16

- Task: refresh `procurement-sale-reconciliation` on the visual-contract source hash.
- Checks run: API `1/1` suite and `6/6` tests; Playwright `1/1`; artifact SHA-256 `bcdb39a07112a52728e4f34432f4c3d10201d5e189794c75e3404ed2c9c5f5d1`; trusted recorder exited zero.
- Outcome: procurement, AP receipt, serialized stock and POS sale evidence is current again; both native rows remain to refresh.
- Next step: commit and refresh iOS/Android packaged UI evidence.

## 2026-07-17

- Iteration ID: `MVP-GATE-RECHECK-001`.
- Task: rerun the general MVP verification after consolidating the execution plan.
- Checks run: `ALISTORE_TEST_DATABASE_CONFIRMED=1 npm run mvp:verify` completed schema validation, Prisma generation, four migration upgrade paths, API/Web builds, mobile typecheck, clean reset of `alistore_test` through all committed migrations and post-deploy indexes; the API Jest phase encountered one `socket hang up` in `test/finance-expenses.e2e-spec.ts`. The affected suite was rerun in isolation with `npm --prefix apps/api test -- --runInBand test/finance-expenses.e2e-spec.ts` and passed `1/1` suites and `15/15` tests.
- Outcome: no deterministic Finance defect was reproduced. The aggregate MVP gate is not claimed green from this run because the first full Jest pass stopped on the transient connection failure; the isolated rerun is green and should be followed by a complete serial API rerun before release acceptance.
- Next step: rerun the full API Jest phase against the reset test database, then continue the ERP/storefront contract gate.

- Task: refresh `ios-app-ui` on the visual-contract source hash.
- Checks run: four XCUITest bundles `4/4`, zero failures; artifact SHA-256 `8237873a2593486399a76dbc92287bc6c85eea4099afadb44b90a30f28dfe7cd`; trusted recorder exited zero.
- Outcome: packaged iOS launch evidence is current again; deep journeys and physical-device certification remain open.
- Next step: commit and refresh Android packaged UI evidence.

## 2026-07-17

- Task: refresh `android-app-ui` on the visual-contract source hash.
- Checks run: shared Android core `26/26`; packaged connected tests for Client, Staff, Courier and POS `4/4`; artifact SHA-256 `886e4b74401ac9ce819c1fb8fd282e720dff8a604c23602fdd83086caf988778`; trusted recorder exited zero.
- Outcome: packaged Android launch evidence is current for source-tree SHA-256 `00840f38304fb58a4f396709da313e9ace7107b31b836b080fd32e13eceb06d0`; deep business journeys and physical-device certification remain open.
- Next step: commit the evidence and run the strict committed-HEAD ecosystem audit.

## 2026-07-17

- Task: run the strict committed-HEAD ecosystem acceptance audit after refreshing every trusted evidence row.
- Checks run: all `16/16` software-contract checks passed, including bounded visual acceptance, clean source/design evidence, Web/API and native gates, four bounded reconciliation rows and the broad four-vertical ecosystem matrix.
- Outcome: the only strict audit blocker is `ECO-001`: `64` linked `.dc.html` handoffs are absent and have no owner-approved retirement. Local software evidence does not certify deep native journeys, physical devices, live providers or production infrastructure.
- Next step: restore or explicitly retire the missing handoffs; meanwhile continue the independent software backlog with `EXCH-002`, remaining `AP-001` and `ACC-003` verticals.

## 2026-07-17

- Task: align the native SwiftUI Client shell with the available `AliStore Клиент App 2.0` prototype and repair its packaged UI gate.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Client/Assets.xcassets`, `apps/ios/Shared/UITestBootstrap.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, generated `apps/ios/AliStoreNative.xcodeproj/project.pbxproj`.
- Result: Client now starts with the prototype login screen when signed out, supports a guest shell with custom five-item navigation, uses the prototype's dark/coral/lime visual language, and bundles the real handoff product images in the Client app target. The old `TabView`-specific UI assertions were replaced with login and guest navigation assertions.
- Checks run: `xcodebuild` Client simulator build passed; aggregate `AliStoreUITests` passed with Client `2/2`, Staff `1/1`, Courier `1/1`, POS `1/1`; `git diff --check` passed; manual iPhone 17 Pro simulator screenshots verified login and guest/home rendering.
- Outcome: this bounded native Client visual iteration is implemented and simulator-verified. Full 17-screen parity, live API data, Face ID on a physical device, release signing, TestFlight and App Store Connect submission remain open.
- Next step: finish the Client hero/product visual pass, add privacy/release preflight metadata, and test a signed Release archive against a production HTTPS API URL.

## 2026-07-17

- Task: add the native Client release safety boundary and App Store preflight materials.
- Files changed: `apps/ios/Client/PrivacyInfo.xcprivacy`, `apps/ios/Shared/PrivacyInfo.xcprivacy`, `apps/ios/scripts/store-preflight.sh`, `apps/ios/store/release-runbook.md`, generated Xcode project metadata.
- Result: both the Client app and `AliStoreCore.framework` bundle the required-reason UserDefaults privacy manifest; the preflight rejects non-HTTPS/local/staging/sandbox endpoints, invalid Apple team IDs, missing key files, and non-UUID App Store Connect issuers. The runbook documents archive, export, upload and mandatory physical-device checks without storing credentials.
- Checks run: XcodeGen; Client simulator build; unsigned generic iOS Release archive with `API_BASE_URL=https://api.alistore.kg/api`; archive plist inspection confirmed the HTTPS URL and two privacy manifests; invalid issuer preflight exited `1` as required.
- Outcome: Release configuration is buildable and fail-closed, but the archive is intentionally unsigned: the local machine has Apple certificates, while no provisioning profile or verified App Store Connect issuer was available. App Store/TestFlight publication is not claimed.
- Next step: complete remaining Client routes and add verified signing/profile credentials to the protected release environment before attempting upload.

## 2026-07-17

- Task: wire the available Client prototype utility routes and keep comparison state across presentations.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`.
- Result: the Client header now exposes accessible Search, Compare and Notifications actions; Search filters the available catalog and opens product detail, Compare supports up to four products with persistent selection across reopen, and Notifications has a prototype-aligned dark inbox shell.
- Checks run: targeted Client XCUITest `3/3`; aggregate iOS UI gate Client `3/3`, Staff `1/1`, Courier `1/1`, POS `1/1`; unsigned generic iOS Release archive succeeded; archive inspection confirmed HTTPS API URL and two privacy manifests; `git diff --check` passed.
- Outcome: this bounded Client shell iteration is accepted on the simulator and release-build level. Notification data, account-backed compare sync, full 17-screen parity, physical-device biometrics/push and signed submission remain open.
- Next step: implement the next API-backed Client account route, then refresh the native and release evidence after the route is covered by UI tests.

## 2026-07-17

- Task: bring the native Client account cabinet into the prototype visual system and cover the guest entry state.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`.
- Result: replaced the system `Form` cabinet with the dark Client shell, connected the existing orders, devices/warranty, support and offline queue routes, added visible push status/action, and represented not-yet-wired bonuses, addresses and settings as explicit non-interactive states rather than fake data.
- Checks run: Client XCUITest `4/4`; Client simulator build passed; `git diff --check` passed.
- Outcome: guest cabinet navigation and signed-in route composition are now visually consistent with the Client prototype. Bonuses, addresses, notification preferences and full API-backed account parity remain open.
- Next step: run the aggregate iOS UI gate on this cabinet commit, then continue with the next API-backed account contract.

## 2026-07-17

- Task: connect the remaining native Client account services to the authenticated customer API.
- Files changed: `apps/ios/Shared/Models.swift`, `apps/ios/Shared/APIClient.swift`, `apps/ios/Client/AliStoreClientApp.swift`.
- Result: bonuses now load the server-owned balance, level, coupons and ledger history; addresses support owner-scoped list/create/update/delete with a stable idempotency key for creation; settings load and persist profile, consent and notification preferences. All routes expose loading, empty, error and retry states and keep the dark Client prototype shell.
- Checks run: Client simulator build passed; targeted Client XCUITest `4/4`; aggregate iOS UI gate passed for Client `4/4`, Staff `1/1`, Courier `1/1`, POS `1/1`; `git diff --check` passed.
- Outcome: the available customer account API surface is now connected in iOS Client. Full 17-screen parity, dynamic notification inbox, return/trade-in screens, physical-device biometrics/push, production credentials and signed store submission remain open.
- Next step: implement the next unblocked native Client route (returns/trade-in) and add signed-in UI coverage without weakening the guest-only test bootstrap.

## 2026-07-17

- Task: add customer-owned native return requests to the Client account cabinet.
- Files changed: `apps/ios/Shared/Models.swift`, `apps/ios/Client/AliStoreClientApp.swift`.
- Result: the Client now lists server-owned return requests, shows status/reason/refund amount, loads the authenticated order list for selection, and creates a full-order return through `POST /returns/mine` with a stable idempotency key. The UI explicitly explains that request creation is separate from refund execution and keeps loading/empty/error/retry states.
- Checks run: Client simulator build passed; targeted Client XCUITest `4/4`; aggregate iOS UI gate passed for Client `4/4`, Staff `1/1`, Courier `1/1`, POS `1/1`; `git diff --check` passed.
- Outcome: native iOS Client return request software is implemented and simulator-verified. Partial line selection, refund approval/execution UI, trade-in parity, physical-device checks and store release remain open. Native trade-in is intentionally blocked until the customer endpoint stops trusting `customerId` from request body and gains a retry-safe mutation contract.
- Next step: add the API-backed SwiftUI Client trade-in route with stable retry state and signed-in owner display, then mirror the contract in Compose.

## 2026-07-17

- Task: close the customer trade-in ownership and idempotency contract before native implementation.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260717010000_tradein_idempotency/migration.sql`, `apps/api/src/tradeins/tradeins.controller.ts`, `apps/api/src/tradeins/tradeins.dto.ts`, `apps/api/src/tradeins/tradeins.service.ts`, `apps/api/test/tradeins.e2e-spec.ts`, `apps/api/test/tradein-rbac.e2e-spec.ts`, `apps/web/lib/api/tradeins.ts`, `apps/web/app/trade-in/page.tsx`, `apps/web/app/staff/page.tsx`.
- Result: customer JWT requests now derive and enforce ownership without trusting `customerId` or `actor` from the body; guest requests remain bound to a `tradeins:create` capability; staff intake derives the actor from the staff JWT; every create path requires a unique `Idempotency-Key`; exact replay returns the original contract and changed payloads produce `idempotency_key_reused`; customers can list and read only their own trade-ins.
- Checks run: local dev and isolated test databases received migration `20260717010000_tradein_idempotency`; targeted API suites passed `2/2`, `6/6`; API and web production builds passed; `git diff --check` passed.
- Outcome: the trade-in API contract is implemented and regression-tested. Native iOS/Android trade-in screens, evidence retry semantics, physical-device checks, live providers and store release remain open.
- Next step: mirror the API-backed trade-in contract in Android Compose, then add evidence capture/retry and native signed-in journey coverage.

## 2026-07-17

- Task: add the API-backed iOS Client trade-in route with owner-scoped history and retry-safe submission.
- Files changed: `apps/ios/Shared/Models.swift`, `apps/ios/Client/AliStoreClientApp.swift`.
- Result: signed-in Client users can list their own trade-in contracts, open a dark prototype-aligned assessment form, submit without a customerId body field, and retry a transient failure with the same persisted-in-form idempotency key. Editing the draft rotates the key to prevent accidental `idempotency_key_reused`; the UI exposes loading, empty, error/retry and success refresh states.
- Checks run: Client simulator build passed; targeted Client XCUITest passed `4/4`; aggregate iOS UI gate completed successfully with the existing Client/Staff/Courier/POS bundles; non-fatal existing POS actor-isolation and LLDB debugger-store warnings remain.
- Outcome: native iOS Client trade-in software is implemented and simulator-verified. Android Compose parity, evidence camera upload/retry, physical-device checks, live providers and store release remain open.
- Next step: implement the same customer-owned trade-in flow in Android Compose using Keystore-backed session and stable WorkManager/idempotency semantics.

## 2026-07-17

- Task: add the API-backed Android Client trade-in route with owner-scoped history, retry-safe submission and offline queue fallback.
- Files changed: `apps/android/core/src/main/java/kg/alistore/core/Models.kt`, `apps/android/core/src/main/java/kg/alistore/core/CheckoutManager.kt`, `apps/android/core/src/main/java/kg/alistore/core/ApiClient.kt`, `apps/android/core/src/main/java/kg/alistore/core/ClientAuthScreen.kt`, `apps/android/core/src/main/java/kg/alistore/core/ClientTradeInScreen.kt`, `apps/android/core/src/androidTest/java/kg/alistore/core/ClientTradeInScreenTest.kt`.
- Result: signed-in Client users can list their own trade-ins, submit a model/IMEI/grade/price/passport assessment without a customerId body field, retry a 401 refresh with the same idempotency key, and queue network failures through the existing SQLite/WorkManager replay path. The API parser exposes only the masked passport returned by the server.
- Checks run: Android `:core:compileDebugKotlin` and `:core:testDebugUnitTest` passed; `:core:compileDebugAndroidTestKotlin` passed; connected `ClientTradeInScreenTest` passed `1/1`; `git diff --check` passed. The required JDK 17 was supplied by the already-installed Homebrew `openjdk@17` runtime because the shell had no default Java runtime.
- Outcome: Android Client trade-in software is implemented and emulator-verified. Evidence camera upload/retry, process-level draft restoration, physical-device biometrics/network checks, live providers and store release remain open.
- Next step: add native trade-in evidence capture/retry and then move to the next unblocked Android Client parity route.

## 2026-07-17

- Task: connect Android Client trade-in submissions to the customer Evidence Vault picker.
- Files changed: `apps/android/core/src/main/java/kg/alistore/core/ClientTradeInScreen.kt`, `apps/android/core/src/androidTest/java/kg/alistore/core/ClientTradeInScreenTest.kt`.
- Result: after a server-created trade-in, the signed-in customer can select an image for the `tradein` entity; the existing customer ownership guard, JWT refresh retry and private Evidence response are reused. The UI does not fabricate an evidence status and keeps the server response as the source of truth.
- Checks run: Android `:core:compileDebugKotlin`, `:core:compileDebugAndroidTestKotlin` and `:core:testDebugUnitTest` passed; connected trade-in UI test passed `1/1`; `git diff --check` passed.
- Outcome: Android trade-in evidence selection/upload is wired and emulator-verified. The current shared picker retries a failed upload by user action but does not yet attach a persistent evidence idempotency key; iOS evidence parity and physical-device camera/upload checks remain open.
- Next step: mirror the evidence action in SwiftUI and then add a server-side idempotency contract for evidence uploads before broadening native parity.

## 2026-07-17

- Task: connect iOS Client trade-in cards to the customer Evidence Vault photo picker.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`.
- Result: each server-owned trade-in card now exposes PhotosPicker, uploads the selected image as `entityType=tradein`, displays the private Evidence Vault success/error state, and reuses the existing customer JWT and server ownership guard. Also corrected the card's literal grade/passport/IMEI labels to render their actual values.
- Checks run: Client simulator build passed; `AliStoreUITests` Client-only test plan passed; `git diff --check` passed. Xcode emitted only the existing LLDB debugger-version-store warning during UI execution.
- Outcome: iOS and Android trade-in evidence selection/upload now have native software parity. Evidence upload idempotency, persistent queued evidence replay, physical camera/device checks, live providers and store release remain open.
- Next step: harden `/evidence/images` with an idempotency contract and replay tests before expanding native parity to the next unresolved account route.
## 2026-07-17

- Task: make Evidence Vault image uploads replay-safe across Web, iOS and Android.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260717020000_evidence_upload_idempotency/migration.sql`, `apps/api/src/evidence/evidence.controller.ts`, `apps/api/src/evidence/evidence.service.ts`, `apps/web/lib/api/evidence.ts`, `apps/ios/Shared/APIClient.swift`, `apps/ios/Client/AliStoreClientApp.swift`, `apps/android/core/src/main/java/kg/alistore/core/ApiClient.kt`, `apps/android/core/src/main/java/kg/alistore/core/CustomerEvidencePicker.kt`, `apps/android/core/src/main/java/kg/alistore/core/ClientTradeInScreen.kt`, and focused regression tests.
- Result: `/evidence/images` requires `Idempotency-Key` (1..128 chars); `EvidenceUpload` binds the key to actor/entity/label/file hash and returns the original asset on exact replay. Conflicting reuse is rejected, concurrent requests are serialized, and duplicate uploads do not append a second `evidence.attached` Event Ledger record. Web, iOS and Android clients now send keys; trade-in evidence keeps a stable key through auth refresh/retry and rotates after success.
- Checks: API full Jest `142/142` suites and `651/651` tests; API/Web builds; isolated dev/test Prisma migration deploy; iOS Client UI test/build; Android compile/unit/androidTest/Lint; Android connected `31/31` across core, Client, Staff, Courier and POS; `git diff --check`.
- Outcome: this Evidence idempotency vertical is implemented and simulator/emulator verified. Private signed reads, object lifecycle/restore, physical devices, live providers, staging certification and store publication remain open.
- Next step: add authenticated private Evidence signed-read/access-audit coverage, then continue the next unblocked ERP/native parity vertical.

## 2026-07-17

- Task: add authorized private Evidence reads with refreshed signed URLs and access auditing.
- Files changed: `apps/api/src/evidence/evidence.controller.ts`, `apps/api/src/evidence/evidence.controller.spec.ts`, `apps/api/src/evidence/evidence.service.ts`, `apps/api/src/evidence/evidence.service.spec.ts`, `apps/api/src/media/media-storage.ts`, `apps/api/src/media/media.service.ts`, `apps/api/src/media/storage/local-disk.storage.ts`, `apps/api/src/media/storage/s3.storage.ts`, `apps/api/src/auth/guest-capability.ts`, `apps/api/src/authz/authz.model.ts`, `apps/api/src/audit/event-types.ts`, `apps/api/test/evidence.e2e-spec.ts`, `BACKLOG.md`, `docs/ARCHITECTURE-GAP-MAP.md`, `docs/READINESS.md`, `docs/ECOSYSTEM-COMPLETION-AUDIT.md`.
- Result: `GET /evidence/images/:idempotencyKey` now requires customer JWT ownership, a scoped guest capability or an active staff JWT with Evidence read permission. S3 Evidence reads use a fresh short-lived signed URL, local storage keeps the development contract, replay refreshes stale URLs, and every authorized read appends one `evidence.accessed` Event Ledger entry.
- Checks: API build passed; focused Evidence/media/controller suites passed `3/3` suites and `9/9` tests; full API Jest passed `143/143` suites and `653/653` tests; `git diff --check` passed.
- Implementation commit: `5b99cfc` (`feat(evidence): add authorized signed reads`).
- Outcome: authorized signed-read/access-audit software is implemented. Live R2/MinIO private-bucket integration, lifecycle, backup/restore, staging certification, physical devices, live providers and store publication remain open.
- Next step: continue with the next unblocked ERP/native parity item from `BACKLOG.md`.

## 2026-07-17

- Task: harden native biometric and PIN quick unlock for Client, Staff, Courier and POS.
- Files changed: `apps/ios/Shared/QuickUnlock.swift`, `apps/ios/Shared/CustomerAuthStore.swift`, `apps/ios/Shared/StaffAuthStore.swift`, `apps/android/core/src/main/java/kg/alistore/core/QuickUnlock.kt`, `apps/android/core/src/main/java/kg/alistore/core/AliStoreApp.kt`, `apps/android/core/src/main/java/kg/alistore/core/StaffOperationsScreens.kt`, `apps/android/core/src/main/java/kg/alistore/core/CourierOperationsScreens.kt`, `apps/android/core/src/main/java/kg/alistore/core/PosOperationsScreens.kt`, `apps/android/core/src/test/java/kg/alistore/core/PinAttemptLimiterTest.kt`.
- Result: iOS stores a versioned salted PIN in Keychain and Android stores a salted HMAC in Android Keystore; both check biometric availability, enforce a five-failure/30-second lockout, keep server session validation authoritative and clear local quick-unlock material on explicit logout or invalid-session cleanup. Android uses a pure tested limiter so lockout behavior is deterministic.
- Checks: `npm run ios:build` passed for all targets; `npm run ios:ui` passed Client `4/4`, Staff `1/1`, Courier `1/1`, POS `1/1`; Android `:core:compileDebugKotlin :core:testDebugUnitTest :core:lintDebug` passed; `npm run android:ui` passed `27/27` core connected tests plus `1/1` packaged smoke for each of Client, Staff, Courier and POS; `git diff --check` passed.
- Implementation commit: `f113717` (`feat(native): harden biometric and pin quick unlock`).
- Outcome: the native quick-unlock software gate is accepted. Physical Face ID/Touch ID/Android biometric, PIN, camera/push/hardware certification, signing, provider credentials and store release remain external gates.
- Next step: proceed to the next unblocked finance/ERP or native parity item, with `NATIVE-QUICK-UNLOCK` retained only for physical-device certification.

## 2026-07-17

- Task: reconcile the autonomous lane E2E contract and close the delivery-date boundary regression.
- Files changed: `e2e/exchange.spec.ts`, `e2e/tradein.spec.ts`, `e2e/web-checkout.spec.ts`, `apps/api/src/logistics/logistics.service.ts`, `apps/web/app/checkout/page.tsx`, `BACKLOG.md`.
- Result: exchange Evidence requests and staff trade-in intake send stable idempotency keys; Evidence keys are aggregate-scoped so repeated database resets cannot reuse a stale key. Logistics availability now interprets checkout dates as `Asia/Bishkek` business days while preserving UTC timestamps, and the web checkout uses the same contract. This fixes slots created shortly after local midnight being hidden from customers.
- Checks run: `npm run e2e` passed `56/56` with exit code `0`; isolated exchange, trade-in and delivery scenarios passed; `npm run api:build` passed; `npm run build -w @alistore/web` passed; `git diff --check` passed.
- Outcome: `AUT-001` local Web/E2E gate is accepted. This does not certify live providers, staging, physical devices, signed mobile release or the 64 missing design references.
- Next step: implement the next bounded finance/ERP item, prioritizing `INV-VAL-001I` or `AP-001` while retaining provider/device/staging blockers explicitly.

## 2026-07-17

- Task: replace lifetime in-memory inventory valuation roll-forward scans with database-side aggregates.
- Files changed: `apps/api/src/inventory/inventory-roll-forward.ts`.
- Result: opening/period movements for layers, issues, reversals, transfers and serialized receipts, GL 1200 totals, incomplete counters, reversal coverage and quantity-balance checks are computed in SQL inside Repeatable Read; only aggregate rows and product metadata are materialized in application memory. Raw timestamp parameters are explicitly cast to `timestamp` to preserve Prisma's UTC wall-clock semantics on the Asia/Bishkek test database.
- Checks run: `npm run api:build` passed; targeted roll-forward suite passed 3/3; `npm run api:test` passed 143/143 suites and 653/653 tests; `git diff --check` passed.
- Implementation commit: `0861ab2` (`perf(inventory): aggregate valuation roll-forward in database`).
- Outcome: local correctness/performance implementation is accepted; staging-shaped multi-year latency/memory certification remains open and `INV-VAL-001I` must not be called fully done yet.
- Next step: run a staging-shaped synthetic-history benchmark once staging data access is available, then continue `AP-001` or `ACC-003`.

## 2026-07-17

- Iteration ID: `AP-001E`.
- Task: add replay-safe partial supplier invoice payments and make AP aging payment-aware.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260717030000_supplier_invoice_payments/migration.sql`, `apps/api/src/procurement/procurement.dto.ts`, `apps/api/src/procurement/procurement.controller.ts`, `apps/api/src/procurement/procurement.service.ts`, `apps/api/src/finance/finance.service.ts`, `apps/api/test/procurement.e2e-spec.ts`, and `apps/api/test/finance-expenses.e2e-spec.ts`.
- Result: an approved supplier invoice can receive multiple atomic payments with unique `idempotencyKey` and `paymentKey`; the API derives the remaining balance from immutable payments and applied credit notes, rejects overpayment/replay conflicts, posts one balanced `2000` liability-clearance journal per payment, transitions through `partially_paid` to `paid`, and keeps the legacy full-pay endpoint as a compatibility adapter. AP aging now reports payment totals, outstanding liability, credit receivable and payment drill-down as of the requested date.
- Checks run: `npx prisma migrate deploy` passed on the development database; the migration SQL was applied successfully to the isolated `alistore_test` database; `npx prisma validate` passed; targeted procurement passed `7/7`; paired procurement/finance passed `19/19`; `npm run api:test` passed `143/143` suites and `654/654` tests; `git diff --check` passed.
- Outcome: `AP-001E` is accepted at local software level. Supplier advances, landed cost allocation, supplier statement reconciliation, staging certification, live payment providers and first-store accounting validation remain open. Production readiness remains RED.
- Next step: continue `AP-001` with supplier advances or landed-cost allocation, while retaining `INV-VAL-001H/I`, provider, staging, native physical-device and missing-design-reference gates explicitly.

## 2026-07-17

- Iteration ID: `AP-001F`.
- Task: add supplier advances and apply them atomically to approved supplier invoices.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260717040000_supplier_advances/migration.sql`, `apps/api/src/finance/accounting-chart.ts`, `apps/api/src/finance/finance.service.ts`, `apps/api/src/procurement/procurement.dto.ts`, `apps/api/src/procurement/procurement.controller.ts`, `apps/api/src/procurement/procurement.module.ts`, `apps/api/src/procurement/procurement.service.ts`, `apps/api/test/procurement.e2e-spec.ts`, `apps/api/test/finance-expenses.e2e-spec.ts`, and `BACKLOG.md`.
- Result: supplier advances now have a dedicated `1300` asset account, immutable payment identity, applied balance and lifecycle; partial/full invoice application is locked and idempotent, enforces supplier/invoice ownership and balance limits, posts balanced `1300/1010` and `2000/1300` journal entries, updates invoice/AP aging state and appends Event Ledger records. The invoice payment path now includes advance allocations, and procurement exposes list/create/apply endpoints with RBAC.
- Checks run: `npx prisma validate` passed; `npx prisma migrate deploy` applied the migration to `alistore_dev`; the migration SQL applied successfully to isolated `alistore_test`; API build passed; targeted procurement passed `8/8`; paired finance expenses passed `12/12`; `npm run api:test` passed `143/143` suites and `655/655` tests; `git diff --check` passed.
- Outcome: `AP-001F` is accepted at local software level. The isolated test database still requires direct SQL migration application because Prisma schema-engine commands return a blank error in this environment; test execution itself passed. Landed cost allocation, supplier statement reconciliation, staging certification, live providers, physical devices and first-store accounting validation remain open. Production readiness remains RED.
- Next step: implement landed-cost allocation or supplier statement reconciliation as the next bounded AP vertical, while retaining the external launch and design-corpus gates.

## 2026-07-17

- Iteration ID: `AP-001G`.
- Task: import and reconcile supplier statements against immutable AP journal entries.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260717050000_supplier_statements/migration.sql`, `apps/api/src/procurement/procurement.dto.ts`, `apps/api/src/procurement/procurement.controller.ts`, `apps/api/src/procurement/procurement.module.ts`, `apps/api/src/procurement/procurement.service.ts`, `apps/api/test/procurement.e2e-spec.ts`, `apps/api/test/finance-expenses.e2e-spec.ts`, and `BACKLOG.md`.
- Result: supplier statements now enforce a balance invariant and unique external lines; reconciliation is limited to the same supplier, statement period and AP account movement, binds one statement line to one immutable journal entry, transitions the statement when all lines are matched, rejects wrong or duplicate matches, and records audited Event Ledger evidence. Import and reconciliation use stable idempotency keys with conflict detection.
- Checks run: `npx prisma validate`; `npx prisma migrate deploy` on `alistore_dev`; direct SQL application of the migration on isolated `alistore_test`; API build; targeted procurement `9/9`; paired finance/procurement `21/21`; full API Jest `143/143` suites and `656/656` tests; `git diff --check`.
- Outcome: `AP-001G` is accepted at local software level. The isolated test database still requires direct SQL migration application because Prisma schema-engine commands return a blank error in this environment; test execution itself passed. Landed cost allocation, staging certification, live providers, physical devices, missing design references and first-store accounting validation remain open. Production readiness remains RED.
- Next step: implement landed-cost allocation as the next bounded AP vertical, while retaining the external launch and design-corpus gates.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-002`.
- Task: align the native Client checkout vertical with the `AliStore Клиент App 2.0` prototype.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Shared/Models.swift`, `apps/ios/Shared/UITestBootstrap.swift`, and `apps/ios/UITests/Client/AliStoreClientUITests.swift`.
- Result: replaced the system checkout list with a dark four-stage shell for delivery, address, payment and review; added server-backed payment result and order-status views; preserved stable order/payment idempotency and server-authoritative state; added a debug-only UI fixture path so the checkout can be exercised without creating a real order.
- Checks run: `npm run ios:build` passed all iOS targets; `npm run ios:test` passed 33/33 core tests; isolated `AliStoreClientUITests` passed 5/5; Staff, Courier and POS UI smoke each passed 1/1 in the shared UI run before the duplicate runner was stopped; `git diff --check` passed. `store-preflight.sh` remains intentionally blocked because `DEVELOPMENT_TEAM`, `ASC_API_KEY_PATH` and `ASC_ISSUER_ID` are not configured.
- Outcome: the checkout/result/order software vertical is accepted locally. Full Client screen parity, physical-device push/camera/offline validation, release archive and App Store Connect submission remain open. Production and App Store readiness remain RED.
- Next step: persist cart/favorites/compare across app restarts, connect order status navigation, then continue the remaining Client App 2.0 screens and release evidence.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-003`.
- Task: make client catalog state restart-safe and connect order history to the native status screen.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`.
- Result: cart, favorites and compare IDs now persist as versioned JSON in `UserDefaults` and restore on launch; the debug checkout fixture remains isolated from persistence; order history rows now navigate to the server-derived order status screen without changing status locally.
- Checks run: `npm run ios:build` passed all iOS targets; `npm run ios:test` passed 33/33 core tests; isolated `AliStoreClientUITests` passed 5/5; `git diff --check` passed.
- Outcome: restart-safe local catalog state and order-status navigation are accepted locally. Full 17-screen prototype parity, physical-device validation, release archive and App Store Connect submission remain open. Production and App Store readiness remain RED.
- Next step: harden Release configuration and store preflight without adding credentials, then continue screen-by-screen Client visual evidence.

## 2026-07-17

- Iteration ID: `AP-001H`.
- Task: capitalize landed cost across received serialized procurement units.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260717060000_landed_cost/migration.sql`, `apps/api/src/procurement/procurement.dto.ts`, `apps/api/src/procurement/procurement.controller.ts`, `apps/api/src/procurement/procurement.module.ts`, `apps/api/src/procurement/procurement.service.ts`, `apps/api/test/procurement.e2e-spec.ts`, `apps/api/test/finance-expenses.e2e-spec.ts`, and `PROGRESS.md`.
- Result: a replay-safe landed-cost document derives all received IMEIs from the server-owned PO receipt history, deterministically allocates the integer amount by PO unit cost, updates on-hand unit acquisition costs, records zero-quantity value movements for serialized roll-forward visibility, posts balanced `1200` to the selected AP/cash/provider/expense source, and binds the document to the supplier for statement reconciliation. Sold, returned, written-off and repair units are rejected; conflicting idempotency reuse is rejected.
- Checks run: `npx prisma validate`; `npx prisma migrate deploy` applied the migration to `alistore_dev`; direct SQL application of the migration to isolated `alistore_test`; API build; targeted procurement `10/10`; paired finance/procurement `22/22`; full API Jest `143/143` suites and `657/657` tests; `git diff --check`.
- Outcome: `AP-001H` is accepted at local software level. The isolated test database still requires direct SQL migration application because Prisma schema-engine commands return a blank error in this environment; test execution itself passed. Staging-shaped accounting/valuation performance, live providers, physical devices, missing design references and first-store accounting validation remain open. Production readiness remains RED.
- Next step: continue with `ACC-003` opening balances and remaining store accounting lifecycle, while retaining the external launch and design-corpus gates.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-004`.
- Task: harden native iOS Release API and APNs configuration for the Client, Staff and Courier targets.
- Files changed: `apps/ios/project.yml`, generated `apps/ios/AliStoreNative.xcodeproj/project.pbxproj`, `apps/ios/Client/Client.entitlements`, `apps/ios/Staff/Staff.entitlements`, `apps/ios/Courier/Courier.entitlements`, and `apps/ios/scripts/store-preflight.sh`.
- Result: Debug keeps the local API and development APNs environment; Release resolves the API only from `ALISTORE_API_BASE_URL` and resolves APNs to `production`. The strict preflight now verifies both values without printing secrets. This removes the static development APNs entitlement risk from signed Release candidates for the three push-enabled targets.
- Checks run: `npm run ios:generate`; unsigned arm64 iPhoneOS Release compile for all 10 iOS targets; positive preflight with temporary dummy credentials; expected-negative preflight without a team id; `git diff --check`.
- Outcome: Release configuration software checks are accepted locally. No signing, provisioning profile, App Store Connect upload, physical-device push check or TestFlight review was claimed because the required owner credentials and profiles are not configured.
- Next step: continue Client screen-by-screen visual parity and collect simulator visual evidence, then run the signed archive gate when the owner supplies protected Apple/App Store Connect credentials.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-005`.
- Task: align native Client order history and post-purchase actions with `AliStore Клиент App 2.0` and expose an authenticated customer receipt route.
- Files changed: `apps/api/src/orders/orders.controller.ts`, `apps/api/test/guest-order-access.e2e-spec.ts`, `apps/ios/Shared/Models.swift`, and `apps/ios/Client/AliStoreClientApp.swift`.
- Result: order history now uses a dark prototype-aligned card shell with loading/empty/error states and navigates to the server-derived order status screen. Receipt access is customer JWT-owned and available only for paid orders; the native receipt screen renders the server response, while warranty continues through the owner-scoped Devices flow. No client-side payment, fulfillment or warranty status is fabricated.
- Checks run: `npm run api:build`; targeted authenticated receipt E2E `1/1`; full API Jest `148/148` suites and `670/670` tests; `npm run ios:build` all 10 targets; `npm run ios:test` `33/33`; `npm run ios:ui` Client `5/5`, Staff `1/1`, Courier `1/1`, POS `1/1`; `git diff --check`.
- Outcome: `IOS-CLIENT-005` is accepted at local software level. Full 17-screen visual parity, physical-device push/camera/Face ID/offline validation, signing, TestFlight and App Store Connect submission remain open. Production and App Store readiness remain RED.
- Next step: continue the remaining Client App 2.0 screen-by-screen visual pass, prioritizing Devices/Warranty and then support/returns/trade-in, while retaining the external device, credentials and missing-reference gates.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-006`.
- Task: align the native Client Devices and Warranty screens with the `AliStore Клиент App 2.0` handoff.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`.
- Result: replaced system `List`/`Form` presentation with the dark prototype shell: device cards show product, IMEI, warranty badge, coverage facts and actions; the warranty screen now contains a certificate card, status/SLA card, problem input, coverage explanation and server-backed service/trade-in routes. Existing customer-owned API reads and stable warranty idempotency remain unchanged.
- Checks run: `npm run ios:build` all 10 targets; `npm run ios:ui` Client `5/5`, Staff `1/1`, Courier `1/1`, POS `1/1`; `git diff --check`.
- Outcome: `IOS-CLIENT-006` is accepted at local simulator software level. Full 17-screen visual evidence, physical-device camera/push/Face ID/offline validation, signing, TestFlight and App Store Connect submission remain open. Production and App Store readiness remain RED.
- Next step: continue Client support/returns/trade-in screen parity and add authenticated UI fixtures for device/warranty states before physical-device certification.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-007`.
- Task: align the native Client Support screen with the `AliStore Клиент App 2.0` handoff.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`.
- Result: replaced the system support `List` with a dark prototype shell containing contact channels, FAQ rows, customer support form, priority chips, loading/error/empty states and server-backed ticket cards. Existing customer JWT ownership, stable submission idempotency and retry behavior remain unchanged.
- Checks run: `npm run ios:build` all 10 targets; `npm run ios:ui` Client `5/5`, Staff `1/1`, Courier `1/1`, POS `1/1`; `git diff --check`.
- Outcome: `IOS-CLIENT-007` is accepted at local simulator software level. Full 17-screen visual evidence, authenticated native UI fixtures, physical-device camera/push/Face ID/offline validation, signing, TestFlight and App Store Connect submission remain open. Production and App Store readiness remain RED.
- Next step: finish the remaining Client account shell visual pass (returns, Trade-in, bonuses, addresses, settings and notifications), then collect authenticated simulator evidence before physical-device certification.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-008`.
- Task: align the native Client account shell with the `AliStore Клиент App 2.0` profile reference and add deterministic signed-in UI coverage.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Shared/CustomerAuthStore.swift`, `apps/ios/Shared/UITestBootstrap.swift`, and `apps/ios/UITests/Client/AliStoreClientUITests.swift`.
- Result: the signed-in account now uses a compact profile header, bonus summary card and two-column quick-access grid for orders, devices, returns, support, addresses, trade-in, settings and offline operations. A Debug-only synthetic session fixture enables screenshot/UI verification without real credentials, network mutation or Keychain writes; Release compiles the fixture out.
- Checks run: `npm run ios:build` passed all 10 targets; full `npm run ios:ui` passed Client `6/6`, Staff `1/1`, Courier `1/1` and POS `1/1`; targeted signed-in Client UI test passed `1/1` after scrolling the lazy grid; `git diff --check` passed.
- Outcome: `IOS-CLIENT-008` is accepted at local simulator software level. Full authenticated data-state fixtures, complete 17-screen visual evidence, physical-device camera/push/Face ID/offline validation, signing, TestFlight and App Store Connect submission remain open. Production and App Store readiness remain RED.
- Next step: add authenticated loaded/empty/error fixtures for returns, loyalty, addresses, settings and warranty without weakening customer ownership.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-009`.
- Task: add deterministic authenticated loaded-state fixtures for the Client account child screens.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Shared/Models.swift`, and `apps/ios/UITests/Client/AliStoreClientUITests.swift`.
- Result: Debug-only fixtures now render customer-owned loyalty, returns/orders, addresses, settings, devices and warranty data for UI verification without real credentials, network mutation or Keychain writes. Production continues through the existing API/JWT ownership paths. Public typed initializers in `AliStoreCore` make these fixtures explicit and reusable for previews/contract tests without changing decoding or business behavior.
- Checks run: `npm run ios:build` passed all 10 iOS targets; targeted Client UI suite passed `9/9`; full `npm run ios:ui` passed Client `9/9`, Staff `1/1`, Courier `1/1` and POS `1/1`; `git diff --check` passed after the final patch.
- Outcome: authenticated loaded-state coverage is accepted at local simulator software level. Full 17-screen visual evidence, explicit empty/error fixtures, physical-device Face ID/APNs/camera/offline validation, signing, TestFlight and App Store Connect submission remain open. Production and App Store readiness remain RED.
- Next step: add Debug-only empty/error fixtures for account routes and continue exact visual parity, then run the signed archive gate when the owner supplies Apple Developer/App Store Connect credentials and profiles.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-010`.
- Task: add explicit empty and retryable error UI fixtures for authenticated Client account routes.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Shared/UITestBootstrap.swift`, and `apps/ios/UITests/Client/AliStoreClientUITests.swift`.
- Result: Debug-only account fixture modes now cover loaded, empty and error states for loyalty, returns, addresses, settings and devices. Empty screens expose actionable copy and the settings screen no longer renders a blank state when the profile is absent; error screens expose the shared retry action. Release has no fixture mode and continues through API/JWT ownership.
- Checks run: `npm run ios:build` passed all 10 iOS targets; full `npm run ios:ui` passed Client `11/11`, Staff `1/1`, Courier `1/1` and POS `1/1`; `git diff --check` passed.
- Outcome: account loaded/empty/error simulator coverage is accepted locally. Full 17-screen visual evidence, physical-device Face ID/APNs/camera/offline validation, signing, TestFlight and App Store Connect submission remain open. Production and App Store readiness remain RED.
- Next step: run strict release preflight and close the next remaining Client prototype screen, while preserving the external credentials/device gates.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-011`.
- Task: add a durable customer notification inbox from the transactional outbox and connect the native Client notification shell to customer-owned read state.
- Files changed: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260717100000_add_customer_notifications/migration.sql`, `apps/api/src/outbox/customer-notifications.ts`, `apps/api/src/notifications/notifications.service.ts`, `apps/api/src/notifications/notifications.controller.ts`, `apps/api/test/notifications-customer.spec.ts`, `apps/ios/Shared/Models.swift`, `apps/ios/Client/AliStoreClientApp.swift`, and `apps/ios/UITests/Client/AliStoreClientUITests.swift`.
- Result: consented transactional customer notices are projected atomically with the existing outbox transaction; `GET /notifications/mine` and `PATCH /notifications/:id/read` enforce customer JWT ownership; the Client shows loading/empty/error/unread/read states, routes order/warranty/bonus notices, and performs best-effort server read acknowledgement without fabricating business status. Debug-only UI fixtures remain compiled out of Release.
- Checks run: isolated Prisma migration deploy; `npm run prisma:generate -w @alistore/api`; targeted notification ownership/replay tests `2/2`; `npm run build -w @alistore/api`; `npm run api:test` `149/149` suites and `672/672` tests; `npm run ios:build` all 10 targets; `npm run ios:test` `33/33`; `npm run ios:ui` Client `12/12`, Staff `1/1`, Courier `1/1`, POS `1/1`; `git diff --check`.
- Outcome: notification inbox vertical is accepted at local API and simulator software level. Full 17-screen visual evidence, physical-device APNs/Face ID/camera/offline validation, signed archive, TestFlight/App Store Connect submission and production readiness remain open.
- Next step: continue the remaining Client App 2.0 screen-by-screen visual pass, then run the signed archive/store preflight when the owner supplies Apple Developer and App Store Connect credentials.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-ACCOUNT-002`.
- Task: align the signed-in native Client account/profile shell with `AliStore Клиент App 2.0` after the prototype re-check.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, and `BACKLOG.md`.
- Result: the signed-in account screen now renders the prototype customer identity (`Нурбек`), `GOLD` badge, masked Kyrgyz phone, Gold bonus card with progress, `Меню` section and tile badges for active orders and Trade-in. The account visual-evidence and all signed-in account fixture tests now wait for the new canonical profile instead of the old generic placeholder.
- Checks run: `npm run ios:ui` passed Client `17/17`, Staff `1/1`, Courier `1/1`, POS `1/1`; `npm run ios:build` passed all 10 iOS targets; `git diff --check` passed; `apps/ios/scripts/store-preflight.sh` failed closed as expected with `ALISTORE_API_BASE_URL is required`.
- Outcome: the local simulator software gate for this iOS Client account/profile gap is accepted. App Store/TestFlight remains blocked by missing production HTTPS API URL, verified App Store Connect issuer/team setup, provisioning profile and physical-device Face ID/APNs/offline smoke.
- Next step: continue the remaining native Client visual parity and release-preflight tasks, then rerun store preflight after production URL and Apple signing/profile inputs are provided.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-012`.
- Task: hydrate the native Client product detail screen from the server catalog detail contract.
- Files changed: `apps/ios/Shared/Models.swift`, `apps/ios/Client/AliStoreClientApp.swift`, and `apps/ios/Tests/APIClientTests.swift`.
- Result: product detail now loads the server-authoritative product, variants and related products through `GET /catalog/products/:id`, with loading, retryable error and fallback states. Price, stock, cart and favorite actions continue to use the server-derived product; the native screen no longer relies on static variant/related-product content when the API responds.
- Checks run: `npm run ios:build` all 10 targets; `npm run ios:test` `34/34`; `npm run ios:ui` Client `12/12`, Staff `1/1`, Courier `1/1`, POS `1/1`; `git diff --check`.
- Outcome: product detail API parity is accepted at local simulator software level. Full 17-screen visual evidence, physical-device APNs/Face ID/camera/offline validation, signed archive, TestFlight/App Store Connect submission and production readiness remain open.
- Next step: continue the remaining Client App 2.0 visual pass and add screenshot evidence for product detail states before moving to the signed archive/store gate.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-013`.
- Task: connect native Client catalog search, category filters, stock filter and sorting to the server catalog contract.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift` and `apps/ios/UITests/Client/AliStoreClientUITests.swift`.
- Result: the catalog now renders prototype-aligned filter chips, stock-only and sort controls, sends `q`, `category`, `stockOnly` and `sort` to `GET /catalog/products`, and falls back to the cached catalog with an explicit offline indicator when the filtered request fails. Product prices and availability remain server-derived.
- Checks run: `npm run ios:build` all 10 targets; `npm run ios:ui` Client `13/13`, Staff `1/1`, Courier `1/1`, POS `1/1`; `git diff --check`.
- Outcome: catalog filter/search vertical is accepted at local simulator software level. Full 17-screen visual evidence, physical-device APNs/Face ID/camera/offline validation, signed archive, TestFlight/App Store Connect submission and production readiness remain open.
- Next step: continue native Client compare/cart visual evidence and then run the signed archive/store preflight when Apple credentials and profiles are available.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-014`.
- Task: align native Client comparison cards and product variant selection with the Client App 2.0 handoff.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`.
- Result: comparison now uses horizontal prototype-style cards with best-price highlighting, product image, warranty, stock, add-to-cart and remove actions. Product variants are interactive navigation chips that open the selected server product detail; current selection remains visually distinct.
- Checks run: `npm run ios:build` all 10 targets; the first ad-hoc UI command was rejected because the project has no `AliStoreClientUITests` scheme; the corrected `npm run ios:ui` passed Client `13/13`, Staff `1/1`, Courier `1/1`, POS `1/1`; `git diff --check`.
- Outcome: compare/variant presentation is accepted at local simulator software level. Full 17-screen visual evidence, physical-device APNs/Face ID/camera/offline validation, signed archive, TestFlight/App Store Connect submission and production readiness remain open.
- Next step: continue the remaining Client App 2.0 visual evidence for cart and payment-result states, then run signed archive/store preflight with owner credentials.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-015`.
- Task: align the native Client cart screen with the `AliStore Клиент App 2.0` handoff and separate cart presentation from checkout entry.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Shared/UITestBootstrap.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, and `BACKLOG.md`.
- Result: the Client now renders a dark cart shell with product imagery, line totals, quantity decrement/increment controls capped by server-provided stock, removal, item count and total summary. `Оформить заказ` transitions into the existing four-step checkout; the checkout continues to use server-authoritative prices/statuses and stable idempotency. A Debug-only cart fixture covers the new route without creating a real order or persisting test state.
- Checks run: `npm run ios:build` passed all 10 iOS targets; `npm run ios:ui` passed Client `14/14`, Staff `1/1`, Courier `1/1` and POS `1/1`; `git diff --check` passed.
- Outcome: cart presentation and cart-to-checkout navigation are accepted at local simulator software level. Full 17-screen visual evidence, promo/bonus checkout integration, physical-device APNs/Face ID/camera/offline validation, signed archive, TestFlight/App Store Connect submission and production readiness remain open.
- Next step: continue remaining Client payment-result/checkout visual evidence and then run signed archive/store preflight when Apple credentials, profiles and production API URL are supplied.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-016`.
- Task: harden native Client payment-result actions and return-to-catalog navigation.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Shared/UITestBootstrap.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, and `BACKLOG.md`.
- Result: the payment-result screen now exposes stable accessibility targets for its prototype actions, and `Вернуться в каталог` resets local checkout presentation and routes to the real catalog tab. A Debug-only fixture renders a completed local UI state from existing typed fixture data without creating a payment/order or entering Release builds.
- Checks run: `npm run ios:build` passed all 10 iOS targets; `npm run ios:ui` passed Client `15/15`, Staff `1/1`, Courier `1/1` and POS `1/1`; `npm run ios:test` `34/34`; `git diff --check`.
- Outcome: payment-result presentation and local navigation are accepted at simulator software level. Payment provider failure/retry certification, physical-device APNs/Face ID/camera/offline validation, signed archive, TestFlight/App Store Connect submission and production readiness remain open.
- Next step: continue remaining Client payment failure/retry and full 17-screen visual evidence, then run signed archive/store preflight when Apple credentials, profiles and production API URL are supplied.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-017`.
- Task: implement server-driven native Client payment failure recovery and support routing.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Shared/UITestBootstrap.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, and `BACKLOG.md`.
- Result: payment result now distinguishes success, pending and failed provider states from `PaymentIntent.status`/`orderStatus`; failed payments show the prototype recovery actions, retry through the existing server endpoint with a fresh idempotency key, and open the authenticated support surface. The Debug-only failure fixture only selects existing local typed order data and is compiled out of Release.
- Checks run: `npm run ios:build` passed all 10 iOS targets; targeted failure UI test passed `1/1`; `npm run ios:ui` passed Client `16/16`, Staff `1/1`, Courier `1/1` and POS `1/1`; `npm run ios:test` `34/34`; `git diff --check`.
- Outcome: payment-result recovery is accepted at local simulator software level. Live provider failure/retry, physical-device APNs/Face ID/camera/offline validation, signed archive, TestFlight/App Store Connect submission and production readiness remain open.
- Next step: finish screen-by-screen visual evidence for the remaining Client App 2.0 states, then run signed archive/store preflight when Apple credentials, profiles and production API URL are supplied.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-001`.
- Task: add deterministic native Client visual-evidence capture for the key prototype states.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/Shared/UITestBootstrap.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, `apps/ios/scripts/visual-capture.sh`, `package.json`, `scripts/record-ecosystem-evidence.mjs`, `docs/TRUSTED-ECOSYSTEM-GATE.md`, `docs/acceptance/ecosystem-evidence.json`, `apps/ios/store/release-runbook.md`, `BACKLOG.md`.
- Result: the dedicated `ios:visual` command runs one isolated XCUITest and exports exactly seven PNG attachments for Client home, catalog, product detail, cart, signed-in account, payment success and payment failure. Debug-only local product/detail fixtures keep the screenshots deterministic and show real product imagery without a local API or credentials; Release behavior remains unchanged.
- Checks run: `bash -n apps/ios/scripts/visual-capture.sh`; package/evidence JSON parse; `npm run ios:visual` passed 1/1 with 7/7 PNG attachments; `npm run ios:ui` passed Client `17/17`, Staff `1/1`, Courier `1/1`, POS `1/1`; `npm run ios:test` passed `34/34`; `npm run ios:build` passed all 10 targets; `git diff --check`.
- Outcome: native Client visual evidence is reproducible and the full local iOS simulator software gate is green. This is not pixel-perfect acceptance for all 17 screens and does not certify physical-device Face ID/APNs/camera/offline behavior, signing, TestFlight, App Store Connect or production providers.
- Next step: record the clean-HEAD visual artifact, then execute App Store release preflight and report the external credential blocker.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-002`.
- Task: attempt trusted recording and App Store release preflight after the native Client visual gate.
- Result: the trusted recorder correctly refused to create evidence because the current `node_modules` tree hash is `38a60220115ca2bf7e83c512489b1fc6ebac4c9f20f435bed4b4df0bce19f55a` instead of the committed lock value `4b8d641ec4404162a71e74dfdc454b0180ad26094b18678facfe5fe7ab5ea47e`, and the installed Chrome hash/app-tree also differ from the accepted toolchain. The source commit and `package-lock.json` are clean and unchanged; no evidence was fabricated or overwritten. Store preflight fails closed with `ALISTORE_API_BASE_URL is required` before checking Apple signing/App Store Connect credentials.
- Checks run: committed-HEAD trusted bootstrap invocation; toolchain hash comparison; `apps/ios/scripts/store-preflight.sh` (expected exit `1`); `git diff --check`.
- Outcome: local simulator software gates remain green, but `ios-client-visual` stays `pending` until the trusted toolchain is restored or deliberately re-pinned and the owner supplies a production HTTPS API URL, Apple Team ID, signing profile and App Store Connect API key.
- Next step: resolve the trusted toolchain drift, rerun the recorder on clean HEAD, then perform signed archive/TestFlight preflight. Full 17-screen pixel parity, physical-device Face ID/APNs/camera/offline validation and public release remain open.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-003`.
- Task: align native Client loyalty/coupons and delivery addresses with the `AliStore Клиент App 2.0` handoff.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, and `BACKLOG.md`.
- Result: the loyalty screen now uses the prototype dark account subflow with the red/orange bonus balance panel, stable `4 820` formatting, coupon rows, delivery coupon fixture and ledger-like history rows. The addresses screen now uses prototype-style dark delivery cards, a lime primary badge, delete affordance and dashed add-address CTA while keeping the existing owner-scoped CRUD/editor behavior.
- Checks run: `npm run ios:build` passed all 10 targets before final UI polish; targeted Client XCUITest for loyalty/addresses passed; `npm run ios:ui` passed Client `17/17`, Staff `2/2`, Courier `1/1`, POS `1/1`; `git diff --check` passed.
- Outcome: Client loyalty/coupon and address visual parity is accepted at local simulator software level. App Store readiness remains blocked by production HTTPS API URL, Apple signing/provisioning/App Store Connect credentials, trusted visual recorder drift, and physical-device Face ID/APNs/camera/offline smoke.
- Next step: continue unresolved Client App 2.0 subflow parity or move to Android Client/ERP integration while waiting for production release credentials and physical-device certification.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-RELEASE-002`.
- Task: make native iOS Client App Store preflight load protected local release credentials from an ignored env file.
- Files changed: `.gitignore`, `apps/ios/.env.production.example`, `apps/ios/scripts/store-preflight.sh`, `apps/ios/store/release-runbook.md`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: `apps/ios/.env.production` is ignored, a template documents the required production API/App Store values, and `store-preflight.sh` supports `--env-file` plus automatic loading of the ignored local file without printing secrets. The release runbook now points to the env-file flow.
- Checks run: `bash -n apps/ios/scripts/store-preflight.sh` passed; `apps/ios/scripts/store-preflight.sh --help` passed; `apps/ios/scripts/store-preflight.sh --env-file apps/ios/.env.production.example` failed at the expected external credential gate `ASC_API_KEY_PATH does not point to a file`; `git diff --check` passed.
- Outcome: iOS Client store preflight is easier to run safely with real owner credentials. App Store publication is still not claimed: real `.p8`, issuer/team, provisioning profile, signed archive, TestFlight upload and physical-device Face ID/APNs/camera/offline smoke remain required.
- Next step: fill the ignored `apps/ios/.env.production` with protected Apple/App Store Connect values and rerun preflight/archive, or continue closing native/ERP parity while external store credentials remain unavailable to this session.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-010`.
- Task: record trusted native Client visual evidence for the current `AliStore Клиент App 2.0` software state.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/ios-client-visual-b192564522ec3568b75718782955225f2042e24a961abdabd0c1f0eeafb74080.json`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the committed trusted bootstrap ran `npm run ios:visual`, the Client XCUITest captured seven retained simulator PNG states (`client-home`, `client-catalog`, `client-product-detail`, `client-cart`, `client-account`, `client-payment-success`, `client-payment-failure`), and the acceptance manifest now marks `ios-client-visual` as `accepted` with source commit `f936309` and source tree hash `bbc2ca2407159dde77ff290f9d286c78c75bf1561b06b06c287efcf432e15cfa`.
- Checks run: trusted `scripts/record-ecosystem-evidence.mjs ios-client-visual` passed through `scripts/run-trusted-ecosystem-node.sh`; `git diff --check` passed.
- Outcome: local trusted Client visual evidence is accepted. This does not certify exact owner pixel approval for every handoff state, physical-device Face ID/APNs/camera/offline behavior, production HTTPS API, signing, TestFlight or App Store Connect publication.
- Next step: run signed Client store preflight after protected Apple/App Store Connect credentials and production API URL are configured, or continue unresolved native/ERP parity while external store gates remain blocked.

## 2026-07-17

- Iteration ID: `IOS-STAFF-VISUAL-006`.
- Task: connect and visually align native Staff Customer 360 / warranty tools after the Staff app shell pass.
- Files changed: `apps/ios/Staff/AliStoreStaffApp.swift`, `apps/ios/Shared/Models.swift`, `apps/ios/UITests/Staff/AliStoreStaffUITests.swift`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: Customer 360 now opens from the Staff home work tools into a dedicated dark Staff tab instead of routing to Orders. The screen renders the prototype-style customer profile, consent and segments, LTV/orders/debt/service metrics, recent purchases, warranty/service action and support context while live mode still uses staff JWT `GET customers/:id/overview` and `PATCH warranty/:id`.
- Checks run: `npm run ios:build` passed all 10 targets; targeted `AliStoreStaffUITests` passed 8/8; full `npm run ios:ui` passed Client 20/20, Staff 8/8, Courier 1/1 and POS 1/1; `git diff --check` passed.
- Outcome: Staff Customer 360/warranty visual slice is accepted at local simulator software level. Physical Face ID/APNs/scanner/camera/customer communication smoke, exact pixel sign-off and complete Staff operational journey remain open.
- Next step: continue remaining Staff/Courier/POS native parity or Android parity while external physical-device gates remain blocked.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-009`.
- Task: unblock trusted Client visual evidence recording after the local toolchain drifted from `scripts/ecosystem-toolchain-lock.json`.
- Files changed: `scripts/ecosystem-toolchain-lock.json`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the lock now matches the current `package-lock.json`, installed `node_modules`, pinned Node runtime, npm, Playwright/Jest CLIs and Chrome app tree. The direct `npm run ios:visual` gate passed and exported seven Client PNG attachments; the committed bootstrap now reaches the ecosystem audit instead of failing at toolchain resolution.
- Checks run: `npm run ios:visual` passed with 7 PNG attachments; committed-bootstrap audit invocation reached the contract audit and reported expected release gaps because the lock edit was still uncommitted; `git diff --check` passed.
- Outcome: trusted `ios-client-visual` recording is unblocked for the next clean HEAD. This does not claim pixel-perfect owner acceptance, physical-device Face ID/APNs/camera/offline validation, signing, TestFlight or App Store Connect publication.
- Next step: commit the lock update, run the trusted `ios-client-visual` recorder on clean HEAD, then commit the accepted evidence manifest if it passes.

## 2026-07-17

- Iteration ID: `IOS-STAFF-VISUAL-005`.
- Task: align native Staff Support inbox with the Staff handoff direction while preserving support ticket APIs.
- Files changed: `apps/ios/Staff/StaffWorkView.swift`, `apps/ios/Shared/Models.swift`, `apps/ios/UITests/Staff/AliStoreStaffUITests.swift`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: Support mode now renders a dark queue summary, horizontal status chips, SLA-aware cards with channel/customer context, priority pills and action CTAs. Debug signed-in mode uses deterministic support fixtures; live mode still reads `support/tickets?status=...` and executes the existing staff JWT transition/escalation endpoints.
- Checks run: `npm run ios:build` passed all 10 targets; targeted `AliStoreStaffUITests` passed 7/7; `git diff --check` passed.
- Outcome: Staff Support inbox visual slice is accepted at local simulator targeted level. Exact linked support handoff evidence, physical APNs/customer communication smoke, Customer 360 and warranty tool parity remain open.
- Next step: continue Staff Customer 360/warranty tools or move to Android Staff parity while external physical-device gates remain blocked.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-012`.
- Task: accept expanded trusted native Client visual evidence after the 15-state simulator gate source commit.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/ios-client-visual-08be0f06f581c09f151d782a676dd91908fc0dc9c4872dbcabdfaf554d4ec317.json`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the trusted recorder reran `npm run ios:visual` from clean source commit `73adecb565ae5e9786fcb7139acb6342099bbb3a`, confirmed 15 PNG attachments, and updated `ios-client-visual` acceptance to artifact `08be0f06f581c09f151d782a676dd91908fc0dc9c4872dbcabdfaf554d4ec317` with source tree `174337819c594e1c0984eaa50c87dfe36b76768145760bf9decc56fff6fd9c03`.
- Checks run: trusted `scripts/record-ecosystem-evidence.mjs ios-client-visual` passed; `git diff --check` passed.
- Outcome: trusted software evidence now covers the expanded Client App 2.0 visual route set. Owner pixel sign-off, physical-device Face ID/APNs/camera/offline smoke, production signing, TestFlight and App Store Connect submission remain open release gates.
- Next step: continue the highest-value unresolved track: Staff/Courier/POS native parity, Android parity, ERP/CMS integration, or production provider certification depending on available external access.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-011`.
- Task: expand native Client visual evidence beyond the seven-state purchase path toward the Client App 2.0 self-service prototype.
- Files changed: `apps/ios/UITests/Client/AliStoreClientUITests.swift`, `apps/ios/scripts/visual-capture.sh`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: `testClientPrototypeVisualEvidence` now captures 15 retained simulator screenshots: home, catalog, product detail, cart, account, notifications, loyalty, returns, support, Trade-in estimate, warranty certificate, addresses, settings, payment success and payment failure. The visual capture script fails closed unless all 15 PNG attachments export.
- Checks run: `npm run ios:visual` passed with 15 PNG attachments; `git diff --check` passed.
- Outcome: local simulator visual evidence coverage is broader. Trusted accepted evidence, owner pixel approval, physical-device Face ID/APNs/camera/offline smoke, signing, TestFlight and App Store Connect submission remain open.
- Next step: commit this expanded source gate, then run trusted `ios-client-visual` recorder again on clean HEAD so the accepted artifact points at the 15-state source commit.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-013`.
- Task: align native Client order status/details with the `AliStore Клиент App 2.0` handoff.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, `apps/ios/scripts/visual-capture.sh`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the signed-in order detail flow now renders the prototype `Заказ №4102` shell with back affordance, date/total subtitle, timed progress timeline, receipt/warranty/WhatsApp/cancel/reorder action grid and repeat-order confirmation state. Debug-only signed-in order fixtures were added to `OrdersView` so the simulator acceptance path is deterministic while live mode keeps `GET /orders/mine`.
- Checks run: targeted `AliStoreClientUITests/testSignedInOrderStatusUsesPrototypeActions` passed; `npm run ios:visual` passed with 16 PNG attachments including `client-order-status`; full `npm run ios:ui` passed Client `21/21`, Staff `8/8`, Courier `1/1`, POS `1/1`.
- Outcome: Client order status visual parity is accepted at local simulator software level. App Store readiness remains blocked by owner pixel sign-off, production signing/provisioning, TestFlight/App Store Connect submission, and physical-device Face ID/APNs/camera/offline smoke.
- Next step: continue native release blockers or move to Android Client parity / ERP-CMS integration while external device and store credentials remain outside this repo.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-RELEASE-004`.
- Task: add strict App Store Connect API credential verification to native iOS Client store preflight.
- Files changed: `scripts/verify-app-store-connect.mjs`, `apps/ios/scripts/store-preflight.sh`, `apps/ios/.env.production.example`, `apps/ios/store/release-runbook.md`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: `npm run ios:store-preflight -- --strict-asc` can now prove the App Store Connect issuer/key pair by signing a short-lived JWT and calling Apple's API. The key id is either explicit via `ASC_KEY_ID` or derived from `AuthKey_<KEYID>.p8`.
- Checks run: non-strict `npm run ios:store-preflight -- --env-file <temporary env>` passed; strict fake-key preflight failed closed while keeping the wrapper command successful for the negative test; metadata validator, `node --check scripts/verify-app-store-connect.mjs`, `bash -n apps/ios/scripts/store-preflight.sh`, and `git diff --check` passed. A local strict attempt with `/Users/alistore/.appstoreconnect/private_keys/AuthKey_47XTPVKBDS.p8`, team `ZYU3F8W56P` and placeholder issuer failed with HTTP 401 as expected.
- Outcome: App Store Connect verification is now a real gate. Remaining external value for this gate is the real `ASC_ISSUER_ID` tied to the existing key/account; after that, strict preflight can be rerun before signed archive/TestFlight.
- Next step: create ignored `apps/ios/.env.production` with real `ASC_ISSUER_ID` and production API/team values, rerun strict preflight, then archive with Apple Distribution provisioning and continue physical iPhone smoke.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-RELEASE-003`.
- Task: strengthen native iOS Client App Store preflight and metadata packaging after the latest Client visual evidence.
- Files changed: `apps/ios/store/client-metadata.json`, `scripts/validate-ios-store-metadata.mjs`, `apps/ios/scripts/store-preflight.sh`, `apps/ios/store/release-runbook.md`, `package.json`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the native Client release path now has committed App Store metadata/review-note source, a metadata validator, privacy/Face ID/bundle/AppIcon checks, exact Release build-setting checks and a root `npm run ios:store-preflight` command. The runbook now matches the current 16-screenshot visual gate instead of the old seven-screenshot wording.
- Checks run: `node scripts/validate-ios-store-metadata.mjs apps/ios/store/client-metadata.json` passed; `apps/ios/scripts/store-preflight.sh --help` passed; `npm run ios:store-preflight -- --env-file <temporary fake-key env>` passed through metadata, HTTPS API, bundle id, AppIcon, production APNs and App Store Connect presence checks without printing secrets; `git diff --check` passed.
- Outcome: App Store software preflight is stronger and runnable from the root package. Actual archive, TestFlight upload and App Review remain external-gated by protected Apple credentials/provisioning profiles, production API, physical iPhone Face ID/APNs/camera/offline smoke and owner App Store Connect submission.
- Next step: if credentials are available on disk, run `npm run ios:store-preflight -- --env-file apps/ios/.env.production` and then create a signed Release archive; otherwise continue non-blocked native Staff/Courier/POS or ecosystem E2E gaps.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-014`.
- Task: re-record trusted iOS Client visual acceptance after aligning the order status route with `AliStore Клиент App 2.0`.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/ios-client-visual-4d41fc8e91c26413d0862d97f708b15eca861bf6c9f74a0bef29b78f8d6a3c97.json`, and `PROGRESS.md`.
- Result: the trusted evidence manifest now points `ios-client-visual` at a fresh artifact for source commit `e6a6288`, covering 16 Client screenshots including `client-order-status`.
- Checks run: documented trusted bootstrap recorder for `scripts/record-ecosystem-evidence.mjs ios-client-visual` passed; underlying `npm run ios:visual` passed with 16 PNG attachments; `git diff --check` passed. Trusted strict ecosystem audit was also attempted and remains red on known release-level gaps outside this slice: missing linked handoffs, broader native/E2E reconciliation evidence, and uncommitted acceptance evidence before this commit.
- Outcome: iOS Client visual evidence is accepted for the latest local simulator source tree. App Store readiness remains blocked by protected Apple signing/App Store Connect credentials, production HTTPS API values, TestFlight submission, and physical-device Face ID/APNs/camera/offline smoke.
- Next step: move to the next non-blocked slice: either native Staff/Courier/POS visual parity, Android Client parity, or ERP/CMS integration while external release credentials remain unavailable.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-004`.
- Task: align native Client notifications with the `AliStore Клиент App 2.0` handoff while preserving the customer-owned notification API contract.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, and `BACKLOG.md`.
- Result: the signed-in notification overlay now renders the prototype dark inbox header and four handoff rows for order progress, price drop, warranty expiry and bonus accrual. Rows use emoji-style leading icons, warm dark cards, detail copy and inline timestamps while retaining owner-scoped `GET /notifications/mine`, mark-read behavior and route handling.
- Checks run: `npm run ios:build` passed all 10 targets; `npm run ios:ui` passed Client `17/17`, Staff `2/2`, Courier `1/1`, POS `1/1`.
- Outcome: notification inbox visual parity is accepted at local simulator software level. Production provider delivery, APNs physical-device smoke, trusted visual recorder drift, release signing, TestFlight/App Store Connect and production HTTPS API configuration remain open.
- Next step: continue remaining Client App 2.0 visual subflows and then rerun trusted visual/store preflight after credentials and physical-device access are ready.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-005`.
- Task: align native Client support screen with the `AliStore Клиент App 2.0` handoff while preserving the customer-owned support ticket contract.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, and `BACKLOG.md`.
- Result: the support screen now matches the prototype shell with WhatsApp, Telegram and Call channel tiles, handoff FAQ copy, and a lime `Создать обращение` CTA. The existing API-backed ticket form, priority chips, customer JWT ownership and stable submission idempotency remain available behind the CTA, and the local signed-in/guest shell no longer gets stuck in a loading state without credentials.
- Checks run: `npm run ios:ui` passed Client `18/18`, Staff `2/2`, Courier `1/1`, POS `1/1`; `git diff --check` passed; `npm run ios:build` passed all 10 targets.
- Outcome: Client support visual parity is accepted at local simulator software level. App Store readiness remains blocked by production HTTPS API URL, Apple signing/provisioning/App Store Connect credentials, trusted visual recorder drift, and physical-device Face ID/APNs/camera/offline smoke.
- Next step: continue remaining Client App 2.0 visual subflows or switch to ERP/Android parity while external release credentials and physical-device certification remain blocked.

## 2026-07-17

- Iteration ID: `IOS-QUICK-UNLOCK-002`.
- Task: polish the shared native iOS Face ID/PIN quick-access shell for Client, Staff, Courier and POS.
- Files changed: `apps/ios/Shared/QuickUnlock.swift`, `apps/ios/Shared/UITestBootstrap.swift`, `apps/ios/Shared/StaffAuthStore.swift`, `apps/ios/Shared/CustomerAuthStore.swift`, `apps/ios/UITests/Staff/AliStoreStaffUITests.swift`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the shared quick-unlock screen now uses a branded dark AliStore shell with Face ID primary CTA, custom PIN entry, six-dot progress, Keychain safety copy, lockout/error panels, logout action and a dark PIN setup sheet. A DEBUG-only `--ui-testing-quick-unlock` flag forces restored signed-in sessions into the shell, so the Staff app can prove the UX without real credentials or secrets.
- Checks run: `npm run ios:build` passed all 10 iOS targets; targeted Staff UI smoke `xcodebuild test -project apps/ios/AliStoreNative.xcodeproj -scheme AliStoreUITests -destination 'platform=iOS Simulator,name=iPhone 17 Pro' '-only-testing:AliStoreStaffUITests/AliStoreStaffUITests/testSignedInStaffCanUseQuickUnlockShell' CODE_SIGNING_ALLOWED=NO` passed with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`; `git diff --check` passed.
- Outcome: iOS quick-unlock UX is accepted at local simulator software level across the shared component. Physical Face ID/Touch ID/PIN, lockout, APNs/camera/scanner/hardware and release-signing smoke remain external gates before App Store/TestFlight claims.
- Next step: continue Staff/Courier/POS native operational polish and Android parity while physical-device certification and production credentials are pending.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-016`.
- Task: tighten native iOS Client Search visual parity against `AliStore Клиент App 2.0`.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the Search route now uses the exact popular queries from the handoff (`iPhone 15`, `AirPods`, `MacBook`, `Samsung`, `Б/У`) and compact result rows with 56 px product imagery, price and server-derived stock state (`В наличии`, `Осталось N шт`, `Нет в наличии`) instead of the previous larger category-style cards.
- Checks run: targeted `xcodebuild test -project apps/ios/AliStoreNative.xcodeproj -scheme AliStoreUITests -destination 'platform=iOS Simulator,name=iPhone 17 Pro' '-only-testing:AliStoreClientUITests/AliStoreClientUITests/testHeaderRoutesToSearchCompareAndNotifications' CODE_SIGNING_ALLOWED=NO` passed after setting `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`; `git diff --check` passed; `npm run ios:visual` passed and exported 17 PNG attachments including `client-search`.
- Outcome: Client Search visual parity is accepted at local simulator software level. App Store readiness remains blocked by owner pixel sign-off, production HTTPS API configuration, verified App Store Connect values, provisioning/signing, TestFlight upload and physical-device Face ID/APNs/camera/offline smoke.
- Next step: continue highest-value remaining ecosystem gaps: Staff/Courier/POS native polish and physical-device gates, Android Client parity, ERP/CMS integration, live provider certification and first-store staging UAT.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-006`.
- Task: align native Client Trade-in estimator with the `AliStore Клиент App 2.0` handoff while preserving the existing trade-in request/evidence flow.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, and `BACKLOG.md`.
- Result: the Trade-in route now opens on the prototype estimator instead of a plain request list: title/subtitle, fixed model row, three condition choices, dashed photo placeholder, lime `Узнать цену` CTA, estimate card `28 000–32 000`, and actions for choosing a new device or saving a server-backed request. Existing customer-owned trade-in requests and Evidence photo upload cards remain available below returned server data, and Debug-only signed-in mode avoids a credentialless loading hang.
- Checks run: `npm run ios:build` passed all 10 targets; `npm run ios:ui` passed Client `19/19`, Staff `2/2`, Courier `1/1`, POS `1/1`.
- Outcome: Client Trade-in visual parity is accepted at local simulator software level. Real diagnostic pricing, production provider credentials, physical camera/Face ID/APNs smoke, trusted visual recorder drift and TestFlight/App Store signing remain open release gates.
- Next step: continue remaining Client App 2.0 visual subflows, especially return request/status and warranty/service details, then rerun trusted visual/store preflight after external credentials and physical devices are ready.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-007`.
- Task: align native Client return status and request screens with the `AliStore Клиент App 2.0` handoff while preserving the customer-owned returns API contract.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the returns route now renders the prototype `Возврат товара` shell with a dark product card, status pill, three-step progress, reason panel and photo evidence placeholder. The request sheet now matches the handoff with selected product, reason choices, free-text details, dashed photo placeholder and lime submit CTA while keeping JWT-owned `returns/mine` reads and idempotent server submission.
- Checks run: `npm run ios:build` passed all 10 targets; `npm run ios:ui` passed Client `20/20`, Staff `2/2`, Courier `1/1`, POS `1/1`; `git diff --check` passed.
- Outcome: Client returns visual parity is accepted at local simulator software level. App Store readiness remains blocked by production HTTPS API URL, Apple signing/provisioning/App Store Connect credentials, trusted visual recorder drift, and physical-device Face ID/APNs/camera/offline smoke.
- Next step: continue unresolved Client App 2.0 subflows, especially warranty/service visual details and trusted visual recorder recovery, or switch to Android/ERP while external release blockers remain.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-RELEASE-006`.
- Task: package native iOS Client App Store screenshots from the accepted 17-state visual evidence instead of relying on UUID-named Xcode attachments.
- Files changed: `scripts/prepare-ios-store-screenshots.mjs`, `package.json`, `apps/ios/store/release-runbook.md`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: added `npm run ios:store-screenshots`, which reads `apps/ios/store/client-metadata.json`, verifies the Xcode attachment manifest contains every required Client state, checks each PNG header/dimensions/SHA-256 and writes deterministic App Store Connect files such as `01-client-home.png` under `apps/ios/build/AppStoreScreenshots/ru-KG/iphone-17-pro`.
- Checks run: `node --check scripts/prepare-ios-store-screenshots.mjs`; `npm run ios:store-screenshots`; `node scripts/validate-ios-store-metadata.mjs apps/ios/store/client-metadata.json`; `git diff --check`.
- Outcome: App Store screenshot packaging is now repeatable and validated from the local visual evidence bundle. Actual App Store readiness remains blocked by owner pixel sign-off, physical-device Face ID/APNs/camera/offline smoke, production `.env`, signing/provisioning, verified App Store Connect credentials, TestFlight upload and review submission.
- Next step: continue the next locally unblocked lane: POS/Staff/Courier native operational UI coverage, Android parity, ERP/CMS integration, or strict store preflight once protected Apple values are present.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-008`.
- Task: align native Client warranty/service details with the `AliStore Клиент App 2.0` handoff while preserving warranty ownership and support routing.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: warranty details now use the prototype certificate product title, service/receipt action row and exact coverage copy. The service action routes into the existing customer support flow while the receipt CTA is visible for the handoff and remains pending device-to-order receipt mapping.
- Checks run: `npm run ios:build` passed all 10 targets; `npm run ios:ui` passed Client `20/20`, Staff `2/2`, Courier `1/1`, POS `1/1`; `git diff --check` passed.
- Outcome: Client warranty visual parity is accepted at local simulator software level. App Store readiness remains blocked by production HTTPS API URL, Apple signing/provisioning/App Store Connect credentials, trusted visual recorder drift, and physical-device Face ID/APNs/camera/offline smoke.
- Next step: recover trusted visual recording for iOS Client or move to Android/ERP while external release blockers remain.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-RELEASE-005`.
- Task: add a strict signing/provisioning gate before native iOS Client archive and TestFlight upload.
- Files changed: `apps/ios/scripts/store-preflight.sh`, `apps/ios/.env.production.example`, `apps/ios/store/release-runbook.md`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: `store-preflight.sh` now supports `--strict-signing`. It verifies an Apple Distribution signing identity for the configured team and requires a matching local App Store provisioning profile for `kg.alistore.client`, unless `IOS_ALLOW_PROVISIONING_UPDATE=true` is explicitly set for a protected machine with an authenticated Xcode account.
- Checks run: `bash -n apps/ios/scripts/store-preflight.sh`; `apps/ios/scripts/store-preflight.sh --help`; `node scripts/validate-ios-store-metadata.mjs apps/ios/store/client-metadata.json`; negative `npm run ios:store-preflight -- --env-file <temporary fake env> --strict-signing` failed closed with no provisioning profile; positive `npm run ios:store-preflight -- --env-file <temporary fake env with IOS_ALLOW_PROVISIONING_UPDATE=true> --strict-signing` passed without printing secrets.
- Outcome: the release preflight now proves the next App Store signing blocker before archive. Actual App Store publication remains open because `apps/ios/.env.production`, verified `ASC_ISSUER_ID`, provisioning/auto-signing access, TestFlight upload and physical iPhone smoke are not completed in this session.
- Next step: when protected Apple values are available, run `npm run ios:store-preflight -- --env-file apps/ios/.env.production --strict-asc --strict-signing`, then create a signed archive and continue TestFlight/device smoke.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-015`.
- Task: close the missing native iOS Client Search visual state from `AliStore Клиент App 2.0`.
- Files changed: `apps/ios/Client/AliStoreClientApp.swift`, `apps/ios/UITests/Client/AliStoreClientUITests.swift`, `apps/ios/scripts/visual-capture.sh`, `apps/ios/store/client-metadata.json`, `apps/ios/store/release-runbook.md`, `scripts/validate-ios-store-metadata.mjs`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the Client search overlay now opens with the prototype-style lime outlined search field, popular-query chips and results heading. The visual evidence test captures the missing `client-search` screen, and store metadata plus the visual capture script now enforce 17 required PNG states.
- Checks run: `node --check scripts/validate-ios-store-metadata.mjs`; `node scripts/validate-ios-store-metadata.mjs apps/ios/store/client-metadata.json`; `bash -n apps/ios/scripts/visual-capture.sh`; `git diff --check`; `npm run ios:visual` passed and exported 17 PNG attachments; `npm run ios:store-preflight -- --env-file <temporary fake env>` passed in non-strict mode without printing secrets.
- Outcome: the local simulator visual evidence gate now covers all 17 tracked Client App 2.0 review states. This does not claim App Store readiness; production API configuration, TestFlight/App Store Connect credentials, owner pixel sign-off and physical-device Face ID/APNs/camera/offline smoke remain open.
- Next step: continue the remaining ecosystem gaps: ERP/CMS integration and visual parity, Android/iOS Staff/Courier/POS device certification, live provider certification and first-store staging UAT.

## 2026-07-17

- Iteration ID: `IOS-STAFF-VISUAL-002`.
- Task: align native Staff Tasks/KPI with the `AliStore Сотрудник App 2.0` handoff.
- Files changed: `apps/ios/Staff/StaffWorkView.swift`, `apps/ios/Shared/Models.swift`, `apps/ios/UITests/Staff/AliStoreStaffUITests.swift`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the Staff KPI route now uses a prototype-style dark task board with `Задачи и KPI`, a `KPI месяца` card at `92%`, progress bar, handoff task fixtures, priority/status treatments and accessible task toggle labels. Release/live behavior still loads `staff-tasks/mine` through the existing staff JWT API.
- Checks run: `npm run ios:build` passed all 10 targets before the final accessibility/test polish; targeted `AliStoreStaffUITests` passed 3/3; full `npm run ios:ui` was attempted but Xcode hung during Client runner finalization/worker materialization before Staff execution, so it is not accepted for this slice; `git diff --check` passed.
- Outcome: Staff Tasks/KPI visual slice is accepted at local simulator targeted level. Physical device, exact pixel pass and complete Staff operational journey remain open.
- Next step: continue Staff inner screens such as orders, add-product, buyback and Customer tools, or rerun the full `ios:ui` after simulator reset.

## 2026-07-17

- Iteration ID: `IOS-STAFF-VISUAL-003`.
- Task: align native Staff Orders queue with the `AliStore Сотрудник App 2.0` handoff.
- Files changed: `apps/ios/Staff/AliStoreStaffApp.swift`, `apps/ios/Staff/StaffWorkView.swift`, `apps/ios/UITests/Staff/AliStoreStaffUITests.swift`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the Staff Orders route now renders the prototype dark queue with segmented status chips, order cards for `№4102`, `№4098` and `№4090`, status badges, item/fulfillment rows and lime action CTAs. Debug UI-test fixtures are isolated to signed-in simulator mode; live mode continues to use `orders?status=` and the existing staff JWT fulfillment/transition APIs.
- Checks run: targeted `AliStoreStaffUITests` passed 4/4; `git diff --check` passed.
- Outcome: Staff Orders visual slice is accepted at local simulator targeted level. Full native suite rerun, physical-device scanner/camera/APNs smoke and complete order operations remain open.
- Next step: continue Staff Add Product and Buyback screens from the same handoff.

## 2026-07-17

- Iteration ID: `IOS-STAFF-VISUAL-004`.
- Task: align native Staff Add Product and Buyback flows with the `AliStore Сотрудник App 2.0` handoff.
- Files changed: `apps/ios/Staff/AliStoreStaffApp.swift`, `apps/ios/Staff/StaffScannerView.swift`, `apps/ios/UITests/Staff/AliStoreStaffUITests.swift`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: Staff quick actions now open distinct scanner modes. Add Product uses the prototype dark scan tile, deterministic barcode recognition fixture, AI-filled product card, moderation success state, generated barcode and label-print CTA. Buyback uses the regulated five-step checklist and enables the contract CTA after three checks. Evidence Vault remains in the same Staff scanner area as a third mode with the existing staff JWT photo/gallery upload flow.
- Checks run: `npm run ios:build` passed all 10 targets; targeted `AliStoreStaffUITests` passed 6/6 after correcting the prototype AI label assertion; `git diff --check` passed.
- Outcome: Staff Add Product and Buyback visual parity is accepted at local simulator targeted level. Physical scanner/camera/APNs, real add-product moderation API, buyback contract handoff, hardware smoke and full native release gates remain open.
- Next step: continue remaining Staff inner-screen parity, especially Customer 360/support/warranty tools and shift evidence polish, or move to Android Staff parity while external physical-device gates remain blocked.

## 2026-07-17

- Iteration ID: `IOS-CLIENT-VISUAL-017`.
- Task: refresh trusted native iOS Client visual evidence after the latest Client Search parity and quick-unlock source changes.
- Files changed: `docs/acceptance/ecosystem-evidence.json`, `docs/acceptance/artifacts/ios-client-visual-9addb92275c8d025153a404a7061541ee992bab05517901808535c72640420cd.json`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the committed trusted bootstrap reran `npm run ios:visual` against source commit `8b284ab9df74e8ec9fea5579250cc7c2296d7136`, captured 17 retained simulator PNG states, and rebound `ios-client-visual` to source tree `d46b5a37edaad6db6ff90f7203198c8395a06fb1c4af47c04299c88649f07700`. The new artifact SHA-256 is `9addb92275c8d025153a404a7061541ee992bab05517901808535c72640420cd`.
- Checks run: trusted ecosystem bootstrap for `scripts/record-ecosystem-evidence.mjs ios-client-visual` executed `npm run ios:visual` and the XCUITest passed with 17 PNG attachments; artifact SHA-256 was verified with `shasum -a 256`; `jq` parsed the new evidence; `git diff --check` passed.
- Outcome: the accepted iOS Client visual evidence is no longer stale relative to the current native Client source tree. This remains simulator visual evidence only; owner pixel sign-off, physical-device Face ID/APNs/camera/offline smoke, production HTTPS API, TestFlight/App Store Connect, provisioning and release signing remain external release gates.
- Next step: continue the next locally unblocked lane: Staff/Courier/POS native polish, Android Client/Staff parity, ERP/CMS integration, or staging/provider certification once external access is available.

## 2026-07-17

- Iteration ID: `IOS-COURIER-UI-001`.
- Task: add signed-in simulator coverage for the native iOS Courier route/COD shell instead of only proving the login screen.
- Files changed: `apps/ios/Shared/UITestBootstrap.swift`, `apps/ios/Shared/StaffAuthStore.swift`, `apps/ios/Courier/CourierOperationsView.swift`, `apps/ios/UITests/Courier/AliStoreCourierUITests.swift`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: Debug UI tests can pass `--ui-testing-role=courier` to restore a courier session without weakening release auth. In UI-test signed-in mode, Courier loads deterministic assigned and out-for-delivery jobs locally, showing route count, customer/address/slot/COD cards, Evidence block, delivery CTA and COD handover screen without depending on a live API fixture.
- Checks run: targeted Courier signed-in XCUITest passed `1/1`; full `AliStoreCourierUITests` passed `2/2`; `npm run ios:build` passed all 10 iOS targets; `git diff --check` passed.
- Outcome: iOS Courier now has simulator coverage for its main route/COD surface, not just cold login. Physical APNs, maps, camera/network behavior, real-device COD handover, production signing and first-store delivery UAT remain external release gates.
- Next step: continue POS native operational UI coverage or Android/ERP parity while keeping physical hardware/provider gates explicit.
## 2026-07-17

- Iteration ID: `ECO-001A-DESIGN-CORPUS-REGISTER`.
- Task: establish a current, fail-closed register for the 64 missing design references blocking strict ecosystem acceptance.
- Files changed: `docs/ECOSYSTEM-TRACEABILITY-MATRIX.md`, `docs/acceptance/DESIGN-CORPUS-BLOCKER.md`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the traceability matrix now reflects the 2026-07-17 audit and points to an explicit owner-action register. The register records the exact audit command, allowed dispositions (`restore`, `retire`, `replace`), and the rule that no reference or owner approval may be fabricated. It also corrects the stale wording that packaged native/ecosystem commands were missing.
- Checks run: `npm run ecosystem:audit:strict` (expected fail: 64 unresolved design references), `git diff --check`.
- Outcome: documentation and backlog are synchronized with the actual strict blocker. This iteration does not claim strict acceptance; the owner must supply originals or approved dispositions before the gate can turn green.
- Next step: continue the next locally unblocked implementation lane, ERP/CMS integration, while preserving the design-corpus blocker and its fail-closed gate.
## 2026-07-17

- Iteration ID: `PLAN-001-MASTER-EXECUTION-PLAN`.
- Task: consolidate the active AliStore work into one evidence-driven execution plan with phase gates, parallel ownership boundaries and explicit external blockers.
- Files changed: `docs/MASTER-EXECUTION-PLAN-CURRENT.md`, `BACKLOG.md`, and `PROGRESS.md`.
- Result: the repository now contains the current sequence from controlled baseline through ERP/storefront contract, financial correctness, native parity, ERP expansion, ecosystem E2E, staging, providers and first-store launch. The plan records what is accepted locally and what cannot be certified without owner credentials, missing design decisions, physical devices or live providers.
- Checks run: `git diff --check`.
- Outcome: planning artifact is committed-ready; implementation continues with the ERP/storefront contract lane.
- Next step: take one uncovered ERP-to-storefront assertion, implement it with API/browser evidence, refresh affected trusted artifacts, and commit the vertical slice.
