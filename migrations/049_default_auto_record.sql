-- ============================================================
-- Migration 049: Default auto_record in proctor_settings
-- Safe migration for public.interviews table
-- ============================================================

-- 1. Ensure `proctor_settings` JSONB column exists on `interviews`
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS proctor_settings JSONB DEFAULT '{}'::jsonb;

-- 2. Backfill pending interviews with default auto_record: true setting
UPDATE public.interviews
SET proctor_settings = COALESCE(proctor_settings, '{}'::jsonb) || '{"auto_record": true}'::jsonb
WHERE status = 'pending'
  AND (proctor_settings IS NULL OR NOT (proctor_settings ? 'auto_record'));

NOTIFY pgrst, 'reload schema';

