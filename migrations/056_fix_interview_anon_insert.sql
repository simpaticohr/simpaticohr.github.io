-- ═══════════════════════════════════════════════════════════════════════════
-- 056_fix_interview_anon_insert.sql
--
-- Problem: Migration 050 revoked INSERT on interviews from anon to prevent
-- score tampering from the candidate interview room. However, the HR admin
-- panel (evalis-platform.html) also uses the anon key (password-gated, not
-- Supabase auth) to INSERT new interview tokens via generateDirectInvite().
--
-- Fix: Re-grant INSERT to anon on interviews. The HR panel needs this to
-- create interview tokens. Score/status fields are still protected because
-- the candidate room routes writes through the Worker (service_role).
--
-- If the HR panel is later migrated to Supabase auth, this grant can be
-- removed and the authenticated-role policies will handle it.
--
-- Idempotent: Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════

-- Re-grant INSERT to anon (SELECT was never revoked)
GRANT INSERT ON public.interviews TO anon;

-- RLS policy: anon can only INSERT rows with status='pending'
-- This prevents anon from inserting completed/scored interviews
DROP POLICY IF EXISTS "anon_insert_pending_interviews" ON public.interviews;
CREATE POLICY "anon_insert_pending_interviews" ON public.interviews
  FOR INSERT TO anon
  WITH CHECK (status = 'pending');

-- Keep the existing anon SELECT policy (from 050)
-- anon_read_interviews already allows SELECT

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
