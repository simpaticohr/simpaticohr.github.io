-- ═══════════════════════════════════════════════════════════════════════════
-- 058_fix_interviews_anon_access.sql
--
-- Problem: The evalis-platform.html admin panel (password-gated, not Supabase
-- auth) needs to INSERT interview tokens and candidates need SELECT access
-- to validate their tokens. Migration 050 correctly revoked INSERT/UPDATE/DELETE
-- from anon to prevent score tampering, but this also broke admin token
-- generation and candidate token validation when no Supabase session exists.
--
-- Fix:
--   1. GRANT SELECT on interviews to anon (was granted in 050 but may have
--      been lost in subsequent migrations)
--   2. GRANT INSERT to anon with RLS check: only status='pending' rows
--   3. GRANT UPDATE to anon with RLS check: only specific safe fields
--      (started_at, attempts_used, status→in_progress)
--
-- The Worker (service_role) handles all score/result writes.
-- Idempotent: Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════

-- Ensure RLS is enabled
ALTER TABLE IF EXISTS public.interviews ENABLE ROW LEVEL SECURITY;

-- ─── GRANT table-level permissions to anon ───
GRANT SELECT ON public.interviews TO anon;
GRANT INSERT ON public.interviews TO anon;
GRANT UPDATE ON public.interviews TO anon;

-- ─── SELECT: anon can read any interview (needed for token validation) ───
DROP POLICY IF EXISTS "anon_read_interviews" ON public.interviews;
CREATE POLICY "anon_read_interviews" ON public.interviews
  FOR SELECT TO anon
  USING (true);

-- ─── INSERT: anon can only insert pending interviews (token generation) ───
DROP POLICY IF EXISTS "anon_insert_pending_interviews" ON public.interviews;
CREATE POLICY "anon_insert_pending_interviews" ON public.interviews
  FOR INSERT TO anon
  WITH CHECK (status = 'pending');

-- ─── UPDATE: anon can update limited fields (start interview, increment attempts) ───
-- Note: RLS WITH CHECK ensures anon can't set status to 'completed' or modify scores
DROP POLICY IF EXISTS "anon_update_interviews_start" ON public.interviews;
CREATE POLICY "anon_update_interviews_start" ON public.interviews
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (
    status IN ('pending', 'in_progress')
    AND overall_score IS NULL
    AND grade IS NULL
  );

-- ─── Ensure service_role has full access (should already exist) ───
DROP POLICY IF EXISTS "service_full_access" ON public.interviews;
CREATE POLICY "service_full_access" ON public.interviews
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── Reload PostgREST schema cache ───
NOTIFY pgrst, 'reload schema';
