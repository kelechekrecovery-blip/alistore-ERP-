# BACKLOG

## Next
- Certify physical POS hardware after devices/provider accounts are available: silent ESC/POS/QZ printing, bank terminal SDKs, and real scanner QA.
- Add campaign delivery integrations after provider accounts are available.
- Connect real social login providers after Apple/Telegram credentials are available.

## Done
- Polish trade-in contract print locale, IMEI, and price formatting.
- Add rate limiting to public checkout, OTP, support, and webhook endpoints.
- Capture trade-in IMEI and activate `imei_reuse` risk detection.
- Write infra runbook for Caddy/backups deployment.
- Add printable order invoice / waybill PDF.
- Add OTP access recovery with refresh-session revocation.
- Print split payment tenders on receipts.
- Add consent-filtered Campaign Segment Builder and ROI.
- Make Excel product import idempotent.
- Add shift close photo report.
- Add debt reminder notifications.
- Build Refund Money Flow / Dispute Center staff UI.
- Ensure exchanges create visible warranty coverage for the new device.
- Add scanner-assisted inventory count UI.
- Add warehouse batch receiving UI/API.
- Add POS split payments.
- Add purchased-product reviews.
- Optimize product detail related products.
- Connect owner AI assistant to merchandising signals.
- Add ERP revenue trend comparison.
- Enforce POS margin-control approval gate.
- Split returns/exchanges customer self-service from staff/cashier RBAC gates.
- Split trade-in customer self-service from staff intake RBAC gates.
- Enforce debt/installment staff RBAC gates.
- Enforce supplier/RMA/scorecard staff RBAC gates.
- Split support/CRM customer self-service from staff/admin RBAC gates.
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
