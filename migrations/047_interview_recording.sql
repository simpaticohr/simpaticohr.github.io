-- ============================================================
-- Migration 047: Add interview recording columns
-- Safe migration for both interviews and interview_sessions tables
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Ensure `interviews` table exists (or create minimal table if missing)
CREATE TABLE IF NOT EXISTS public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending'
);

-- 2. Ensure `interview_sessions` table exists (if missing)
CREATE TABLE IF NOT EXISTS public.interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending'
);

-- 3. Add recording columns to `interviews` table
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS recording_file_id TEXT;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS recording_size_bytes BIGINT;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS recording_expires_at TIMESTAMPTZ;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN DEFAULT false;

-- 4. Add recording columns to `interview_sessions` table
ALTER TABLE public.interview_sessions ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE public.interview_sessions ADD COLUMN IF NOT EXISTS recording_file_id TEXT;
ALTER TABLE public.interview_sessions ADD COLUMN IF NOT EXISTS recording_size_bytes BIGINT;
ALTER TABLE public.interview_sessions ADD COLUMN IF NOT EXISTS recording_expires_at TIMESTAMPTZ;
ALTER TABLE public.interview_sessions ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN DEFAULT false;

-- 5. Create indexes for cleanup queries
CREATE INDEX IF NOT EXISTS idx_interviews_recording_expires
  ON public.interviews(recording_expires_at)
  WHERE recording_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interview_sessions_recording_expires
  ON public.interview_sessions(recording_expires_at)
  WHERE recording_file_id IS NOT NULL;

-- 6. Grant permissions
GRANT ALL ON public.interviews TO anon, authenticated, service_role;
GRANT ALL ON public.interview_sessions TO anon, authenticated, service_role;

-- 7. Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
