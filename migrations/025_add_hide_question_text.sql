-- Migration 025: Add hide_question_text column to interviews table
-- Fixes PGRST204 "Could not find the 'hide_question_text' column of 'interviews' in the schema cache"
-- This column controls whether question text is hidden during voice-only interviews.

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS hide_question_text boolean DEFAULT false;

-- Grant access so PostgREST (anon/authenticated roles) can read/write it
GRANT SELECT, INSERT, UPDATE ON interviews TO anon;
GRANT SELECT, INSERT, UPDATE ON interviews TO authenticated;

-- Notify PostgREST to reload the schema cache so the new column is picked up immediately
NOTIFY pgrst, 'reload schema';
