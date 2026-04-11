-- Add company_id to training_courses (was missed in migration 003)
-- This fixes 400 errors: "column training_courses.company_id does not exist"

ALTER TABLE training_courses ADD COLUMN IF NOT EXISTS company_id UUID;

-- Notify PostgREST to reload the schema cache so the frontend queries succeed immediately
NOTIFY pgrst, 'reload schema';
