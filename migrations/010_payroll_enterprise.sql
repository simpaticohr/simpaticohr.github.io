-- Migration 010: Enterprise Payroll Enhancements
-- Adds support for Salary Breakdown (Allowances), Tax Regimes, Reimbursements, and Overtime.

-- 1. Add columns to employee_salaries for tax regime and allowances breakdown
ALTER TABLE public.employee_salaries 
ADD COLUMN IF NOT EXISTS tax_regime TEXT DEFAULT 'old',
ADD COLUMN IF NOT EXISTS allowances JSONB DEFAULT '{}'::jsonb;

-- 2. Add columns to payslips for granular tracking
ALTER TABLE public.payslips 
ADD COLUMN IF NOT EXISTS allowances_total NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS reimbursements_total NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS overtime_pay NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax_regime TEXT;

-- 3. Create employee_expenses table for non-taxable reimbursements
CREATE TABLE IF NOT EXISTS public.employee_expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  expense_date    DATE NOT NULL,
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  category        TEXT NOT NULL,
  description     TEXT,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  paid_in_payslip UUID REFERENCES payslips(id) ON DELETE SET NULL,
  company_id      TEXT,
  tenant_id       TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_expenses_tenant ON employee_expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_expenses_employee ON employee_expenses(employee_id);

-- 4. RLS for employee_expenses
ALTER TABLE public.employee_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_expenses" ON employee_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "tenant_insert_expenses" ON employee_expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tenant_update_expenses" ON employee_expenses FOR UPDATE TO authenticated USING (true);

-- Service role full access
CREATE POLICY "service_full_access" ON employee_expenses FOR ALL TO service_role USING (true) WITH CHECK (true);
