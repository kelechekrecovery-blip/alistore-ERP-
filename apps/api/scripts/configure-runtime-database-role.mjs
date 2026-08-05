import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Client } = pg;

export function quoteIdentifier(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error('Invalid PostgreSQL identifier');
  }
  return `"${value.replaceAll('"', '""')}"`;
}

export function privilegeStatements(ownerRole, runtimeRole) {
  const owner = quoteIdentifier(ownerRole);
  const runtime = quoteIdentifier(runtimeRole);
  return [
    'REVOKE CREATE ON SCHEMA public FROM PUBLIC',
    'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC',
    'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC',
    `REVOKE ALL ON SCHEMA public FROM ${runtime}`,
    `GRANT USAGE ON SCHEMA public TO ${runtime}`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${runtime}`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${runtime}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public REVOKE ALL ON TABLES FROM ${runtime}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${runtime}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${runtime}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${runtime}`,
    'REVOKE ALL ON TABLE public."AuditEvent" FROM PUBLIC',
    `REVOKE ALL ON TABLE public."AuditEvent" FROM ${runtime}`,
    `GRANT SELECT, INSERT ON TABLE public."AuditEvent" TO ${runtime}`,
    'REVOKE ALL ON TABLE public."_prisma_migrations" FROM PUBLIC',
    `REVOKE ALL ON TABLE public."_prisma_migrations" FROM ${runtime}`,
  ];
}

export function backupPrivilegeStatements(ownerRole, backupRole) {
  const owner = quoteIdentifier(ownerRole);
  const backup = quoteIdentifier(backupRole);
  return [
    `REVOKE ALL ON SCHEMA public FROM ${backup}`,
    `GRANT USAGE ON SCHEMA public TO ${backup}`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${backup}`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${backup}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public REVOKE ALL ON TABLES FROM ${backup}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${backup}`,
    `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${backup}`,
    `GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ${backup}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT SELECT ON TABLES TO ${backup}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT SELECT ON SEQUENCES TO ${backup}`,
  ];
}

async function scalar(client, text, values = []) {
  const result = await client.query(text, values);
  return result.rows[0];
}

async function expectDenied(client, statement, label) {
  await client.query('BEGIN');
  try {
    await client.query(statement);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '42501') return;
    throw new Error(`${label} failed with an unexpected database error (${error?.code ?? 'unknown'})`);
  }
  await client.query('ROLLBACK');
  throw new Error(`${label} was unexpectedly permitted`);
}

async function expectLedgerGuard(client, statement, label) {
  await client.query('BEGIN');
  try {
    await client.query(statement);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '55000') return;
    throw new Error(`${label} failed with an unexpected database error (${error?.code ?? 'unknown'})`);
  }
  await client.query('ROLLBACK');
  throw new Error(`${label} did not activate the immutable ledger guard`);
}

async function inspectRole(ownerClient, restrictedClient, label) {
  const ownerIdentity = await scalar(ownerClient, 'SELECT current_user AS role');
  const restrictedIdentity = await scalar(restrictedClient, 'SELECT current_user AS role');
  const runtimeRole = restrictedIdentity.role;
  const ownerRole = ownerIdentity.role;

  if (runtimeRole === ownerRole) throw new Error(`${label} and owner database roles must differ`);

  const attributes = await scalar(
    ownerClient,
    `SELECT
       EXISTS (
         SELECT 1 FROM pg_roles
          WHERE pg_has_role($1, oid, 'MEMBER')
            AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
       ) AS elevated_member,
       pg_has_role($1, $2, 'MEMBER') AS owner_member`,
    [runtimeRole, ownerRole],
  );
  if (attributes.elevated_member || attributes.owner_member) {
    throw new Error(`${label} database role is elevated or can assume the owner role`);
  }

  const ownership = await scalar(
    ownerClient,
    `SELECT
       pg_has_role($1, (SELECT datdba FROM pg_database WHERE datname = current_database()), 'MEMBER') AS owns_database,
       pg_has_role($1, n.nspowner, 'MEMBER') AS owns_schema,
       EXISTS (
         SELECT 1 FROM pg_class c
          WHERE c.relnamespace = n.oid AND c.relkind IN ('r', 'p', 'S')
            AND pg_has_role($1, c.relowner, 'MEMBER')
       ) AS owns_object,
       EXISTS (
         SELECT 1 FROM pg_class c
          WHERE c.relnamespace = n.oid AND c.relname = 'AuditEvent' AND c.relkind IN ('r', 'p')
       ) AS audit_exists
     FROM pg_namespace n WHERE n.nspname = 'public'`,
    [runtimeRole],
  );
  if (!ownership?.audit_exists) throw new Error('public."AuditEvent" does not exist');
  if (ownership.owns_database || ownership.owns_schema || ownership.owns_object) {
    throw new Error(`${label} database role owns the database or application schema objects`);
  }

  return { ownerRole, runtimeRole };
}

