-- This migration adds missing columns and tables to the Supabase database.
-- It addresses errors seen in the dashboard when adding employees and running payroll.

-- 1. Add tenant_id or company_id support
-- (If you already ran 001_tenant_isolation.sql, tenant_id is used. We ensure it's present across tables that need it.)
ALTER TABLE departments ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE departments ADD COLUMN IF NOT EXISTS company_id UUID;

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS company_id UUID;

ALTER TABLE employee_salaries ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE employee_salaries ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE employee_salaries ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'full_time';

-- 2. Create the missing payroll_deductions table if it does not exist
CREATE TABLE IF NOT EXISTS payroll_deductions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  amount       NUMERIC(10,2) NOT NULL,
  frequency    TEXT DEFAULT 'monthly' CHECK (frequency IN ('once','weekly','biweekly','monthly')),
  start_date   DATE,
  end_date     DATE,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  tenant_id    TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  company_id   UUID
);

-- Enable RLS and add basic policies so queries don't fail
ALTER TABLE payroll_deductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_access" ON payroll_deductions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tenant_read_deductions" ON payroll_deductions FOR SELECT TO authenticated USING (true);


-- Notify PostgREST to reload the schema cache so the new tables and columns are picked up immediately
NOTIFY pgrst, 'reload schema';
