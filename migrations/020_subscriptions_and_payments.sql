-- Migration 020: Create subscriptions and payment_transactions tables
-- Required by billing endpoints: /billing/subscription, /billing/verify-payment,
-- /billing/cancel, /billing/transactions, /billing/paddle-webhook
-- Also adds subscription_start / subscription_end to companies for trial-guard.js

-- ═══════════════════════════════════════════════════════════════════
-- 1. Subscriptions table — stores active/cancelled subscription state
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan          TEXT NOT NULL DEFAULT 'trial',           -- trial, starter, professional, enterprise
  status        TEXT NOT NULL DEFAULT 'active',          -- active, paused, cancelled, expired
  gateway       TEXT,                                     -- cashfree, paddle, manual
  gateway_subscription_id TEXT,                           -- external subscription ID
  gateway_customer_id     TEXT,                           -- external customer ID
  currency      TEXT DEFAULT 'INR',
  billing_cycle TEXT DEFAULT 'monthly',                   -- monthly, annual
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  tenant_id     TEXT
);

-- Index for fast lookup by company
CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id ON subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON subscriptions(tenant_id);

-- ═══════════════════════════════════════════════════════════════════
-- 2. Payment transactions — audit log for all payment events
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id),
  gateway       TEXT NOT NULL,                            -- cashfree, paddle
  gateway_order_id TEXT,                                  -- external order/transaction ID
  amount        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency      TEXT DEFAULT 'INR',
  status        TEXT NOT NULL DEFAULT 'pending',          -- pending, paid, failed, refunded
  plan          TEXT,
  billing_cycle TEXT,
  metadata      JSONB DEFAULT '{}',                       -- raw gateway response
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  tenant_id     TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_company_id ON payment_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- 3. Add subscription columns to companies (for trial-guard.js)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'trial';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_start TIMESTAMPTZ DEFAULT now();
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- ═══════════════════════════════════════════════════════════════════
-- 4. RLS policies — tenant isolation
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Subscriptions: service role full access, authenticated users read own
CREATE POLICY "subscriptions_service_all" ON subscriptions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "subscriptions_read_own" ON subscriptions
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- Transactions: service role full access, authenticated users read own
CREATE POLICY "payment_transactions_service_all" ON payment_transactions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "payment_transactions_read_own" ON payment_transactions
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════
-- 5. Backfill: set subscription_start for existing companies
-- ═══════════════════════════════════════════════════════════════════

UPDATE companies
SET subscription_start = created_at,
    subscription_end = created_at + INTERVAL '2 days'
WHERE subscription_start IS NULL AND subscription_plan = 'trial';
