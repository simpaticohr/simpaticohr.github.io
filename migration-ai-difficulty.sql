-- Migration: AI Interview Difficulty and Anti-Repeat Question System
-- Run in Supabase SQL Editor

-- 1. Add AI difficulty and round tracking to interviews table
ALTER TABLE interviews 
  ADD COLUMN IF NOT EXISTS ai_difficulty TEXT DEFAULT 'adaptive',
  ADD COLUMN IF NOT EXISTS round_number INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_interview_id UUID,
  ADD COLUMN IF NOT EXISTS difficulty_auto_escalate BOOLEAN DEFAULT true;

-- 2. Question History table for anti-repeat tracking
CREATE TABLE IF NOT EXISTS question_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_email   TEXT NOT NULL,
  company_id        UUID,
  interview_id      UUID,
  question_text     TEXT NOT NULL,
  topic_fingerprint TEXT NOT NULL,
  difficulty_level  TEXT,
  phase             TEXT,
  round_number      INT DEFAULT 1,
  asked_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_qhist_candidate 
  ON question_history(candidate_email);
CREATE INDEX IF NOT EXISTS idx_qhist_topic 
  ON question_history(candidate_email, topic_fingerprint);
CREATE INDEX IF NOT EXISTS idx_qhist_interview 
  ON question_history(interview_id);

-- RLS
ALTER TABLE question_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_qhist" 
    ON question_history FOR ALL TO service_role USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Index on interviews for round tracking
CREATE INDEX IF NOT EXISTS idx_interviews_candidate_round 
  ON interviews(candidate_email, round_number);
