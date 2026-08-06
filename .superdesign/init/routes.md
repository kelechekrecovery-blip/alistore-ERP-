# Web route map

Framework: Next.js 16 App Router (`apps/web/app`). Every page uses the root layout at `apps/web/app/layout.tsx`; there are no nested `layout.tsx` files and no separate router configuration. The root layout supplies fonts, locale/auth/cart/favorites/compare providers, reduced-motion policy, attribution capture, and the demo-mode banner. Public storefront pages add `SiteHeader`/`SiteFooter` themselves; operational pages render their own full-screen shell after `StaffSessionLogin`.

## Public storefront

| URL | Page file | Layout / shell | Summary |
| --- | --- | --- | --- |
| `/` | `apps/web/app/page.tsx` | Root layout; `HomeClient`, `SiteHeader`, `SiteFooter`, mobile `MobileHome` | SSR storefront content, CMS blocks, hero, category shortcuts, benefits, and featured catalog products. |
| `/catalog` | `apps/web/app/catalog/page.tsx` | Root layout; `CatalogClient`, storefront chrome, mobile `MobileCatalog` | Searchable/filterable product grid with category, stock and sort controls; query state lives in `?q=` and `?category=`. |
| `/product/[id]` | `apps/web/app/product/[id]/page.tsx` | Root layout; `ProductClient`, storefront chrome, mobile `MobileProduct` | Product gallery, price, stock/condition, variants, cart/favorites/compare actions, reviews and related products. |
| `/cart` | `apps/web/app/cart/page.tsx` | Root layout; storefront chrome, mobile `MobileCart` | Cart line items, quantity, promo and bonus controls, availability reconciliation and order summary. |
| `/checkout` | `apps/web/app/checkout/page.tsx` | Root layout; storefront chrome | Contact, delivery/pickup, payment and installment workflow; creates an order and stores guest-order access. |
| `/favorites` | `apps/web/app/favorites/page.tsx` | Root layout; storefront chrome, mobile `MobileFavorites` | Saved-product grid backed by the favorites provider. |
| `/compare` | `apps/web/app/compare/page.tsx` | Root layout; storefront chrome | Side-by-side product/specification comparison with cart actions. |
| `/search` | `apps/web/app/search/page.tsx` | Root layout; mobile `MobileSearch` | Dedicated mobile search; desktop forwards to `/catalog?q=…`. |
| `/login` | `apps/web/app/login/page.tsx` | Root layout; storefront chrome | Customer authentication with phone, email, and Telegram paths. |
| `/app` | `apps/web/app/app/page.tsx` | Root layout; `MobileHome` only | Web entry point that re-exports the client-app mobile home surface. |
| `/tg` | `apps/web/app/tg/page.tsx` | Root layout; Telegram mini-app shell | Telegram catalog/cart/order experience sharing the same API and guest order contract. |
| `/trade-in` | `apps/web/app/trade-in/page.tsx` | Root layout; `MobileAppFrame` | Customer trade-in estimate and evidence submission. |
| `/b2b` | `apps/web/app/b2b/page.tsx` | Root layout; `MobileAppFrame` | Business quote request, company details and order totals. |
| `/support` | `apps/web/app/support/page.tsx` | Root layout; `MobileAppFrame` | Support inbox, ticket creation and evidence upload. |
| `/about` | `apps/web/app/about/page.tsx` | Root layout; `StorefrontInfoPage` | CMS-backed company information. |
| `/delivery` | `apps/web/app/delivery/page.tsx` | Root layout; `StorefrontInfoPage` | CMS-backed delivery and payment information. |
| `/oferta` | `apps/web/app/oferta/page.tsx` | Root layout; storefront chrome | Public offer document. |
| `/privacy` | `apps/web/app/privacy/page.tsx` | Root layout; storefront chrome | Privacy policy document. |

## Customer account and order tracking

| URL | Page file | Layout / shell | Summary |
| --- | --- | --- | --- |
| `/account` | `apps/web/app/account/page.tsx` | Root layout; storefront chrome, mobile `MobileProfile` | Customer hub for orders, devices, warranty, bonuses, addresses, settings and sign-out. |
| `/account/orders/[id]` | `apps/web/app/account/orders/[id]/page.tsx` | Root layout; `OrderDetailClient` | Authenticated order details, receipt and order actions. |
| `/account/orders/[id]/status` | `apps/web/app/account/orders/[id]/status/page.tsx` | Root layout; `OrderStatusClient` | Authenticated order status timeline. |
| `/order/[id]` | `apps/web/app/order/[id]/page.tsx` | Root layout; `GuestOrderStatus` | Guest order-status access using the locally stored guest token. |
| `/account/addresses` | `apps/web/app/account/addresses/page.tsx` | Root layout; `MobileAppFrame` | Saved delivery address CRUD. |
| `/account/bonuses` | `apps/web/app/account/bonuses/page.tsx` | Root layout; `MobileAppFrame` | Loyalty balance and coupons. |
| `/account/devices` | `apps/web/app/account/devices/page.tsx` | Root layout; `AccountDetailFrame` | Owned devices, service work orders, loaners and estimate approval. |
| `/account/notifications` | `apps/web/app/account/notifications/page.tsx` | Root layout; `MobileAppFrame` | Customer notifications and communication settings. |
| `/account/protection` | `apps/web/app/account/protection/page.tsx` | Root layout; `MobileAppFrame` | Device-protection policies and offers. |
| `/account/returns` | `apps/web/app/account/returns/page.tsx` | Root layout; `MobileAppFrame` | Return request creation, evidence and status. |
| `/account/settings` | `apps/web/app/account/settings/page.tsx` | Root layout; `MobileAppFrame` | Profile, email attachment, consent and data-management settings. |
| `/account/warranty/[imei]` | `apps/web/app/account/warranty/[imei]/page.tsx` | Root layout; `WarrantyCertificateClient` | Customer warranty certificate for one IMEI. |

