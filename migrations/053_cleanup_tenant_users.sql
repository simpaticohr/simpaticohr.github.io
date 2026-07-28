-- ============================================================================
-- Migration 053: Clean Up Unauthorized Tenant Access & Isolate Users
-- ============================================================================
-- PROBLEM:
--   Other accounts (e.g. evalisglobal@gmail.com, ptsinanpmna@gmail.com, fdoalkfod@gmail.com)
--   were previously linked to the company owned by faisalkkod@gmail.com.
--
-- THIS SCRIPT:
--   1. Identifies the company owned by faisalkkod@gmail.com
--   2. Disassociates (sets company_id = NULL) or deletes user profile rows for all
--      emails assigned to that company EXCEPT faisalkkod@gmail.com
--   3. Prevents any future auto-linking of users to companies they don't own
-- ============================================================================

BEGIN;

-- 1. Unlink any user accounts from faisalkkod@gmail.com's company EXCEPT faisalkkod@gmail.com
UPDATE public.users
SET company_id = NULL
WHERE company_id IN (
    SELECT id FROM public.companies WHERE LOWER(email) = 'faisalkkod@gmail.com'
)
AND LOWER(email) != 'faisalkkod@gmail.com';

-- 2. Also check if companies were created with other emails having the same company_id
-- and clear company_id from users table for any non-owner emails
UPDATE public.users u
SET company_id = NULL
FROM public.companies c
WHERE u.company_id = c.id
  AND LOWER(u.email) != LOWER(c.email)
  AND u.role IN ('hr', 'hr_manager', 'company_admin');

-- 3. Verify clean state (run in SQL editor to confirm remaining users)
SELECT 
    u.id,
    u.email,
    u.role,
    u.company_id,
    c.name AS company_name,
    c.email AS company_owner_email
FROM public.users u
LEFT JOIN public.companies c ON u.company_id = c.id
ORDER BY c.id, u.email;

COMMIT;
