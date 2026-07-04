-- ============================================================================
-- Migration 032 v3: COMPREHENSIVE RLS — Exact schema match
-- ============================================================================
-- Built from actual schema discovery. Two policy strategies:
--   A) Tables WITH tenant_id → tenant-scoped policies
--   B) Tables WITHOUT tenant_id → authenticated-only access
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: Helper function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS TEXT AS $$
  SELECT company_id::text FROM public.users WHERE auth_id::text = auth.uid()::text LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================================
-- PART 2: Enable RLS on all unprotected tables
-- ============================================================================

-- Tables WITH tenant_id
ALTER TABLE public.departments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salaries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_policies              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_cycles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_enrollments     ENABLE ROW LEVEL SECURITY;

-- Tables WITHOUT tenant_id
ALTER TABLE public.ats_candidates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_timeline_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_tickets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_counters             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_reviews      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_courses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                    ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- PART 3: Service-role full access on ALL tables (Worker keeps working)
-- ============================================================================

DROP POLICY IF EXISTS "service_full_access" ON public.departments;
CREATE POLICY "service_full_access" ON public.departments FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.employee_salaries;
CREATE POLICY "service_full_access" ON public.employee_salaries FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.employees;
CREATE POLICY "service_full_access" ON public.employees FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.goals;
CREATE POLICY "service_full_access" ON public.goals FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.hr_policies;
CREATE POLICY "service_full_access" ON public.hr_policies FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.interviews;
CREATE POLICY "service_full_access" ON public.interviews FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.leave_balances;
CREATE POLICY "service_full_access" ON public.leave_balances FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.leave_requests;
CREATE POLICY "service_full_access" ON public.leave_requests FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.onboarding_records;
CREATE POLICY "service_full_access" ON public.onboarding_records FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.onboarding_templates;
CREATE POLICY "service_full_access" ON public.onboarding_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.payroll_runs;
CREATE POLICY "service_full_access" ON public.payroll_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.payslips;
CREATE POLICY "service_full_access" ON public.payslips FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.performance_cycles;
CREATE POLICY "service_full_access" ON public.performance_cycles FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.training_enrollments;
CREATE POLICY "service_full_access" ON public.training_enrollments FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.ats_candidates;
CREATE POLICY "service_full_access" ON public.ats_candidates FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.ats_timeline_events;
CREATE POLICY "service_full_access" ON public.ats_timeline_events FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.automation_logs;
CREATE POLICY "service_full_access" ON public.automation_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.automation_rules;
CREATE POLICY "service_full_access" ON public.automation_rules FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.employee_documents;
CREATE POLICY "service_full_access" ON public.employee_documents FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.hr_tickets;
CREATE POLICY "service_full_access" ON public.hr_tickets FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.job_counters;
CREATE POLICY "service_full_access" ON public.job_counters FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.jobs;
CREATE POLICY "service_full_access" ON public.jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.job_listings;
CREATE POLICY "service_full_access" ON public.job_listings FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.onboarding_tasks;
CREATE POLICY "service_full_access" ON public.onboarding_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.org_profiles;
CREATE POLICY "service_full_access" ON public.org_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.performance_reviews;
CREATE POLICY "service_full_access" ON public.performance_reviews FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.platform_settings;
CREATE POLICY "service_full_access" ON public.platform_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.training_courses;
CREATE POLICY "service_full_access" ON public.training_courses FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.users;
CREATE POLICY "service_full_access" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.applied_for;
CREATE POLICY "service_full_access" ON public.applied_for FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.candidate_profiles;
CREATE POLICY "service_full_access" ON public.candidate_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- PART 4A: Tenant-scoped policies (tables WITH tenant_id)
-- ============================================================================

