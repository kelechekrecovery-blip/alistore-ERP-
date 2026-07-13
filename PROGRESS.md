# PROGRESS

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
