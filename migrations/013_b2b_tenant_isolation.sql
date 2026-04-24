-- ============================================================
-- Migration 013: B2B SaaS Multi-Tenant Isolation
-- Ensures ALL tables have tenant_id for complete data isolation
-- Run in Supabase SQL Editor
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- 1. EMPLOYEES — Add tenant_id (critical for B2B isolation)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);

-- ═══════════════════════════════════════════════════════════
-- 2. JOBS — Add tenant_id
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs(tenant_id);

-- ═══════════════════════════════════════════════════════════
-- 3. JOB_APPLICATIONS — Ensure tenant_id exists (may already from 007/008)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.job_applications
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

CREATE INDEX IF NOT EXISTS idx_job_applications_tenant ON job_applications(tenant_id);

-- ═══════════════════════════════════════════════════════════
-- 4. EXPENSES — Add tenant_id (currently only has company_id UUID)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_id ON expenses(tenant_id);

-- ═══════════════════════════════════════════════════════════
-- 5. OFFBOARDING — Add tenant_id (currently only has company_id UUID)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.offboarding_records
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

ALTER TABLE public.offboarding_tasks
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

CREATE INDEX IF NOT EXISTS idx_offboarding_records_tenant ON offboarding_records(tenant_id);

-- ═══════════════════════════════════════════════════════════
-- 6. PULSE SURVEYS — Add tenant_id (currently only has company_id UUID)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.pulse_surveys
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

ALTER TABLE public.pulse_survey_responses
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

CREATE INDEX IF NOT EXISTS idx_pulse_surveys_tenant ON pulse_surveys(tenant_id);

-- ═══════════════════════════════════════════════════════════
-- 7. DEPARTMENTS — Add tenant_id
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.departments
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

CREATE INDEX IF NOT EXISTS idx_departments_tenant ON departments(tenant_id);

-- ═══════════════════════════════════════════════════════════
-- 8. EMPLOYEE DOCUMENTS — Add tenant_id if missing
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.employee_documents
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

CREATE INDEX IF NOT EXISTS idx_employee_documents_tenant ON employee_documents(tenant_id);

-- ═══════════════════════════════════════════════════════════
-- 9. HR POLICIES — Add tenant_id if missing
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.hr_policies
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

CREATE INDEX IF NOT EXISTS idx_hr_policies_tenant ON hr_policies(tenant_id);

-- ═══════════════════════════════════════════════════════════
-- 10. HR TICKETS — Add tenant_id
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.hr_tickets
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

CREATE INDEX IF NOT EXISTS idx_hr_tickets_tenant ON hr_tickets(tenant_id);

-- ═══════════════════════════════════════════════════════════
-- 11. AUTOMATION — Add tenant_id
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.automation_rules
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

ALTER TABLE public.automation_logs
ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

CREATE INDEX IF NOT EXISTS idx_automation_rules_tenant ON automation_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_tenant ON automation_logs(tenant_id);

-- ═══════════════════════════════════════════════════════════
-- 12. INTERVIEWS — Add tenant_id if table exists
-- ═══════════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'interviews') THEN
    EXECUTE 'ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT ''SIMP_PRO_MAIN''';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_interviews_tenant ON interviews(tenant_id)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
-- REFRESH SCHEMA CACHE
-- ═══════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