-- ── departments ──
DROP POLICY IF EXISTS "tenant_rw_departments" ON public.departments;
CREATE POLICY "tenant_rw_departments" ON public.departments
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── employee_salaries ──
DROP POLICY IF EXISTS "tenant_rw_employee_salaries" ON public.employee_salaries;
CREATE POLICY "tenant_rw_employee_salaries" ON public.employee_salaries
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── employees ──
DROP POLICY IF EXISTS "tenant_rw_employees" ON public.employees;
CREATE POLICY "tenant_rw_employees" ON public.employees
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── goals ──
DROP POLICY IF EXISTS "tenant_rw_goals" ON public.goals;
CREATE POLICY "tenant_rw_goals" ON public.goals
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── hr_policies ──
DROP POLICY IF EXISTS "tenant_isolation_hr_policies" ON public.hr_policies;
DROP POLICY IF EXISTS "tenant_rw_hr_policies" ON public.hr_policies;
CREATE POLICY "tenant_rw_hr_policies" ON public.hr_policies
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── interviews ──
DROP POLICY IF EXISTS "tenant_rw_interviews" ON public.interviews;
CREATE POLICY "tenant_rw_interviews" ON public.interviews
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── leave_balances ──
DROP POLICY IF EXISTS "tenant_rw_leave_balances" ON public.leave_balances;
CREATE POLICY "tenant_rw_leave_balances" ON public.leave_balances
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── leave_requests ──
DROP POLICY IF EXISTS "tenant_rw_leave_requests" ON public.leave_requests;
CREATE POLICY "tenant_rw_leave_requests" ON public.leave_requests
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── onboarding_records ──
DROP POLICY IF EXISTS "tenant_rw_onboarding_records" ON public.onboarding_records;
CREATE POLICY "tenant_rw_onboarding_records" ON public.onboarding_records
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── onboarding_templates ──
DROP POLICY IF EXISTS "tenant_rw_onboarding_templates" ON public.onboarding_templates;
CREATE POLICY "tenant_rw_onboarding_templates" ON public.onboarding_templates
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── payroll_runs ──
DROP POLICY IF EXISTS "tenant_rw_payroll_runs" ON public.payroll_runs;
CREATE POLICY "tenant_rw_payroll_runs" ON public.payroll_runs
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── payslips ──
DROP POLICY IF EXISTS "tenant_rw_payslips" ON public.payslips;
CREATE POLICY "tenant_rw_payslips" ON public.payslips
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── payroll_deductions (already has RLS) ──
DROP POLICY IF EXISTS "tenant_rw_payroll_deductions" ON public.payroll_deductions;
CREATE POLICY "tenant_rw_payroll_deductions" ON public.payroll_deductions
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── performance_cycles ──
DROP POLICY IF EXISTS "tenant_rw_performance_cycles" ON public.performance_cycles;
CREATE POLICY "tenant_rw_performance_cycles" ON public.performance_cycles
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── performance_goals (already has RLS) ──
DROP POLICY IF EXISTS "tenant_rw_performance_goals" ON public.performance_goals;
CREATE POLICY "tenant_rw_performance_goals" ON public.performance_goals
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── review_cycles (already has RLS) ──
DROP POLICY IF EXISTS "tenant_rw_review_cycles" ON public.review_cycles;
CREATE POLICY "tenant_rw_review_cycles" ON public.review_cycles
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── training_enrollments ──
DROP POLICY IF EXISTS "tenant_rw_training_enrollments" ON public.training_enrollments;
CREATE POLICY "tenant_rw_training_enrollments" ON public.training_enrollments
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ── job_applications (already has RLS) ──
DROP POLICY IF EXISTS "tenant_read_job_applications" ON public.job_applications;
CREATE POLICY "tenant_read_job_applications" ON public.job_applications
  FOR SELECT TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id());


-- ============================================================================
-- PART 4B: Authenticated-only policies (tables WITHOUT tenant_id)
-- ============================================================================
-- These tables lack tenant_id so we allow any authenticated user access.
-- The Worker handles tenant filtering at the application level.
-- ============================================================================

