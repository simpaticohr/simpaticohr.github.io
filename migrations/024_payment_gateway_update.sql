-- Migration 024: Update payment tables for CCAvenue + Wise gateway switch
-- Replaces Razorpay references with dual-gateway support:
--   CCAvenue (domestic INR) + Wise (international USD)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add new columns to payment_transactions for richer tracking
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS payment_method TEXT;       -- upi, card, netbanking, wallet, bank_transfer
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS gateway_response JSONB DEFAULT '{}';
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS is_international BOOLEAN DEFAULT false;

-- 2. Add amount column to subscriptions if not present
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2);

-- 3. Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_payment_transactions_gateway ON payment_transactions(gateway);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_gateway_payment_id ON payment_transactions(gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_is_international ON payment_transactions(is_international);

-- 4. Update any existing gateway references (data migration)
-- Convert old 'razorpay' gateway entries to 'legacy_razorpay' for audit trail
UPDATE payment_transactions SET gateway = 'legacy_razorpay' WHERE gateway = 'razorpay';
UPDATE subscriptions SET gateway = 'legacy_razorpay' WHERE gateway = 'razorpay';
