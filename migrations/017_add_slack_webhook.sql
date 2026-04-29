-- Migration 017: Add Slack integration column to companies table
-- Stores the tenant's Slack Incoming Webhook URL for automation notifications

ALTER TABLE companies ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT DEFAULT NULL;

COMMENT ON COLUMN companies.slack_webhook_url IS 'Slack Incoming Webhook URL for automation notifications';
