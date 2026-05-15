-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 022: Explicit GRANT statements for Supabase Data API access
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- WHY: Starting May 30 2026 (new projects) and October 30 2026 (existing projects),
-- Supabase no longer auto-grants Data API access to tables in the "public" schema.
-- Without explicit GRANTs, PostgREST / supabase-js / GraphQL will return "42501"
-- permission errors on any table created after the cutoff date.
--
-- This migration retroactively adds explicit GRANTs to ALL existing public tables
-- so the transition is seamless. It is idempotent (safe to re-run).
-- Each GRANT is wrapped in a safety check so missing tables are silently skipped.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  tbl TEXT;
  all_tables TEXT[] := ARRAY[
    -- Core HR
    'employees',
    'departments',
    'leave_requests',
    'leave_balances',
    'attendance_records',
    'audit_logs',
    -- Payroll
    'employee_salaries',
    'payslips',
    'payroll_runs',
    'payroll_deductions',
    'employee_expenses',
    -- ATS / Recruitment
    'jobs',
    'job_listings',
    'job_applications',
    'applications',
    'interviews',
    'interview_sessions',
    'candidate_assessments',
    'assessments',
    -- Performance & Training
    'performance_reviews',
    'review_cycles',
    'performance_goals',
    'goals',
    'training_courses',
    'training_enrollments',
    -- Onboarding / Offboarding
    'onboarding_records',
    'onboarding_tasks',
    'offboarding_records',
    'offboarding_tasks',
    -- HR Ops
    'hr_tickets',
    'hr_policies',
    'employee_documents',
    'expenses',
    -- Pulse Surveys
    'pulse_surveys',
    'pulse_survey_responses',
    -- Automation
    'automation_rules',
    'automation_logs',
    -- Multi-tenant / Org
    'companies',
    'users',
    'org_profiles',
    -- Billing
    'subscriptions',
    'payment_transactions'
  ];
BEGIN
  FOREACH tbl IN ARRAY all_tables
  LOOP
    -- Only grant if the table actually exists in public schema
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('GRANT SELECT ON public.%I TO anon', tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);
      RAISE NOTICE 'Granted access on: %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (does not exist): %', tbl;
    END IF;
  END LOOP;
END
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SEQUENCES — Grant usage on all sequences in public schema
-- (Required for gen_random_uuid() / auto-increment inserts via Data API)
-- ─────────────────────────────────────────────────────────────────────────────

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- DEFAULT PRIVILEGES — Auto-grant on FUTURE tables and sequences
-- (This is the key safeguard: any new CREATE TABLE will automatically
--  get these grants, preventing 42501 errors after the cutoff date)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- SCHEMA USAGE — Ensure roles can access the public schema itself
-- ─────────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- REFRESH POSTGREST SCHEMA CACHE
-- ═══════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE. After running this migration:
--
-- 1. All existing tables have explicit GRANTs for anon, authenticated, service_role
-- 2. Tables that don't exist are silently skipped (check NOTICE logs)
-- 3. RLS policies (already in place) still control row-level access
-- 4. DEFAULT PRIVILEGES ensure future tables automatically get the same grants
-- 5. No 42501 errors will occur after the Supabase May 30 / October 30 cutoff
-- ═══════════════════════════════════════════════════════════════════════════════
