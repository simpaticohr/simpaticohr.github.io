-- ═══════════════════════════════════════════════════════════════════════════════
-- SIMPATICO HR — FIX COMPANIES AND USERS RLS POLICIES FOR NON-DEFAULT TENANTS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Fixes dashboard-loading issues for non-default (e.g. UK) companies.
-- Specifically, this drops and recreates:
-- 1. SELECT policy on companies table to allow selection if the user is the owner
--    or exists in the users table with that company_id (bypassing missing JWT claims).
-- 2. INSERT policy on users table to allow new user profiles to be successfully created.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Drop and Recreate companies SELECT policy
DROP POLICY IF EXISTS "tenant_read_own_company" ON public.companies;
CREATE POLICY "tenant_read_own_company" ON public.companies
  FOR SELECT TO authenticated
  USING (
    id::text = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'app_metadata'->>'company_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'company_id'),
      'SIMP_PRO_MAIN'
    )
    OR email = auth.jwt()->>'email'
    OR id::text IN (SELECT company_id::text FROM public.users WHERE auth_id = auth.uid())
  );

-- 2. Drop and Recreate users INSERT policy
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (auth_id::text = auth.uid()::text);

-- ═══════════════════════════════════════════════════════════════════════════════
-- REFRESH SCHEMA CACHE
-- ═══════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
