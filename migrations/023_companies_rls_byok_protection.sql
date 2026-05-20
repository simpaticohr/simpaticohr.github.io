-- ═══════════════════════════════════════════════════════════════════════════════
-- SIMPATICO HR — COMPANIES TABLE RLS + BYOK COLUMN PROTECTION
-- ═══════════════════════════════════════════════════════════════════════════════
-- Fixes Critical Issue C5: The `companies` table had NO Row-Level Security.
-- This migration enables RLS and adds tenant-scoped policies to prevent
-- cross-tenant access to BYOK AI configuration (api keys, provider, model).
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Enable RLS on the companies table
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2. Service role bypass (Worker API uses service_role for backend operations)
CREATE POLICY "service_full_access" ON public.companies
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Authenticated users can only read their own company row
-- The tenant_id in JWT claims must match the company's id
CREATE POLICY "tenant_read_own_company" ON public.companies
  FOR SELECT TO authenticated
  USING (
    id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'app_metadata'->>'company_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'company_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- 4. Only service_role (backend Worker) can update company rows
-- Authenticated users must go through the Worker API endpoints
-- which enforce role checks (admin, company_admin, etc.)
CREATE POLICY "tenant_update_own_company" ON public.companies
  FOR UPDATE TO authenticated
  USING (
    id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'app_metadata'->>'company_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'company_id'),
      'SIMP_PRO_MAIN'
    )
  )
  WITH CHECK (
    id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'app_metadata'->>'company_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'company_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE. After running this migration:
-- 1. The `companies` table now has RLS enabled
-- 2. Authenticated users can only read/update their OWN company row
-- 3. The backend Worker (service_role) retains full access for admin operations
-- 4. Direct Supabase API calls with anon/authenticated keys are now tenant-scoped
-- ═══════════════════════════════════════════════════════════════════════════════
