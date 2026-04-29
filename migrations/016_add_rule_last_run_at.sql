-- Add last_run_at column to automation_rules for server-side cron tracking

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'automation_rules' AND column_name = 'last_run_at') THEN
        ALTER TABLE automation_rules ADD COLUMN last_run_at TIMESTAMPTZ;
    END IF;
END $$;
