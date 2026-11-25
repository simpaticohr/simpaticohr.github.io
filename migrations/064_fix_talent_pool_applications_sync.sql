-- ============================================================================
-- Migration 064: Fix Talent Pool & Application Tenant Isolation (UUID/TEXT safe)
-- Run in Supabase SQL Editor (Project: cvkxtsvgnynxexmemfuy)
-- ============================================================================

-- 1. Ensure required columns exist (only adds if missing; preserves existing types)
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'SIMP_PRO_MAIN';

-- 2. Type-safe backfill across company_id, tenant_id, and jobs.company_id
-- Handles both UUID and TEXT column schemas cleanly without 22P02 / 42804 errors.
DO $do$
DECLARE
  v_comp_type TEXT;
  v_ten_type  TEXT;
  v_has_jobs_ten BOOLEAN := FALSE;
  v_uuid_re CONSTANT TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_job_ten_expr TEXT;
  v_sql TEXT;
BEGIN
  SELECT data_type INTO v_comp_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'job_applications' AND column_name = 'company_id';

  SELECT data_type INTO v_ten_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'job_applications' AND column_name = 'tenant_id';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'tenant_id'
  ) INTO v_has_jobs_ten;

  -- Step A: Populate job_applications.company_id from tenant_id when missing/placeholder
  IF v_comp_type = 'uuid' THEN
    EXECUTE $sql$
      UPDATE public.job_applications
      SET company_id = tenant_id::text::uuid
      WHERE company_id IS NULL
        AND tenant_id IS NOT NULL
        AND tenant_id::text ~* $1
    $sql$ USING v_uuid_re;
  ELSE
    EXECUTE $sql$
      UPDATE public.job_applications
      SET company_id = tenant_id::text
      WHERE (company_id IS NULL OR BTRIM(company_id::text) IN ('', 'SIMP_PRO_MAIN', 'default'))
        AND tenant_id IS NOT NULL
        AND BTRIM(tenant_id::text) NOT IN ('', 'SIMP_PRO_MAIN', 'default')
    $sql$;
  END IF;

  -- Step B: Populate job_applications.tenant_id from company_id when missing/placeholder
  IF v_ten_type = 'uuid' THEN
    EXECUTE $sql$
      UPDATE public.job_applications
      SET tenant_id = company_id::text::uuid
      WHERE tenant_id IS NULL
        AND company_id IS NOT NULL
        AND company_id::text ~* $1
    $sql$ USING v_uuid_re;
  ELSE
    EXECUTE $sql$
      UPDATE public.job_applications
      SET tenant_id = company_id::text
      WHERE (tenant_id IS NULL OR BTRIM(tenant_id::text) IN ('', 'SIMP_PRO_MAIN', 'default'))
        AND company_id IS NOT NULL
        AND BTRIM(company_id::text) NOT IN ('', 'SIMP_PRO_MAIN', 'default')
    $sql$;
  END IF;

  -- Step C: Backfill orphaned applications from their corresponding job's company_id
  IF v_has_jobs_ten THEN
    v_job_ten_expr := $sql$COALESCE(NULLIF(NULLIF(NULLIF(BTRIM(j.tenant_id::text), 'SIMP_PRO_MAIN'), 'default'), ''), j.company_id::text)$sql$;
  ELSE
    v_job_ten_expr := $sql$j.company_id::text$sql$;
  END IF;

  IF v_comp_type = 'uuid' AND v_ten_type = 'uuid' THEN
    v_sql :=
      $sql$UPDATE public.job_applications a SET company_id = COALESCE(a.company_id, j.company_id::text::uuid), tenant_id = COALESCE(a.tenant_id, CASE WHEN ($sql$ ||
      v_job_ten_expr ||
      $sql$) ~* $1 THEN ($sql$ ||
      v_job_ten_expr ||
      $sql$)::uuid ELSE j.company_id::text::uuid END) FROM public.jobs j WHERE a.job_id::text = j.id::text AND (a.company_id IS NULL OR a.tenant_id IS NULL) AND j.company_id IS NOT NULL AND j.company_id::text ~* $1$sql$;
    EXECUTE v_sql USING v_uuid_re;

  ELSIF v_comp_type = 'uuid' THEN
    v_sql :=
      $sql$UPDATE public.job_applications a SET company_id = COALESCE(a.company_id, j.company_id::text::uuid), tenant_id = COALESCE(NULLIF(NULLIF(NULLIF(BTRIM(a.tenant_id::text), 'SIMP_PRO_MAIN'), 'default'), ''), $sql$ ||
      v_job_ten_expr ||
      $sql$) FROM public.jobs j WHERE a.job_id::text = j.id::text AND (a.company_id IS NULL OR a.tenant_id IS NULL OR BTRIM(a.tenant_id::text) IN ('', 'SIMP_PRO_MAIN', 'default')) AND j.company_id IS NOT NULL AND j.company_id::text ~* $1$sql$;
    EXECUTE v_sql USING v_uuid_re;

  ELSIF v_ten_type = 'uuid' THEN
    v_sql :=
      $sql$UPDATE public.job_applications a SET company_id = COALESCE(NULLIF(NULLIF(NULLIF(BTRIM(a.company_id::text), 'SIMP_PRO_MAIN'), 'default'), ''), j.company_id::text), tenant_id = COALESCE(a.tenant_id, CASE WHEN ($sql$ ||
      v_job_ten_expr ||
      $sql$) ~* $1 THEN ($sql$ ||
      v_job_ten_expr ||
      $sql$)::uuid ELSE NULL END) FROM public.jobs j WHERE a.job_id::text = j.id::text AND (a.company_id IS NULL OR BTRIM(a.company_id::text) IN ('', 'SIMP_PRO_MAIN', 'default') OR a.tenant_id IS NULL) AND j.company_id IS NOT NULL AND BTRIM(j.company_id::text) NOT IN ('', 'SIMP_PRO_MAIN', 'default')$sql$;
    EXECUTE v_sql USING v_uuid_re;

  ELSE
    v_sql :=
      $sql$UPDATE public.job_applications a SET company_id = COALESCE(NULLIF(NULLIF(NULLIF(BTRIM(a.company_id::text), 'SIMP_PRO_MAIN'), 'default'), ''), j.company_id::text), tenant_id = COALESCE(NULLIF(NULLIF(NULLIF(BTRIM(a.tenant_id::text), 'SIMP_PRO_MAIN'), 'default'), ''), $sql$ ||
      v_job_ten_expr ||
      $sql$) FROM public.jobs j WHERE a.job_id::text = j.id::text AND (a.company_id IS NULL OR BTRIM(a.company_id::text) IN ('', 'SIMP_PRO_MAIN', 'default') OR a.tenant_id IS NULL OR BTRIM(a.tenant_id::text) IN ('', 'SIMP_PRO_MAIN', 'default')) AND j.company_id IS NOT NULL AND BTRIM(j.company_id::text) NOT IN ('', 'SIMP_PRO_MAIN', 'default')$sql$;
    EXECUTE v_sql;
  END IF;
