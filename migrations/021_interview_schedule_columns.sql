-- Migration 021: Add scheduling metadata columns to interviews table
-- These columns preserve the HR-scheduled date/time, interviewer details,
-- and interview mode so they survive database sync round-trips.

ALTER TABLE interviews ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS scheduled_time TEXT;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS scheduled_end_time TEXT;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS interviewer_name TEXT;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS interviewer_email TEXT;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS interview_mode TEXT;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS meeting_link TEXT;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS notes TEXT;

-- Index for faster filtering by scheduled date
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_date ON interviews(scheduled_date);
