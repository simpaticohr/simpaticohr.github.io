-- ============================================================================
-- Simpatico HR — Supabase RLS Verification Script
-- ============================================================================
-- Run this in your Supabase SQL Editor to check the health of your database.
-- This does NOT modify any data — it is READ ONLY.
-- ============================================================================

-- 1. CHECK: Which tables have RLS enabled/disabled?
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY rls_enabled ASC, tablename;

-- 2. CHECK: How many RLS policies per table?
SELECT
  t.tablename,
  t.rowsecurity AS rls_enabled,
  COALESCE(p.policy_count, 0) AS policy_count,
  CASE
    WHEN t.rowsecurity = true AND COALESCE(p.policy_count, 0) = 0
      THEN '🔴 LOCKED OUT — RLS on but no policies!'
    WHEN t.rowsecurity = false
      THEN '⚠️ NO RLS — table is open to anon key'
    WHEN COALESCE(p.policy_count, 0) < 2
      THEN '🟡 Few policies — review coverage'
    ELSE '✅ OK'
  END AS health
FROM pg_tables t
LEFT JOIN (
  SELECT tablename, count(*) AS policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY tablename
) p ON t.tablename = p.tablename
WHERE t.schemaname = 'public'
ORDER BY t.rowsecurity ASC, policy_count ASC, t.tablename;

-- 3. CHECK: List all RLS policies with details
SELECT
  tablename,
  policyname,
  roles,
  cmd AS operation,
  LEFT(qual, 80) AS using_clause,
  LEFT(with_check, 80) AS check_clause
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4. CHECK: Tables with NULL tenant_id (needs backfill)
-- Uncomment and run one at a time to check specific tables:
-- SELECT count(*) AS null_tenant_rows FROM public.onboarding_template_tasks WHERE tenant_id IS NULL;
-- SELECT count(*) AS null_tenant_rows FROM public.training_paths WHERE tenant_id IS NULL;
-- SELECT count(*) AS null_tenant_rows FROM public.training_path_courses WHERE tenant_id IS NULL;
-- SELECT count(*) AS null_tenant_rows FROM public.leave_balances WHERE tenant_id IS NULL;

-- 5. CHECK: Does get_my_tenant_id() function exist?
SELECT
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'get_my_tenant_id';

-- 6. CHECK: Any tables in public schema WITHOUT tenant_id column?
SELECT t.tablename
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = t.tablename
      AND c.column_name = 'tenant_id'
  )
ORDER BY t.tablename;
