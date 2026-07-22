-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 046: jobs.tenant_id — align jobs table with the v5.0 tenant model
-- Run ONCE in the Supabase SQL editor, in the SAME project the Worker uses
-- (project ref: cvkxtsvgnynxexmemfuy — check the URL of your dashboard!).
--
-- Why: the v5.0 Worker injects tenant_id filters on every tenant-aware table,
-- but this database's jobs table predates that model (it only has company_id).
-- Result: GET /recruitment/jobs → 400 "column jobs.tenant_id does not exist".
-- job_applications already has tenant_id — only jobs is missing it.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Add the column (idempotent)
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- 2. Backfill from company_id so existing rows stay visible to their tenant
UPDATE public.jobs
   SET tenant_id = company_id::text
 WHERE tenant_id IS NULL
   AND company_id IS NOT NULL;

-- 3. Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON public.jobs(tenant_id);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
