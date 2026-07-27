-- ═══════════════════════════════════════════════════════════════════════════════
-- SIMPATICO HR — AGENTIC AI ENGINE
-- Migration 048: Agent config, runs, and actions tables + company toggle
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. ADD AGENT COLUMNS TO COMPANIES ──────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'agent_mode') THEN
        ALTER TABLE companies ADD COLUMN agent_mode BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'agent_daily_limit') THEN
        ALTER TABLE companies ADD COLUMN agent_daily_limit INT DEFAULT 50;
    END IF;
END $$;

-- ─── 2. AGENT CONFIG (per-tenant agent preferences) ────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  agent_type      TEXT NOT NULL CHECK (agent_type IN ('recruitment','onboarding','leave','debrief','anomaly','ticket')),
  enabled         BOOLEAN DEFAULT true,
  auto_approve    BOOLEAN DEFAULT false,
  config_json     JSONB DEFAULT '{}',
  tenant_id       TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, agent_type)
);

CREATE INDEX IF NOT EXISTS idx_agent_config_company ON agent_config(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_config_tenant ON agent_config(tenant_id);

-- Grants
GRANT SELECT ON public.agent_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_config TO authenticated;
GRANT ALL ON public.agent_config TO service_role;

-- RLS
ALTER TABLE public.agent_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_full_access_agent_config" ON agent_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_read_agent_config" ON agent_config
  FOR SELECT TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

CREATE POLICY "tenant_insert_agent_config" ON agent_config
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

CREATE POLICY "tenant_update_agent_config" ON agent_config
  FOR UPDATE TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- ─── 3. AGENT RUNS (every orchestrator execution cycle) ────────────────────

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  agent_type      TEXT,
  trigger_type    TEXT DEFAULT 'cron' CHECK (trigger_type IN ('cron','manual','event')),
  status          TEXT DEFAULT 'running' CHECK (status IN ('running','completed','failed','partial')),
  actions_taken   INT DEFAULT 0,
  actions_pending INT DEFAULT 0,
  summary         TEXT,
  duration_ms     INT,
  llm_provider    TEXT,
  tokens_used     INT DEFAULT 0,
  error_message   TEXT,
  tenant_id       TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_company ON agent_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant ON agent_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created ON agent_runs(created_at DESC);

-- Grants
GRANT SELECT ON public.agent_runs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;

-- RLS
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_full_access_agent_runs" ON agent_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_read_agent_runs" ON agent_runs
  FOR SELECT TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

CREATE POLICY "tenant_insert_agent_runs" ON agent_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

CREATE POLICY "tenant_update_agent_runs" ON agent_runs
  FOR UPDATE TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- ─── 4. AGENT ACTIONS (every individual action an agent takes) ─────────────

CREATE TABLE IF NOT EXISTS public.agent_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID REFERENCES agent_runs(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL,
  agent_type      TEXT NOT NULL,
  action_type     TEXT NOT NULL,
  target_type     TEXT,
  target_id       UUID,
  description     TEXT,
  input_context   JSONB DEFAULT '{}',
  output_result   JSONB DEFAULT '{}',
  status          TEXT DEFAULT 'executed' CHECK (status IN ('executed','pending_approval','approved','rejected','failed')),
  approved_by     UUID,
  approved_at     TIMESTAMPTZ,
  tenant_id       TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_actions_run ON agent_actions(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_company ON agent_actions(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_tenant ON agent_actions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_status ON agent_actions(status);
CREATE INDEX IF NOT EXISTS idx_agent_actions_created ON agent_actions(created_at DESC);

-- Grants
GRANT SELECT ON public.agent_actions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_actions TO authenticated;
GRANT ALL ON public.agent_actions TO service_role;

-- RLS
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_full_access_agent_actions" ON agent_actions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_read_agent_actions" ON agent_actions
  FOR SELECT TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

CREATE POLICY "tenant_insert_agent_actions" ON agent_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

CREATE POLICY "tenant_update_agent_actions" ON agent_actions
  FOR UPDATE TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- ─── 5. REFRESH POSTGREST CACHE ────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
