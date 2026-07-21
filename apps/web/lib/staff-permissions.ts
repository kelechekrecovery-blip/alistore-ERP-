/**
 * Web-side mirror of the API casbin Role Permission Matrix
 * (apps/api/src/authz/authz.model.ts). Only the grants the web UI gates on are
 * mirrored; the server RBAC stays the source of truth — this map only keeps
 * navigation and tabs that would render 403 out of sight. Role inheritance
 * matches the policy edges: owner → admin → senior_seller.
 */

export type StaffPermission = { obj: string; act: string };

/** permission "obj:act" → roles with an explicit `p, role, obj, act` policy line. */
const GRANTS: Record<string, readonly string[]> = {
  'reports:read': ['admin', 'owner'],
  'finance:read': ['admin', 'owner'],
  'hr:read': ['admin', 'owner'],
  'logistics:read': ['admin', 'owner'],
  'store_operations:read': ['seller', 'cashier', 'senior_seller', 'warehouse', 'service', 'courier', 'admin', 'owner'],
  'service_center:read': ['service', 'technician', 'admin', 'owner'],
  'support:read': ['admin', 'owner'],
  'ai:read': ['admin', 'owner'],
  'campaigns:read': ['marketer', 'admin', 'owner'],
  'storefront:read': ['marketer', 'admin', 'owner'],
  'inventory:count': ['warehouse', 'admin', 'owner'],
  'orders:queue': ['warehouse', 'admin', 'owner'],
  'procurement:read': ['warehouse', 'admin', 'owner'],
  'b2b:read': ['seller', 'senior_seller', 'admin', 'owner'],
  'protection:read': ['seller', 'senior_seller', 'admin', 'owner'],
  'tradeins:intake': ['cashier', 'seller', 'senior_seller', 'admin', 'owner'],
  'staff:manage': ['owner'],
  'settings:manage': ['owner'],
  'debts:read': ['cashier', 'seller', 'senior_seller', 'admin', 'owner'],
  'debts:create': ['cashier', 'seller', 'senior_seller', 'admin', 'owner'],
  'debts:pay': ['cashier', 'senior_seller', 'admin', 'owner'],
  'giftcards:issue': ['admin', 'owner'],
  'refunds:read': ['admin', 'owner'],
  'refunds:retry': ['admin', 'owner'],
  'refunds:manage': ['admin', 'owner'],
  'documents:read': ['seller', 'cashier', 'warehouse', 'admin', 'owner'],
  'labels:print': ['seller', 'cashier', 'warehouse', 'admin', 'owner'],
  'receipts:print': ['seller', 'cashier', 'senior_seller', 'admin', 'owner'],
};

/** `g, child, parent` policy edges: a role also holds every grant of its parent. */
const ROLE_INHERITS: Record<string, string> = { owner: 'admin', admin: 'senior_seller' };

function roleWithAncestors(role: string): string[] {
  const chain = [role];
  let current = role;
  while (ROLE_INHERITS[current]) {
    current = ROLE_INHERITS[current];
    chain.push(current);
  }
  return chain;
}

export function staffCan(role: string, obj: string, act: string): boolean {
  const roles = GRANTS[`${obj}:${act}`];
  if (!roles) return false;
  return roleWithAncestors(role).some((candidate) => roles.includes(candidate));
}

export const canReadDebts = (role: string) => staffCan(role, 'debts', 'read');
export const canCreateDebt = (role: string) => staffCan(role, 'debts', 'create');
export const canPayDebt = (role: string) => staffCan(role, 'debts', 'pay');
export const canIssueGiftCard = (role: string) => staffCan(role, 'giftcards', 'issue');
export const canReadRefunds = (role: string) => staffCan(role, 'refunds', 'read');
export const canRetryRefund = (role: string) => staffCan(role, 'refunds', 'retry');
export const canManageRefunds = (role: string) => staffCan(role, 'refunds', 'manage');
export const canPrintDocuments = (role: string) => staffCan(role, 'documents', 'read');
export const canPrintLabels = (role: string) => staffCan(role, 'labels', 'print');
export const canPrintReceipts = (role: string) => staffCan(role, 'receipts', 'print');

/** ERP shell routes (app/erp/page.tsx). `null` — route is open to every staff role. */
export type ErpRoute =
  | 'dash' | 'admin' | 'ai' | 'pricing' | 'reorder' | 'finance' | 'stock' | 'hr'
  | 'logistics' | 'operations' | 'service' | 'kpi' | 'crm' | 'campaigns'
  | 'storefront' | 'risks' | 'readiness' | 'settings' | 'ledger' | 'tasks';

export const ERP_ROUTE_PERMISSION: Record<ErpRoute, StaffPermission | null> = {
  dash: { obj: 'reports', act: 'read' },
  admin: null, // module launcher filters its own cards by role
  ai: { obj: 'ai', act: 'read' },
  pricing: { obj: 'ai', act: 'read' },
  reorder: { obj: 'procurement', act: 'read' },
  finance: { obj: 'finance', act: 'read' },
  stock: { obj: 'inventory', act: 'count' },
  hr: { obj: 'hr', act: 'read' },
  logistics: { obj: 'logistics', act: 'read' },
  operations: { obj: 'store_operations', act: 'read' },
  service: { obj: 'service_center', act: 'read' },
  kpi: { obj: 'reports', act: 'read' },
  crm: { obj: 'support', act: 'read' },
  campaigns: { obj: 'campaigns', act: 'read' },
  storefront: { obj: 'storefront', act: 'read' },
  risks: { obj: 'reports', act: 'read' },
  readiness: { obj: 'reports', act: 'read' }, // lists unconfigured integrations — owner/admin only
  settings: { obj: 'reports', act: 'read' }, // read for owner/admin; writing needs settings:manage (owner)
  ledger: { obj: 'reports', act: 'read' },
  tasks: null,
};

export function erpRouteAllowed(role: string, route: ErpRoute): boolean {
  const required = ERP_ROUTE_PERMISSION[route];
  return !required || staffCan(role, required.obj, required.act);
}

/** /staff app tabs (app/staff/page.tsx). `null` — tab is open to every staff role. */
export type StaffAppTab = 'home' | 'orders' | 'b2b' | 'protection' | 'tasks' | 'buyback' | 'hr';

export const STAFF_TAB_PERMISSION: Record<StaffAppTab, StaffPermission | null> = {
  home: null,
  orders: { obj: 'orders', act: 'queue' },
  b2b: { obj: 'b2b', act: 'read' },
  protection: { obj: 'protection', act: 'read' },
  tasks: null, // staff-tasks/mine is open to every staff role
  buyback: { obj: 'tradeins', act: 'intake' },
  hr: null, // hr/me/* self-service endpoints are open to every staff role
};

export function staffTabAllowed(role: string, tab: StaffAppTab): boolean {
  const required = STAFF_TAB_PERMISSION[tab];
  return !required || staffCan(role, required.obj, required.act);
}
