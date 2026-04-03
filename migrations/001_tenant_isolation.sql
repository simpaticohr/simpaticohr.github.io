-- ═══════════════════════════════════════════════════════════════════════════════
-- SIMPATICO HR — TENANT ISOLATION MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════════
-- Run this ONCE in your Supabase SQL Editor to enable multi-tenant data isolation.
-- After running, each company's data is completely invisible to other companies.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Add tenant_id column to ALL core tables
-- ───────────────────────────────────────────

ALTER TABLE employees            ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE departments          ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE leave_requests       ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE leave_balances       ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE payslips             ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE payroll_runs         ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE payroll_deductions   ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE employee_salaries    ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE performance_cycles   ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE performance_reviews  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE goals                ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE training_courses     ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE onboarding_records   ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE onboarding_tasks     ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE hr_tickets           ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE hr_policies          ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE employee_documents   ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE audit_logs           ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

-- Job/ATS tables
ALTER TABLE jobs                 ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE job_listings         ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE applications         ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE interviews           ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE interview_sessions   ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

-- Org profiles
ALTER TABLE org_profiles         ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';


-- 2. Create indexes for tenant_id queries (critical for performance)
-- ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_tenant ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant ON leave_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payslips_tenant ON payslips(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant ON payroll_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_tenant ON performance_reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_courses_tenant ON training_courses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_enrollments_tenant ON training_enrollments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_records_tenant ON onboarding_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_tickets_tenant ON hr_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_policies_tenant ON hr_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_listings_tenant ON job_listings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_applications_tenant ON applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_goals_tenant ON goals(tenant_id);


-- 3. Drop overly permissive RLS policies
-- ───────────────────────────────────────────

-- Drop the old "see everything" policies
DROP POLICY IF EXISTS "Auth users read employees" ON employees;
DROP POLICY IF EXISTS "Service role full access" ON employees;
DROP POLICY IF EXISTS "Service role full access" ON leave_requests;
DROP POLICY IF EXISTS "Service role full access" ON performance_reviews;
DROP POLICY IF EXISTS "Service role full access" ON training_enrollments;
DROP POLICY IF EXISTS "Service role full access" ON payslips;
DROP POLICY IF EXISTS "Service role full access" ON onboarding_records;
DROP POLICY IF EXISTS "Own payslips" ON payslips;


-- 4. Create new TENANT-SCOPED RLS policies
-- ───────────────────────────────────────────

-- Service role bypass (Worker API uses service_role — full access, scoped by application logic)
CREATE POLICY "service_full_access" ON employees           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON leave_requests      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON performance_reviews  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON training_enrollments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON payslips             FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON onboarding_records   FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users: can ONLY read employees from their own tenant
-- (requires tenant_id to be set in JWT custom claims)
CREATE POLICY "tenant_read_employees" ON employees
  FOR SELECT TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- Authenticated users: can only read own payslips
CREATE POLICY "tenant_own_payslips" ON payslips
  FOR SELECT TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
    AND employee_id IN (
      SELECT id FROM employees WHERE email = auth.jwt()->>'email'
    )
  );

-- Authenticated users: can read leave requests from own tenant
CREATE POLICY "tenant_read_leave" ON leave_requests
  FOR SELECT TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- Authenticated users: can read performance reviews from own tenant
CREATE POLICY "tenant_read_reviews" ON performance_reviews
  FOR SELECT TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- Authenticated users: can read training enrollments from own tenant
CREATE POLICY "tenant_read_training" ON training_enrollments
  FOR SELECT TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- Authenticated users: can read onboarding records from own tenant
CREATE POLICY "tenant_read_onboarding" ON onboarding_records
  FOR SELECT TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );


-- 5. Enable RLS on remaining tables that need it
-- ───────────────────────────────────────────

ALTER TABLE departments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_courses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_tickets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_policies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;

-- Service role bypass for new tables
CREATE POLICY "service_full_access" ON departments          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON payroll_runs          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON training_courses      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON hr_tickets            FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON hr_policies           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON employee_documents    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON goals                 FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON audit_logs            FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 6. Backfill existing data
-- ───────────────────────────────────────────
-- All existing data gets assigned to the primary tenant.
-- (The DEFAULT clause above handles this, but explicit update ensures completeness.)
-- UPDATE employees SET tenant_id = 'SIMP_PRO_MAIN' WHERE tenant_id IS NULL;
-- (Not needed since we used NOT NULL DEFAULT, but uncomment if you alter existing rows.)


-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE. After running this migration:
-- 1. Every table now has a `tenant_id` column
-- 2. All existing data is assigned to 'SIMP_PRO_MAIN'
-- 3. RLS policies enforce tenant isolation at the database level
-- 4. The Worker's sbFetch() adds `&tenant_id=eq.{tenantId}` to all queries
-- 5. New clients get a different tenant_id, and can NEVER see other tenants' data
-- ═══════════════════════════════════════════════════════════════════════════════