async function verifyPrivileges(ownerClient, runtimeClient, expectedRuntimeRole) {
  const identity = await scalar(runtimeClient, 'SELECT current_user AS role');
  if (identity.role !== expectedRuntimeRole) throw new Error('Runtime connection changed database identity');

  const checks = await scalar(
    ownerClient,
    `SELECT
       has_schema_privilege($1, 'public', 'USAGE') AS schema_usage,
       has_schema_privilege($1, 'public', 'CREATE') AS schema_create,
       has_table_privilege($1, 'public."AuditEvent"', 'SELECT') AS audit_select,
       has_table_privilege($1, 'public."AuditEvent"', 'INSERT') AS audit_insert,
       has_table_privilege($1, 'public."AuditEvent"', 'UPDATE') AS audit_update,
       has_table_privilege($1, 'public."AuditEvent"', 'DELETE') AS audit_delete,
       has_table_privilege($1, 'public."AuditEvent"', 'TRUNCATE') AS audit_truncate,
       (has_table_privilege($1, 'public."_prisma_migrations"', 'SELECT') OR
        has_table_privilege($1, 'public."_prisma_migrations"', 'INSERT') OR
        has_table_privilege($1, 'public."_prisma_migrations"', 'UPDATE') OR
        has_table_privilege($1, 'public."_prisma_migrations"', 'DELETE') OR
        has_table_privilege($1, 'public."_prisma_migrations"', 'TRUNCATE') OR
        has_table_privilege($1, 'public."_prisma_migrations"', 'REFERENCES') OR
        has_table_privilege($1, 'public."_prisma_migrations"', 'TRIGGER')) AS migrations_access,
       NOT EXISTS (
         SELECT 1
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind IN ('r', 'p')
            AND c.relname NOT IN ('AuditEvent', '_prisma_migrations')
            AND NOT (
              has_table_privilege($1, c.oid, 'SELECT') AND
              has_table_privilege($1, c.oid, 'INSERT') AND
              has_table_privilege($1, c.oid, 'UPDATE') AND
              has_table_privilege($1, c.oid, 'DELETE')
            )
       ) AS ordinary_table_dml,
       NOT EXISTS (
         SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
            AND c.relname NOT IN ('AuditEvent', '_prisma_migrations')
            AND (has_table_privilege($1, c.oid, 'TRUNCATE') OR
                 has_table_privilege($1, c.oid, 'REFERENCES') OR
                 has_table_privilege($1, c.oid, 'TRIGGER'))
       ) AS ordinary_table_dangerous,
       NOT EXISTS (
         SELECT 1
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND NOT CASE WHEN c.relkind = 'S' THEN
            has_sequence_privilege($1, c.oid, 'USAGE') AND
            has_sequence_privilege($1, c.oid, 'SELECT')
          ELSE true END
       ) AS ordinary_sequence_access,
       NOT EXISTS (
         SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND CASE WHEN c.relkind = 'S'
            THEN has_sequence_privilege($1, c.oid, 'UPDATE') ELSE false END
       ) AS ordinary_sequence_safe,
       NOT EXISTS (
         SELECT 1 FROM pg_roles r
          WHERE pg_has_role($1, r.oid, 'MEMBER') AND (
            has_schema_privilege(r.oid, 'public', 'CREATE') OR
            has_table_privilege(r.oid, 'public."AuditEvent"', 'UPDATE') OR
            has_table_privilege(r.oid, 'public."AuditEvent"', 'DELETE') OR
            has_table_privilege(r.oid, 'public."AuditEvent"', 'TRUNCATE') OR
            has_table_privilege(r.oid, 'public."AuditEvent"', 'TRIGGER') OR
            has_table_privilege(r.oid, 'public."AuditEvent"', 'REFERENCES') OR
            has_table_privilege(r.oid, 'public."_prisma_migrations"', 'SELECT') OR
            has_table_privilege(r.oid, 'public."_prisma_migrations"', 'INSERT') OR
            has_table_privilege(r.oid, 'public."_prisma_migrations"', 'UPDATE') OR
            has_table_privilege(r.oid, 'public."_prisma_migrations"', 'DELETE') OR
            has_table_privilege(r.oid, 'public."_prisma_migrations"', 'TRUNCATE') OR
            has_table_privilege(r.oid, 'public."_prisma_migrations"', 'TRIGGER') OR
            has_table_privilege(r.oid, 'public."_prisma_migrations"', 'REFERENCES') OR
            EXISTS (
              SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
                 AND c.relname NOT IN ('AuditEvent', '_prisma_migrations')
                 AND (has_table_privilege(r.oid, c.oid, 'TRUNCATE') OR
                      has_table_privilege(r.oid, c.oid, 'TRIGGER') OR
                      has_table_privilege(r.oid, c.oid, 'REFERENCES'))
            ) OR EXISTS (
              SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND CASE WHEN c.relkind = 'S'
                 THEN has_sequence_privilege(r.oid, c.oid, 'UPDATE') ELSE false END
            )
          )
       ) AS accessible_roles_safe`,
    [expectedRuntimeRole],
  );
  if (!checks.schema_usage || checks.schema_create || !checks.audit_select || !checks.audit_insert ||
      checks.audit_update || checks.audit_delete || checks.audit_truncate || checks.migrations_access ||
      !checks.ordinary_table_dml || !checks.ordinary_table_dangerous ||
      !checks.ordinary_sequence_access || !checks.ordinary_sequence_safe ||
      !checks.accessible_roles_safe) {
    throw new Error('Runtime database ACL verification failed');
  }

  await expectDenied(runtimeClient, 'CREATE TABLE public.__alistore_acl_probe (id integer)', 'schema CREATE probe');
  await expectDenied(runtimeClient, 'UPDATE public."AuditEvent" SET "type" = "type" WHERE false', 'AuditEvent UPDATE probe');
  await expectDenied(runtimeClient, 'DELETE FROM public."AuditEvent" WHERE false', 'AuditEvent DELETE probe');
  await expectDenied(runtimeClient, 'TRUNCATE TABLE public."AuditEvent"', 'AuditEvent TRUNCATE probe');
}

