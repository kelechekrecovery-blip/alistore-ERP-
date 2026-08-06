# AliStore Full Ecosystem Master Program

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this program gate by gate. Every gate must first be decomposed into its own design/spec and implementation plan; external certification must remain fail-closed until live evidence exists.

**Goal:** Build one production AliStore ecosystem for a fully reconciled single-store pilot, then scale it to further stores, native applications, service operations and marketplace partners.

**Architecture:** PostgreSQL and domain services remain authoritative. Money, stock and status mutations are atomic with the append-only Event Ledger; clients only express intent. External providers, search, queues, storage and AI remain replaceable adapters with explicit readiness and live-certification gates.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Next.js 16, React, SwiftUI, Kotlin Compose, Jest, Vitest, Playwright, Render, Cloudflare, R2/S3, Redis and Meilisearch.

## Global Constraints

- Execute in gate order; gates, not calendar dates, control progression.
- The first production milestone is one fully reconciled store.
- Never fabricate provider, hardware, legal, physical-device or seven-day pilot evidence.
- PostgreSQL is truth for catalog, prices, inventory, orders, money, service and partner settlements.
- Clients may never assert paid, approved, delivered, refunded or stock state.
- Every critical money, stock or status mutation is atomic with an AuditEvent.
- Every replayable command has a stable idempotency key and incompatible-replay guard.
- Customer, staff and seller tokens remain isolated behind independent guards.
- Public and role-scoped DTOs expose the minimum data required and never leak internal costs or PII.
- AI is read-only/recommendation-only; domain services own mutations.
- Migrations are additive and forward-only; removals require dual-read/write and populated-data evidence.
- New public DTO fields start optional for native-client compatibility.
- External adapters remain fail-closed until live certification evidence exists.
- Each vertical slice ends with focused tests, security/quality review, evidence, backlog/readiness updates and atomic commits.

---

## Gate 0 — Truth and Baseline

**Goal:** Freeze the current system truth before adding behavior.

- Record the current SHA and integration order for the OTP/Google auth branch.
- Build a route-to-API-to-model-to-RBAC-to-Ledger-to-acceptance matrix for web, API, iOS and Android surfaces.
- Classify every surface as `accepted`, `partial`, `placeholder`, `external` or `blocked`.
- Remove completed features from future plans rather than reimplementing existing aggregates.
- Record Node, PostgreSQL, Xcode, Android SDK and browser versions.
- Define one server-owned feature-flag registry with safe defaults.
- Document backup, dry-run, additive migration and application rollback policy.

**Gate:** clean diff check; production builds; no unknown contract owner; every blocker has an owner and acceptance criterion; baseline evidence records commands, results and SHA.

## Gate 1 — Legal and Production Safety

- Implement a complete fiscal provider port/module and readiness gate.
- Persist fiscal number, QR, provider reference and immutable tax lines for sale/refund/exchange/Z-report.
- Make strict production preflight fail without certified fiscalization.
- Activate private Evidence/media storage in R2/S3.
- Enable Outbox relay, retry, DLQ and queue-age monitoring.
- Connect Sentry/GlitchTip and owner alert delivery.
- Run restore from a production-compatible bucket and verify migrations, journals and Ledger.
- Enforce interactive HTML cache safety, Cloudflare Access/WAF/rate limits, staging backup and zero-secret logging.
- Owner lane: OFD, payment, OTP, APNs/FCM, Render/Cloudflare ownership, legal documents and physical POS hardware.

**Gate:** live fiscal sale/QR, signed/replay-safe payment and refund, physical OTP delivery, delivered Outbox event, verified restore and strict readiness failures when any required certification is removed.

## Gate 2 — Customer Interest, Consent, Analytics and i18n

- Add server-side saved products, product alerts, recent views and notification preferences.
- Merge guest local favorites into the authenticated account without data loss.
- Trigger one Outbox notification per eligible price/stock transition and subscription.
- Extend the privacy-safe funnel with product view, search, favorite, alert, cart, checkout, order, payment and refund events.
- Add versioned consent records and suppression behavior.
- Externalize customer-facing strings and metadata into shared Russian/Kyrgyz resources.
- Add ERP queues/dashboards for alert delivery, funnel aggregation and consent status.

