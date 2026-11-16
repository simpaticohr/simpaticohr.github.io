-- ============================================================
-- Simpatico HR Platform — Influencer Marketing Module Schema Extension
-- Run in Supabase SQL editor
-- This extends the existing schema with influencer marketing capabilities
-- ============================================================

-- ── Enable UUID extension (if not already enabled) ──
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ════════════════════════════════════════════════════════
-- 1. INFLUENCER PROFILES
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS influencer_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Social presence
  primary_platform    TEXT NOT NULL CHECK (primary_platform IN ('linkedin','instagram','youtube','twitter','tiktok','facebook','other')),
  primary_handle      TEXT NOT NULL,
  secondary_platform  TEXT CHECK (secondary_platform IN ('linkedin','instagram','youtube','twitter','tiktok','facebook','other')),
  secondary_handle    TEXT,
  follower_range      TEXT CHECK (follower_range IN ('1k-10k','10k-50k','50k-500k','500k+')),
  
  -- Content profile
  content_niches      TEXT[] DEFAULT '{}',
  content_types       TEXT[] DEFAULT '{}',
  languages           TEXT[] DEFAULT '{}',
  bio                 TEXT,
  portfolio_links     TEXT[] DEFAULT '{}',
  
  -- Availability & pricing
  available_for       TEXT[] DEFAULT '{}',
  rate_card           TEXT,
  media_kit_url       TEXT,
  
  -- Verification & status
  status              TEXT DEFAULT 'pending' CHECK (status IN ('pending','verified','active','suspended','rejected')),
  verified_at         TIMESTAMPTZ,
  
  -- Analytics (populated later by platform)
  engagement_rate     NUMERIC(5,2),
  audience_score      NUMERIC(5,2),
  brand_safety_score  NUMERIC(5,2),
  
  -- Metadata
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════
-- 2. INFLUENCER CAMPAIGNS
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS influencer_campaigns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Campaign details
  title                 TEXT NOT NULL,
  description           TEXT,
  objective             TEXT CHECK (objective IN ('employer_branding','talent_acquisition','event_promotion','product_launch','awareness','other')),
  
  -- Targeting
  target_platforms      TEXT[] DEFAULT '{}',
  target_niches         TEXT[] DEFAULT '{}',
  target_follower_range TEXT,
  target_locations      TEXT[] DEFAULT '{}',
  
  -- Budget & timeline
  budget_total          NUMERIC(12,2),
  budget_per_post       NUMERIC(10,2),
  currency              TEXT DEFAULT 'INR',
  start_date            DATE,
  end_date              DATE,
  
  -- Content requirements
  deliverables          JSONB DEFAULT '[]',
  brand_guidelines      TEXT,
  hashtags              TEXT[] DEFAULT '{}',
  talking_points        TEXT[] DEFAULT '{}',
  
  -- Status
  status                TEXT DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed','cancelled')),
  
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════
-- 3. CAMPAIGN APPLICATIONS
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS campaign_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES influencer_campaigns(id) ON DELETE CASCADE,
  influencer_id   UUID NOT NULL REFERENCES influencer_profiles(id) ON DELETE CASCADE,
  
  proposal        TEXT,
  proposed_rate   NUMERIC(10,2),
  status          TEXT DEFAULT 'applied' CHECK (status IN ('applied','shortlisted','accepted','rejected','completed')),
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(campaign_id, influencer_id)
);

-- ════════════════════════════════════════════════════════
-- 4. CAMPAIGN CONTENT SUBMISSIONS
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS campaign_content (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES campaign_applications(id) ON DELETE CASCADE,
  
  content_url     TEXT NOT NULL,
  content_type    TEXT,
  caption         TEXT,
  
  -- Approval workflow
  status          TEXT DEFAULT 'submitted' CHECK (status IN ('submitted','revision_requested','approved','published','rejected')),
  reviewer_notes  TEXT,
  
  -- Performance (populated after publishing)
  impressions     BIGINT DEFAULT 0,
  reach           BIGINT DEFAULT 0,
  engagement      BIGINT DEFAULT 0,
  clicks          BIGINT DEFAULT 0,
  conversions     INT DEFAULT 0,
  
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  published_at    TIMESTAMPTZ
);

-- ════════════════════════════════════════════════════════
-- 5. INFLUENCER PAYOUTS
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS influencer_payouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id   UUID NOT NULL REFERENCES influencer_profiles(id) ON DELETE CASCADE,
  campaign_id     UUID REFERENCES influencer_campaigns(id) ON DELETE SET NULL,
  
  amount          NUMERIC(10,2) NOT NULL,
  currency        TEXT DEFAULT 'INR',
  method          TEXT CHECK (method IN ('upi','bank_transfer','paypal','wise')),
  
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  transaction_ref TEXT,
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  paid_at         TIMESTAMPTZ
);

-- ════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════

-- B-Tree indexes for status, platform, and foreign keys
CREATE INDEX IF NOT EXISTS idx_influencer_user ON influencer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_influencer_platform ON influencer_profiles(primary_platform);
CREATE INDEX IF NOT EXISTS idx_influencer_status ON influencer_profiles(status);
CREATE INDEX IF NOT EXISTS idx_influencer_follower ON influencer_profiles(follower_range);

CREATE INDEX IF NOT EXISTS idx_campaigns_company ON influencer_campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON influencer_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_objective ON influencer_campaigns(objective);

