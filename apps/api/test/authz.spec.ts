import { AuthzService } from '../src/authz/authz.service';

describe('AuthzService (casbin — Role Permission Matrix)', () => {
  const authz = new AuthzService();

  beforeAll(async () => {
    await authz.init();
  });

  it('admin may approve a refund; senior_seller may not', async () => {
    expect(await authz.can('admin', 'refund', 'approve')).toBe(true);
    expect(await authz.can('senior_seller', 'refund', 'approve')).toBe(false);
  });

  it('owner inherits admin + senior_seller permissions', async () => {
    expect(await authz.can('owner', 'refund', 'approve')).toBe(true); // via admin
    expect(await authz.can('owner', 'discount', 'approve')).toBe(true); // via senior_seller
    expect(await authz.can('owner', 'write_off', 'approve')).toBe(true); // direct
  });

  it('a plain seller may not approve any dangerous action', async () => {
    expect(await authz.can('seller', 'discount', 'approve')).toBe(false);
    expect(await authz.can('seller', 'refund', 'approve')).toBe(false);
    expect(await authz.can('seller', 'write_off', 'approve')).toBe(false);
  });

  it('keeps inventory valuation and GL reconciliation financial', async () => {
    expect(await authz.can('owner', 'finance', 'read')).toBe(true);
    expect(await authz.can('admin', 'finance', 'read')).toBe(true);
    expect(await authz.can('warehouse', 'finance', 'read')).toBe(false);
  });
});
