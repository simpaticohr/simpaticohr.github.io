-- ============================================================================
-- Migration 061: Performance Kudos and Weekly Check-ins Tables
-- ============================================================================
-- Creates tables for Peer Kudos and Manager/Weekly Check-ins with
-- multi-tenant isolation and RLS policies.
-- ============================================================================

BEGIN;

-- 1. Create performance_kudos table
CREATE TABLE IF NOT EXISTS public.performance_kudos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  category TEXT DEFAULT 'Teamwork',
  message TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create performance_checkins table
CREATE TABLE IF NOT EXISTS public.performance_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  went_well TEXT NOT NULL,
  blockers TEXT,
  date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes for query performance and tenant isolation
CREATE INDEX IF NOT EXISTS idx_perf_kudos_tenant ON public.performance_kudos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_perf_kudos_emp ON public.performance_kudos(employee_id);
CREATE INDEX IF NOT EXISTS idx_perf_kudos_date ON public.performance_kudos(date DESC);

CREATE INDEX IF NOT EXISTS idx_perf_checkins_tenant ON public.performance_checkins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_perf_checkins_emp ON public.performance_checkins(employee_id);
CREATE INDEX IF NOT EXISTS idx_perf_checkins_date ON public.performance_checkins(date DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.performance_kudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_checkins ENABLE ROW LEVEL SECURITY;

-- Service role bypass
DROP POLICY IF EXISTS "service_full_access" ON public.performance_kudos;
CREATE POLICY "service_full_access" ON public.performance_kudos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.performance_checkins;
CREATE POLICY "service_full_access" ON public.performance_checkins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated multi-tenant policies
DROP POLICY IF EXISTS "tenant_all_kudos" ON public.performance_kudos;
CREATE POLICY "tenant_all_kudos" ON public.performance_kudos
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id() OR tenant_id = 'SIMP_PRO_MAIN')
  WITH CHECK (tenant_id::text = public.get_my_tenant_id() OR tenant_id = 'SIMP_PRO_MAIN');

DROP POLICY IF EXISTS "tenant_all_checkins" ON public.performance_checkins;
CREATE POLICY "tenant_all_checkins" ON public.performance_checkins
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id() OR tenant_id = 'SIMP_PRO_MAIN')
  WITH CHECK (tenant_id::text = public.get_my_tenant_id() OR tenant_id = 'SIMP_PRO_MAIN');

-- 5. Permissions
GRANT ALL ON public.performance_kudos TO authenticated;
GRANT ALL ON public.performance_kudos TO service_role;
GRANT ALL ON public.performance_checkins TO authenticated;
GRANT ALL ON public.performance_checkins TO service_role;

COMMIT;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
