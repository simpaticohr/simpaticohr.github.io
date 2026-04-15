-- ============================================================
-- Migration 008: Fix job_applications table schema
-- Run in Supabase SQL Editor
-- Ensures all columns referenced by the worker exist
-- ============================================================

-- 1. Add missing columns that the worker INSERT expects
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS resume_url TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS match_score INTEGER;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS resume_text TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_job_applications_tenant ON job_applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_job ON job_applications(job_id);

-- 3. RLS — ensure service_role can write freely
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON job_applications;
CREATE POLICY "service_full_access" ON job_applications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Allow public/anon read (candidates checking status)
DROP POLICY IF EXISTS "anon_read_applications" ON job_applications;
CREATE POLICY "anon_read_applications" ON job_applications
  FOR SELECT TO anon USING (true);

-- 5. Force PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
