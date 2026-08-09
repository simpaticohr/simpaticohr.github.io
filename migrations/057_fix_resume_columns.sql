-- ═══════════════════════════════════════════════════════════════════════════════
-- SIMPATICO HR — FIX RESUME COLUMNS & POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════
-- Fixes: Resumes uploaded during candidate registration are never persisted
-- because the target columns and RLS UPDATE policies don't exist.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Add resume columns to users table ───────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS resume_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS resume_text TEXT;

-- ─── 2. Add resume columns to candidate_profiles table ──────────────────────
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS resume_url TEXT;
ALTER TABLE public.candidate_profiles ADD COLUMN IF NOT EXISTS resume_text TEXT;

-- ─── 3. UPDATE policy on candidate_profiles for own profile ─────────────────
-- candidate_profiles.user_id stores the users-table PK (not auth.uid()),
-- so we join through users to verify ownership.
DROP POLICY IF EXISTS "candidate_profiles_update_own" ON public.candidate_profiles;
CREATE POLICY "candidate_profiles_update_own" ON public.candidate_profiles
  FOR UPDATE TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Also allow INSERT for authenticated users creating their own profile
DROP POLICY IF EXISTS "candidate_profiles_insert_own" ON public.candidate_profiles;
CREATE POLICY "candidate_profiles_insert_own" ON public.candidate_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ─── 4. Storage policies for documents bucket (resume uploads) ──────────────
-- Ensure the bucket exists (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
DROP POLICY IF EXISTS "auth_upload_documents" ON storage.objects;
CREATE POLICY "auth_upload_documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents');

-- Allow public read access (resumes are stored with public URLs)
DROP POLICY IF EXISTS "public_read_documents" ON storage.objects;
CREATE POLICY "public_read_documents" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'documents');

-- Allow authenticated users to overwrite/update their own uploads
DROP POLICY IF EXISTS "auth_update_documents" ON storage.objects;
CREATE POLICY "auth_update_documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'documents');
