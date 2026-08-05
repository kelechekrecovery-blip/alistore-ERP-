# Wave 3 baseline — AI, messaging, and approval safety

## AI support control plane

`reports-ai-rbac.e2e-spec.ts`: **1 suite / 6 tests passed**. Coverage confirms owner/admin RBAC, blind-cash blocking, audited read-only tool execution, kill switch behavior, support triage as a reviewable draft, and customer/staff timeline scoping.

## Procurement AI approval bridge

`POST /api/ai/reorder/draft-approval` recalculates the recommendation server-side and parks a `procurement_draft` approval. It requires procurement-create permission and explicit supplier, destination, idempotency key and unit costs. Only admin/owner can approve it. Approval executes the PO creation and `purchase_order.created` ledger event atomically; missing or malformed snapshots fail closed.

## Safety boundary

AI has no direct tools for payment, refund, inventory mutation, role changes, production flags or supplier communication. The only new write path is an approval-gated draft PO created after a human decision.

## Messaging reliability

Outbox/Telegram/provider gate: **4 suites / 39 tests passed**. Coverage includes retry backoff and DLQ/redrive rules, FCM retry propagation, multi-channel transport errors, duplicate Telegram update suppression, webhook-secret validation, Telegram identity scoping, approval routing and retention/redaction.

## Camera/edge control plane

Camera gateway and ledger coverage: **2 suites / 7 tests passed**. Edge devices use hashed one-time secrets, timestamped HMAC signatures, store-point binding, metadata privacy limits, idempotent ingestion, kill-switch behavior, retention deadlines and ledger events. Raw frames/audio/face/document payloads are rejected; EZVIZ integration remains an external adapter task, not an implicit trust boundary.

Native gate: `npm run android:test` completed successfully for app, staff, courier, POS and shared core modules (unit tests + lint).
