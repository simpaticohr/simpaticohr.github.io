-- ═══════════════════════════════════════════════════════════════════════════════
-- SIMPATICO HR — NEW TABLE MIGRATION TEMPLATE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Copy this template for every new table you create.
-- Since Supabase no longer auto-grants Data API access (May 30 2026+),
-- you MUST include explicit GRANTs or the table will return 42501 errors
-- from PostgREST / supabase-js / GraphQL.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── 1. CREATE TABLE ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.your_table_name (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- your columns here
  tenant_id       TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  company_id      UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. INDEXES ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_your_table_tenant ON your_table_name(tenant_id);


-- ─── 3. EXPLICIT GRANTS (REQUIRED since May 30 2026) ────────────────────────
-- Without these, the Data API will NOT be able to access this table.
-- GRANTs control TABLE-level access. RLS controls ROW-level access.

-- anon: read-only for public-facing queries (e.g. job listings)
GRANT SELECT ON public.your_table_name TO anon;

-- authenticated: full CRUD for logged-in users (filtered by RLS policies)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table_name TO authenticated;

-- service_role: full access for backend Workers (bypasses RLS)
GRANT ALL ON public.your_table_name TO service_role;


-- ─── 4. ROW LEVEL SECURITY ──────────────────────────────────────────────────

ALTER TABLE public.your_table_name ENABLE ROW LEVEL SECURITY;

-- Service role bypass (your Cloudflare Worker uses service_role key)
CREATE POLICY "service_full_access" ON your_table_name
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users: read rows from own tenant only
CREATE POLICY "tenant_read_your_table" ON your_table_name
  FOR SELECT TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- Authenticated users: insert rows for own tenant
CREATE POLICY "tenant_insert_your_table" ON your_table_name
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- Authenticated users: update rows in own tenant
CREATE POLICY "tenant_update_your_table" ON your_table_name
  FOR UPDATE TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );


-- ─── 5. REFRESH POSTGREST CACHE ─────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
