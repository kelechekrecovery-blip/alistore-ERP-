import { assertBackupDatabaseRole, BackupDatabaseRoleQuery } from './backup-database-role.guard';

const secure = {
  schemaExists: true,
  canUseSchema: true,
  isElevated: false,
  ownsDatabase: false,
  ownsSchema: false,
  ownsObject: false,
  canCreate: false,
  allTableSelect: true,
  canMutateTable: false,
  allSequenceSelect: true,
  canMutateSequence: false,
};

describe('assertBackupDatabaseRole', () => {
  it('accepts the read-only dump role and inspects transitive memberships', async () => {
    const mock = jest.fn(async (_sql: string) => [secure]);
    await expect(assertBackupDatabaseRole(mock as unknown as BackupDatabaseRoleQuery)).resolves.toBeUndefined();
    expect(mock.mock.calls[0]?.[0]).toContain("pg_has_role(current_user, oid, 'MEMBER')");
  });

  it.each([
    ['missing schema', { schemaExists: false }],
    ['missing schema usage', { canUseSchema: false }],
    ['elevated membership', { isElevated: true }],
    ['database ownership', { ownsDatabase: true }],
    ['schema ownership', { ownsSchema: true }],
    ['object ownership', { ownsObject: true }],
    ['schema create', { canCreate: true }],
    ['missing table select', { allTableSelect: false }],
    ['table mutation', { canMutateTable: true }],
    ['missing sequence select', { allSequenceSelect: false }],
    ['sequence mutation', { canMutateSequence: true }],
  ])('rejects %s', async (_label, change) => {
    const query = jest.fn(async () => [{ ...secure, ...change }]) as unknown as BackupDatabaseRoleQuery;
    await expect(assertBackupDatabaseRole(query)).rejects.toThrow('Backup database role verification failed');
  });

  it('redacts catalog errors', async () => {
    const query = jest.fn(async () => { throw new Error('postgresql://user:secret@example/db'); });
    await expect(assertBackupDatabaseRole(query as unknown as BackupDatabaseRoleQuery))
      .rejects.toThrow('catalog query failed');
    await expect(assertBackupDatabaseRole(query as unknown as BackupDatabaseRoleQuery))
      .rejects.not.toThrow('secret');
  });
});