async function verifyBackupPrivileges(ownerClient, backupClient, expectedRole) {
  const checks = await scalar(ownerClient, `SELECT
    has_schema_privilege($1, 'public', 'USAGE') AS schema_usage,
    has_schema_privilege($1, 'public', 'CREATE') AS schema_create,
    NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
         AND NOT has_table_privilege($1, c.oid, 'SELECT')
    ) AS all_table_select,
    NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
         AND (has_table_privilege($1, c.oid, 'INSERT') OR
              has_table_privilege($1, c.oid, 'UPDATE') OR
              has_table_privilege($1, c.oid, 'DELETE') OR
              has_table_privilege($1, c.oid, 'TRUNCATE') OR
              has_table_privilege($1, c.oid, 'REFERENCES') OR
              has_table_privilege($1, c.oid, 'TRIGGER'))
    ) AS no_table_mutation,
    NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND NOT CASE WHEN c.relkind = 'S'
         THEN has_sequence_privilege($1, c.oid, 'SELECT') ELSE true END
    ) AS all_sequence_select,
    NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND CASE WHEN c.relkind = 'S' THEN
         has_sequence_privilege($1, c.oid, 'USAGE') OR has_sequence_privilege($1, c.oid, 'UPDATE')
       ELSE false END
    ) AS no_sequence_mutation,
    NOT EXISTS (
      SELECT 1 FROM pg_roles r
       WHERE pg_has_role($1, r.oid, 'MEMBER') AND (
         has_schema_privilege(r.oid, 'public', 'CREATE') OR
         EXISTS (
           SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
              AND (has_table_privilege(r.oid, c.oid, 'INSERT') OR
                   has_table_privilege(r.oid, c.oid, 'UPDATE') OR
                   has_table_privilege(r.oid, c.oid, 'DELETE') OR
                   has_table_privilege(r.oid, c.oid, 'TRUNCATE') OR
                   has_table_privilege(r.oid, c.oid, 'TRIGGER') OR
                   has_table_privilege(r.oid, c.oid, 'REFERENCES'))
         ) OR EXISTS (
           SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND CASE WHEN c.relkind = 'S' THEN
              has_sequence_privilege(r.oid, c.oid, 'USAGE') OR
              has_sequence_privilege(r.oid, c.oid, 'UPDATE')
            ELSE false END
         )
       )
    ) AS accessible_roles_safe`, [expectedRole]);
  if (!checks.schema_usage || checks.schema_create || !checks.all_table_select ||
      !checks.no_table_mutation || !checks.all_sequence_select || !checks.no_sequence_mutation ||
      !checks.accessible_roles_safe) {
    throw new Error('Backup database ACL verification failed');
  }
  await expectDenied(backupClient, 'CREATE TABLE public.__alistore_backup_acl_probe (id integer)', 'backup schema CREATE probe');
  await expectDenied(backupClient, `INSERT INTO public."AuditEvent" (id, "type", actor, payload, refs)
    VALUES ('backup-acl-probe', 'backup.probe', 'backup', '{}'::jsonb, ARRAY[]::text[])`, 'backup INSERT probe');
}

