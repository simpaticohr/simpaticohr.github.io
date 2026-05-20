-- ============================================================================
-- Migration 030: RLS Production Hardening
-- ============================================================================
-- Description:
--   Comprehensive security hardening for the Simpatico HR ATS database.
--   This migration fixes ALL known RLS security issues across every table:
--
--   1. Enables RLS on 13 unprotected tables
--   2. Adds missing tenant_id columns for multi-tenant isolation
--   3. Creates a reusable get_my_tenant_id() helper function
--   4. Adds service_role full-access policies to all newly-protected tables
--   5. Adds tenant-scoped authenticated read/write policies
--   6. Fixes broken USING(true) policies that provide no tenant filtering
--   7. Secures subscriptions & payment_transactions (CRITICAL – was open to anon)
--   8. Fixes job_applications anon read leak (CRITICAL)
--   9. Standardises current_setting policies to use get_my_tenant_id()
--  10. Adds public read policies for career-page tables (jobs, job_listings)
--
-- Idempotency:
--   - Uses DROP POLICY IF EXISTS before every CREATE POLICY
--   - Uses ADD COLUMN IF NOT EXISTS for tenant_id additions
--   - Uses CREATE OR REPLACE FUNCTION for the helper
--   - Wrapped in a transaction for atomicity
--
-- Created: 2026-05-20
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: Enable RLS on all unprotected tables
-- ============================================================================
-- These tables currently have NO RLS enabled. Enabling it here ensures that
-- no data is accessible unless an explicit policy grants access.
-- ============================================================================

ALTER TABLE IF EXISTS public.jobs                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_listings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.interviews               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.interview_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.applications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leave_balances           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.onboarding_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.onboarding_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.onboarding_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.training_paths           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.training_path_courses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.org_profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users                    ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- PART 2: Add missing tenant_id columns
-- ============================================================================
-- Some tables were created without a tenant_id column, which is required for
-- multi-tenant row-level isolation. We add it here as nullable TEXT so that
-- existing rows are not broken; a backfill should follow in production.
-- ============================================================================

ALTER TABLE public.onboarding_template_tasks ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE public.training_paths            ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE public.training_path_courses     ADD COLUMN IF NOT EXISTS tenant_id TEXT;


-- ============================================================================
-- PART 3: Create helper function for tenant resolution
-- ============================================================================
-- Looks up the current authenticated user's company_id from the users table.
-- SECURITY DEFINER so it runs with elevated privileges (needed to read users
-- table even when RLS is active). STABLE because the result does not change
-- within a single transaction.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS TEXT AS $$
  SELECT company_id FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================================
-- PART 4: Service-role full-access policies on all newly-protected tables
-- ============================================================================
-- The service_role is used by server-side functions and background workers.
-- It must bypass RLS entirely. Each policy is scoped with TO service_role.
-- ============================================================================