**Gate:** ownership isolation, idempotent alert delivery, revoked-marketing suppression, no analytics PII, ru/ky critical journeys and backward-compatible optional DTO fields.

## Gate 3 — Catalog, PIM, Search and Merchandising

- Add completeness scoring, localized content, media galleries, variants, compatibility rules and bundles.
- Add partner product moderation and validation for HTTPS media, duplicate identifiers and category attributes.
- Publish catalog events through Outbox and update Meilisearch without making it authoritative.
- Add suggestions, typo tolerance, transliteration and recent searches.
- Add variant switching, store availability, pickup estimates, compatibility, bundles, enhanced compare, verified reviews/Q&A and deterministic recommendations.

**Gate:** pagination beyond 100 items, PostgreSQL search fallback, coherent variant state, component-derived bundle availability, seller-safe DTOs, reversible CMS revision and passing Core Web Vitals budgets.

## Gate 4 — Reserve, Checkout, Payments and Loyalty

- Add expiring server-owned reservation and idempotent expiry release.
- Add explicit preorder/deposit behavior and certified installment offers.
- Bind accepted Trade-in credit once.
- Add cloud cart handoff to POS with authoritative re-quotation.
- Preserve guest-capability ownership and scope.
- Recalculate price, stock, promotion, bonus, tax and delivery at critical transitions.
- Preserve created orders when payment-intent creation fails.
- Add referral settlement after payment and refund compensation for loyalty/campaign economics.

**Gate:** race-safe last-unit checkout, exactly-once reserve release, reconciled deposit/refund, non-enumerating guest access, replay-safe incentives and fail-closed uncertified payments.

## Gate 5 — Staff, Warehouse and First-Store Fulfillment

- Add role/SLA task inbox, scan-first receiving, guided transfers and blind counts.
- Add inventory discrepancy approval, wave picking, packing QC and quarantine.
- Add opening/closing checklists, task-scoped Customer 360 and staff device readiness.
- Keep all serialized/quantity mutations in one inventory boundary.
- Track bundle and consignment allocations separately.
- Require Evidence for dangerous adjustments and post FIFO valuation/movements atomically.

**Gate:** procurement-to-sale reconciliation, exactly-once transfer receiving, blind counts, evidence-backed valuation write-off, quarantine before resale, owner-scoped offline replay and IMEI packing validation.

## Gate 6 — POS, Finance and Reconciliation

- Certify scanner, printer, terminal and cash drawer.
- Complete cash/card/QR/split/gift-card/loyalty/refund/exchange flows.
- Add omnichannel cart retrieval, variants, bundles, consignment, marketplace lines and Trade-in credit.
- Add electronic receipts, cash movements, shift close and strict offline policy.
- Reconcile Payment, Refund, COD, CashShift, Journal and Event Ledger.
- Add blocking discrepancy queues, SKU/channel P&L, cash-flow forecast, tax settlement and provider statements.

**Gate:** balanced journals, tender-correct refunds, fully reversed exchanges, no shift close with unexplained discrepancy, no offline duplicates, physical hardware acceptance and zero unexplained daily money variance.

## Gate 7 — Courier and Authoritative Logistics

- Manage zones, slots, capacity and dispatch in ERP.
- Add explainable route optimization, live ETA, customer-safe tracking and proof of delivery.
- Complete COD collection/handover, failure reasons, rescheduling, return/Trade-in pickup and external-carrier contracts.
- Retain geolocation only during the active delivery window.

**Gate:** race-safe slot capacity, capacity release on change, courier ownership isolation, scoped POD, exactly-once COD accounting, owner/order-preserving offline replay and location removal after terminal delivery.

## Gate 8 — Service, Warranty, Trade-in and Supplier RMA

