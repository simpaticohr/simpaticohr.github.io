-- Migration 042: Allow super_admin and superadmin users to select all companies (for tenant switching)
BEGIN;

DROP POLICY IF EXISTS "superadmin_select_all_companies" ON public.companies;
CREATE POLICY "superadmin_select_all_companies" ON public.companies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  );

COMMIT;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
