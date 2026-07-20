import { describe, expect, it } from 'vitest';
import {
  ERP_ROUTE_PERMISSION,
  STAFF_TAB_PERMISSION,
  erpRouteAllowed,
  staffCan,
  staffTabAllowed,
  type ErpRoute,
} from './staff-permissions';
import { STAFF_ROLES } from './api/staff-auth';

/**
 * UI-STAFF-ADMIN. The ERP sidebar and the /staff tabs used to render the full
 * owner navigation for every staff role, so seller/service/technician/courier
 * landed on views whose API calls answer 403 (e.g. orders,queue is only
 * warehouse/admin/owner in apps/api/src/authz/authz.model.ts). The web-side
 * gate must mirror the casbin Role Permission Matrix — including the
 * owner→admin→senior_seller inheritance — instead of re-inventing role lists
 * per screen.
 */
describe('staffCan (casbin mirror)', () => {
  it('grants orders:queue only to warehouse/admin/owner', () => {
    for (const role of ['warehouse', 'admin', 'owner']) {
      expect(staffCan(role, 'orders', 'queue')).toBe(true);
    }
    for (const role of ['seller', 'senior_seller', 'cashier', 'service', 'technician', 'courier', 'marketer', 'franchise']) {
      expect(staffCan(role, 'orders', 'queue')).toBe(false);
    }
  });

  it('owner inherits admin grants and admin inherits senior_seller grants', () => {
    // b2b:read is explicit for seller/senior_seller/admin/owner, but
    // hr:read is only granted to admin/owner — owner must inherit via admin.
    expect(staffCan('owner', 'hr', 'read')).toBe(true);
    expect(staffCan('admin', 'hr', 'read')).toBe(true);
    expect(staffCan('senior_seller', 'hr', 'read')).toBe(false);
    expect(staffCan('owner', 'b2b', 'read')).toBe(true);
  });

  it('inheritance flows downward only: admin does not get owner-only staff:manage', () => {
    expect(staffCan('owner', 'staff', 'manage')).toBe(true);
    expect(staffCan('admin', 'staff', 'manage')).toBe(false);
    expect(staffCan('senior_seller', 'staff', 'manage')).toBe(false);
  });

  it('print grants mirror the casbin matrix (UI-PRINT)', () => {
    // documents:read — seller/cashier/warehouse/admin/owner
    for (const role of ['seller', 'cashier', 'warehouse', 'admin', 'owner']) {
      expect(staffCan(role, 'documents', 'read')).toBe(true);
    }
    for (const role of ['senior_seller', 'franchise', 'service', 'courier', 'marketer', 'technician']) {
      expect(staffCan(role, 'documents', 'read')).toBe(false);
    }
    // labels:print — seller/cashier/warehouse/admin/owner
    expect(staffCan('warehouse', 'labels', 'print')).toBe(true);
    expect(staffCan('franchise', 'labels', 'print')).toBe(false);
    // receipts:print — seller/cashier/senior_seller/admin/owner, NOT warehouse
    for (const role of ['seller', 'cashier', 'senior_seller', 'admin', 'owner']) {
      expect(staffCan(role, 'receipts', 'print')).toBe(true);
    }
    for (const role of ['warehouse', 'service', 'courier', 'marketer', 'technician']) {
      expect(staffCan(role, 'receipts', 'print')).toBe(false);
    }
  });

  it('denies unknown roles and unknown permissions', () => {
    expect(staffCan('superroot', 'orders', 'queue')).toBe(false);
    expect(staffCan('owner', 'orders', 'teleport')).toBe(false);
  });
});

