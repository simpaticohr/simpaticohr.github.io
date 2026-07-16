-- Migration 043: Create consulting_kpi_history table for trend analysis and forecasting
BEGIN;

CREATE TABLE IF NOT EXISTS public.consulting_kpi_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,
  kpi_id      UUID NOT NULL REFERENCES public.consulting_kpis(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  value       NUMERIC(14, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consulting_kpi_history_tenant ON public.consulting_kpi_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consulting_kpi_history_kpi ON public.consulting_kpi_history(kpi_id);

ALTER TABLE public.consulting_kpi_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON public.consulting_kpi_history;
CREATE POLICY "service_full_access" ON public.consulting_kpi_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_rw_consulting_kpi_history" ON public.consulting_kpi_history;
CREATE POLICY "tenant_rw_consulting_kpi_history" ON public.consulting_kpi_history
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

COMMIT;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
