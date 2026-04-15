-- ============================================================
-- Simpatico HR Platform — 005 Migration
-- Run in Supabase SQL editor
-- Adds AI scoring + resume columns to job_applications table
-- These were computed by the backend but never persisted
-- ============================================================

-- 1. Store the AI match score (0-100)
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS match_score INTEGER;

-- 2. Store the AI reasoning summary
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- 3. Store the candidate's resume text for the profile drawer
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS resume_text TEXT;

-- 4. Ensure applied_at exists (backend sets this on insert)
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ DEFAULT NOW();
