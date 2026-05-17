-- Migration: Add blocking columns to companies table
-- Purpose: Enable super admin to block companies or restrict their interview access
-- Date: 2026-05-17

-- Add is_blocked column (blocks full platform access)
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;

-- Add interviews_blocked column (restricts interview creation only)
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS interviews_blocked BOOLEAN DEFAULT FALSE;

-- Add index for quick filtering of blocked companies
CREATE INDEX IF NOT EXISTS idx_companies_is_blocked ON companies (is_blocked) WHERE is_blocked = true;
CREATE INDEX IF NOT EXISTS idx_companies_interviews_blocked ON companies (interviews_blocked) WHERE interviews_blocked = true;

-- Comment on columns for documentation
COMMENT ON COLUMN companies.is_blocked IS 'When true, the company account is fully blocked from platform access';
COMMENT ON COLUMN companies.interviews_blocked IS 'When true, the company cannot create or conduct new interviews';