export async function configureRuntimeDatabaseRole({ ownerUrl, runtimeUrl, backupUrl }) {
  if (!ownerUrl || !runtimeUrl) {
    throw new Error('DATABASE_OWNER_URL and DATABASE_RUNTIME_URL are required');
  }
  const ownerClient = new Client({ connectionString: ownerUrl });
  const runtimeClient = new Client({ connectionString: runtimeUrl });
  const backupClient = backupUrl ? new Client({ connectionString: backupUrl }) : null;
  await ownerClient.connect();
  try {
    await runtimeClient.connect();
    try {
      const { ownerRole, runtimeRole } = await inspectRole(ownerClient, runtimeClient, 'Runtime');
      let backupRole;
      if (backupClient) {
        await backupClient.connect();
        ({ runtimeRole: backupRole } = await inspectRole(ownerClient, backupClient, 'Backup'));
        if (backupRole === runtimeRole) throw new Error('Runtime and backup database roles must differ');
      }
      await ownerClient.query('BEGIN');
      try {
        const statements = privilegeStatements(ownerRole, runtimeRole);
        if (backupRole) statements.push(...backupPrivilegeStatements(ownerRole, backupRole));
        for (const statement of statements) {
          await ownerClient.query(statement);
        }
        await ownerClient.query('COMMIT');
      } catch (error) {
        await ownerClient.query('ROLLBACK');
        throw error;
      }
      await verifyPrivileges(ownerClient, runtimeClient, runtimeRole);
      if (backupClient && backupRole) await verifyBackupPrivileges(ownerClient, backupClient, backupRole);
      await expectLedgerGuard(ownerClient, 'UPDATE public."AuditEvent" SET "type" = "type" WHERE false', 'owner UPDATE probe');
      await expectLedgerGuard(ownerClient, 'DELETE FROM public."AuditEvent" WHERE false', 'owner DELETE probe');
      await expectLedgerGuard(ownerClient, 'TRUNCATE TABLE public."AuditEvent"', 'owner TRUNCATE probe');
      process.stdout.write('Runtime database role configured and verified.\n');
    } finally {
      if (backupClient) await backupClient.end().catch(() => undefined);
      await runtimeClient.end();
    }
  } finally {
    await ownerClient.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  configureRuntimeDatabaseRole({
    ownerUrl: process.env.DATABASE_OWNER_URL,
    runtimeUrl: process.env.DATABASE_RUNTIME_URL,
    backupUrl: process.env.DATABASE_BACKUP_URL,
  }).catch((error) => {
    process.stderr.write('Runtime database role configuration failed.\n');
    process.exitCode = 1;
  });
}
