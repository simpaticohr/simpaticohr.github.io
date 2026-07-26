-- 007_applications_schema.sql
-- Ensure job_applications table exists and has all worker schema columns

-- 1. Create table if missing
CREATE TABLE IF NOT EXISTS public.job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT DEFAULT 'SIMP_PRO_MAIN',
    company_id TEXT DEFAULT 'SIMP_PRO_MAIN',
    client_id TEXT DEFAULT 'SIMP_PRO_MAIN',
    job_id TEXT,
    candidate_name TEXT,
    candidate_email TEXT,
    candidate_skills TEXT,
    status TEXT DEFAULT 'applied',
    match_score INTEGER,
    ai_summary TEXT,
    resume_text TEXT,
    resume_url TEXT,
    source TEXT DEFAULT 'careers_page',
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add columns idempotently if table already existed
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS company_id TEXT DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS client_id TEXT DEFAULT 'SIMP_PRO_MAIN';

-- 3. Clean up RLS permissions
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON job_applications;
CREATE POLICY "service_full_access" ON job_applications FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_applications" ON job_applications;
CREATE POLICY "anon_read_applications" ON job_applications FOR SELECT TO anon USING (true);

-- 4. Ensure schema cache is updated so PostgREST stops complaining about missing columns
NOTIFY pgrst, 'reload schema';

