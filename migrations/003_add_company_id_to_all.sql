-- Add company_id and tenant_id columns to remaining tables for multi-tenant isolation
-- This fixes 'column table.company_id does not exist' errors in the dashboard.

ALTER TABLE review_cycles ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE review_cycles ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

ALTER TABLE performance_goals ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE performance_goals ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

ALTER TABLE onboarding_templates ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE onboarding_templates ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

ALTER TABLE onboarding_records ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE onboarding_records ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

-- Also ensure hr_policies has it, just in case
ALTER TABLE hr_policies ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE hr_policies ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

-- Notify PostgREST to reload the schema cache so the frontend queries succeed immediately
NOTIFY pgrst, 'reload schema';
