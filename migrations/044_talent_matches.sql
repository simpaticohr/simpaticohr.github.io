-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 044: talent_matches — AI Talent Rediscovery & Matching
-- Run ONCE in the Supabase SQL Editor.
-- Stores per-(job, application) AI match scores produced by POST /ai/talent-match,
-- so rediscovery results are instant on re-open and auditable over time.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 0. HELPER FUNCTION (self-contained — no table dependencies at all) ──────
-- get_my_tenant_id() resolves the caller's tenant purely from JWT claims
-- (the same claims the Worker reads in verifyViaSupabase). It deliberately
-- references NO tables: this database has no public.users table, and several
-- legacy migrations wrongly assume users/companies exist at function-creation
-- time. Returns NULL when claims are absent → policies match nothing (fail-closed);
-- the Worker path is unaffected (service_role bypasses RLS).

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS TEXT AS $$
  SELECT COALESCE(
    auth.jwt()->'app_metadata'->>'tenant_id',
    auth.jwt()->'app_metadata'->>'company_id',
    auth.jwt()->'user_metadata'->>'tenant_id',
    auth.jwt()->'user_metadata'->>'company_id'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── 1. CREATE TABLE ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.talent_matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  job_id          UUID NOT NULL,
  application_id  UUID NOT NULL,
  match_score     INTEGER,
  reasoning       TEXT,
  skills_matched  TEXT[],
  skills_missing  TEXT[],
  model           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_talent_matches_job_app UNIQUE (job_id, application_id)
);

-- ─── 2. INDEXES ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_talent_matches_tenant    ON public.talent_matches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_talent_matches_job_score ON public.talent_matches(job_id, match_score DESC);
CREATE INDEX IF NOT EXISTS idx_talent_matches_app       ON public.talent_matches(application_id);

-- ─── 3. EXPLICIT GRANTS (REQUIRED since May 30 2026) ────────────────────────
-- NO anon grant: match data is internal recruiter data, never public.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_matches TO authenticated;
GRANT ALL ON public.talent_matches TO service_role;

-- ─── 4. ROW LEVEL SECURITY ──────────────────────────────────────────────────

ALTER TABLE public.talent_matches ENABLE ROW LEVEL SECURITY;

-- Service role bypass (Cloudflare Worker uses service_role key)
DROP POLICY IF EXISTS "service_full_access" ON public.talent_matches;
CREATE POLICY "service_full_access" ON public.talent_matches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users: own tenant only (same pattern as migrations 030/032)
DROP POLICY IF EXISTS "tenant_read_talent_matches" ON public.talent_matches;
CREATE POLICY "tenant_read_talent_matches" ON public.talent_matches
  FOR SELECT TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_insert_talent_matches" ON public.talent_matches;
CREATE POLICY "tenant_insert_talent_matches" ON public.talent_matches
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_update_talent_matches" ON public.talent_matches;
CREATE POLICY "tenant_update_talent_matches" ON public.talent_matches
  FOR UPDATE TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

-- ─── 5. REFRESH POSTGREST CACHE ─────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
