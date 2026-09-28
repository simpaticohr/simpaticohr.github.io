-- Migration 059: Add allowances JSONB and tax_regime TEXT to employee_salaries
-- Required for proper payroll calculation:
--   • allowances stores HRA and Special Allowance amounts
--   • tax_regime stores 'old' or 'new' (India) for correct slab selection
-- Both fields are already referenced by the frontend and backend tax engines
-- but were missing from the schema, causing them to always be null.

ALTER TABLE public.employee_salaries
ADD COLUMN IF NOT EXISTS allowances JSONB DEFAULT '{}';

ALTER TABLE public.employee_salaries
ADD COLUMN IF NOT EXISTS tax_regime TEXT DEFAULT 'old';

-- Add a comment for documentation
COMMENT ON COLUMN public.employee_salaries.allowances IS 'JSONB containing allowance components, e.g. {"hra": 5000, "special": 3000}';
COMMENT ON COLUMN public.employee_salaries.tax_regime IS 'Tax regime selection: old (default) or new (India New Regime)';

-- Refresh PostgREST schema cache so the new columns are immediately available
NOTIFY pgrst, 'reload schema';
