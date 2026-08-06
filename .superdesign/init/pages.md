# Key page dependency trees

All entries use `apps/web/app/layout.tsx`. The layout adds `apps/web/app/globals.css`, `apps/web/app/fonts.ts`, `apps/web/components/AttributionCapture.tsx`, `apps/web/components/DemoModeBanner.tsx`, and the providers in `apps/web/lib/auth.tsx`, `cart.tsx`, `favorites.tsx`, `compare.tsx`, and `i18n/locale.tsx`.

The API barrel `apps/web/lib/api.ts` re-exports the domain clients under `apps/web/lib/api/*.ts`; those clients converge on `apps/web/lib/api/http.ts`. It is listed once as `API barrel subtree` below instead of expanding the same nonvisual subtree under every component. This keeps the trees complete and deduplicated; for a visual design call, use the page, visual components, and state helpers, and omit unrelated API modules.

## / (Storefront home)

Entry: `apps/web/app/page.tsx`

Dependencies:
- `apps/web/app/HomeClient.tsx`
  - `apps/web/components/LoadFailure.tsx`
  - `apps/web/components/ProductCard.tsx`
    - `apps/web/components/ui/Badge.tsx`
      - `apps/web/components/ui/cn.ts`
    - `apps/web/lib/product-image.ts`
    - `apps/web/lib/cart.tsx`
    - `apps/web/lib/favorites.tsx`
    - `apps/web/lib/compare.tsx`
    - `apps/web/lib/format.ts`
    - `apps/web/lib/to-order.ts`
    - `apps/web/lib/api.ts` → API barrel subtree
  - `apps/web/components/SiteHeader.tsx`
    - `apps/web/components/storefront/Motion.tsx`
    - customer state providers; `apps/web/lib/api.ts` → API barrel subtree
  - `apps/web/components/SiteFooter.tsx`
    - `apps/web/lib/api.ts` → API barrel subtree
  - `apps/web/components/mobile/MobileHome.tsx`
    - `apps/web/components/LoadFailure.tsx`
    - `apps/web/components/mobile/MobileFrame.tsx`
      - `apps/web/components/MobileTabBar.tsx`
      - `apps/web/components/mobile/login-next.ts`
      - customer state providers
    - `apps/web/components/mobile/MobileProductCard.tsx`
      - `apps/web/components/ProductCard.tsx`
      - `apps/web/components/ui/Badge.tsx`
      - cart/favorites/compare and format helpers
    - `apps/web/components/motion/primitives.tsx`
    - `apps/web/lib/api.ts` → API barrel subtree
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/JsonLdScript.tsx`
- `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/lib/site.ts`

## /catalog (Catalog)

Entry: `apps/web/app/catalog/page.tsx`

Dependencies:
- `apps/web/app/catalog/CatalogClient.tsx`
  - `apps/web/components/ProductCard.tsx`
    - `apps/web/components/ui/Badge.tsx`
      - `apps/web/components/ui/cn.ts`
    - `apps/web/lib/product-image.ts`
    - cart/favorites/compare, format and to-order helpers
    - `apps/web/lib/api.ts` → API barrel subtree
  - `apps/web/components/SiteHeader.tsx`
    - `apps/web/components/storefront/Motion.tsx`
    - customer state providers; `apps/web/lib/api.ts` → API barrel subtree
  - `apps/web/components/SiteFooter.tsx`
  - `apps/web/components/mobile/MobileCatalog.tsx`
    - `apps/web/components/mobile/MobileFrame.tsx`
      - `apps/web/components/MobileTabBar.tsx`
      - `apps/web/components/mobile/login-next.ts`
    - `apps/web/components/mobile/MobileProductCard.tsx`
      - `apps/web/components/ProductCard.tsx`
      - `apps/web/components/ui/Badge.tsx`
    - customer state and format helpers
    - `apps/web/lib/api.ts` → API barrel subtree
  - `apps/web/lib/catalog-view.ts`
  - `apps/web/lib/format.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/JsonLdScript.tsx`
- `apps/web/lib/catalog-view.ts`
- `apps/web/lib/site.ts`
- `apps/web/lib/api.ts` → API barrel subtree

## /product/[id] (Product details)

Entry: `apps/web/app/product/[id]/page.tsx`

Dependencies:
- `apps/web/app/product/[id]/ProductClient.tsx`
  - `apps/web/components/ProductCard.tsx`
    - `apps/web/components/ui/Badge.tsx`
      - `apps/web/components/ui/cn.ts`
    - `apps/web/lib/product-image.ts`
    - cart/favorites/compare, format and to-order helpers
  - `apps/web/components/SiteHeader.tsx`
    - `apps/web/components/storefront/Motion.tsx`
  - `apps/web/components/SiteFooter.tsx`
  - `apps/web/components/mobile/MobileProduct.tsx`
    - `apps/web/components/mobile/MobileFrame.tsx`
      - `apps/web/components/MobileTabBar.tsx`
      - `apps/web/components/mobile/login-next.ts`
    - `apps/web/components/ui/Badge.tsx`
    - cart/favorites/compare and format helpers
    - `apps/web/lib/api.ts` → API barrel subtree
  - `apps/web/lib/analytics.ts`
  - `apps/web/lib/auth.tsx`
  - `apps/web/lib/cart.tsx`
  - `apps/web/lib/favorites.tsx`
  - `apps/web/lib/compare.tsx`
  - `apps/web/lib/format.ts`
  - `apps/web/lib/to-order.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/JsonLdScript.tsx`
- `apps/web/lib/product-image.ts`
- `apps/web/lib/format.ts`
- `apps/web/lib/site.ts`
- `apps/web/lib/api.ts` → API barrel subtree

## /cart (Cart)

Entry: `apps/web/app/cart/page.tsx`

Dependencies:
- `apps/web/components/SiteHeader.tsx`
  - `apps/web/components/storefront/Motion.tsx`
  - customer state providers; `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/SiteFooter.tsx`
- `apps/web/components/mobile/MobileCart.tsx`
  - `apps/web/components/mobile/MobileFrame.tsx`
    - `apps/web/components/MobileTabBar.tsx`
    - `apps/web/components/mobile/login-next.ts`
    - customer state providers
  - `apps/web/lib/cart.tsx`
  - `apps/web/lib/format.ts`
- `apps/web/lib/cart.tsx`
  - `apps/web/lib/auth.tsx`
  - `apps/web/lib/api/promotions.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/lib/format.ts`
- `apps/web/lib/api.ts` → API barrel subtree

## /checkout (Checkout)

Entry: `apps/web/app/checkout/page.tsx`

Dependencies:
- `apps/web/components/SiteHeader.tsx`
  - `apps/web/components/storefront/Motion.tsx`
  - customer state providers; `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/SiteFooter.tsx`
- `apps/web/lib/cart.tsx`
  - `apps/web/lib/auth.tsx`
  - `apps/web/lib/api/promotions.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/lib/auth.tsx`
- `apps/web/lib/checkout-idempotency.ts`
- `apps/web/lib/checkout-payment-options.ts`
- `apps/web/lib/attribution.ts`
- `apps/web/lib/guest-order-access.ts`
- `apps/web/lib/to-order.ts`
- `apps/web/lib/format.ts`
- `apps/web/lib/api/catalog.ts`
- `apps/web/lib/api/payments.ts`
- `apps/web/lib/api.ts` → API barrel subtree

## /erp (ERP command center)

Entry: `apps/web/app/erp/page.tsx`

Dependencies:
- `apps/web/components/StaffSessionLogin.tsx`
  - `apps/web/lib/staff-session.ts`
    - `apps/web/lib/api/staff-auth.ts`
    - `apps/web/lib/api/http.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/erp/DashboardView.tsx`
  - `apps/web/components/erp/Card.tsx`
    - `apps/web/lib/cn.ts`
  - `apps/web/components/erp/FunnelPanel.tsx`
  - `apps/web/components/erp/ZReportPanel.tsx`
- `apps/web/components/erp/StockView.tsx`
  - `apps/web/components/erp/Card.tsx`
  - `apps/web/components/erp/AsyncPanel.tsx`
  - `apps/web/components/erp/SupplyOperationsQueue.tsx`
  - `apps/web/components/WarehouseOps.tsx`
    - `apps/web/components/EvidencePicker.tsx`
    - `apps/web/components/LoadFailure.tsx`
    - `apps/web/lib/use-operational-store-point.tsx`
  - `apps/web/components/ConsignmentOps.tsx`
- `apps/web/components/erp/FinanceView.tsx`
  - `apps/web/components/erp/Card.tsx`
  - `apps/web/components/erp/AsyncPanel.tsx`
  - `apps/web/components/erp/FinanceControlsPanel.tsx`
  - `apps/web/components/erp/FinanceSettlementWorkspace.tsx`
  - `apps/web/components/erp/ZReportPanel.tsx`
- `apps/web/components/erp/TasksView.tsx`
- `apps/web/components/erp/KpiView.tsx`
  - `apps/web/components/erp/Card.tsx`
- `apps/web/components/erp/CrmView.tsx`
  - `apps/web/components/erp/Card.tsx`
  - `apps/web/components/erp/CustomerCard.tsx`
  - `apps/web/components/erp/AsyncPanel.tsx`
  - `apps/web/lib/crm.ts`
- `apps/web/components/erp/AiView.tsx`
- `apps/web/components/erp/AdminView.tsx`
  - `apps/web/components/erp/StaffAdminView.tsx`
  - `apps/web/components/admin/ProductManagementView.tsx`
    - `apps/web/components/admin/ProductList.tsx`
    - `apps/web/components/admin/ProductEditor.tsx`
      - `apps/web/components/erp/ImageField.tsx`
        - `apps/web/lib/api/media.ts`
      - `apps/web/lib/admin-product-form.ts`
    - `apps/web/lib/ai.ts`
- `apps/web/components/erp/HrView.tsx`
- `apps/web/components/erp/LogisticsView.tsx`
- `apps/web/components/erp/StoreOperationsView.tsx`
- `apps/web/components/erp/ServiceCenterView.tsx`
- `apps/web/components/erp/PricingView.tsx`
- `apps/web/components/erp/ReorderView.tsx`
  - `apps/web/components/erp/ProcurementView.tsx`
    - `apps/web/lib/use-operational-store-point.tsx`
  - `apps/web/components/erp/SupplyOperationsQueue.tsx`
  - `apps/web/lib/ai.ts`
- `apps/web/components/erp/CampaignsView.tsx`
  - `apps/web/components/erp/Card.tsx`
  - `apps/web/components/erp/AsyncPanel.tsx`
- `apps/web/components/erp/StorefrontView.tsx`
  - `apps/web/components/erp/StorefrontBlocksView.tsx`
  - `apps/web/components/erp/PromotionsView.tsx`
  - `apps/web/components/erp/ReviewModerationView.tsx`
  - `apps/web/components/erp/ImageField.tsx`
- `apps/web/components/erp/RiskCenterView.tsx`
- `apps/web/components/erp/ReadinessView.tsx`
- `apps/web/components/erp/FeatureFlagsView.tsx`
- `apps/web/components/erp/SettingsView.tsx`
  - `apps/web/lib/api/settings.ts`
- `apps/web/components/erp/Card.tsx`
- `apps/web/lib/reports.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/lib/api/staff-tasks.ts`
- `apps/web/lib/staff-session.ts`
- `apps/web/lib/staff-permissions.ts`
- `apps/web/lib/format.ts`
- `apps/web/lib/api.ts` → API barrel subtree

## /pos (Point of sale)

Entry: `apps/web/app/pos/page.tsx`

Dependencies:
- `apps/web/components/pos/PosCatalog.tsx`
  - `apps/web/components/ProductCard.tsx`
    - `apps/web/components/ui/Badge.tsx`
      - `apps/web/components/ui/cn.ts`
    - product image, cart, favorites, compare, format and to-order helpers
  - `apps/web/lib/format.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/pos/PosTicket.tsx`
  - `apps/web/components/ProductCard.tsx`
  - `apps/web/lib/format.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/pos/PosCheckout.tsx`
  - `apps/web/lib/format.ts`
  - `apps/web/lib/pos-offline.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/pos/ServicePosPayment.tsx`
  - `apps/web/components/pos/PosCheckout.tsx`
  - `apps/web/lib/staff-session.ts`
  - `apps/web/lib/format.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/StaffSessionLogin.tsx`
  - `apps/web/lib/staff-session.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/lib/staff-session.ts`
- `apps/web/lib/api.ts` → API barrel subtree, including `api/pos.ts`, `pos-offline.ts`, and `pos-hardware.ts`

## /staff (Staff workspace)

Entry: `apps/web/app/staff/page.tsx`

Dependencies:
- `apps/web/components/staff/ShiftHandoverPanel.tsx`
  - `apps/web/lib/staff.ts`
    - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/staff/DebtsDesk.tsx`
  - `apps/web/lib/staff-permissions.ts`
  - `apps/web/lib/format.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/staff/GiftCardIssue.tsx`
  - `apps/web/lib/staff-permissions.ts`
  - `apps/web/lib/format.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/StaffSessionLogin.tsx`
  - `apps/web/lib/staff-session.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/lib/staff.ts`