describe('erpRouteAllowed (sidebar filter)', () => {
  const ALL_ROUTES: ErpRoute[] = [
    'dash', 'admin', 'stock', 'finance', 'hr', 'logistics', 'operations',
    'service', 'kpi', 'crm', 'ai', 'pricing', 'reorder', 'campaigns',
    'storefront', 'risks', 'readiness', 'ledger',
  ];

  it('covers every route the ERP shell renders', () => {
    for (const route of ALL_ROUTES) {
      expect(Object.keys(ERP_ROUTE_PERMISSION)).toContain(route);
    }
  });

  it('owner sees the full navigation', () => {
    for (const route of ALL_ROUTES) {
      expect(erpRouteAllowed('owner', route)).toBe(true);
    }
  });

  it('warehouse keeps stock and operations but loses owner screens', () => {
    for (const route of ['stock', 'operations', 'admin'] as const) {
      expect(erpRouteAllowed('warehouse', route)).toBe(true);
    }
    for (const route of ['dash', 'finance', 'hr', 'ai', 'crm', 'ledger', 'campaigns', 'service'] as const) {
      expect(erpRouteAllowed('warehouse', route)).toBe(false);
    }
  });

  it('marketer keeps campaigns and storefront only', () => {
    for (const route of ['campaigns', 'storefront', 'admin'] as const) {
      expect(erpRouteAllowed('marketer', route)).toBe(true);
    }
    for (const route of ['dash', 'finance', 'hr', 'stock', 'service', 'ai'] as const) {
      expect(erpRouteAllowed('marketer', route)).toBe(false);
    }
  });

  // «Готовность запуска» enumerates which integrations are still unconfigured —
  // an attacker's checklist, so it follows reports:read like the other owner screens.
  it('readiness is owner/admin only', () => {
    expect(erpRouteAllowed('owner', 'readiness')).toBe(true);
    expect(erpRouteAllowed('admin', 'readiness')).toBe(true);
    for (const role of ['warehouse', 'marketer', 'cashier', 'seller', 'courier', 'service'] as const) {
      expect(erpRouteAllowed(role, 'readiness')).toBe(false);
    }
  });

  it('courier keeps point operations but loses service center and finance', () => {
    expect(erpRouteAllowed('courier', 'operations')).toBe(true);
    expect(erpRouteAllowed('courier', 'service')).toBe(false);
    expect(erpRouteAllowed('courier', 'finance')).toBe(false);
  });

  it('seller loses HR and reports but keeps point operations', () => {
    expect(erpRouteAllowed('seller', 'operations')).toBe(true);
    expect(erpRouteAllowed('seller', 'hr')).toBe(false);
    expect(erpRouteAllowed('seller', 'kpi')).toBe(false);
  });
});

describe('staffTabAllowed (/staff tabs, WEB-005 regression)', () => {
  it('covers every tab the staff app renders', () => {
    for (const tab of ['home', 'orders', 'b2b', 'protection', 'tasks', 'buyback', 'hr']) {
      expect(Object.keys(STAFF_TAB_PERMISSION)).toContain(tab);
    }
  });

  it('order queue is hidden from roles without orders:queue', () => {
    for (const role of ['warehouse', 'admin', 'owner']) {
      expect(staffTabAllowed(role, 'orders')).toBe(true);
    }
    // These roles used to see the queue and hit 403 on fetchOrdersByStatus.
    for (const role of ['seller', 'senior_seller', 'cashier', 'service', 'technician', 'courier', 'marketer', 'franchise']) {
      expect(staffTabAllowed(role, 'orders')).toBe(false);
    }
  });

  it('home, tasks and HR self-service stay open to every staff role', () => {
    for (const role of STAFF_ROLES) {
      expect(staffTabAllowed(role, 'home')).toBe(true);
      expect(staffTabAllowed(role, 'tasks')).toBe(true);
      expect(staffTabAllowed(role, 'hr')).toBe(true);
    }
  });

  it('buyback follows tradeins:intake and b2b follows b2b:read', () => {
    expect(staffTabAllowed('cashier', 'buyback')).toBe(true);
    expect(staffTabAllowed('warehouse', 'buyback')).toBe(false);
    expect(staffTabAllowed('courier', 'buyback')).toBe(false);
    expect(staffTabAllowed('seller', 'b2b')).toBe(true);
    expect(staffTabAllowed('technician', 'b2b')).toBe(false);
    expect(staffTabAllowed('seller', 'protection')).toBe(true);
    expect(staffTabAllowed('courier', 'protection')).toBe(false);
  });
});

describe('STAFF_ROLES (create-account form options)', () => {
  it('lists every assignable role', () => {
    expect([...STAFF_ROLES].sort()).toEqual(
      ['admin', 'cashier', 'courier', 'marketer', 'owner', 'seller', 'senior_seller', 'service', 'technician', 'warehouse'].sort(),
    );
  });

  // `franchise` stays in the Prisma enum (Postgres cannot drop an enum value in
  // place) but is retired: no grants, not offered when creating an account.
  it('does not offer the retired franchise role', () => {
    expect([...STAFF_ROLES]).not.toContain('franchise');
    expect(staffCan('franchise', 'store_operations', 'read')).toBe(false);
    expect(staffCan('franchise', 'receipts', 'print')).toBe(false);
    expect(staffCan('franchise', 'debts', 'create')).toBe(false);
  });
});
