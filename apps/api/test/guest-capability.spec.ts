import {
  issueGuestCheckoutCapability,
  requireGuestCapability,
} from '../src/auth/guest-capability';

describe('guest checkout capability', () => {
  it('binds checkout scopes to one customer', () => {
    const token = issueGuestCheckoutCapability('customer-1');
    expect(requireGuestCapability(token, 'orders:create', 'customer-1').sub).toBe('customer-1');
    expect(requireGuestCapability(token, 'payments:intent').scopes).toContain('payments:intent');
    expect(requireGuestCapability(token, 'evidence:write').scopes).toContain('support:create');
    expect(() => requireGuestCapability(token, 'orders:create', 'customer-2'))
      .toThrow('guest_capability_owner_mismatch');
  });

  it('rejects missing and tampered capabilities', () => {
    expect(() => requireGuestCapability(undefined, 'orders:create'))
      .toThrow('guest_capability_required');
    const token = issueGuestCheckoutCapability('customer-1');
    expect(() => requireGuestCapability(`${token.slice(0, -1)}x`, 'orders:create'))
      .toThrow('guest_capability_invalid');
  });
});