END $do$;

-- 3. Create performance indexes for pool queries
CREATE INDEX IF NOT EXISTS idx_job_applications_company_id ON public.job_applications(company_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_tenant_id ON public.job_applications(tenant_id);

-- 4. Trigger to keep company_id and tenant_id aligned safely for both UUID & TEXT schemas
CREATE OR REPLACE FUNCTION public.sync_application_tenant_fields()
RETURNS TRIGGER AS $$
DECLARE
  v_comp TEXT := NULLIF(BTRIM(COALESCE(NEW.company_id::text, '')), '');
  v_ten  TEXT := NULLIF(BTRIM(COALESCE(NEW.tenant_id::text, '')), '');
  c_uuid_re CONSTANT TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF v_comp IN ('SIMP_PRO_MAIN', 'default', 'null', 'undefined') THEN
    v_comp := NULL;
  END IF;
  IF v_ten IN ('SIMP_PRO_MAIN', 'default', 'null', 'undefined') THEN
    v_ten := NULL;
  END IF;

  IF v_comp IS NOT NULL AND v_ten IS NULL THEN
    IF v_comp ~* c_uuid_re OR pg_typeof(NEW.tenant_id)::text IN ('text', 'character varying') THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object('tenant_id', v_comp));
    END IF;
  ELSIF v_ten IS NOT NULL AND v_comp IS NULL THEN
    IF v_ten ~* c_uuid_re OR pg_typeof(NEW.company_id)::text IN ('text', 'character varying') THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object('company_id', v_ten));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_application_tenant_fields ON public.job_applications;
CREATE TRIGGER trigger_sync_application_tenant_fields
BEFORE INSERT OR UPDATE ON public.job_applications
FOR EACH ROW
EXECUTE FUNCTION public.sync_application_tenant_fields();

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
