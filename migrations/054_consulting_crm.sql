-- ============================================================================
-- Migration 054: Consulting CRM Tables (Multi-Tenant)
-- ============================================================================
-- Creates 2 tables for the Business Consulting CRM module:
--   1. consulting_crm_contacts — leads, prospects, customers, partners
--   2. consulting_crm_deals    — sales pipeline / deal tracking
--
-- Follows patterns from 033_consulting_tables.sql + _TEMPLATE_new_table.sql
-- With explicit GRANTs required since May 30 2026.
--
-- Run in Supabase SQL Editor: select all → copy → paste → run
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. consulting_crm_contacts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consulting_crm_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  created_by      TEXT,
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  company         TEXT,
  designation     TEXT,
  type            TEXT DEFAULT 'lead' CHECK (type IN ('lead', 'prospect', 'customer', 'partner')),
  source          TEXT DEFAULT 'website' CHECK (source IN ('referral', 'website', 'whatsapp', 'linkedin', 'cold', 'event', 'other')),
  tags            JSONB DEFAULT '[]',
  notes           TEXT,
  last_contacted  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consulting_crm_contacts_tenant
  ON public.consulting_crm_contacts (tenant_id);

CREATE INDEX IF NOT EXISTS idx_consulting_crm_contacts_type
  ON public.consulting_crm_contacts (tenant_id, type);

-- Explicit GRANTs (required since May 30 2026)
GRANT SELECT ON public.consulting_crm_contacts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consulting_crm_contacts TO authenticated;
GRANT ALL ON public.consulting_crm_contacts TO service_role;

-- RLS
ALTER TABLE public.consulting_crm_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON public.consulting_crm_contacts;
CREATE POLICY "service_full_access" ON public.consulting_crm_contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_rw_consulting_crm_contacts" ON public.consulting_crm_contacts;
CREATE POLICY "tenant_rw_consulting_crm_contacts" ON public.consulting_crm_contacts
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "superadmin_all_consulting_crm_contacts" ON public.consulting_crm_contacts;
CREATE POLICY "superadmin_all_consulting_crm_contacts" ON public.consulting_crm_contacts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_id = auth.uid()
        AND role IN ('super_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_id = auth.uid()
        AND role IN ('super_admin', 'superadmin')
    )
  );


-- ============================================================================
-- 2. consulting_crm_deals
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consulting_crm_deals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  created_by      TEXT,
  contact_id      UUID REFERENCES public.consulting_crm_contacts(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  value           NUMERIC(14,2) DEFAULT 0,
  currency        TEXT DEFAULT 'INR',
  stage           TEXT DEFAULT 'lead' CHECK (stage IN ('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  probability     INTEGER DEFAULT 10 CHECK (probability >= 0 AND probability <= 100),
  expected_close  DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consulting_crm_deals_tenant
  ON public.consulting_crm_deals (tenant_id);

CREATE INDEX IF NOT EXISTS idx_consulting_crm_deals_stage
  ON public.consulting_crm_deals (tenant_id, stage);

CREATE INDEX IF NOT EXISTS idx_consulting_crm_deals_contact
  ON public.consulting_crm_deals (contact_id);

-- Explicit GRANTs
GRANT SELECT ON public.consulting_crm_deals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consulting_crm_deals TO authenticated;
GRANT ALL ON public.consulting_crm_deals TO service_role;

-- RLS
ALTER TABLE public.consulting_crm_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON public.consulting_crm_deals;
CREATE POLICY "service_full_access" ON public.consulting_crm_deals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_rw_consulting_crm_deals" ON public.consulting_crm_deals;
CREATE POLICY "tenant_rw_consulting_crm_deals" ON public.consulting_crm_deals
  FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id())
  WITH CHECK (tenant_id::text = public.get_my_tenant_id());

DROP POLICY IF EXISTS "superadmin_all_consulting_crm_deals" ON public.consulting_crm_deals;
CREATE POLICY "superadmin_all_consulting_crm_deals" ON public.consulting_crm_deals
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_id = auth.uid()
        AND role IN ('super_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_id = auth.uid()
        AND role IN ('super_admin', 'superadmin')
    )
  );


-- ============================================================================
-- Refresh PostgREST schema cache
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;
