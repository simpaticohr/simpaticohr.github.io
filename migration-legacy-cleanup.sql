-- ============================================================
-- LEGACY DATA CLEANUP MIGRATION
-- Run in Supabase SQL editor to fix null names and status enums
-- ============================================================

-- 1. Backfill null or missing candidate names
-- Use email prefix if name is missing
UPDATE employees 
SET first_name = COALESCE(first_name, SPLIT_PART(email, '@', 1))
WHERE first_name IS NULL OR TRIM(first_name) = '';

UPDATE employees 
SET last_name = COALESCE(last_name, 'Employee')
WHERE last_name IS NULL OR TRIM(last_name) = '';

-- 2. Normalize candidate status enum values
-- 'shortlisted' → 'screening' (standard status)
-- 'onboarding' → keep as is (valid status)
-- Any unrecognized values → 'active' (default)
UPDATE employees 
SET status = 'screening' 
WHERE status = 'shortlisted';

UPDATE employees 
SET status = 'active' 
WHERE status NOT IN ('active', 'on_leave', 'terminated', 'offboarding', 'screening', 'onboarding', 'inactive');

-- 3. Verify migration success
SELECT 
  COUNT(*) AS total_records,
  SUM(CASE WHEN first_name IS NULL OR TRIM(first_name) = '' THEN 1 ELSE 0 END) AS null_first_names,
  SUM(CASE WHEN last_name IS NULL OR TRIM(last_name) = '' THEN 1 ELSE 0 END) AS null_last_names,
  COUNT(DISTINCT status) AS unique_statuses
FROM employees;

-- 4. Show all unique status values after cleanup
SELECT DISTINCT status, COUNT(*) as count
FROM employees
GROUP BY status
ORDER BY count DESC;

-- 5. Log: Record the migration timestamp
-- (Optional: Create a migration_log table to track what was changed)
-- COMMENT ON TABLE employees IS 'Legacy data cleanup: Backfilled null names, normalized status enums. Run date: ' || NOW();
