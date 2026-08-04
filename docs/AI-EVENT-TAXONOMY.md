# AliStore AI Event Taxonomy

Status: Phase 0 canonical contract. Existing event names remain compatible until
producers and consumers migrate through aliases/projections.

## Event envelope

The physical `AuditEvent` table currently stores `id`, `type`, `actor`, `ts`,
`payload` and `refs`. The remaining rows below are target producer invariants:
`schema_version` belongs inside the JSON payload, while `idempotency_key` remains
on the owning command/entity and is not claimed as an `AuditEvent` column.

| Field | Rule |
|---|---|
| `id` | server-generated immutable identifier |
| `type` | canonical lowercase dotted name |
| `actor` | authenticated customer/staff/service/edge identity; never body-trusted |
| `ts` | server commit timestamp; device time belongs in payload as `occurred_at` |
| `payload` | versioned, schema-validated, PII-minimized JSON |
| `refs` | authoritative domain/ledger IDs used to verify the claim |
| `idempotency_key` | stored on owning command/entity; retries must not create a second fact |
| `schema_version` | positive integer in payload, starting at `1` |

Events describe committed facts, not intentions. A recommendation, approval
request and executed action are three separate events.

## Canonical event contract defined in Phase 0

Phase 0 defines and audits this contract. P0.8 implements the security-relevant
`auth.login` and `auth.signup` producers; the remaining `MISSING`/`PARTIAL` rows
are implemented and migrated in P1 after the P0 reliability/security exit gate.

| Canonical event | Current status | Current evidence / compatibility mapping | Required producer and minimum payload |
|---|---|---|---|
| `auth.login` | MISSING | Review-login-specific events exist in `auth.service.ts`; no general canonical event | Auth service after success/failure decision; `subject_ref`, `principal_type`, `method`, `outcome`, `reason_code`, `session_ref` |
| `auth.signup` | MISSING | Customer upsert/social enrollment exists but no canonical event | Auth enrollment transaction; `customer_ref`, `method`, `consent_version`, `outcome` |
| `catalog.view` | MISSING | Funnel/product analytics are separate; no ledger type | Privacy-safe analytics pipeline; `product_ref`, `surface`, `session_ref`, `store_ref?` |
| `cart.updated` | MISSING | Client cart state exists; no canonical server fact | Server/consented analytics edge; `cart_ref`, `line_count`, `value`, `operation` — no raw client prices |
| `order.created` | PARTIAL | `EventType.OrderCreated = order.created`; current payload has not been certified against every field/version below | Orders transaction; `order_ref`, `customer_ref`, `store_ref`, `amount`, `currency`, `supply_mode` |
| `payment.authorized` | MISSING | `payment.received` records captured money, not provider authorization | Payment adapter after verified provider response; `payment_ref`, `order_ref`, `provider_ref`, `amount`, `method` |
| `payment.failed` | MISSING | Provider/refund failure events exist, but not canonical payment failure | Payment adapter; `payment_ref`, `order_ref`, `reason_code`, `retryable`, redacted provider status |
| `refund.requested` | PARTIAL | `EventType.RefundRequested = refund.requested`; current payload has not been certified against every field/version below | Refund transaction; `refund_ref`, `payment_ref`, `order_ref`, `amount`, `reason_code`, `approval_ref` |
| `inventory.changed` | PARTIAL | Specific `stock.*`, `unit.*`, `inventory.*` events are authoritative | Projection/alias over specific events; `product_ref`, `unit_ref?`, `location_ref`, `delta`, `reason`, `movement_ref` |
| `delivery.delayed` | MISSING | Delivery assigned/out/delivered/failed exist | SLA scheduler; `delivery_ref`, `order_ref`, `store_ref`, `delay_minutes`, `reason_code`, `owner_ref` |
| `support.ticket_created` | PARTIAL | Current canonical implementation is `ticket.created` | Support transaction; add alias/migration policy; `ticket_ref`, `customer_ref`, `channel`, `priority`, `sla_ref` |
| `ai.recommendation_created` | PARTIAL | `ai.run_completed` and durable `AiDecision` exist | AI Control Plane transaction; `run_ref`, `decision_ref`, `tool`, `risk_level`, `confidence_method`, `evidence_refs` |
| `ai.approval_requested` | PARTIAL | Generic `approval.requested` with action `ai_support_triage` exists | Approval transaction; `run_ref`, `decision_ref`, `approval_ref`, `action`, `policy_ref` |
| `ai.action_executed` | PARTIAL | `ai.decision_approved` changes draft metadata; no generic domain execution event | Domain executor after committed action; `decision_ref`, `approval_ref`, `command_ref`, `domain_event_refs`, `rollback` |
| `camera.queue_detected` | PARTIAL | Input `queue_length_estimated`; ledger emits generic `camera.detection_recorded` | Camera gateway; `detection_ref`, `device_ref`, `store_ref`, `count`, `confidence`, `occurred_at`, `retention_until` |
| `camera.shelf_empty` | PARTIAL | Input `shelf_empty_detected`; generic detection event | Camera gateway; `detection_ref`, `device_ref`, `store_ref`, `zone_ref`, `confidence`, `occurred_at` |
| `camera.incident_detected` | PARTIAL | Multiple incident input types; generic detection event | Camera gateway; `detection_ref`, `device_ref`, `store_ref`, `incident_type`, `confidence`, `occurred_at`, `review_task_ref` |

