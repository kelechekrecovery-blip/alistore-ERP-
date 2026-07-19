# Store Privacy Data

This file is the source checklist for App Store privacy labels and Google Play
Data safety. It is not a legal policy; publish the final policy at
`https://ali.kg/privacy` before submission.

## Data Collected

- Contact info: phone number and optional name for checkout, account, support,
  delivery, and order notifications.
- Purchases: order items, quantities, totals, payment method, status, and returns.
- User content: support messages, evidence photos, return/warranty/trade-in notes
  when those flows are enabled.
- Identifiers: customer id, staff id, order id, device/unit identifiers such as IMEI
  for warranty, stock, and fraud prevention.
- Device data: Expo push token and local installation id when the user enables native
  notifications.
- Diagnostics: crash and error events if observability is enabled.

## Data Use

- App functionality: checkout, delivery, support, warranty, staff POS, and order
  history.
- Fraud prevention and security: RBAC, approval gates, stock/IMEI invariants, audit
  ledger.
- Analytics: internal operational reporting and product performance.
- Communications: transactional order, support, warranty, reservation, and campaign
  messages only when consent rules allow them.

## Data Sharing

AliStore may send necessary transactional data to configured providers such as
payment processors, delivery services, email/SMS/push/Telegram/WhatsApp gateways,
observability tools, and object storage. Provider credentials must be configured in
production before enabling the related feature.

## Retention And Deletion

Operational and audit records are retained as required for accounting, warranty,
fraud prevention, and legal obligations. Customer-facing deletion/export procedures
must be documented before public store launch.

## App Review Notes

- The app requires network access to the production AliStore API.
- Staff/POS features require a demo staff account with the correct role.
- The app does not contain gambling, mature content, user-generated public feeds, or
  unrestricted web browsing.
