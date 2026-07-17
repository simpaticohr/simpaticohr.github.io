-- Migration 044: Allow super_admin and superadmin users full access to all consulting tables (for tenant switching)
BEGIN;

-- 1. consulting_projects
DROP POLICY IF EXISTS "superadmin_all_consulting_projects" ON public.consulting_projects;
CREATE POLICY "superadmin_all_consulting_projects" ON public.consulting_projects
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  );

-- 2. consulting_assessments
DROP POLICY IF EXISTS "superadmin_all_consulting_assessments" ON public.consulting_assessments;
CREATE POLICY "superadmin_all_consulting_assessments" ON public.consulting_assessments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  );

-- 3. consulting_swot
DROP POLICY IF EXISTS "superadmin_all_consulting_swot" ON public.consulting_swot;
CREATE POLICY "superadmin_all_consulting_swot" ON public.consulting_swot
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  );

-- 4. consulting_kpis
DROP POLICY IF EXISTS "superadmin_all_consulting_kpis" ON public.consulting_kpis;
CREATE POLICY "superadmin_all_consulting_kpis" ON public.consulting_kpis
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  );

-- 5. consulting_kpi_history
DROP POLICY IF EXISTS "superadmin_all_consulting_kpi_history" ON public.consulting_kpi_history;
CREATE POLICY "superadmin_all_consulting_kpi_history" ON public.consulting_kpi_history
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  );

-- 6. consulting_documents
DROP POLICY IF EXISTS "superadmin_all_consulting_documents" ON public.consulting_documents;
CREATE POLICY "superadmin_all_consulting_documents" ON public.consulting_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  );

-- 7. consulting_meetings
DROP POLICY IF EXISTS "superadmin_all_consulting_meetings" ON public.consulting_meetings;
CREATE POLICY "superadmin_all_consulting_meetings" ON public.consulting_meetings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  );

-- 8. consulting_activity
DROP POLICY IF EXISTS "superadmin_all_consulting_activity" ON public.consulting_activity;
CREATE POLICY "superadmin_all_consulting_activity" ON public.consulting_activity
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_id = auth.uid() 
      AND role IN ('super_admin', 'superadmin')
    )
  );

COMMIT;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
