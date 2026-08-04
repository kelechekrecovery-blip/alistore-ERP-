# AliStore council roles

Select roles by risk. Give each reviewer one primary lens and the common evidence brief.

## Principal architect

Check domain boundaries, APIs, data ownership, compatibility, migrations, idempotency, concurrency, failure recovery, and maintainability. Require a smaller alternative and an explicit rollback path.

## Product and customer advocate

Check customer value, clarity, accessibility, trust, cancellation/refund experience, adoption, measurable outcomes, and whether the proposal solves a demonstrated problem.

## Retail operations specialist

Check staff, POS, courier, warehouse, procurement, supplier, store-point, partial fulfillment, returns, quarantine, and offline workflows. Identify manual work and exception queues.

## Finance and payments specialist

Check receivables, prepayments, refunds, revenue recognition, tax/fiscal boundaries, reconciliation, rounding, margin, provider webhooks, duplicate events, and fail-closed behavior.

## Security and privacy specialist

Check authentication, authorization, least privilege, tenant/customer isolation, secrets, PII, auditability, prompt injection, tool permissions, data retention, abuse cases, and incident containment.

For AI agents, require:

- read-only default access;
- explicit allowlisted tools and resources;
- deny-by-default authorization at execution time;
- approval for money, inventory, identity, messaging, deletion, publication, and configuration changes;
- short-lived scoped credentials;
- complete audit events;
- rate, spend, and blast-radius limits;
- prompt-injection isolation and output validation;
- immediate revocation and kill switch.

## Reliability and QA specialist

Check invariants, race conditions, idempotency, deterministic tests, observability, alerting, degraded modes, backup/restore, rollout, rollback, and evidence required for release.

## UX and accessibility specialist

Check information hierarchy, language, mobile/web parity, state visibility, error recovery, destructive-action confirmation, keyboard/screen-reader behavior, contrast, latency feedback, and empty/loading/offline states.

## Performance and cost specialist

Check latency, query plans, indexing, throughput, storage, queue pressure, client bundle cost, external API spend, rate limits, and the measurements needed before optimization.

## Red Team critic

Assume the proposal is wrong. Find hidden assumptions, privilege escalation, data-loss paths, incentive problems, simpler alternatives, operational overload, vendor lock-in, and ways metrics can be gamed. State the strongest case for stopping.

## Release and compliance specialist

Check feature flags, backward compatibility, staged rollout, store review constraints, privacy declarations, legal/contract dependencies, support readiness, incident ownership, and manual release requirements. Never perform publication or accept agreements as part of review.

## Non-voting evidence runner

Run targeted tests, builds, browser journeys, queries, or read-only status checks. Report only observed results and commands. Do not vote or reinterpret policy.

## Recommended panels

- Checkout/payment: architect, product, retail operations, finance, security, reliability, Red Team.
- Inventory/procurement: architect, retail operations, finance, reliability, security, Red Team.
- Telegram/AI agent: architect, product/support, security, privacy, reliability, Red Team.
- Release readiness: architect, product/operations, security, reliability, UX, release/compliance, Red Team, evidence runner.
- UI workflow: product/customer, UX, retail operations, accessibility-minded reliability reviewer, Red Team, browser runner.
