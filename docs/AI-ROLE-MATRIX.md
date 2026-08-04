# AliStore AI Role Matrix

Status: target capability model. It supplements the current customer/staff JWT
and detailed staff roles; it does not silently rename existing production roles.

## Identity model

| Requested role | Current implementation | Status | Scope |
|---|---|---|---|
| `customer` | customer JWT | COMPLETE | own profile, orders, support, returns, evidence capability |
| `staff` | umbrella over seller/cashier/warehouse/service/technician/marketer | PARTIAL | never use as an unrestricted stored role; resolve to concrete current staff role |
| `courier` | concrete staff role `courier` | COMPLETE | assigned runs, evidence and COD custody only |
| `manager` | no canonical role; parts map to `senior_seller`/`franchise`/`admin` | MISSING | must be defined per store and cannot inherit owner finance globally |
| `owner` | concrete staff role `owner` | COMPLETE | global business administration; still subject to TOTP/four-eyes |
| `admin` | concrete staff role `admin` | COMPLETE | operational administration; cannot bypass owner-only policy |
| `ai_observer` | no independent principal; owner/admin can use `ai:read` | MISSING | L0–L1 read-only, scoped facts |
| `ai_recommender` | no independent principal; `AiDecision` is a draft artifact | MISSING | L2–L3 recommendation/draft only |
| `ai_executor` | no AI identity; domain approval executors are server code | MISSING by design | L4 bounded service execution after approval; never an LLM credential |

## Capability matrix

Legend: `SELF` own data only, `SCOPED` assigned store/resource, `ALLOW` direct,
`DRAFT` create non-executing artifact, `REQUEST` park approval, `DENY` forbidden.

| Capability | customer | staff | courier | manager | owner | admin | ai_observer | ai_recommender | ai_executor |
|---|---|---|---|---|---|---|---|---|---|
| Read public catalog | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | SCOPED | SCOPED | SCOPED |
| Read customer PII | SELF | SCOPED | assigned delivery only | SCOPED | ALLOW with reason | ALLOW with reason | DENY by default | DENY by default | DENY |
| Read finance/global KPI | SELF orders only | DENY | DENY | store-scoped | ALLOW | ALLOW | SCOPED policy | SCOPED policy | DENY |
| Create order/support request | SELF | SCOPED | DENY | SCOPED | ALLOW | ALLOW | DENY | DRAFT | REQUEST only |
| Create AI recommendation | DENY | authorized surface | DENY | ALLOW | ALLOW | ALLOW | DENY | DRAFT | DENY |
| Draft customer response | DENY | SCOPED | DENY | SCOPED | ALLOW | ALLOW | DENY | DRAFT | DENY |
| Send legal/customer message | SELF-initiated only | policy | delivery template only | REQUEST | REQUEST | REQUEST | DENY | REQUEST | ALLOW only after approval |
| Change price/discount | DENY | threshold policy | DENY | REQUEST | REQUEST/approve | REQUEST/approve | DENY | REQUEST | ALLOW only approved command |
| Change stock/IMEI | DENY | warehouse policy | DENY | REQUEST | REQUEST/approve | REQUEST | DENY | REQUEST | ALLOW only approved domain command |
| Payment/refund | SELF checkout/request | cashier policy | COD custody only | REQUEST | REQUEST/approve | REQUEST/approve | DENY | REQUEST | ALLOW only approved domain command |
| Change roles/staff | DENY | DENY | DENY | DENY | REQUEST/approve | REQUEST | DENY | DENY | ALLOW only approved identity command |
| Salary/accounting close | DENY | DENY | DENY | REQUEST | REQUEST/approve | REQUEST | DENY | REQUEST | ALLOW only approved finance command |
| Camera live/raw media | DENY | DENY | DENY | explicit incident scope | explicit reason | explicit reason | DENY | DENY | DENY |
| Approve own request | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| Kill AI/camera feature | DENY | DENY | DENY | store-scope proposal | ALLOW | ALLOW operationally | DENY | DENY | DENY |

## AI principal rules

1. AI capability roles are service capabilities, not human business roles and
   never appear as client-controlled JWT claims.
2. A human/service principal obtains a short-lived, audience-bound capability
   after the API rechecks current account status, store scope and policy.
3. `ai_observer` can call only allowlisted reads and receives minimized fields.
4. `ai_recommender` can create `AiDecision(status=draft)` and an approval request;
   it cannot send, publish or mutate domain state.
5. `ai_executor` is deterministic server code. It accepts only an approved,
   fingerprinted command and invokes the owning domain service idempotently.
6. Every AI capability has rate/spend/blast-radius limits, expiry, audit trace and
   immediate global/store/tool revocation.

## Mandatory approval boundaries

Approval plus TOTP/four-eyes is required for:

- refunds and ambiguous provider reconciliation;
- price/discount outside direct role limit;
- inventory adjustment, quarantine disposal and write-off;
- roles, staff lifecycle, TOTP reset and sensitive consent override;
- payroll, manual accounting adjustment and legal/fiscal messages;
- campaign/storefront publication and mass messaging;
- deletion, PII export/access outside self scope;
- any AI-proposed command that changes money, stock, status, identity or public content.

Approval does not turn arbitrary AI output into a command. The payload must pass a
domain DTO, canonical fingerprint, state preconditions and idempotency guard.

## Deny-by-default checks

- Token role is never accepted without `ActiveStaffGuard`/current-role recheck.
- Store/location scope is server-derived from assignments.
- Blind-cash/open-drawer restrictions continue to apply to financial AI reads.
- Customer-owned resources require owner checks even if an ID is known.
- Edge devices can ingest only their registered store/device event schema.
- No role can delete or rewrite Event Ledger history.
- Face recognition, emotion inference and employee productivity scoring are denied
  until separate legal, privacy and labor-policy approval.

## Tests required before activation

1. Positive and negative RBAC matrix for every route/tool/action.
2. Deactivated/demoted staff token rejected immediately.
3. Customer/staff/store cross-scope IDOR tests.
4. Four-eyes self-approval and payload-reuse rejection.
5. AI observer/recommender direct mutation attempts rejected.
6. Executor replay changes domain state exactly once and emits one domain event.
7. Kill switch revokes new runs and prevents queued unapproved execution.
8. Camera/Telegram service credentials cannot call unrelated API resources.