- Add customer booking, model-aware diagnostics and versioned estimates/approvals.
- Reserve parts, bind payments, expose safe status/messages and complete Evidence chain.
- Complete loaner custody/disputes, repair warranty/repeat linkage and supplier RMA.
- Add guided Trade-in capture, advisory AI grading, final post-diagnostic price and idempotent approved payout/credit.

**Gate:** warranty isolation, reapproval after estimate change, race-safe parts, replay-safe service payment, exclusive loaner custody, no double Trade-in payout, correct replacement ownership and service profitability reporting.

## Gate 9 — ERP Intelligence

- Unite executive cockpit, reconciliation, risk and readiness.
- Add SKU/seller/store/channel P&L, supplier scorecards, reorder/pricing recommendations with approval, workforce planning, incidents, consent/legal registry, disaster-recovery dashboard and scenario planning.
- Keep the AI copilot read-only by default.

**Gate:** traceable metrics, no AI mutation authority, owned risk findings, lead-time-aware reorder, reconciled cash flow and DR status backed by a real restore drill.

## Gate 10 — AliStore Business and Marketplace

- Add KYB and owner approval; keep SellerUser isolated from StaffUser.
- Move seller sessions to protected cookie/MFA and add seller roles.
- Add product submissions/moderation, seller-owned price/stock, line routing, immutable commission snapshots and fulfillment SLA.
- Add settlement ledger, refund/commission/withholding entries, idempotent payouts, disputes, statements, analytics, bulk import and signed inventory feeds.

**Gate:** token isolation, non-enumerating ownership failures, serialized price history, no internal cost leakage, refund-adjusted settlements, exactly-once payouts and safe seller suspension.

## Gate 11 — Native Parity and Store Release

- Freeze shared customer/Staff/Courier/POS contract fixtures.
- Complete push, links, social login, secure storage and owner-scoped offline behavior.
- Add store stock/map, scanner, service, delivery management and warranty wallet.
- Complete accessibility, ru/ky metadata, remote config/minimum version, review accounts and physical-device journeys.

**Gate:** release builds for four iOS/four Android apps, live scoped links/push, secure revocation, offline ownership, safe review accounts, ≥99.5% pilot crash-free sessions and packaged critical journeys.

## Gate 12 — One-Store Pilot

- Load real catalog/media/prices/taxes/stock and opening balances.
- Configure StorePoint, zones, slots, locations, staff roles, providers, hardware, legal documents and consent versions.
- Execute pickup, prepaid delivery, COD, POS tenders, return/refund, exchange, warranty/repair, Trade-in, procurement, marketplace settlement, outage/recovery, offline restart, restore and application rollback journeys.

**Seven-day exit gate:** no unowned P0/P1 incidents, no unexplained money/stock discrepancy, no duplicate payout/refund, reconciled fiscal/provider statements, healthy Outbox, API error rate <1%, availability ≥99.9%, passing web-vitals budget, fresh verified backup and signed operational UAT.

## Gate 13 — Scale

Scale in this order: second owned store, inter-store reconciliation, public native rollout, limited marketplace sellers, external carriers, franchise controls, deeper personalization/AI, then new regions/channels. Each expansion repeats import dry-run, role audit, stock count, provider/hardware smoke, reconciliation baseline, limited rollout, rollback rehearsal and seven-day observation.

## Required Program Artifacts

- A separate design/spec and implementation plan for each Gate 1–13.
- One source-controlled acceptance matrix spanning the eight authoritative business events plus customer interest, fiscalization and seller settlement.
- Machine-readable feature flags and readiness.
- Dated acceptance evidence per gate.
- Updated `BACKLOG.md`, `PROGRESS.md` and readiness docs after each accepted slice.

## Common Verification

```bash
git diff --check
npm test -w @alistore/web
npm run api:test
npm run build
npm run e2e
npm run ecosystem:verify
npm run security:secrets
npm run security:dependencies
npm run launch:check
```

Destructive database gates require an explicitly confirmed disposable test database. Production evidence, provider callbacks, hardware checks and pilot observation cannot be simulated or inferred.
