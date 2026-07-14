-- Migration 039: Add proctoring, resume matching, and company settings columns
ALTER TABLE public.interview_sessions ADD COLUMN IF NOT EXISTS proctoring_violations JSONB DEFAULT '{}';
ALTER TABLE public.interview_sessions ADD COLUMN IF NOT EXISTS resume_matching_report JSONB;

ALTER TABLE public.interview_companies ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
