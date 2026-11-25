-- ============================================================================
-- Migration 064: Fix Talent Pool & Application Tenant Isolation
-- Run in Supabase SQL Editor (Project: cvkxtsvgnynxexmemfuy)
-- ============================================================================

-- 1. Ensure required columns exist
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS company_id TEXT DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'SIMP_PRO_MAIN';

-- 2. Backfill company_id and tenant_id from each other
UPDATE public.job_applications
SET company_id = tenant_id
WHERE (company_id IS NULL OR company_id = 'SIMP_PRO_MAIN')
  AND tenant_id IS NOT NULL
  AND tenant_id <> 'SIMP_PRO_MAIN';

UPDATE public.job_applications
SET tenant_id = company_id
WHERE (tenant_id IS NULL OR tenant_id = 'SIMP_PRO_MAIN')
  AND company_id IS NOT NULL
  AND company_id <> 'SIMP_PRO_MAIN';

-- 3. Backfill orphaned applications from their corresponding job's company_id
UPDATE public.job_applications a
SET company_id = j.company_id,
    tenant_id = COALESCE(j.tenant_id, j.company_id::text)
FROM public.jobs j
WHERE a.job_id = j.id::text
  AND (a.company_id IS NULL OR a.company_id = 'SIMP_PRO_MAIN')
  AND j.company_id IS NOT NULL;

-- 4. Create performance indexes for pool queries
CREATE INDEX IF NOT EXISTS idx_job_applications_company_id ON public.job_applications(company_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_tenant_id ON public.job_applications(tenant_id);

-- 5. Trigger to automatically keep company_id and tenant_id aligned on new applications
CREATE OR REPLACE FUNCTION public.sync_application_tenant_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NOT NULL AND NEW.company_id <> 'SIMP_PRO_MAIN' AND (NEW.tenant_id IS NULL OR NEW.tenant_id = 'SIMP_PRO_MAIN') THEN
    NEW.tenant_id := NEW.company_id;
  ELSIF NEW.tenant_id IS NOT NULL AND NEW.tenant_id <> 'SIMP_PRO_MAIN' AND (NEW.company_id IS NULL OR NEW.company_id = 'SIMP_PRO_MAIN') THEN
    NEW.company_id := NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_application_tenant_fields ON public.job_applications;
CREATE TRIGGER trigger_sync_application_tenant_fields
BEFORE INSERT OR UPDATE ON public.job_applications
FOR EACH ROW
EXECUTE FUNCTION public.sync_application_tenant_fields();

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
