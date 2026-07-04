-- ============================================================================
-- Migration 035: Add file upload columns to consulting_documents
-- ============================================================================
-- Adds file_path, file_url, and file_name for Supabase Storage uploads.
-- ============================================================================

ALTER TABLE public.consulting_documents
  ADD COLUMN IF NOT EXISTS file_path TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS file_url  TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS file_name TEXT DEFAULT '';
