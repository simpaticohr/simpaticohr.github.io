-- ============================================================================
-- Migration 060: Fix Missing tenant_id on onboarding_tasks Table
-- ============================================================================
-- Issue:
--   Starting an onboarding flow or adding tasks fails with error PGRST204:
--   "Could not find the 'tenant_id' column of 'onboarding_tasks' in the schema cache"
--
-- Solution:
--   1. Add tenant_id column with default 'SIMP_PRO_MAIN'
--   2. Index tenant_id and onboarding_record_id for query performance
--   3. Backfill tenant_id from parent onboarding_records
--   4. Attach trigger to inherit tenant_id from parent record on new inserts
--   5. Configure strict RLS policies for service_role and authenticated users
--   6. Reload PostgREST schema cache
-- ============================================================================

BEGIN;

-- 1. Ensure onboarding_tasks has tenant_id column
ALTER TABLE IF EXISTS public.onboarding_tasks
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';

-- 2. Add indexes for tenant isolation & parent lookup performance
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_tenant
  ON public.onboarding_tasks(tenant_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_record_id
  ON public.onboarding_tasks(onboarding_record_id);

-- 3. Backfill tenant_id from parent onboarding_records where available
UPDATE public.onboarding_tasks ot
SET tenant_id = orec.tenant_id
FROM public.onboarding_records orec
WHERE ot.onboarding_record_id = orec.id
  AND orec.tenant_id IS NOT NULL;

-- 4. Automatically populate tenant_id from parent record if omitted on insert
CREATE OR REPLACE FUNCTION public.trg_set_onboarding_task_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.tenant_id = 'SIMP_PRO_MAIN' THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM public.onboarding_records
    WHERE id = NEW.onboarding_record_id;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := 'SIMP_PRO_MAIN';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_onboarding_tasks_set_tenant ON public.onboarding_tasks;
CREATE TRIGGER trg_onboarding_tasks_set_tenant
  BEFORE INSERT ON public.onboarding_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_onboarding_task_tenant_id();

-- 5. Enable and configure Row Level Security (RLS)
ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;

-- Service role bypass for backend workers
DROP POLICY IF EXISTS "service_full_access" ON public.onboarding_tasks;
CREATE POLICY "service_full_access" ON public.onboarding_tasks
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Drop legacy or conflicting policies
DROP POLICY IF EXISTS "auth_rw_onboarding_tasks" ON public.onboarding_tasks;
DROP POLICY IF EXISTS "tenant_read_onboarding_tasks" ON public.onboarding_tasks;
DROP POLICY IF EXISTS "tenant_write_onboarding_tasks" ON public.onboarding_tasks;
DROP POLICY IF EXISTS "tenant_update_onboarding_tasks" ON public.onboarding_tasks;
DROP POLICY IF EXISTS "tenant_delete_onboarding_tasks" ON public.onboarding_tasks;
DROP POLICY IF EXISTS "tenant_all_onboarding_tasks" ON public.onboarding_tasks;

-- Multi-tenant scoped access for authenticated users
CREATE POLICY "tenant_all_onboarding_tasks" ON public.onboarding_tasks
  FOR ALL TO authenticated
  USING (
    tenant_id::text = public.get_my_tenant_id()
    OR tenant_id = 'SIMP_PRO_MAIN'
    OR EXISTS (
      SELECT 1 FROM public.onboarding_records r
      WHERE r.id = onboarding_tasks.onboarding_record_id
        AND (r.tenant_id::text = public.get_my_tenant_id() OR r.tenant_id = 'SIMP_PRO_MAIN')
    )
  )
  WITH CHECK (
    tenant_id::text = public.get_my_tenant_id()
    OR tenant_id = 'SIMP_PRO_MAIN'
    OR EXISTS (
      SELECT 1 FROM public.onboarding_records r
      WHERE r.id = onboarding_tasks.onboarding_record_id
        AND (r.tenant_id::text = public.get_my_tenant_id() OR r.tenant_id = 'SIMP_PRO_MAIN')
    )
  );

-- 6. Grant standard table permissions
GRANT ALL ON public.onboarding_tasks TO authenticated;
GRANT ALL ON public.onboarding_tasks TO service_role;

COMMIT;

-- 7. Notify PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';
