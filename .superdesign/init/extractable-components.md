# Extractable components

## Layout components

## SiteHeader
- Source: `apps/web/components/SiteHeader.tsx`
- Category: layout
- Description: Responsive AliStore storefront header with contact strip, catalog/search, customer tools, counts, category navigation and mobile menu.
- Extractable props: `variant` (`"light" | "design3"`, default: `"design3"`)
- Hardcoded: AliStore logo treatment, navigation/category labels and URLs, Lucide icons, search action, responsive breakpoints, all styling; account/cart/favorites/compare/store data come from providers/API.

## SiteFooter
- Source: `apps/web/components/SiteFooter.tsx`
- Category: layout
- Description: Storefront footer with customer/account/document navigation and CMS-backed store contacts.
- Extractable props: none
- Hardcoded: AliStore mark, column labels and URLs, copyright line, all CSS; description/contact values come from storefront API.

## MobileFrame
- Source: `apps/web/components/mobile/MobileFrame.tsx`
- Category: layout
- Description: Full-height mobile client-app shell with compact header, optional search/profile tools and persistent bottom tabs.
- Extractable props: `active`, `header`, `city`; `children` is the page content.
- Hardcoded: AliStore branding, icon names, tab chrome and CSS.

## MobileTabBar
- Source: `apps/web/components/MobileTabBar.tsx`
- Category: layout
- Description: Persistent five-tab mobile navigation shared by mobile home, catalog, favorites, cart and account surfaces.
- Extractable props: `active`; dynamic cart and favorite badge counts come from providers.
- Hardcoded: tab labels, URLs, icon names, five-tab order and CSS.

## MobileAppFrame
- Source: `apps/web/components/MobileAppFrame.tsx`
- Category: layout
- Description: Customer self-service page frame with storefront header/footer, back action, title, subtitle and elevated content surface.
- Extractable props: `title`, `subtitle`, `backHref`; `children` is the page content. (`active` is declared but currently unused.)
- Hardcoded: ArrowLeft icon, storefront shell components, container widths and CSS.

## AccountDetailFrame
- Source: `apps/web/components/AccountDetailFrame.tsx`
- Category: layout
- Description: Authenticated account-detail shell used by device/service screens with mobile and desktop treatments.
- Extractable props: none; `children` is the page content.
- Hardcoded: back icon, storefront chrome, responsive structure and CSS.

## StaffSessionLogin
- Source: `apps/web/components/StaffSessionLogin.tsx`
- Category: layout
- Description: Shared authentication/bootstrap gate used by POS, Staff, Courier, ERP, Warehouse and supporting operations tools.
- Extractable props: `mode`, `title`, `caption`, `onAuthenticated`
- Hardcoded: username/password/bootstrap field labels, first-owner bootstrap copy, API behavior and CSS.

## StorefrontInfoPage
- Source: `apps/web/components/StorefrontInfoPage.tsx`
- Category: layout
- Description: Shared CMS-driven informational page shell used by About and Delivery.
- Extractable props: `kind`
- Hardcoded: storefront chrome, error/loading layout, content section styling and CSS.

## Basic components

## ProductCard
- Source: `apps/web/components/ProductCard.tsx`
- Category: basic
- Description: Shared product tile with image/placeholder, stock and condition states, price, installment value, compare/favorite and cart actions.
- Extractable props: `product`, `variant`
- Hardcoded: icon names, status wording, product URL shape, interaction placement and CSS.

## MobileProductCard
- Source: `apps/web/components/mobile/MobileProductCard.tsx`
- Category: basic
- Description: Compact mobile product tile reusing the shared product imagery and customer state.
- Extractable props: `product`, `badge`, `priority`, `showCompare`
- Hardcoded: icon names, URL shape, cart/favorite/compare behavior and CSS.

## CatalogControls
- Source: `apps/web/components/CatalogControls.tsx`
- Category: basic
- Description: Reusable catalog search, category, stock and sort controls.
- Extractable props: `categories`; query, category and stock-only state is read from and written to URL search params.
- Hardcoded: field labels, URL parameter names, router target, default option wording and CSS.

## StatusPill
- Source: `apps/web/components/ui/Badge.tsx`
- Category: basic
- Description: Semantic compact status badge shared by product and operational states.
- Extractable props: `status`, `children`, `className`
- Hardcoded: tone palette, rounded shape and base typography.

## Button
- Source: `apps/web/components/ui/Button.tsx`
- Category: basic
- Description: Shared button primitive with visual variants and sizes.
- Extractable props: `variant`, `size`, standard button props.
- Hardcoded: variant/size CSS.

## Input
- Source: `apps/web/components/ui/Input.tsx`
- Category: basic
- Description: Shared input primitive wrapping the canonical `.input` class.
- Extractable props: standard input props.
- Hardcoded: canonical input CSS class.

## Surface
- Source: `apps/web/components/ui/Surface.tsx`
- Category: basic
- Description: Generic elevated/bordered surface for grouped content.
- Extractable props: `tone`, `inset`, `className`, standard div props.
- Hardcoded: surface styles and radius.

## Skeleton
- Source: `apps/web/components/ui/Skeleton.tsx`
- Category: basic
- Description: Shared loading placeholder primitive.
- Extractable props: `tone`, `className`, standard div props.
- Hardcoded: pulse animation and base color.

