export type BackupDatabaseRoleQuery = <T>(sql: string) => Promise<T>;

type BackupRoleSnapshot = {
  schemaExists: boolean;
  canUseSchema: boolean;
  isElevated: boolean;
  ownsDatabase: boolean;
  ownsSchema: boolean;
  ownsObject: boolean;
  canCreate: boolean;
  allTableSelect: boolean;
  canMutateTable: boolean;
  allSequenceSelect: boolean;
  canMutateSequence: boolean;
};

export async function assertBackupDatabaseRole(query: BackupDatabaseRoleQuery): Promise<void> {
  let rows: BackupRoleSnapshot[];
  try {
    rows = await query<BackupRoleSnapshot[]>(BACKUP_ROLE_QUERY);
  } catch {
    throw new Error('Backup database role verification failed: catalog query failed');
  }
  const value = rows[0];
  const failures: string[] = [];
  if (!value?.schemaExists) failures.push('public schema is missing');
  if (!value?.canUseSchema) failures.push('role cannot use public schema');
  if (value?.isElevated) failures.push('role can assume an elevated role');
  if (value?.ownsDatabase || value?.ownsSchema || value?.ownsObject) failures.push('role owns application objects');
  if (value?.canCreate) failures.push('role can CREATE in public');
  if (!value?.allTableSelect) failures.push('role cannot read every table');
  if (value?.canMutateTable) failures.push('role can mutate application tables');
  if (!value?.allSequenceSelect) failures.push('role cannot read every sequence');
  if (value?.canMutateSequence) failures.push('role can mutate application sequences');
  if (failures.length) throw new Error(`Backup database role verification failed: ${failures.join('; ')}`);
}

const BACKUP_ROLE_QUERY = `
WITH accessible_roles AS (
  SELECT oid, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
  FROM pg_roles WHERE pg_has_role(current_user, oid, 'MEMBER')
), public_schema AS (
  SELECT oid, nspowner FROM pg_namespace WHERE nspname = 'public'
)
SELECT
  EXISTS (SELECT 1 FROM public_schema) AS "schemaExists",
  EXISTS (
    SELECT 1 FROM public_schema n JOIN accessible_roles r
      ON has_schema_privilege(r.oid, n.oid, 'USAGE')
  ) AS "canUseSchema",
  NOT EXISTS (SELECT 1 FROM accessible_roles) OR EXISTS (
    SELECT 1 FROM accessible_roles
     WHERE rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls
  ) AS "isElevated",
  EXISTS (
    SELECT 1 FROM pg_database d JOIN accessible_roles r ON r.oid = d.datdba
     WHERE d.datname = current_database()
  ) AS "ownsDatabase",
  EXISTS (
    SELECT 1 FROM public_schema n JOIN accessible_roles r ON r.oid = n.nspowner
  ) AS "ownsSchema",
  EXISTS (
    SELECT 1 FROM pg_class c JOIN public_schema n ON n.oid = c.relnamespace
     JOIN accessible_roles r ON r.oid = c.relowner WHERE c.relkind IN ('r', 'p', 'S')
  ) AS "ownsObject",
  EXISTS (
    SELECT 1 FROM public_schema n JOIN accessible_roles r
      ON has_schema_privilege(r.oid, n.oid, 'CREATE')
  ) AS "canCreate",
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN public_schema n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p') AND NOT EXISTS (
       SELECT 1 FROM accessible_roles r WHERE has_table_privilege(r.oid, c.oid, 'SELECT')
     )
  ) AS "allTableSelect",
  EXISTS (
    SELECT 1 FROM pg_class c JOIN public_schema n ON n.oid = c.relnamespace
     JOIN accessible_roles r ON
       has_table_privilege(r.oid, c.oid, 'INSERT') OR
       has_table_privilege(r.oid, c.oid, 'UPDATE') OR
       has_table_privilege(r.oid, c.oid, 'DELETE') OR
       has_table_privilege(r.oid, c.oid, 'TRUNCATE') OR
       has_table_privilege(r.oid, c.oid, 'TRIGGER') OR
       has_table_privilege(r.oid, c.oid, 'REFERENCES')
     WHERE c.relkind IN ('r', 'p')
  ) AS "canMutateTable",
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN public_schema n ON n.oid = c.relnamespace
     WHERE NOT CASE WHEN c.relkind = 'S' THEN EXISTS (
       SELECT 1 FROM accessible_roles r WHERE has_sequence_privilege(r.oid, c.oid, 'SELECT')
     ) ELSE true END
  ) AS "allSequenceSelect",
  EXISTS (
    SELECT 1 FROM pg_class c JOIN public_schema n ON n.oid = c.relnamespace
     WHERE CASE WHEN c.relkind = 'S' THEN EXISTS (
       SELECT 1 FROM accessible_roles r WHERE
         has_sequence_privilege(r.oid, c.oid, 'USAGE') OR
         has_sequence_privilege(r.oid, c.oid, 'UPDATE')
     ) ELSE false END
  ) AS "canMutateSequence"
`;
