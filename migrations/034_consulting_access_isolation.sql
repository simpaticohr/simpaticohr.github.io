-- ============================================================================
-- Migration 034: Business Consulting Access Isolation
-- ============================================================================
-- Adds service_type to companies table and consulting_admin role support.
-- This separates HR/ATS users from Business Consulting users.
-- ============================================================================

BEGIN;

-- 1. Add service_type column to companies table
-- Values: 'hr' (default), 'consulting', 'both'
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'hr';

-- 2. Update existing companies to 'hr' (they were all HR before this)
UPDATE public.companies
  SET service_type = 'hr'
  WHERE service_type IS NULL;

COMMIT;
