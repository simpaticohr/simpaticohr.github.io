-- Migration 054: Allow public (anon) read access to companies for careers page
-- 
-- PROBLEM: The careers page (careers.html) uses the Supabase anon key to fetch
-- company branding (name, logo, colors) and subscription_plan. But RLS only
-- allows authenticated users or service_role to read from companies.
-- Result: careers page gets 0 rows → no branding → subscription_plan defaults
-- to 'trial' → 48-hour trial guard filters out ALL jobs → empty careers page.
--
-- FIX: Add a SELECT policy for the anon role on companies, restricted to
-- active companies only. This exposes rows but the SELECT clause in the
-- frontend query already limits columns to safe public fields.
-- Also add anon read for jobs so public careers pages can list open positions.

-- ─── 1. PUBLIC READ POLICY ON COMPANIES (for careers page branding) ──────────

DROP POLICY IF EXISTS "public_read_active_companies" ON public.companies;
CREATE POLICY "public_read_active_companies" ON public.companies
  FOR SELECT TO anon
  USING (is_active = true);

COMMENT ON POLICY "public_read_active_companies" ON public.companies IS
  'Allows unauthenticated (anon) users to read active company profiles for public careers pages, job listings, and branded apply pages.';

-- ─── 2. PUBLIC READ POLICY ON JOBS (for careers page listings) ───────────────
-- Jobs may already be readable via anon, but ensure it explicitly exists.

DROP POLICY IF EXISTS "public_read_active_jobs" ON public.jobs;
CREATE POLICY "public_read_active_jobs" ON public.jobs
  FOR SELECT TO anon
  USING (is_active = true AND status IN ('open', 'active'));

COMMENT ON POLICY "public_read_active_jobs" ON public.jobs IS
  'Allows unauthenticated users to read active/open jobs for public careers pages and job detail pages.';

-- ─── 3. ENSURE DEFAULT TENANT EXISTS IN COMPANIES TABLE ─────────────────────
-- The hardcoded default tenant a0000000-... is used when no company_id param
-- is provided. It needs a real row so branding and plan checks work.

INSERT INTO public.companies (id, name, email, subscription_plan, is_active)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Simpatico HR',
  'admin@simpaticohr.in',
  'enterprise',
  true
)
ON CONFLICT (id) DO UPDATE SET
  subscription_plan = EXCLUDED.subscription_plan,
  is_active = EXCLUDED.is_active;

-- ─── 4. VERIFY ──────────────────────────────────────────────────────────────
-- After running this migration, test:
--   1. Visit careers.html (no params) → should show all Simpatico HR jobs
--   2. Visit careers.html?company_id=<uuid> → should show that company's jobs
--   3. Company name should appear in hero header
--   4. Paid companies should show all jobs (no 48h filter)