## Existing domain families retained

- `order.*` — state machine and cancellation/exchange facts.
- `payment.*`, `refund.*`, `accounting.*`, `finance.*` — money and reconciliation.
- `stock.*`, `unit.*`, `inventory.*`, `reservation.*` — quantity/serialized inventory.
- `delivery.*`, `cash.*`, `shift.*` — courier and POS custody.
- `approval.*` — request/decision lifecycle.
- `ticket.*`, `campaign.*`, `customer.*`, `evidence.*` — CRM/privacy/content.
- `ai.*`, `telegram_agent.*`, `camera.*` — control-plane and edge safety facts.

Existing specific names are not rewritten in place. New canonical events may be
added alongside them, or generated as versioned projections, until all consumers
move without breaking reports.

## Producer invariants

1. Money, stock, status, role and approval events co-commit with the mutation.
2. Authentication failures may use a security event sink when no domain
   transaction exists, but must never include secrets, OTPs or raw tokens.
3. Client analytics is not trusted as business truth and is separated from the
   immutable financial/stock ledger.
4. Device `occurred_at` is validated for clock skew; `ts` stays server-owned.
5. Camera events use typed per-event payloads. The registered internal
   `device_ref` is required; raw hardware identifiers, arbitrary device metadata,
   arbitrary JSON, faces, embeddings, names and raw audio/video are rejected.
6. AI events record model/prompt/eval versions, tool name, evidence IDs and
   policy result, never hidden chain-of-thought or unredacted PII prompts.

## Consumer rules

- Executive facts must resolve every `evidence_ref` to an authorized domain row
  or ledger event.
- Metrics declare accepted event versions and late-event policy.
- Rebuildable projections store a watermark and are safe to replay.
- Notifications consume Outbox rows created in the same transaction; ledger
  events are not used as an unaudited message queue.
- Schema-breaking changes require a new `schema_version`, dual-read/dual-write
  window and rollback test.

## Quality gates

- 100% required fields and valid refs for canonical events.
- 0 secrets/OTP/token/raw passport/raw camera payloads in ledger fixtures.
- Duplicate command replay produces 0 additional business events.
- Money/stock/status mutation without the expected event fails its integration test.
- Event latency, unknown-type count and dead-letter count are observable.
- Production runtime DB role cannot update or delete existing Event Ledger rows.
