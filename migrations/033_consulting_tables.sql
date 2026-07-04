-- ============================================================================
-- Migration 033: Consulting Dashboard Tables (Multi-Tenant)
-- ============================================================================
-- Creates 6 tables for the Business Consulting Dashboard with:
--   - tenant_id for multi-tenant isolation
--   - created_by for activity tracking
--   - RLS enabled + service_role + tenant-scoped policies
--   - Indexes on tenant_id for performance
--
-- Run in Supabase SQL Editor: select all → copy → paste → run
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. consulting_projects
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consulting_projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  TEXT NOT NULL,
  created_by TEXT,
  name       TEXT NOT NULL,
  type       TEXT DEFAULT 'strategy',
  stage      TEXT DEFAULT 'discovery',
  progress   INTEGER DEFAULT 0,
  milestone  TEXT,
  start_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consulting_projects_tenant
  ON public.consulting_projects (tenant_id);

ALTER TABLE public.consulting_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON public.consulting_projects;
CREATE POLICY "service_full_access" ON public.consulting_projects
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_rw_consulting_projects" ON public.consulting_projects;
CREATE POLICY "tenant_rw_consulting_projects" ON public.consulting_projects
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());


-- ============================================================================
-- 2. consulting_assessments
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consulting_assessments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  created_by      TEXT,
  overall_score   NUMERIC(5,2) DEFAULT 0,
  category_scores JSONB DEFAULT '{}',
  answers         JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consulting_assessments_tenant
  ON public.consulting_assessments (tenant_id);

ALTER TABLE public.consulting_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON public.consulting_assessments;
CREATE POLICY "service_full_access" ON public.consulting_assessments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_rw_consulting_assessments" ON public.consulting_assessments;
CREATE POLICY "tenant_rw_consulting_assessments" ON public.consulting_assessments
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());


-- ============================================================================
-- 3. consulting_swot
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consulting_swot (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  TEXT NOT NULL,
  created_by TEXT,
  type       TEXT NOT NULL CHECK (type IN ('strengths', 'weaknesses', 'opportunities', 'threats')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consulting_swot_tenant
  ON public.consulting_swot (tenant_id);

ALTER TABLE public.consulting_swot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON public.consulting_swot;
CREATE POLICY "service_full_access" ON public.consulting_swot
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_rw_consulting_swot" ON public.consulting_swot;
CREATE POLICY "tenant_rw_consulting_swot" ON public.consulting_swot
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());


-- ============================================================================
-- 4. consulting_kpis
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consulting_kpis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  created_by    TEXT,
  name          TEXT NOT NULL,
  current_value NUMERIC(12,2) DEFAULT 0,
  target_value  NUMERIC(12,2) DEFAULT 100,
  unit          TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consulting_kpis_tenant
  ON public.consulting_kpis (tenant_id);

ALTER TABLE public.consulting_kpis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON public.consulting_kpis;
CREATE POLICY "service_full_access" ON public.consulting_kpis
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_rw_consulting_kpis" ON public.consulting_kpis;
CREATE POLICY "tenant_rw_consulting_kpis" ON public.consulting_kpis
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());


-- ============================================================================
-- 5. consulting_documents
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consulting_documents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  TEXT NOT NULL,
  created_by TEXT,
  name       TEXT NOT NULL,
  category   TEXT DEFAULT 'report',
  doc_type   TEXT DEFAULT 'pdf',
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consulting_documents_tenant
  ON public.consulting_documents (tenant_id);

ALTER TABLE public.consulting_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON public.consulting_documents;
CREATE POLICY "service_full_access" ON public.consulting_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_rw_consulting_documents" ON public.consulting_documents;
CREATE POLICY "tenant_rw_consulting_documents" ON public.consulting_documents
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());


-- ============================================================================
-- 6. consulting_meetings
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consulting_meetings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  TEXT NOT NULL,
  created_by TEXT,
  title      TEXT NOT NULL,
  date       DATE NOT NULL,
  time       TEXT DEFAULT '10:00',
  type       TEXT DEFAULT 'strategy',
  status     TEXT DEFAULT 'scheduled',
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consulting_meetings_tenant
  ON public.consulting_meetings (tenant_id);

ALTER TABLE public.consulting_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON public.consulting_meetings;
CREATE POLICY "service_full_access" ON public.consulting_meetings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_rw_consulting_meetings" ON public.consulting_meetings;
CREATE POLICY "tenant_rw_consulting_meetings" ON public.consulting_meetings
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());


-- ============================================================================
-- 7. consulting_activity (notification/activity log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consulting_activity (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  TEXT NOT NULL,
  user_id    TEXT,
  user_name  TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  detail     TEXT,
  read       BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consulting_activity_tenant
  ON public.consulting_activity (tenant_id);
CREATE INDEX IF NOT EXISTS idx_consulting_activity_created
  ON public.consulting_activity (created_at DESC);

ALTER TABLE public.consulting_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON public.consulting_activity;
CREATE POLICY "service_full_access" ON public.consulting_activity
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_rw_consulting_activity" ON public.consulting_activity;
CREATE POLICY "tenant_rw_consulting_activity" ON public.consulting_activity
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());


-- ============================================================================
-- Done
-- ============================================================================

COMMIT;
