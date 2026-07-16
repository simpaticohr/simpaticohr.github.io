-- ============================================================================
-- Migration 040: Fix Employees Tenant Isolation & Clean Legacy Permissive Policies
-- ============================================================================

BEGIN;

-- 1. Ensure RLS is active on employees table
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- 2. Drop the old permissive "see everything" policies
DROP POLICY IF EXISTS "Auth users read employees" ON public.employees;
DROP POLICY IF EXISTS "Service role full access" ON public.employees;

-- 3. Drop legacy leaky policies from 001_tenant_isolation.sql
DROP POLICY IF EXISTS "tenant_read_employees" ON public.employees;
DROP POLICY IF EXISTS "tenant_own_payslips" ON public.payslips;
DROP POLICY IF EXISTS "tenant_all_payslips" ON public.payslips;
DROP POLICY IF EXISTS "tenant_all_payroll_runs" ON public.payroll_runs;
DROP POLICY IF EXISTS "tenant_read_leave" ON public.leave_requests;
DROP POLICY IF EXISTS "tenant_read_reviews" ON public.performance_reviews;
DROP POLICY IF EXISTS "tenant_read_training" ON public.training_enrollments;
DROP POLICY IF EXISTS "tenant_read_onboarding" ON public.onboarding_records;

-- 4. Re-create employees-specific policies with strict isolation
DROP POLICY IF EXISTS "service_full_access" ON public.employees;
CREATE POLICY "service_full_access" ON public.employees
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_rw_employees" ON public.employees;
CREATE POLICY "tenant_rw_employees" ON public.employees
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

COMMIT;

-- Notify PostgREST to reload the schema cache so the frontend queries succeed immediately
NOTIFY pgrst, 'reload schema';