-- jobs
DROP POLICY IF EXISTS "service_full_access" ON public.jobs;
CREATE POLICY "service_full_access" ON public.jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- job_listings
DROP POLICY IF EXISTS "service_full_access" ON public.job_listings;
CREATE POLICY "service_full_access" ON public.job_listings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- interviews
DROP POLICY IF EXISTS "service_full_access" ON public.interviews;
CREATE POLICY "service_full_access" ON public.interviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- interview_sessions
DROP POLICY IF EXISTS "service_full_access" ON public.interview_sessions;
CREATE POLICY "service_full_access" ON public.interview_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- applications
DROP POLICY IF EXISTS "service_full_access" ON public.applications;
CREATE POLICY "service_full_access" ON public.applications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- leave_balances
DROP POLICY IF EXISTS "service_full_access" ON public.leave_balances;
CREATE POLICY "service_full_access" ON public.leave_balances
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- onboarding_templates
DROP POLICY IF EXISTS "service_full_access" ON public.onboarding_templates;
CREATE POLICY "service_full_access" ON public.onboarding_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- onboarding_template_tasks
DROP POLICY IF EXISTS "service_full_access" ON public.onboarding_template_tasks;
CREATE POLICY "service_full_access" ON public.onboarding_template_tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- onboarding_tasks
DROP POLICY IF EXISTS "service_full_access" ON public.onboarding_tasks;
CREATE POLICY "service_full_access" ON public.onboarding_tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- training_paths
DROP POLICY IF EXISTS "service_full_access" ON public.training_paths;
CREATE POLICY "service_full_access" ON public.training_paths
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- training_path_courses
DROP POLICY IF EXISTS "service_full_access" ON public.training_path_courses;
CREATE POLICY "service_full_access" ON public.training_path_courses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- org_profiles
DROP POLICY IF EXISTS "service_full_access" ON public.org_profiles;
CREATE POLICY "service_full_access" ON public.org_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- users
DROP POLICY IF EXISTS "service_full_access" ON public.users;
CREATE POLICY "service_full_access" ON public.users
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- PART 5: Tenant-scoped authenticated policies for newly-protected tables
-- ============================================================================
-- Every authenticated user can only read/write rows that belong to their own
-- tenant (company). The tenant_id is resolved via get_my_tenant_id().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 5a. jobs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_jobs" ON public.jobs;
CREATE POLICY "tenant_read_jobs" ON public.jobs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_write_jobs" ON public.jobs;
CREATE POLICY "tenant_write_jobs" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_jobs" ON public.jobs;
CREATE POLICY "tenant_update_jobs" ON public.jobs
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_jobs" ON public.jobs;
CREATE POLICY "tenant_delete_jobs" ON public.jobs
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 5b. job_listings
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_job_listings" ON public.job_listings;
CREATE POLICY "tenant_read_job_listings" ON public.job_listings
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_write_job_listings" ON public.job_listings;
CREATE POLICY "tenant_write_job_listings" ON public.job_listings
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_job_listings" ON public.job_listings;
CREATE POLICY "tenant_update_job_listings" ON public.job_listings
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_job_listings" ON public.job_listings;
CREATE POLICY "tenant_delete_job_listings" ON public.job_listings
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 5c. interviews
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_interviews" ON public.interviews;
CREATE POLICY "tenant_read_interviews" ON public.interviews
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_write_interviews" ON public.interviews;
CREATE POLICY "tenant_write_interviews" ON public.interviews
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_interviews" ON public.interviews;
CREATE POLICY "tenant_update_interviews" ON public.interviews
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_interviews" ON public.interviews;
CREATE POLICY "tenant_delete_interviews" ON public.interviews
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 5d. interview_sessions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_interview_sessions" ON public.interview_sessions;
CREATE POLICY "tenant_read_interview_sessions" ON public.interview_sessions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_write_interview_sessions" ON public.interview_sessions;
CREATE POLICY "tenant_write_interview_sessions" ON public.interview_sessions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_interview_sessions" ON public.interview_sessions;
CREATE POLICY "tenant_update_interview_sessions" ON public.interview_sessions
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_interview_sessions" ON public.interview_sessions;
CREATE POLICY "tenant_delete_interview_sessions" ON public.interview_sessions
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 5e. applications
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_applications" ON public.applications;
CREATE POLICY "tenant_read_applications" ON public.applications
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_write_applications" ON public.applications;
CREATE POLICY "tenant_write_applications" ON public.applications
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_applications" ON public.applications;
CREATE POLICY "tenant_update_applications" ON public.applications
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_applications" ON public.applications;
CREATE POLICY "tenant_delete_applications" ON public.applications
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 5f. leave_balances
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_leave_balances" ON public.leave_balances;
CREATE POLICY "tenant_read_leave_balances" ON public.leave_balances
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_write_leave_balances" ON public.leave_balances;
CREATE POLICY "tenant_write_leave_balances" ON public.leave_balances
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_leave_balances" ON public.leave_balances;
CREATE POLICY "tenant_update_leave_balances" ON public.leave_balances
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_leave_balances" ON public.leave_balances;
CREATE POLICY "tenant_delete_leave_balances" ON public.leave_balances
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 5g. onboarding_templates
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_onboarding_templates" ON public.onboarding_templates;
CREATE POLICY "tenant_read_onboarding_templates" ON public.onboarding_templates
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_write_onboarding_templates" ON public.onboarding_templates;
CREATE POLICY "tenant_write_onboarding_templates" ON public.onboarding_templates
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_onboarding_templates" ON public.onboarding_templates;
CREATE POLICY "tenant_update_onboarding_templates" ON public.onboarding_templates
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_onboarding_templates" ON public.onboarding_templates;
CREATE POLICY "tenant_delete_onboarding_templates" ON public.onboarding_templates
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 5h. onboarding_template_tasks
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_onboarding_template_tasks" ON public.onboarding_template_tasks;
CREATE POLICY "tenant_read_onboarding_template_tasks" ON public.onboarding_template_tasks
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_write_onboarding_template_tasks" ON public.onboarding_template_tasks;
CREATE POLICY "tenant_write_onboarding_template_tasks" ON public.onboarding_template_tasks
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_onboarding_template_tasks" ON public.onboarding_template_tasks;
CREATE POLICY "tenant_update_onboarding_template_tasks" ON public.onboarding_template_tasks
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_onboarding_template_tasks" ON public.onboarding_template_tasks;
CREATE POLICY "tenant_delete_onboarding_template_tasks" ON public.onboarding_template_tasks
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 5i. onboarding_tasks
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_onboarding_tasks" ON public.onboarding_tasks;
CREATE POLICY "tenant_read_onboarding_tasks" ON public.onboarding_tasks
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_write_onboarding_tasks" ON public.onboarding_tasks;
CREATE POLICY "tenant_write_onboarding_tasks" ON public.onboarding_tasks
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_onboarding_tasks" ON public.onboarding_tasks;
CREATE POLICY "tenant_update_onboarding_tasks" ON public.onboarding_tasks
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_onboarding_tasks" ON public.onboarding_tasks;
CREATE POLICY "tenant_delete_onboarding_tasks" ON public.onboarding_tasks
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 5j. training_paths
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_training_paths" ON public.training_paths;
CREATE POLICY "tenant_read_training_paths" ON public.training_paths
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_write_training_paths" ON public.training_paths;
CREATE POLICY "tenant_write_training_paths" ON public.training_paths
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_training_paths" ON public.training_paths;
CREATE POLICY "tenant_update_training_paths" ON public.training_paths
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_training_paths" ON public.training_paths;
CREATE POLICY "tenant_delete_training_paths" ON public.training_paths
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 5k. training_path_courses
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_training_path_courses" ON public.training_path_courses;
CREATE POLICY "tenant_read_training_path_courses" ON public.training_path_courses
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_write_training_path_courses" ON public.training_path_courses;
CREATE POLICY "tenant_write_training_path_courses" ON public.training_path_courses
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_training_path_courses" ON public.training_path_courses;
CREATE POLICY "tenant_update_training_path_courses" ON public.training_path_courses
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_training_path_courses" ON public.training_path_courses;
CREATE POLICY "tenant_delete_training_path_courses" ON public.training_path_courses
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 5l. org_profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_org_profiles" ON public.org_profiles;
CREATE POLICY "tenant_read_org_profiles" ON public.org_profiles
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_write_org_profiles" ON public.org_profiles;
CREATE POLICY "tenant_write_org_profiles" ON public.org_profiles
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_org_profiles" ON public.org_profiles;
CREATE POLICY "tenant_update_org_profiles" ON public.org_profiles
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_org_profiles" ON public.org_profiles;
CREATE POLICY "tenant_delete_org_profiles" ON public.org_profiles
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 5m. users (special handling – no tenant_id filtering, uses auth_id/company_id)
-- ---------------------------------------------------------------------------

