-- Migration 012: Add missing columns to payslips table
-- Fixes PGRST204 "Could not find the 'sent_at' column of 'payslips' in the schema cache"
-- Also adds 'currency' column used by worker handleRunPayroll and 'deductions' JSONB for itemized tracking

-- 1. Add sent_at column to track when payslip was emailed
ALTER TABLE public.payslips
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- 2. Add currency column (worker stores this during payroll run)
ALTER TABLE public.payslips
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';

-- 3. Add deductions JSONB for itemized deduction breakdown in PDF
ALTER TABLE public.payslips
ADD COLUMN IF NOT EXISTS deductions JSONB;

-- 4. Add update policy for payslips (needed for PATCH /send endpoint)
DROP POLICY IF EXISTS "tenant_update_payslips" ON payslips;
CREATE POLICY "tenant_update_payslips" ON payslips
  FOR UPDATE TO authenticated USING (true);

-- 5. Refresh schema cache (PostgREST picks this up automatically, but notify just in case)
NOTIFY pgrst, 'reload schema';
