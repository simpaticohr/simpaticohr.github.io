-- Migration: Add interview_language and experience_level columns to interviews table
-- These enable multilingual AI interviews and proper difficulty calibration

ALTER TABLE interviews 
  ADD COLUMN IF NOT EXISTS interview_language TEXT DEFAULT 'en-IN',
  ADD COLUMN IF NOT EXISTS experience_level TEXT DEFAULT 'mid';

COMMENT ON COLUMN interviews.interview_language IS 'BCP-47 language code for AI interviewer TTS and STT (e.g. hi-IN, ta-IN, en-US)';
COMMENT ON COLUMN interviews.experience_level IS 'Candidate experience level hint (fresher, junior, mid, senior, staff)';
