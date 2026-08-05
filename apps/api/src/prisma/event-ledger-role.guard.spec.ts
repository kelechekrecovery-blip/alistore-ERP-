import { assertEventLedgerRole, EventLedgerRoleQuery } from './event-ledger-role.guard';

const secureSnapshot = {
  tableExists: true,
  hasOwnerMembership: false,
  isElevated: false,
  canCreateInSchema: false,
  canSelect: true,
  canInsert: true,
  canUpdate: false,
  canDelete: false,
  canTruncate: false,
  canTrigger: false,
  canReference: false,
  immutableGuardReady: true,
};

describe('assertEventLedgerRole', () => {
  it('accepts the minimal append-only application role', async () => {
    const queryMock = jest.fn(async (_sql: string) => [secureSnapshot]);
    const query = queryMock as unknown as EventLedgerRoleQuery;

    await expect(assertEventLedgerRole(query)).resolves.toBeUndefined();
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0]?.[0]).toContain("has_table_privilege(a.oid, l.oid, 'INSERT')");
    expect(queryMock.mock.calls[0]?.[0]).toContain("pg_has_role(current_user, oid, 'MEMBER')");
  });

  it.each([
    ['table is absent', { tableExists: false }],
    ['role owns or can assume the table owner', { hasOwnerMembership: true }],
    ['role is elevated', { isElevated: true }],
    ['role can create in schema', { canCreateInSchema: true }],
    ['SELECT is missing', { canSelect: false }],
    ['INSERT is missing', { canInsert: false }],
    ['UPDATE is granted', { canUpdate: true }],
    ['DELETE is granted', { canDelete: true }],
    ['TRUNCATE is granted', { canTruncate: true }],
    ['TRIGGER is granted', { canTrigger: true }],
    ['REFERENCES is granted', { canReference: true }],
    ['immutable trigger is not ready', { immutableGuardReady: false }],
  ])('rejects when %s', async (_label, override) => {
    const query = jest.fn(async () => [{ ...secureSnapshot, ...override }]) as unknown as EventLedgerRoleQuery;

    await expect(assertEventLedgerRole(query)).rejects.toThrow('Event Ledger database role verification failed');
  });

  it('fails closed when the catalog query returns no result', async () => {
    const query = jest.fn(async () => []) as unknown as EventLedgerRoleQuery;

    await expect(assertEventLedgerRole(query)).rejects.toThrow('AuditEvent table is missing');
  });

  it('redacts catalog query failures that may contain a connection string', async () => {
    const query = jest.fn(async () => {
      throw new Error('database unavailable at postgresql://user:secret@example.test/db');
    }) as unknown as EventLedgerRoleQuery;

    await expect(assertEventLedgerRole(query)).rejects.toThrow(
      'Event Ledger database role verification failed: catalog query failed',
    );
    await expect(assertEventLedgerRole(query)).rejects.not.toThrow('secret');
  });
});
