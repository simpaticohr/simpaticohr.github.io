-- ============================================================================
-- Simpatico HR — Tenant Isolation Diagnostic & Fix
-- ============================================================================
-- Run this in your Supabase SQL Editor to diagnose and fix the tenant leak.
-- Step 1: DIAGNOSE (read-only queries)
-- Step 2: FIX (commented out — uncomment after reviewing)
-- ============================================================================

-- ─── STEP 1: DIAGNOSE ─────────────────────────────────────────────────────

-- 1a. Show ALL users and their company assignments
SELECT 
  u.id, 
  u.email, 
  u.role, 
  u.company_id, 
  u.auth_id,
  c.name AS company_name, 
  c.email AS company_email
FROM public.users u
LEFT JOIN public.companies c ON u.company_id = c.id
ORDER BY u.company_id, u.email;

-- 1b. Check if multiple users share the same company_id (potential leak)
SELECT 
  c.id AS company_id,
  c.name AS company_name,
  c.email AS company_owner_email,
  count(u.id) AS user_count,
  string_agg(u.email, ', ') AS member_emails
FROM public.companies c
LEFT JOIN public.users u ON u.company_id = c.id
GROUP BY c.id, c.name, c.email
HAVING count(u.id) > 1
ORDER BY user_count DESC;

-- 1c. Check users that should NOT belong to a company
-- (Their email domain doesn't match company owner's email domain)
SELECT 
  u.email AS user_email,
  u.role,
  c.email AS company_email,
  c.name AS company_name,
  CASE 
    WHEN split_part(u.email, '@', 2) != split_part(c.email, '@', 2) 
    THEN '⚠️ DOMAIN MISMATCH - possible leak'
    ELSE '✅ OK'
  END AS status
FROM public.users u
JOIN public.companies c ON u.company_id = c.id
WHERE u.role IN ('hr', 'hr_manager', 'company_admin', 'interviewer')
ORDER BY c.id, u.email;

-- 1d. Check if get_my_tenant_id() function exists and works
SELECT routine_name, security_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_name = 'get_my_tenant_id';

-- 1e. Check RLS status on critical tables
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('jobs', 'interviews', 'job_applications', 'employees', 'users', 'companies')
ORDER BY tablename;

-- 1f. List all RLS policies on critical tables
SELECT tablename, policyname, roles, cmd, 
  LEFT(qual, 100) AS using_clause
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('jobs', 'interviews', 'job_applications', 'employees')
ORDER BY tablename, policyname;
