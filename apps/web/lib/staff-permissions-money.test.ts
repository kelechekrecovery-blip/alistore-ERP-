import { describe, expect, it } from 'vitest';
import {
  canCreateDebt,
  canIssueGiftCard,
  canManageRefunds,
  canPayDebt,
  canReadDebts,
  canReadRefunds,
  canRetryRefund,
} from './staff-permissions';

/**
 * UI-DEBTS-GIFT-REFUND. The money-operation gates must mirror the server casbin
 * policy (apps/api/src/authz/authz.model.ts) exactly: showing an action the role
 * cannot complete lands staff on a 403, hiding one it holds blocks a legal sale.
 */
describe('staff-permissions · debts grants (mirror of RBAC policy)', () => {
  it('debts:create — cashier, seller, senior_seller, admin, owner', () => {
    for (const role of ['cashier', 'seller', 'senior_seller', 'admin', 'owner']) {
      expect(canCreateDebt(role)).toBe(true);
    }
    for (const role of ['warehouse', 'courier', 'service', 'technician', 'marketer']) {
      expect(canCreateDebt(role)).toBe(false);
    }
  });

  it('debts:read — same set as create', () => {
    for (const role of ['cashier', 'seller', 'senior_seller', 'admin', 'owner']) {
      expect(canReadDebts(role)).toBe(true);
    }
    for (const role of ['warehouse', 'courier', 'service']) {
      expect(canReadDebts(role)).toBe(false);
    }
  });

  it('debts:pay — cashier, senior_seller, admin, owner only (seller/franchise get 403 server-side)', () => {
    for (const role of ['cashier', 'senior_seller', 'admin', 'owner']) {
      expect(canPayDebt(role)).toBe(true);
    }
    for (const role of ['seller', 'franchise', 'warehouse', 'courier']) {
      expect(canPayDebt(role)).toBe(false);
    }
  });
});

describe('staff-permissions · giftcards grant', () => {
  it('giftcards:issue — cashier, senior_seller, admin, owner', () => {
    for (const role of ['cashier', 'senior_seller', 'admin', 'owner']) {
      expect(canIssueGiftCard(role)).toBe(true);
    }
    for (const role of ['seller', 'franchise', 'warehouse', 'courier', 'service']) {
      expect(canIssueGiftCard(role)).toBe(false);
    }
  });
});

describe('staff-permissions · refunds grants', () => {
  it('refunds:read/retry — admin and owner only', () => {
    for (const role of ['admin', 'owner']) {
      expect(canReadRefunds(role)).toBe(true);
      expect(canRetryRefund(role)).toBe(true);
    }
    for (const role of ['cashier', 'seller', 'senior_seller', 'franchise', 'warehouse']) {
      expect(canReadRefunds(role)).toBe(false);
      expect(canRetryRefund(role)).toBe(false);
    }
  });

  it('refunds:manage — admin and owner (cancel/resolve must not hide from admin)', () => {
    expect(canManageRefunds('admin')).toBe(true);
    expect(canManageRefunds('owner')).toBe(true);
    for (const role of ['cashier', 'seller', 'senior_seller', 'franchise']) {
      expect(canManageRefunds(role)).toBe(false);
    }
  });
});