CREATE INDEX IF NOT EXISTS idx_applications_campaign ON campaign_applications(campaign_id);
CREATE INDEX IF NOT EXISTS idx_applications_influencer ON campaign_applications(influencer_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON campaign_applications(status);

CREATE INDEX IF NOT EXISTS idx_content_application ON campaign_content(application_id);
CREATE INDEX IF NOT EXISTS idx_content_status ON campaign_content(status);

CREATE INDEX IF NOT EXISTS idx_payouts_influencer ON influencer_payouts(influencer_id);
CREATE INDEX IF NOT EXISTS idx_payouts_campaign ON influencer_payouts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON influencer_payouts(status);

-- GIN indexes for array columns
CREATE INDEX IF NOT EXISTS idx_influencer_niches ON influencer_profiles USING GIN (content_niches);
CREATE INDEX IF NOT EXISTS idx_influencer_content_types ON influencer_profiles USING GIN (content_types);
CREATE INDEX IF NOT EXISTS idx_influencer_languages ON influencer_profiles USING GIN (languages);
CREATE INDEX IF NOT EXISTS idx_influencer_available_for ON influencer_profiles USING GIN (available_for);
CREATE INDEX IF NOT EXISTS idx_influencer_portfolio_links ON influencer_profiles USING GIN (portfolio_links);

CREATE INDEX IF NOT EXISTS idx_campaigns_target_platforms ON influencer_campaigns USING GIN (target_platforms);
CREATE INDEX IF NOT EXISTS idx_campaigns_target_niches ON influencer_campaigns USING GIN (target_niches);
CREATE INDEX IF NOT EXISTS idx_campaigns_target_locations ON influencer_campaigns USING GIN (target_locations);
CREATE INDEX IF NOT EXISTS idx_campaigns_hashtags ON influencer_campaigns USING GIN (hashtags);
CREATE INDEX IF NOT EXISTS idx_campaigns_talking_points ON influencer_campaigns USING GIN (talking_points);

-- ════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════════════════
ALTER TABLE influencer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencer_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencer_payouts ENABLE ROW LEVEL SECURITY;

-- Service role bypass (Cloudflare Workers / Backend)
CREATE POLICY "Service role full access" ON influencer_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON influencer_campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON campaign_applications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON campaign_content FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON influencer_payouts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anon / Public insert for signup (before auth is established)
CREATE POLICY "anon_insert_influencer" ON influencer_profiles
  FOR INSERT WITH CHECK (true);

-- Influencers can read and update their own profile
CREATE POLICY "influencer_own_profile" ON influencer_profiles
  FOR ALL TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Anyone authenticated can view active or verified influencer profiles (for discovery)
CREATE POLICY "view_active_influencer_profiles" ON influencer_profiles
  FOR SELECT TO authenticated
  USING (status IN ('verified', 'active'));

-- Anyone authenticated can view active campaigns
CREATE POLICY "view_active_campaigns" ON influencer_campaigns
  FOR SELECT TO authenticated
  USING (status = 'active');

-- Company admins can manage their campaigns
CREATE POLICY "company_manage_campaigns" ON influencer_campaigns
  FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));

-- Influencers can manage their own applications
CREATE POLICY "influencer_own_applications" ON campaign_applications
  FOR ALL TO authenticated
  USING (influencer_id IN (SELECT id FROM influencer_profiles WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())))
  WITH CHECK (influencer_id IN (SELECT id FROM influencer_profiles WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())));

-- Company admins can view applications for their campaigns
CREATE POLICY "company_view_applications" ON campaign_applications
  FOR SELECT TO authenticated
  USING (campaign_id IN (SELECT id FROM influencer_campaigns WHERE company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid())));

-- Influencers can manage their own content submissions
CREATE POLICY "influencer_own_content" ON campaign_content
  FOR ALL TO authenticated
  USING (application_id IN (SELECT id FROM campaign_applications WHERE influencer_id IN (SELECT id FROM influencer_profiles WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))))
  WITH CHECK (application_id IN (SELECT id FROM campaign_applications WHERE influencer_id IN (SELECT id FROM influencer_profiles WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))));

-- Company admins can view content submissions for their campaigns
CREATE POLICY "company_view_content" ON campaign_content
  FOR SELECT TO authenticated
  USING (application_id IN (SELECT ca.id FROM campaign_applications ca JOIN influencer_campaigns ic ON ca.campaign_id = ic.id WHERE ic.company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid())));

-- Influencers can view their own payouts
CREATE POLICY "influencer_own_payouts" ON influencer_payouts
  FOR SELECT TO authenticated
  USING (influencer_id IN (SELECT id FROM influencer_profiles WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())));

-- ════════════════════════════════════════════════════════
-- TRIGGERS (Auto-update updated_at)
-- ════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_influencer_profiles_updated ON influencer_profiles;
CREATE TRIGGER t_influencer_profiles_updated
  BEFORE UPDATE ON influencer_profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS t_influencer_campaigns_updated ON influencer_campaigns;
CREATE TRIGGER t_influencer_campaigns_updated
  BEFORE UPDATE ON influencer_campaigns
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS t_campaign_applications_updated ON campaign_applications;
CREATE TRIGGER t_campaign_applications_updated
  BEFORE UPDATE ON campaign_applications
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
