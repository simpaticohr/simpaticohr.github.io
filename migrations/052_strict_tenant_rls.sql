-- ============================================================================
-- Migration 052: Strict Tenant Isolation — Database-Level Enforcement
-- ============================================================================
-- PROBLEM: Multiple users share the same company_id in the users table,
-- causing cross-tenant data leakage. Frontend filters (.eq('company_id', X))
-- are insufficient because they're client-side and can be bypassed.
--
-- This migration:
--   1. Re-creates get_my_tenant_id() to return company_id::text (UUID safe)
--   2. Drops and recreates ALL RLS policies on critical tables to enforce
--      company_id = get_my_tenant_id() at the database level
--   3. Ensures RLS is enabled on ALL critical tables
--   4. Adds policies that use company_id (not tenant_id) for consistency
--      with the frontend queries
--
-- IDEMPOTENT: Safe to run multiple times.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: Recreate get_my_tenant_id() with proper UUID->TEXT casting
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS TEXT AS $$
  SELECT company_id::text FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- PART 2: Enable RLS on ALL critical tables
-- ============================================================================

ALTER TABLE IF EXISTS public.jobs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.interviews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_applications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.companies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.interview_sessions  ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 3: Service role bypass (needed for workers/backend)
-- ============================================================================

-- jobs
DROP POLICY IF EXISTS "service_full_access" ON public.jobs;
CREATE POLICY "service_full_access" ON public.jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- interviews
DROP POLICY IF EXISTS "service_full_access" ON public.interviews;
CREATE POLICY "service_full_access" ON public.interviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- job_applications
DROP POLICY IF EXISTS "service_full_access" ON public.job_applications;
CREATE POLICY "service_full_access" ON public.job_applications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- employees
DROP POLICY IF EXISTS "service_full_access" ON public.employees;
CREATE POLICY "service_full_access" ON public.employees
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- interview_sessions
DROP POLICY IF EXISTS "service_full_access" ON public.interview_sessions;
CREATE POLICY "service_full_access" ON public.interview_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- users (service role needs full access)
DROP POLICY IF EXISTS "service_full_access" ON public.users;
CREATE POLICY "service_full_access" ON public.users
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- companies (service role needs full access)
DROP POLICY IF EXISTS "service_full_access" ON public.companies;
CREATE POLICY "service_full_access" ON public.companies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 4: STRICT tenant-scoped policies using company_id
-- ============================================================================
-- Every authenticated user can ONLY see rows where company_id matches
-- their own company_id from the users table.
-- ============================================================================

