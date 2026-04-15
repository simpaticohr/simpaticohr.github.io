-- 007_applications_schema.sql
-- Fix job_applications columns matching the updated worker schema

ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS company_id TEXT DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS client_id TEXT DEFAULT 'SIMP_PRO_MAIN';

-- Clean up any broken permissions
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON job_applications;
CREATE POLICY "service_full_access" ON job_applications FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Ensure schema cache is updated so PostgREST stops complaining about missing columns
NOTIFY pgrst, 'reload schema';