-- Users can read their own record
DROP POLICY IF EXISTS "users_read_own" ON public.users;
CREATE POLICY "users_read_own" ON public.users
  FOR SELECT TO authenticated
  USING (auth_id = auth.uid());

-- Users can read other users in the same company
DROP POLICY IF EXISTS "users_read_own_company" ON public.users;
CREATE POLICY "users_read_own_company" ON public.users
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_tenant_id());

-- Users can update their own record
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- Allow new user signup (insert own record)
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (auth_id = auth.uid());


-- ============================================================================
-- PART 6: Fix broken USING(true) policies
-- ============================================================================
-- These tables already have RLS enabled, but their authenticated policies use
-- USING(true) which provides zero tenant filtering. We drop the old policies
-- and replace them with proper tenant-scoped ones.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 6a. employee_salaries
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_salaries"  ON public.employee_salaries;
DROP POLICY IF EXISTS "tenant_insert_salaries" ON public.employee_salaries;
DROP POLICY IF EXISTS "tenant_update_salaries" ON public.employee_salaries;

CREATE POLICY "tenant_read_salaries" ON public.employee_salaries
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_insert_salaries" ON public.employee_salaries
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_update_salaries" ON public.employee_salaries
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 6b. payroll_deductions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_deductions"  ON public.payroll_deductions;
DROP POLICY IF EXISTS "tenant_insert_deductions" ON public.payroll_deductions;