## LoadFailure
- Source: `apps/web/components/LoadFailure.tsx`
- Category: basic
- Description: Explicit error panel with retry action used by storefront, comparison and warehouse operations.
- Extractable props: `what`, `detail`, `onRetry`, `className`
- Hardcoded: failure icon, retry wording and CSS.

## EvidencePicker
- Source: `apps/web/components/EvidencePicker.tsx`
- Category: basic
- Description: Reusable multi-image evidence input for returns, trade-in, support, warehouse and courier workflows.
- Extractable props: `files`, `onChange`, `label`, `hint`, `max`
- Hardcoded: camera/file affordance, preview treatment, limits copy and CSS.

## ErpCard
- Source: `apps/web/components/erp/Card.tsx`
- Category: basic
- Description: Shared glass surface used across ERP module views.
- Extractable props: `className`; `children` is content.
- Hardcoded: `erp3-glass`, radius and default padding.

## AsyncPanel
- Source: `apps/web/components/erp/AsyncPanel.tsx`
- Category: basic
- Description: ERP data-state wrapper that distinguishes loading, failure with retry, empty and rendered states.
- Extractable props: `data`, `error`, `onRetry`, `isEmpty`, `emptyText`, `loadingText`; `children` renders loaded data.
- Hardcoded: Loader/Refresh icons, status structure and CSS.

## PosCatalog
- Source: `apps/web/components/pos/PosCatalog.tsx`
- Category: basic
- Description: POS product search/category grid with scan-oriented add-to-ticket actions.
- Extractable props: `cashier`, `shop`, `online`, `queueSummary`, `scanCode`, `onScanCodeChange`, `onScan`, `syncing`, `onSync`, `canPrint`, `onPrint`, `catalogSync`, `terminalMessage`, `queue`, `onClearSynced`, `categories`, `cat`, `onSelectCategory`, `grid`, `onAdd`, `onLogoutStaff`
- Hardcoded: POS labels, product grouping rules, icon names and CSS.

## PosTicket
- Source: `apps/web/components/pos/PosTicket.tsx`
- Category: basic
- Description: Current POS basket with quantity controls, discount state and totals.
- Extractable props: `lines`, `count`, `subtotal`, `total`, `discPct`, `discIdx`, `discounts`, `onClear`, `onSetQty`, `onSetDiscount`, `onCheckout`, `customerQuery`, `customer`, `customerBusy`, `onCustomerQueryChange`, `onFindCustomer`, `onClearCustomer`
- Hardcoded: ticket labels, icon names and CSS.

## PosCheckout
- Source: `apps/web/components/pos/PosCheckout.tsx`
- Category: basic
- Description: Reusable POS payment-method and split-payment workflow used for retail and service payments.
- Extractable props: `route`, `total`, `discountLimit`, `method`, `busy`, `pending`, `result`, `offlineResult`, `completion`, `title`, `confirmLabel`, `newLabel`, `allowedMethods`, `onSelectMethod`, `onFinish`, `onCancel`, `onNewSale`, `onPrintReceipt`, `onPrintServerReceipt`, `serverPrintBusy`
- Hardcoded: payment icon mapping, keypad/payment layout and CSS.

## ShiftHandoverPanel
- Source: `apps/web/components/staff/ShiftHandoverPanel.tsx`
- Category: basic
- Description: Staff shift cash handover form with target, counted cash, discrepancy reason and retry/error states.
- Extractable props: `shiftId`, `accessToken`, `onDone`
- Hardcoded: workflow copy, validation rules, field labels and CSS.

## DebtsDesk
- Source: `apps/web/components/staff/DebtsDesk.tsx`
- Category: basic
- Description: Staff debt/installment creation and repayment workspace with permission-aware states.
- Extractable props: `accessToken`, `role`, `flash`
- Hardcoded: business field labels, permission behavior, idempotency workflow and CSS.

## GiftCardIssue
- Source: `apps/web/components/staff/GiftCardIssue.tsx`
- Category: basic
- Description: Permission-aware gift-card issuance form and issued-code confirmation panel.
- Extractable props: `accessToken`, `role`, `flash`
- Hardcoded: issuance field labels, code presentation, idempotency behavior and CSS.

## WarehouseOps
- Source: `apps/web/components/WarehouseOps.tsx`
- Category: basic
- Description: Reusable warehouse operations workspace for receiving, transfers, write-offs and RMA with evidence handling.
- Extractable props: `accessToken`, `actor`
- Hardcoded: operation tabs, workflow field labels, endpoint behavior and CSS.

## ConsignmentOps
- Source: `apps/web/components/ConsignmentOps.tsx`
- Category: basic
- Description: Consignment intake, inventory and settlement workspace shared by Warehouse and ERP stock surfaces.
- Extractable props: `accessToken`, `role`
- Hardcoded: operation copy, financial fields, workflow rules and CSS.

## ServicePosPayment
- Source: `apps/web/components/pos/ServicePosPayment.tsx`
- Category: basic
- Description: Service-center payment wrapper that adapts a repair work order to the shared POS checkout flow.
- Extractable props: `workOrderId`, `session`, `onBack`
- Hardcoded: supported payment methods, repair payment copy, completion reference format and CSS.
