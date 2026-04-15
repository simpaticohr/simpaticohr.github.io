-- Migration 007: Create employee_salaries and payroll tables
-- Run in Supabase SQL Editor

-- Employee Salaries table
CREATE TABLE IF NOT EXISTS public.employee_salaries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  base_salary     NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency        TEXT DEFAULT 'INR',
  employment_type TEXT DEFAULT 'full_time',
  effective_date  DATE DEFAULT CURRENT_DATE,
  company_id      TEXT,
  tenant_id       TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_salaries_tenant ON employee_salaries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_emp_salaries_employee ON employee_salaries(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_salaries_company ON employee_salaries(company_id);

-- Payslips table
CREATE TABLE IF NOT EXISTS public.payslips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period          TEXT,
  gross_pay       NUMERIC(12,2) DEFAULT 0,
  deductions_total NUMERIC(12,2) DEFAULT 0,
  net_pay         NUMERIC(12,2) DEFAULT 0,
  status          TEXT DEFAULT 'generated' CHECK (status IN ('generated','sent','paid')),
  payslip_key     TEXT,
  paid_at         TIMESTAMPTZ,
  pay_date        DATE,
  payroll_run_id  UUID,
  company_id      TEXT,
  tenant_id       TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payslips_tenant ON payslips(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id);

-- Payroll runs table
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period          TEXT NOT NULL,
  type            TEXT DEFAULT 'monthly',
  total_gross     NUMERIC(12,2) DEFAULT 0,
  total_net       NUMERIC(12,2) DEFAULT 0,
  employee_count  INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft','processing','completed','failed')),
  pay_date        DATE,
  notes           TEXT,
  run_by_id       UUID,
  company_id      TEXT,
  tenant_id       TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant ON payroll_runs(tenant_id);

-- Payroll deductions table
CREATE TABLE IF NOT EXISTS public.payroll_deductions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  frequency       TEXT DEFAULT 'monthly',
  start_date      DATE,
  end_date        DATE,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  company_id      TEXT,
  tenant_id       TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deductions_tenant ON payroll_deductions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deductions_employee ON payroll_deductions(employee_id);

-- RLS Policies
ALTER TABLE public.employee_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_deductions ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "service_full_access" ON employee_salaries;
CREATE POLICY "service_full_access" ON employee_salaries FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON payslips;
CREATE POLICY "service_full_access" ON payslips FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON payroll_runs;
CREATE POLICY "service_full_access" ON payroll_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON payroll_deductions;
CREATE POLICY "service_full_access" ON payroll_deductions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated read policies
DROP POLICY IF EXISTS "tenant_read_salaries" ON employee_salaries;
CREATE POLICY "tenant_read_salaries" ON employee_salaries FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tenant_read_payslips" ON payslips;
CREATE POLICY "tenant_read_payslips" ON payslips FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tenant_read_runs" ON payroll_runs;
CREATE POLICY "tenant_read_runs" ON payroll_runs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tenant_read_deductions" ON payroll_deductions;
CREATE POLICY "tenant_read_deductions" ON payroll_deductions FOR SELECT TO authenticated USING (true);

-- Authenticated write policies
DROP POLICY IF EXISTS "tenant_insert_salaries" ON employee_salaries;
CREATE POLICY "tenant_insert_salaries" ON employee_salaries FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_update_salaries" ON employee_salaries;
CREATE POLICY "tenant_update_salaries" ON employee_salaries FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "tenant_insert_payslips" ON payslips;
CREATE POLICY "tenant_insert_payslips" ON payslips FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_insert_runs" ON payroll_runs;
CREATE POLICY "tenant_insert_runs" ON payroll_runs FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_update_runs" ON payroll_runs;
CREATE POLICY "tenant_update_runs" ON payroll_runs FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "tenant_insert_deductions" ON payroll_deductions;
CREATE POLICY "tenant_insert_deductions" ON payroll_deductions FOR INSERT TO authenticated WITH CHECK (true);
