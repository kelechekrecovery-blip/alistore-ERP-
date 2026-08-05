export type EventLedgerRoleQuery = <T>(sql: string) => Promise<T>;

type EventLedgerRoleSnapshot = {
  tableExists: boolean;
  hasOwnerMembership: boolean;
  isElevated: boolean;
  canCreateInSchema: boolean;
  canSelect: boolean;
  canInsert: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canTruncate: boolean;
  canTrigger: boolean;
  canReference: boolean;
  immutableGuardReady: boolean;
};

/**
 * Verify the production database identity used by the API and workers.
 *
 * AuditEvent is append-only only when the application role cannot bypass or
 * remove the database guard. Keep this query independent of Prisma models so
 * it can run immediately after connecting, including during a partial deploy.
 */
export async function assertEventLedgerRole(query: EventLedgerRoleQuery): Promise<void> {
  let rows: EventLedgerRoleSnapshot[];
  try {
    rows = await query<EventLedgerRoleSnapshot[]>(EVENT_LEDGER_ROLE_QUERY);
  } catch {
    // Catalog/connection errors may contain connection details. Startup still
    // fails closed, but the public error is deliberately credential-free.
    throw new Error('Event Ledger database role verification failed: catalog query failed');
  }
  const snapshot = rows[0];

  const failures: string[] = [];
  if (!snapshot?.tableExists) failures.push('AuditEvent table is missing');
  if (snapshot?.hasOwnerMembership) failures.push('role owns or can assume the AuditEvent owner role');
  if (snapshot?.isElevated) failures.push('role has elevated PostgreSQL attributes');
  if (snapshot?.canCreateInSchema) failures.push('role can CREATE in the ledger schema');
  if (!snapshot?.canSelect) failures.push('role lacks SELECT on AuditEvent');
  if (!snapshot?.canInsert) failures.push('role lacks INSERT on AuditEvent');
  if (snapshot?.canUpdate) failures.push('role can UPDATE AuditEvent');
  if (snapshot?.canDelete) failures.push('role can DELETE AuditEvent');
  if (snapshot?.canTruncate) failures.push('role can TRUNCATE AuditEvent');
  if (snapshot?.canTrigger) failures.push('role can alter AuditEvent triggers');
  if (snapshot?.canReference) failures.push('role has REFERENCES on AuditEvent');
  if (!snapshot?.immutableGuardReady) failures.push('immutable ledger trigger is missing, disabled, or incomplete');

  if (failures.length > 0) {
    throw new Error(`Event Ledger database role verification failed: ${failures.join('; ')}`);
  }
}

const EVENT_LEDGER_ROLE_QUERY = `
WITH accessible_roles AS (
  -- MEMBER includes direct and transitive memberships even when privileges are
  -- currently hidden behind NOINHERIT: the login could still SET ROLE later.
  SELECT oid, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
  FROM pg_roles
  WHERE pg_has_role(current_user, oid, 'MEMBER')
), ledger AS (
  SELECT c.oid, c.relowner, n.oid AS schema_oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'AuditEvent'
    AND c.relkind IN ('r', 'p')
), immutable_guard AS (
  SELECT t.tgenabled, pg_get_triggerdef(t.oid, true) AS definition,
         p.prosecdef, p.proconfig, p.prosrc,
         pg_has_role(current_user, p.proowner, 'MEMBER') AS function_owner_membership
  FROM pg_trigger t
  JOIN ledger l ON l.oid = t.tgrelid
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal
    AND t.tgname = 'AuditEvent_immutable_guard'
)
SELECT
  EXISTS (SELECT 1 FROM ledger) AS "tableExists",
  COALESCE((
    SELECT EXISTS (SELECT 1 FROM accessible_roles a WHERE a.oid = l.relowner)
    FROM ledger l
  ), true) AS "hasOwnerMembership",
  NOT EXISTS (SELECT 1 FROM accessible_roles)
    OR EXISTS (
      SELECT 1
      FROM accessible_roles a
      WHERE a.rolsuper OR a.rolcreaterole OR a.rolcreatedb OR a.rolreplication OR a.rolbypassrls
    ) AS "isElevated",
  COALESCE((
    SELECT EXISTS (
      SELECT 1 FROM accessible_roles a WHERE has_schema_privilege(a.oid, l.schema_oid, 'CREATE')
    )
    FROM ledger l
  ), true) AS "canCreateInSchema",
  COALESCE((
    SELECT EXISTS (
      SELECT 1 FROM accessible_roles a WHERE has_table_privilege(a.oid, l.oid, 'SELECT')
    )
    FROM ledger l
  ), false) AS "canSelect",
  COALESCE((
    SELECT EXISTS (
      SELECT 1 FROM accessible_roles a WHERE has_table_privilege(a.oid, l.oid, 'INSERT')
    )
    FROM ledger l
  ), false) AS "canInsert",
  COALESCE((
    SELECT EXISTS (
      SELECT 1 FROM accessible_roles a WHERE has_table_privilege(a.oid, l.oid, 'UPDATE')
    )
    FROM ledger l
  ), true) AS "canUpdate",
  COALESCE((
    SELECT EXISTS (
      SELECT 1 FROM accessible_roles a WHERE has_table_privilege(a.oid, l.oid, 'DELETE')
    )
    FROM ledger l
  ), true) AS "canDelete",
  COALESCE((
    SELECT EXISTS (
      SELECT 1 FROM accessible_roles a WHERE has_table_privilege(a.oid, l.oid, 'TRUNCATE')
    )
    FROM ledger l
  ), true) AS "canTruncate",
  COALESCE((
    SELECT EXISTS (
      SELECT 1 FROM accessible_roles a WHERE has_table_privilege(a.oid, l.oid, 'TRIGGER')
    )
    FROM ledger l
  ), true) AS "canTrigger",
  COALESCE((
    SELECT EXISTS (
      SELECT 1 FROM accessible_roles a WHERE has_table_privilege(a.oid, l.oid, 'REFERENCES')
    )
    FROM ledger l
  ), true) AS "canReference",
  COALESCE((
    SELECT
      g.tgenabled IN ('O', 'A')
      AND upper(g.definition) LIKE '%UPDATE%'
      AND upper(g.definition) LIKE '%DELETE%'
      AND upper(g.definition) LIKE '%TRUNCATE%'
      AND upper(g.definition) LIKE '%ALISTORE_REJECT_AUDIT_EVENT_MUTATION%'
      AND NOT g.prosecdef
      AND g.proconfig IS NULL
      AND NOT g.function_owner_membership
      AND upper(g.prosrc) LIKE '%RAISE EXCEPTION%AUDITEVENT IS APPEND-ONLY%'
      AND upper(g.prosrc) LIKE '%ERRCODE%55000%'
    FROM immutable_guard g
  ), false) AS "immutableGuardReady"
`;
