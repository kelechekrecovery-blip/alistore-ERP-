import assert from 'node:assert/strict';
import test from 'node:test';
import {
  backupPrivilegeStatements,
  privilegeStatements,
  quoteIdentifier,
} from './configure-runtime-database-role.mjs';

test('quoteIdentifier safely quotes server-provided role names', () => {
  assert.equal(quoteIdentifier('alistore_runtime'), '"alistore_runtime"');
  assert.equal(quoteIdentifier('role"name'), '"role""name"');
  assert.throws(() => quoteIdentifier('bad\0role'), /Invalid PostgreSQL identifier/);
});

test('ACL plan keeps the ledger append-only and migrations owner-only', () => {
  const sql = privilegeStatements('alistore_owner', 'alistore_runtime').join(';\n');
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES/);
  assert.match(sql, /REVOKE ALL ON TABLE public\."AuditEvent"/);
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE public\."AuditEvent"/);
  assert.doesNotMatch(sql, /GRANT[^;]*(UPDATE|DELETE|TRUNCATE)[^;]*"AuditEvent"/);
  assert.match(sql, /REVOKE ALL ON TABLE public\."_prisma_migrations"/);
  assert.match(sql, /REVOKE CREATE ON SCHEMA public FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "alistore_runtime"/);
  assert.match(sql, /GRANT USAGE, SELECT ON ALL SEQUENCES/);
  assert.doesNotMatch(sql, /GRANT[^;]*UPDATE ON ALL SEQUENCES/);
});

test('backup ACL is read-only and includes migration history', () => {
  const sql = backupPrivilegeStatements('alistore_owner', 'alistore_backup').join(';\n');
  assert.match(sql, /GRANT SELECT ON ALL TABLES IN SCHEMA public TO "alistore_backup"/);
  assert.match(sql, /GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO "alistore_backup"/);
  assert.doesNotMatch(sql, /GRANT[^;]*(INSERT|UPDATE|DELETE|TRUNCATE)[^;]*TO "alistore_backup"/);
});
