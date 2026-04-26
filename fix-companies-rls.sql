-- ═══════════════════════════════════════════════════════════════════════════════
-- SIMPATICO HR — FIX COMPANIES RLS UPDATE POLICY
-- ═══════════════════════════════════════════════════════════════════════════════
-- Run this ONCE in your Supabase SQL Editor to fix the "new row violates row-level security policy" error.

-- 1. Drop any existing UPDATE policies that might be causing the conflict
DROP POLICY IF EXISTS "Enable update for users based on email" ON companies;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON companies;
DROP POLICY IF EXISTS "Users can update their own company" ON companies;
DROP POLICY IF EXISTS "tenant_update_companies" ON companies;

-- 2. Create the correct UPDATE policy allowing users to update their company
CREATE POLICY "tenant_update_companies" ON companies
FOR UPDATE TO authenticated
USING (
  id IN (SELECT company_id FROM users WHERE auth_id = auth.uid())
)
WITH CHECK (
  id IN (SELECT company_id FROM users WHERE auth_id = auth.uid())
);

-- 3. Just in case, add a SELECT policy if it was missing
DROP POLICY IF EXISTS "tenant_select_companies" ON companies;
CREATE POLICY "tenant_select_companies" ON companies
FOR SELECT TO authenticated
USING (
  id IN (SELECT company_id FROM users WHERE auth_id = auth.uid())
);

-- 4. Give service role full access
DROP POLICY IF EXISTS "service_full_access" ON companies;
CREATE POLICY "service_full_access" ON companies 
FOR ALL TO service_role 
USING (true) WITH CHECK (true);