CREATE POLICY "tenant_read_deductions" ON public.payroll_deductions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_insert_deductions" ON public.payroll_deductions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 6c. payroll_runs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_runs"   ON public.payroll_runs;
DROP POLICY IF EXISTS "tenant_insert_runs" ON public.payroll_runs;
DROP POLICY IF EXISTS "tenant_update_runs" ON public.payroll_runs;

CREATE POLICY "tenant_read_runs" ON public.payroll_runs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_insert_runs" ON public.payroll_runs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_update_runs" ON public.payroll_runs
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 6d. payslips
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_payslips"   ON public.payslips;
DROP POLICY IF EXISTS "tenant_insert_payslips" ON public.payslips;
DROP POLICY IF EXISTS "tenant_update_payslips" ON public.payslips;

CREATE POLICY "tenant_read_payslips" ON public.payslips
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_insert_payslips" ON public.payslips
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_update_payslips" ON public.payslips
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 6e. employee_expenses
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_read_expenses"   ON public.employee_expenses;
DROP POLICY IF EXISTS "tenant_insert_expenses" ON public.employee_expenses;
DROP POLICY IF EXISTS "tenant_update_expenses" ON public.employee_expenses;

CREATE POLICY "tenant_read_expenses" ON public.employee_expenses
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_insert_expenses" ON public.employee_expenses
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_update_expenses" ON public.employee_expenses
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 6f. offboarding_records
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Auth users read offboarding"   ON public.offboarding_records;
DROP POLICY IF EXISTS "Auth users insert offboarding" ON public.offboarding_records;
DROP POLICY IF EXISTS "Auth users update offboarding" ON public.offboarding_records;

CREATE POLICY "tenant_read_offboarding_records" ON public.offboarding_records
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_insert_offboarding_records" ON public.offboarding_records
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_update_offboarding_records" ON public.offboarding_records
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 6g. offboarding_tasks
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Auth users read offboarding_tasks"   ON public.offboarding_tasks;
DROP POLICY IF EXISTS "Auth users update offboarding_tasks" ON public.offboarding_tasks;

CREATE POLICY "tenant_read_offboarding_tasks" ON public.offboarding_tasks
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_update_offboarding_tasks" ON public.offboarding_tasks
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 6h. pulse_surveys
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Auth users read pulse_surveys" ON public.pulse_surveys;

CREATE POLICY "tenant_read_pulse_surveys" ON public.pulse_surveys
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 6i. pulse_survey_responses
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Auth users insert pulse_responses" ON public.pulse_survey_responses;
DROP POLICY IF EXISTS "Auth users read pulse_responses"   ON public.pulse_survey_responses;

CREATE POLICY "tenant_read_pulse_survey_responses" ON public.pulse_survey_responses
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_insert_pulse_survey_responses" ON public.pulse_survey_responses
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 6j. automation_rules
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Auth users read rules"   ON public.automation_rules;
DROP POLICY IF EXISTS "Auth users insert rules" ON public.automation_rules;
DROP POLICY IF EXISTS "Auth users update rules" ON public.automation_rules;
DROP POLICY IF EXISTS "Auth users delete rules" ON public.automation_rules;

