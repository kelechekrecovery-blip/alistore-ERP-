import { canApprove, canDiscountDirectly } from '../src/rbac/permissions';

/** Role Permission Matrix — pure policy, no DB. */
describe('RBAC policy', () => {
  it('only authorized roles may approve each dangerous action', () => {
    expect(canApprove('refund', 'admin')).toBe(true);
    expect(canApprove('refund', 'owner')).toBe(true);
    expect(canApprove('refund', 'seller')).toBe(false);

    // write_off / stock_adjust / delete are owner-only
    expect(canApprove('write_off', 'owner')).toBe(true);
    expect(canApprove('write_off', 'admin')).toBe(false);
    expect(canApprove('delete', 'owner')).toBe(true);
    expect(canApprove('delete', 'senior_seller')).toBe(false);

    // discount can be approved by senior_seller and up
    expect(canApprove('discount', 'senior_seller')).toBe(true);
    expect(canApprove('discount', 'seller')).toBe(false);
  });

  it('enforces role discount limits', () => {
    expect(canDiscountDirectly('seller', 5)).toBe(true);
    expect(canDiscountDirectly('seller', 10)).toBe(false);
    expect(canDiscountDirectly('senior_seller', 15)).toBe(true);
    expect(canDiscountDirectly('warehouse', 1)).toBe(false);
    expect(canDiscountDirectly('owner', 100)).toBe(true);
  });
});
