-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 046: tenant_id backfill — align job tables with v5.0 tenant model
-- Run ONCE in the Supabase SQL editor (project: cvkxtsvgnynxexmemfuy)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- 1. Target public.job_listings (if exists)
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'job_listings') THEN
    EXECUTE 'ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT ''SIMP_PRO_MAIN''';
    EXECUTE 'UPDATE public.job_listings SET tenant_id = company_id::text WHERE (tenant_id IS NULL OR tenant_id = ''SIMP_PRO_MAIN'') AND company_id IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_job_listings_tenant ON public.job_listings(tenant_id)';
  END IF;

  -- 2. Target public.jobs (if exists)
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'jobs') THEN
    EXECUTE 'ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT ''SIMP_PRO_MAIN''';
    EXECUTE 'UPDATE public.jobs SET tenant_id = company_id::text WHERE tenant_id IS NULL AND company_id IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON public.jobs(tenant_id)';
  END IF;

  -- 3. Target public.job_applications (if exists)
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'job_applications') THEN
    EXECUTE 'ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT ''SIMP_PRO_MAIN''';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_job_applications_tenant ON public.job_applications(tenant_id)';
  END IF;
END $$;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
