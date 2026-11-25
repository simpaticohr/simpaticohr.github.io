-- ============================================================================
-- Migration 063: Cascade company name updates to jobs table and backfill existing jobs
-- Run ONCE in Supabase SQL Editor (Project: cvkxtsvgnynxexmemfuy)
-- ============================================================================

-- 1. Backfill all existing jobs with the current company name from companies table
UPDATE public.jobs j
SET company_name = c.name
FROM public.companies c
WHERE j.company_id = c.id
  AND c.name IS NOT NULL
  AND c.name <> ''
  AND (j.company_name IS DISTINCT FROM c.name);

-- 2. Trigger function to automatically propagate future company name updates to jobs
CREATE OR REPLACE FUNCTION public.sync_company_name_to_jobs()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.jobs
    SET company_name = NEW.name
    WHERE company_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach trigger to companies table for automatic synchronization
DROP TRIGGER IF EXISTS trigger_sync_company_name_to_jobs ON public.companies;
CREATE TRIGGER trigger_sync_company_name_to_jobs
AFTER UPDATE OF name ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.sync_company_name_to_jobs();

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
