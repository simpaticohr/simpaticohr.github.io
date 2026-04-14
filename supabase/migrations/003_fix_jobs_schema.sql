-- ============================================================
-- Simpatico HR Platform — 003 Migration
-- Run in Supabase SQL editor
-- Fixes job posting issues and applications count
-- ============================================================

-- 1. Fix the "unable to post job" error by adding the missing column
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS syndication_targets TEXT[] DEFAULT '{}';

-- 2. Fix the "applications count showing 0" issue by adding a cache column
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS applications_count INT DEFAULT 0;

-- 3. Create an automatic trigger so the applications count stays accurate
CREATE OR REPLACE FUNCTION public.update_job_applications_count() 
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.jobs SET applications_count = applications_count + 1 WHERE id = NEW.job_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.jobs SET applications_count = applications_count - 1 WHERE id = OLD.job_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach the automation trigger
DROP TRIGGER IF EXISTS trigger_update_applications_count ON public.job_applications;
CREATE TRIGGER trigger_update_applications_count
AFTER INSERT OR DELETE ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.update_job_applications_count();
