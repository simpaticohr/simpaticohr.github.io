-- Migration 055: Payroll Hardening & Schema Integrity Fix
-- Ensures payroll_runs and payslips have all required columns and tenant-aware RLS

-- 1. Ensure payroll_runs has all columns accessed by Worker & Frontend
ALTER TABLE IF EXISTS public.payroll_runs
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS initiated_by TEXT,
ADD COLUMN IF NOT EXISTS run_by_id UUID;

-- 2. Ensure payslips has itemized breakdown columns
ALTER TABLE IF EXISTS public.payslips
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS allowances_total NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS reimbursements_total NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS bonus_pay NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS deductions JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- 3. Ensure leave_requests has consistent column names
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leave_requests' AND column_name = 'type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leave_requests' AND column_name = 'leave_type'
  ) THEN
    ALTER TABLE public.leave_requests ADD COLUMN leave_type TEXT;
    UPDATE public.leave_requests SET leave_type = type WHERE leave_type IS NULL;
  END IF;
END $$;

-- 4. Ensure expenses has paid_in_payslip tracking
ALTER TABLE IF EXISTS public.expenses
ADD COLUMN IF NOT EXISTS paid_in_payslip UUID,
ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'SIMP_PRO_MAIN';

-- 5. Tighten RLS policies to enforce tenant isolation
DROP POLICY IF EXISTS "tenant_read_salaries" ON public.employee_salaries;
CREATE POLICY "tenant_read_salaries" ON public.employee_salaries FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(auth.jwt()->>'tenant_id', 'SIMP_PRO_MAIN') OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "tenant_read_payslips" ON public.payslips;
CREATE POLICY "tenant_read_payslips" ON public.payslips FOR SELECT TO authenticated
  USING (
    tenant_id = COALESCE(auth.jwt()->>'tenant_id', 'SIMP_PRO_MAIN')
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "tenant_read_runs" ON public.payroll_runs;
CREATE POLICY "tenant_read_runs" ON public.payroll_runs FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(auth.jwt()->>'tenant_id', 'SIMP_PRO_MAIN') OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "tenant_read_deductions" ON public.payroll_deductions;
CREATE POLICY "tenant_read_deductions" ON public.payroll_deductions FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(auth.jwt()->>'tenant_id', 'SIMP_PRO_MAIN') OR auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