## Staff and operations

These routes are staff-only or operational surfaces. Their prefixes come from `apps/web/config/internal-routes.json` and receive `X-Robots-Tag: noindex, nofollow` in `apps/web/next.config.mjs`.

| URL | Page file | Layout / shell | Summary |
| --- | --- | --- | --- |
| `/erp` | `apps/web/app/erp/page.tsx` | Root layout; custom ERP command-center shell | Owner/admin cockpit: dashboard, stock, finance, tasks, KPI, CRM, HR, logistics, service, CMS, risks, readiness, flags, settings and Event Ledger. |
| `/pos` | `apps/web/app/pos/page.tsx` | Root layout; custom POS shell | Cashier sale flow: scan/catalog, ticket, customer, payment, offline queue/sync, receipt printing and service-order payments. |
| `/staff` | `apps/web/app/staff/page.tsx` | Root layout; custom staff shell | Store employee workspace: shift, orders, tasks/KPI, B2B, protection, buyback, debts, gift cards and HR week. |
| `/courier` | `apps/web/app/courier/page.tsx` | Root layout; responsive courier shell | Courier route, delivery start/complete/fail, evidence upload, online state, COD reconciliation and profile. |
| `/courier-cash` | `apps/web/app/courier-cash/page.tsx` | Root layout; cash-receiver shell | Cashier/admin/owner accepts and reconciles COD from a courier run. |
| `/warehouse` | `apps/web/app/warehouse/page.tsx` | Root layout; warehouse shell | Order picking/packing/issue stages plus receiving, transfers, write-offs, RMA and consignment operations. |
| `/approvals` | `apps/web/app/approvals/page.tsx` | Root layout; approval inbox shell | Two-factor-gated approvals, returns, refund execution/resolution and printable acts. |
| `/refunds` | `apps/web/app/refunds/page.tsx` | Root layout; refunds desk shell | Refund queue, provider reconciliation, retry and management actions. |
| `/admin/products` | `apps/web/app/admin/products/page.tsx` | Root layout; Products 3.0 shell | Product, variant, price and publication management linked to approvals. |
| `/ai-tools` | `apps/web/app/ai-tools/page.tsx` | Root layout; AI tools shell | Staff catalog categorization and description generation. |
| `/assess` | `apps/web/app/assess/page.tsx` | Root layout; valuation shell | Staff used-device grading and recommended buyback/resale calculation. |
| `/exchange` | `apps/web/app/exchange/page.tsx` | Root layout; exchange shell | Exchange workflow with replacement units and price difference. |
| `/warranty` | `apps/web/app/warranty/page.tsx` | Root layout; service shell | Staff warranty-case lookup, transitions and warranty-document printing. |

## Route handlers and generated routes

| URL | File | Purpose |
| --- | --- | --- |
| `/api/runtime-config` | `apps/web/app/api/runtime-config/route.ts` | Browser-safe runtime configuration endpoint. |
| `/healthz` | `apps/web/app/healthz/route.ts` | Web service health probe. |
| `/tg/webhook` | `apps/web/app/tg/webhook/route.ts` | Telegram webhook handler. |
| `/robots.txt` | `apps/web/app/robots.ts` | Robots policy including operational-route exclusions. |
| `/sitemap.xml` | `apps/web/app/sitemap.ts` | Public storefront sitemap; excludes internal routes. |

## Ecosystem route relationships

- Storefront `/catalog` → `/product/[id]` → `/cart` → `/checkout` creates the order consumed by `/staff` and `/warehouse`.
- `/pos` creates an in-store sale against the same product/stock/customer model surfaced in `/erp`; offline POS commands reconcile through the shared API and Event Ledger.
- `/staff` owns the store-side shift, customer handoff, buyback and order queue; higher-risk actions move to `/approvals`, while stock fulfillment moves to `/warehouse`.
- `/warehouse` reserves/assigns IMEI units, progresses orders to pickup/delivery, and feeds stock/risk state back into `/erp`.
- `/courier` receives assigned deliveries after warehouse packing, records proof/status, and closes the COD run; `/courier-cash` performs the independent receiver-side cash handover.
- `/erp` is the supervisory web surface across POS, Staff, Warehouse and Courier: it reads operational KPIs, stock, finance, logistics, service, risks and the shared Event Ledger.