CREATE POLICY "tenant_read_automation_rules" ON public.automation_rules
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_insert_automation_rules" ON public.automation_rules
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_update_automation_rules" ON public.automation_rules
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_delete_automation_rules" ON public.automation_rules
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 6k. automation_logs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Auth users read logs"   ON public.automation_logs;
DROP POLICY IF EXISTS "Auth users insert logs" ON public.automation_logs;

CREATE POLICY "tenant_read_automation_logs" ON public.automation_logs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "tenant_insert_automation_logs" ON public.automation_logs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());


-- ============================================================================
-- PART 7: Fix subscriptions & payment_transactions (CRITICAL)
-- ============================================================================
-- The current policies allow ANY role (including anon) full CRUD access.
-- We replace them with service_role-only write and tenant-scoped read.
-- ============================================================================

-- subscriptions
DROP POLICY IF EXISTS "subscriptions_service_all" ON public.subscriptions;
CREATE POLICY "subscriptions_service_all" ON public.subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "subscriptions_tenant_read" ON public.subscriptions;
CREATE POLICY "subscriptions_tenant_read" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- payment_transactions
DROP POLICY IF EXISTS "payment_transactions_service_all" ON public.payment_transactions;
CREATE POLICY "payment_transactions_service_all" ON public.payment_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "payment_transactions_tenant_read" ON public.payment_transactions;
CREATE POLICY "payment_transactions_tenant_read" ON public.payment_transactions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());


-- ============================================================================
-- PART 8: Fix job_applications anon read (CRITICAL)
-- ============================================================================
-- Previously anon could read all job applications. Remove that policy and
-- replace with a tenant-scoped read for authenticated users only.
-- ============================================================================

DROP POLICY IF EXISTS "anon_read_applications" ON public.job_applications;

DROP POLICY IF EXISTS "tenant_read_job_applications" ON public.job_applications;
CREATE POLICY "tenant_read_job_applications" ON public.job_applications
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());


-- ============================================================================
-- PART 9: Fix inconsistent current_setting policies
-- ============================================================================
-- Some tables used current_setting('app.tenant_id') for isolation, which is
-- fragile and requires the app to SET the GUC correctly. We standardise
-- everything to use get_my_tenant_id() which derives the tenant from auth.uid().
-- ============================================================================

-- hr_policies
DROP POLICY IF EXISTS "tenant_isolation_hr_policies" ON public.hr_policies;
CREATE POLICY "tenant_isolation_hr_policies" ON public.hr_policies
  FOR ALL TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- hr_tickets
DROP POLICY IF EXISTS "tenant_isolation_hr_tickets" ON public.hr_tickets;
CREATE POLICY "tenant_isolation_hr_tickets" ON public.hr_tickets
  FOR ALL TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- expenses
DROP POLICY IF EXISTS "tenant_isolation_expenses" ON public.expenses;
DROP POLICY IF EXISTS "Auth users read expenses"   ON public.expenses;
DROP POLICY IF EXISTS "Auth users insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Auth users update expenses" ON public.expenses;
CREATE POLICY "tenant_isolation_expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());


-- ============================================================================
-- PART 10: Public read policies for public-facing tables
-- ============================================================================
-- Career pages need anonymous access to published jobs and the ability to
-- submit applications without authentication.
-- ============================================================================

-- Public can view published jobs (for career pages)
DROP POLICY IF EXISTS "anon_read_published_jobs" ON public.jobs;
CREATE POLICY "anon_read_published_jobs" ON public.jobs
  FOR SELECT TO anon
  USING (status = 'published' OR status = 'active' OR status = 'open');

-- Public can view published job listings
DROP POLICY IF EXISTS "anon_read_published_listings" ON public.job_listings;
CREATE POLICY "anon_read_published_listings" ON public.job_listings
  FOR SELECT TO anon
  USING (status = 'published' OR status = 'active' OR status = 'open');

-- Public can submit job applications (INSERT only)
DROP POLICY IF EXISTS "anon_insert_applications" ON public.job_applications;
CREATE POLICY "anon_insert_applications" ON public.job_applications
  FOR INSERT TO anon
  WITH CHECK (true);


-- ============================================================================
-- Done – commit all changes atomically
-- ============================================================================

COMMIT;