- `apps/web/lib/staff-permissions.ts`
- `apps/web/lib/staff-session.ts`
- `apps/web/lib/format.ts`
- `apps/web/lib/api.ts` → API barrel subtree

## /courier (Courier workspace)

Entry: `apps/web/app/courier/page.tsx`

Dependencies:
- `apps/web/components/StaffSessionLogin.tsx`
  - `apps/web/lib/staff-session.ts`
    - `apps/web/lib/api/staff-auth.ts`
    - `apps/web/lib/api/http.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/lib/staff-session.ts`
- `apps/web/lib/format.ts`
- `apps/web/lib/api.ts` → API barrel subtree, including `apps/web/lib/api/courier.ts`

## /warehouse (Warehouse workspace)

Entry: `apps/web/app/warehouse/page.tsx`

Dependencies:
- `apps/web/components/WarehouseOps.tsx`
  - `apps/web/components/EvidencePicker.tsx`
  - `apps/web/components/LoadFailure.tsx`
  - `apps/web/lib/use-operational-store-point.tsx`
    - `apps/web/lib/api.ts` → API barrel subtree
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/ConsignmentOps.tsx`
  - `apps/web/lib/use-operational-store-point.tsx`
  - `apps/web/lib/format.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/components/StaffSessionLogin.tsx`
  - `apps/web/lib/staff-session.ts`
  - `apps/web/lib/api.ts` → API barrel subtree
- `apps/web/lib/staff-session.ts`
- `apps/web/lib/format.ts`
- `apps/web/lib/api.ts` → API barrel subtree, including `apps/web/lib/api/warehouse.ts`

## Shared API barrel subtree

- `apps/web/lib/api.ts`
  - `apps/web/lib/api/http.ts`
  - `apps/web/lib/api/catalog.ts`
  - `apps/web/lib/api/orders.ts`
    - `apps/web/lib/reports.ts`
    - `apps/web/lib/attribution.ts`
  - `apps/web/lib/api/auth.ts`
  - `apps/web/lib/api/pos.ts`
  - `apps/web/lib/api/warehouse.ts`
  - `apps/web/lib/api/exchanges.ts`
  - `apps/web/lib/api/approvals.ts`
  - `apps/web/lib/api/tradeins.ts`
  - `apps/web/lib/api/support.ts`
  - `apps/web/lib/api/returns.ts`
  - `apps/web/lib/api/evidence.ts`
  - `apps/web/lib/api/payments.ts`
  - `apps/web/lib/api/giftcards.ts`
  - `apps/web/lib/api/documents.ts`
  - `apps/web/lib/api/labels.ts`
  - `apps/web/lib/api/receipts.ts`
    - `apps/web/lib/pos-offline.ts`
  - `apps/web/lib/api/debts.ts`
  - `apps/web/lib/api/refunds.ts`
  - `apps/web/lib/api/staff-auth.ts`
  - `apps/web/lib/api/campaigns.ts`
  - `apps/web/lib/api/products-admin.ts`
  - `apps/web/lib/api/readiness.ts`
  - `apps/web/lib/api/feature-flags.ts`
  - `apps/web/lib/api/b2b.ts`
  - `apps/web/lib/api/protection.ts`
  - `apps/web/lib/api/procurement.ts`
  - `apps/web/lib/api/finance.ts`
  - `apps/web/lib/api/customer-account.ts`
  - `apps/web/lib/api/notifications.ts`
  - `apps/web/lib/api/staff-tasks.ts`
  - `apps/web/lib/api/hr.ts`
  - `apps/web/lib/api/logistics.ts`
  - `apps/web/lib/api/courier.ts`
  - `apps/web/lib/api/store-operations.ts`
  - `apps/web/lib/api/service-center.ts`
  - `apps/web/lib/api/storefront.ts`
  - `apps/web/lib/api/reviews.ts`
  - `apps/web/lib/api/promotions.ts`
  - `apps/web/lib/api/storefront-blocks.ts`
  - `apps/web/lib/pos-offline.ts`
  - `apps/web/lib/pos-hardware.ts`
  - `apps/web/lib/format.ts`
