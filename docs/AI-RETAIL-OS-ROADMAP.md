# AliStore AI Retail OS — implementation roadmap

## Product decision

AliStore becomes an AI-first retail operating system for electronics. AI reads
bounded, typed projections from Postgres/Event Ledger and returns a source-backed
recommendation. Domain services remain the only writers of money, stock, order
state, permissions and legal records. Any material action is a draft or an
Approval workflow until a human confirms it.

## Delivered foundation (Phase 0)

- `POST /ai/orchestrator/runs` starts an allow-listed, read-only tool.
- `GET /ai/orchestrator/runs/:id` returns the actor-scoped durable trace.
- `AiRun`, `AiRunStep` and `AiDecision` persist redacted execution metadata,
  confidence, status and source references.
- `ai.run_started`, `ai.run_completed` and `ai.guardrail_blocked` are appended
  transactionally to `AuditEvent`.
- `AI_KILL_SWITCH=1` blocks new runs before a provider is called.
- Initial tools: `insights`, `pricing_review`, `reorder_review`, `risk_signals`.

## Delivery phases

### P1 — owner and staff copilot

1. ERP AI cockpit: daily briefing, risk radar, next actions and source chips.
2. Catalog factory: description, category, SEO draft, image QA and bundles.
3. Support triage: category, SLA, reply draft and escalation; no automatic
   customer-facing send without consent and staff confirmation.
4. Staff task generator: recommendations become `StaffTask` only through the
   existing task service and idempotency key.
5. Reorder and pricing review: draft PO/price proposal, never auto-send.

Acceptance: each recommendation has source references, confidence and a human
decision; feature flags can disable every capability independently.

### P2 — customer and operations surfaces

1. Telegram owner/staff commands call the same orchestrator and preserve the
   existing pairing, retention and prompt-injection controls.
2. Web/iOS/Android smart product finder, warranty explainer and trade-in intake.
3. POS seller copilot for compatible accessories/protection with margin guard.
4. Courier route/COD/proof-of-delivery assistant in offline-safe draft mode.
5. Finance reconciliation and cash-shift anomaly explanations.

Acceptance: customer data is tenant/role scoped; native clients never treat an
AI response as truth; replay uses idempotency; write actions become Approval.

### P3 — camera edge gateway (EZVIZ/IP)

Camera data enters through a local edge gateway as metadata, not an unrestricted
cloud video feed:

`camera → edge detection/redaction → signed event → AliStore API → task/alert`

Start with queue length, empty shelf, camera health, restricted-area motion and
safety events. Store only short, encrypted evidence clips on a trigger with TTL.
Disable audio, face recognition, demographic/emotion inference and employee
productivity scoring by default. Every live/clip view, export, retention change,
model execution and RBAC change is append-only audited.

Acceptance: invalid signatures, replay and unauthorized clip URLs fail; low
confidence events create no business mutation; high confidence creates a review
task/decision, never a stock or cash mutation; global/store/camera/model kill
switches work independently.

### P4 — scale and measurement

- demand forecast, inventory aging and supplier scorecards;
- abandoned checkout recovery with consent filters;
- campaign/CRM assistant with preview and attribution;
- service-center diagnostics and warranty SLA copilot;
- PostHog/Sentry/OpenTelemetry only after PII-safe configuration;
- offline eval set for pricing, reorder, support, trade-in and camera false
  positives/negatives; promotion requires an explicit certification flag.

## Universal safety gates

- No AI direct writes to `Payment`, `Refund`, `DeviceUnit`, `Order.status`, roles,
  credentials, evidence deletion or audit records.
- Every accepted write-intent uses the owning domain service, Approval/four-eyes
  policy and `AuditService.transaction`.
- Numeric claims expose their source and timestamp; low confidence is visible.
- No raw secrets or unnecessary PII in prompts, traces, mobile logs or evidence.
- Rollback is a feature flag/kill switch, not a database rewrite.
- E2E covers customer support, catalog draft/publish, owner briefing, approval
  boundary and camera replay/retention behavior.

## Pilot and launch gate

Do not call the retail OS production-complete until one real pilot store passes
payment/refund, fiscal receipt, cash shift, scanner/POS, courier handover, push,
evidence storage, monitoring and all-role E2E checks. AI may ship read-only/draft
features before that pilot, but external provider and privacy certification remain
explicit release blockers.
