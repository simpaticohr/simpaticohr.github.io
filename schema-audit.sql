-- Multi-tenant security audit. Every query should return zero rows unless noted.

-- Tenant tables missing mandatory UUID ownership, FK, index, RLS, or forced RLS.
WITH tenant_tables AS (
  SELECT c.oid, n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND (c.relname LIKE 'consulting_%' OR EXISTS (
      SELECT 1 FROM information_schema.columns x
      WHERE x.table_schema = n.nspname AND x.table_name = c.relname AND x.column_name = 'company_id'
    ))
)
SELECT t.relname AS insecure_table,
  NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.relname AND c.column_name='company_id' AND c.data_type='uuid' AND c.is_nullable='NO') AS bad_company_id,
  NOT t.relrowsecurity AS rls_disabled,
  NOT t.relforcerowsecurity AS rls_not_forced,
  NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid=t.oid AND c.contype='f' AND pg_get_constraintdef(c.oid) LIKE '%company_id%companies%') AS missing_company_fk,
  NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=t.oid AND pg_get_indexdef(i.indexrelid) LIKE '%(company_id)%') AS missing_company_index
FROM tenant_tables t
WHERE NOT t.relrowsecurity OR NOT t.relforcerowsecurity
   OR NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.relname AND c.column_name='company_id' AND c.data_type='uuid' AND c.is_nullable='NO')
   OR NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid=t.oid AND c.contype='f' AND pg_get_constraintdef(c.oid) LIKE '%company_id%companies%')
   OR NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=t.oid AND pg_get_indexdef(i.indexrelid) LIKE '%(company_id)%');

-- Tenant tables missing one or more authenticated CRUD policies.
WITH tenant_tables AS (
  SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='company_id'
)
SELECT t.table_name, x.command AS missing_policy
FROM tenant_tables t
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) x(command)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_policies p
  WHERE p.schemaname='public' AND p.tablename=t.table_name
    AND p.cmd=x.command AND 'authenticated'=ANY(p.roles)
)
ORDER BY t.table_name, x.command;

-- Dangerous authenticated/anonymous policies with unconditional predicates.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND (roles && ARRAY['anon','authenticated','public']::name[])
  AND (coalesce(qual,'') IN ('true','(true)') OR coalesce(with_check,'') IN ('true','(true)'));

-- Legacy text tenant columns remaining after UUID cutover.
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND column_name='tenant_id';