-- ── ats_candidates ──
DROP POLICY IF EXISTS "auth_rw_ats_candidates" ON public.ats_candidates;
CREATE POLICY "auth_rw_ats_candidates" ON public.ats_candidates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── ats_timeline_events ──
DROP POLICY IF EXISTS "auth_rw_ats_timeline_events" ON public.ats_timeline_events;
CREATE POLICY "auth_rw_ats_timeline_events" ON public.ats_timeline_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── automation_logs ──
DROP POLICY IF EXISTS "auth_rw_automation_logs" ON public.automation_logs;
CREATE POLICY "auth_rw_automation_logs" ON public.automation_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── automation_rules ──
DROP POLICY IF EXISTS "auth_rw_automation_rules" ON public.automation_rules;
CREATE POLICY "auth_rw_automation_rules" ON public.automation_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── employee_documents ──
DROP POLICY IF EXISTS "auth_rw_employee_documents" ON public.employee_documents;
CREATE POLICY "auth_rw_employee_documents" ON public.employee_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── hr_tickets ──
DROP POLICY IF EXISTS "auth_rw_hr_tickets" ON public.hr_tickets;
CREATE POLICY "auth_rw_hr_tickets" ON public.hr_tickets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── job_counters ──
DROP POLICY IF EXISTS "auth_rw_job_counters" ON public.job_counters;
CREATE POLICY "auth_rw_job_counters" ON public.job_counters
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── jobs (no tenant_id!) ──
DROP POLICY IF EXISTS "auth_rw_jobs" ON public.jobs;
CREATE POLICY "auth_rw_jobs" ON public.jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── job_listings ──
DROP POLICY IF EXISTS "auth_rw_job_listings" ON public.job_listings;
CREATE POLICY "auth_rw_job_listings" ON public.job_listings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── onboarding_tasks (no tenant_id) ──
DROP POLICY IF EXISTS "auth_rw_onboarding_tasks" ON public.onboarding_tasks;
CREATE POLICY "auth_rw_onboarding_tasks" ON public.onboarding_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── org_profiles ──
DROP POLICY IF EXISTS "auth_rw_org_profiles" ON public.org_profiles;
CREATE POLICY "auth_rw_org_profiles" ON public.org_profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── performance_reviews (no tenant_id) ──
DROP POLICY IF EXISTS "auth_rw_performance_reviews" ON public.performance_reviews;
CREATE POLICY "auth_rw_performance_reviews" ON public.performance_reviews
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── platform_settings ──
DROP POLICY IF EXISTS "auth_read_platform_settings" ON public.platform_settings;
CREATE POLICY "auth_read_platform_settings" ON public.platform_settings
  FOR SELECT TO authenticated USING (true);

-- ── training_courses (no tenant_id) ──
DROP POLICY IF EXISTS "auth_rw_training_courses" ON public.training_courses;
CREATE POLICY "auth_rw_training_courses" ON public.training_courses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── users ──
DROP POLICY IF EXISTS "auth_read_users" ON public.users;
CREATE POLICY "auth_read_users" ON public.users
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (auth_id::text = auth.uid()::text)
  WITH CHECK (auth_id::text = auth.uid()::text);

-- ── notifications (no tenant_id) ──
DROP POLICY IF EXISTS "auth_rw_notifications" ON public.notifications;
CREATE POLICY "auth_rw_notifications" ON public.notifications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================================
-- PART 5: Fix LOCKED OUT tables (RLS on, zero policies)
-- ============================================================================

DROP POLICY IF EXISTS "auth_rw_applied_for" ON public.applied_for;
CREATE POLICY "auth_rw_applied_for" ON public.applied_for
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_read_candidate_profiles" ON public.candidate_profiles;
CREATE POLICY "auth_read_candidate_profiles" ON public.candidate_profiles
  FOR SELECT TO authenticated USING (true);


-- ============================================================================
-- PART 6: Fix anon INSERT on job_applications
-- ============================================================================

DROP POLICY IF EXISTS "anon_insert_applications" ON public.job_applications;
DROP POLICY IF EXISTS "anon_insert_applications_safe" ON public.job_applications;
CREATE POLICY "anon_insert_applications_safe" ON public.job_applications
  FOR INSERT TO anon
  WITH CHECK (
    (status IS NULL OR status IN ('new', 'applied', 'pending'))
  );

DROP POLICY IF EXISTS "anon_read_applications" ON public.job_applications;


-- ============================================================================
-- PART 7: Public career page access (anon reads published jobs)
-- ============================================================================

DROP POLICY IF EXISTS "anon_read_published_jobs" ON public.jobs;
CREATE POLICY "anon_read_published_jobs" ON public.jobs
  FOR SELECT TO anon
  USING (status = 'published' OR status = 'active' OR status = 'open');

DROP POLICY IF EXISTS "anon_read_published_listings" ON public.job_listings;
CREATE POLICY "anon_read_published_listings" ON public.job_listings
  FOR SELECT TO anon
  USING (status = 'published' OR status = 'active' OR status = 'open');


-- ============================================================================
-- Done
-- ============================================================================

COMMIT;
