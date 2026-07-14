-- ============================================================
-- Migration 038: Add detailed report, transcript, and mode columns to interview_sessions
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/cvkxtsvgnynxexmemfuy/sql)
-- ============================================================

ALTER TABLE public.interview_sessions ADD COLUMN IF NOT EXISTS detailed_report JSONB;
ALTER TABLE public.interview_sessions ADD COLUMN IF NOT EXISTS chat_history JSONB;
ALTER TABLE public.interview_sessions ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'text';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
