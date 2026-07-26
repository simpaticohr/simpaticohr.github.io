-- ============================================================
-- Migration 008: Create and Fix job_applications table schema
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Create job_applications table if it doesn't exist
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

-- 2. Add missing columns (idempotent if table already existed)
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS company_id TEXT DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS client_id TEXT DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS candidate_name TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS candidate_email TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS candidate_skills TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'applied';
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS match_score INTEGER;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS resume_text TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS resume_url TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_job_applications_tenant ON job_applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_job ON job_applications(job_id);

-- 4. RLS — ensure service_role & anon policies exist
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON job_applications;
CREATE POLICY "service_full_access" ON job_applications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_applications" ON job_applications;
CREATE POLICY "anon_read_applications" ON job_applications
  FOR SELECT TO anon USING (true);

-- 5. Force PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';

