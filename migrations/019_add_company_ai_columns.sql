-- Migration: Add AI provider columns to companies table
-- Required for BYOK (Bring Your Own Key) custom AI routing

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS ai_provider TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_api_key TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_base_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT NULL;

-- Add tenant_id to interviews for proper tenant resolution
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT NULL;

-- Backfill tenant_id from company_id where missing
UPDATE interviews SET tenant_id = company_id WHERE tenant_id IS NULL AND company_id IS NOT NULL;

COMMENT ON COLUMN companies.ai_provider IS 'AI provider: cloudflare, openai, anthropic, kimi, gemini, deepseek, custom';
COMMENT ON COLUMN companies.ai_api_key IS 'Encrypted API key for custom AI provider';
COMMENT ON COLUMN companies.ai_base_url IS 'Base URL for custom provider API endpoint';
COMMENT ON COLUMN companies.ai_model IS 'Model identifier (e.g. gpt-4o, claude-3-haiku, kimi-k2-0520)';
