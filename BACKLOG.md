# BACKLOG

## Next
- Split public/customer self-service from staff/admin Role Permission Matrix gates for support/CRM, suppliers, debts, trade-in intake, and returns/exchanges.
- Certify physical POS hardware after devices/provider accounts are available: silent ESC/POS/QZ printing, bank terminal SDKs, and real scanner QA.
- Add campaign delivery integrations after provider accounts are available.

## Done
- Split warranty customer self-service from staff-console RBAC gates.
- Enforce active staff RBAC on product price/archive and payment refund request endpoints.
- Enforce active staff RBAC on courier COD/delivery and print/export endpoints.
- Enforce Role Permission Matrix on POS/warehouse/staff-session operational endpoints.
- Finish staff-session rollout for POS/warehouse/staff operational endpoints.
- Add staff TOTP step-up 2FA for Approval Inbox approve decisions, with setup/enable/disable staff auth endpoints and UI enrollment.
- Harden staff JWT authorization for Customer PII reads and Approval Inbox decisions; approval role now comes from JWT, not request body.
- Build offline POS queue/sync with `clientSaleId` idempotency, conflict states, scanner input, receipt printing, and terminal readiness fallback.
- Add provider-shaped payment intents and sandbox webhook reconciliation for card, MBank QR, O!Деньги QR, and installments.
- Add real Evidence Vault image upload flows for trade-in, returns, warranty, support, and warehouse operations on top of the media service.
- Complete customer app ecosystem routes: search, bonuses, addresses, notifications/preferences, support tickets, returns, and customer trade-in.