-- ─── JOBS ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_read_jobs" ON public.jobs;
CREATE POLICY "tenant_read_jobs" ON public.jobs
  FOR SELECT TO authenticated
  USING (company_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_insert_jobs" ON public.jobs;
CREATE POLICY "tenant_insert_jobs" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (company_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_jobs" ON public.jobs;
CREATE POLICY "tenant_update_jobs" ON public.jobs
  FOR UPDATE TO authenticated
  USING (company_id::text = public.get_my_tenant_id())
  WITH CHECK (company_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_jobs" ON public.jobs;
CREATE POLICY "tenant_delete_jobs" ON public.jobs
  FOR DELETE TO authenticated
  USING (company_id::text = public.get_my_tenant_id());



-- ─── INTERVIEWS ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_read_interviews" ON public.interviews;
CREATE POLICY "tenant_read_interviews" ON public.interviews
  FOR SELECT TO authenticated
  USING (company_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_insert_interviews" ON public.interviews;
CREATE POLICY "tenant_insert_interviews" ON public.interviews
  FOR INSERT TO authenticated
  WITH CHECK (company_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_interviews" ON public.interviews;
CREATE POLICY "tenant_update_interviews" ON public.interviews
  FOR UPDATE TO authenticated
  USING (company_id::text = public.get_my_tenant_id())
  WITH CHECK (company_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_interviews" ON public.interviews;
CREATE POLICY "tenant_delete_interviews" ON public.interviews
  FOR DELETE TO authenticated
  USING (company_id::text = public.get_my_tenant_id());

-- ─── JOB_APPLICATIONS ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_read_job_applications" ON public.job_applications;
CREATE POLICY "tenant_read_job_applications" ON public.job_applications
  FOR SELECT TO authenticated
  USING (company_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_insert_job_applications" ON public.job_applications;
CREATE POLICY "tenant_insert_job_applications" ON public.job_applications
  FOR INSERT TO authenticated
  WITH CHECK (company_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_job_applications" ON public.job_applications;
CREATE POLICY "tenant_update_job_applications" ON public.job_applications
  FOR UPDATE TO authenticated
  USING (company_id::text = public.get_my_tenant_id())
  WITH CHECK (company_id::text = public.get_my_tenant_id());

-- ─── EMPLOYEES ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_read_employees" ON public.employees;
CREATE POLICY "tenant_read_employees" ON public.employees
  FOR SELECT TO authenticated
  USING (company_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_insert_employees" ON public.employees;
CREATE POLICY "tenant_insert_employees" ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (company_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_employees" ON public.employees;
CREATE POLICY "tenant_update_employees" ON public.employees
  FOR UPDATE TO authenticated
  USING (company_id::text = public.get_my_tenant_id())
  WITH CHECK (company_id::text = public.get_my_tenant_id());

-- ─── INTERVIEW_SESSIONS ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_read_interview_sessions" ON public.interview_sessions;
CREATE POLICY "tenant_read_interview_sessions" ON public.interview_sessions
  FOR SELECT TO authenticated
  USING (company_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_insert_interview_sessions" ON public.interview_sessions;
CREATE POLICY "tenant_insert_interview_sessions" ON public.interview_sessions
  FOR INSERT TO authenticated
  WITH CHECK (company_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_interview_sessions" ON public.interview_sessions;
CREATE POLICY "tenant_update_interview_sessions" ON public.interview_sessions
  FOR UPDATE TO authenticated
  USING (company_id::text = public.get_my_tenant_id())
  WITH CHECK (company_id::text = public.get_my_tenant_id());

-- ─── USERS ─────────────────────────────────────────────────────────────────
-- Users can read their own profile and profiles in their company
DROP POLICY IF EXISTS "users_read_own" ON public.users;
CREATE POLICY "users_read_own" ON public.users
  FOR SELECT TO authenticated
  USING (
    auth_id = auth.uid() 
    OR company_id::text = public.get_my_tenant_id()
  );

-- Users can update only their own profile
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- ─── COMPANIES ─────────────────────────────────────────────────────────────
-- Users can only read their own company
DROP POLICY IF EXISTS "companies_read_own" ON public.companies;
CREATE POLICY "companies_read_own" ON public.companies
  FOR SELECT TO authenticated
  USING (id::text = public.get_my_tenant_id());

-- Company admins can update their own company
DROP POLICY IF EXISTS "companies_update_own" ON public.companies;
CREATE POLICY "companies_update_own" ON public.companies
  FOR UPDATE TO authenticated
  USING (id::text = public.get_my_tenant_id())
  WITH CHECK (id::text = public.get_my_tenant_id());

-- ============================================================================
-- PART 5: Public access policies for career pages (anonymous job viewing)
-- ============================================================================

DROP POLICY IF EXISTS "public_read_active_jobs" ON public.jobs;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'status'
  ) THEN
    EXECUTE 'CREATE POLICY "public_read_active_jobs" ON public.jobs
      FOR SELECT TO anon
      USING (status = ''active'' OR status = ''published'')';
  ELSE
    EXECUTE 'CREATE POLICY "public_read_active_jobs" ON public.jobs
      FOR SELECT TO anon
      USING (true)';
  END IF;
END $$;

-- ============================================================================
-- PART 6: Reload PostgREST schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;
