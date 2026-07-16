-- Migration 041: Fix Training Courses and Performance Reviews RLS policies for strict tenant isolation
BEGIN;

-- 1. Correct training_courses RLS policy to enforce tenant isolation using company_id
DROP POLICY IF EXISTS "auth_rw_training_courses" ON public.training_courses;
CREATE POLICY "auth_rw_training_courses" ON public.training_courses
  FOR ALL TO authenticated
  USING (company_id::text = public.get_my_tenant_id())
  WITH CHECK (company_id::text = public.get_my_tenant_id());

-- 2. Correct performance_reviews RLS policy to enforce tenant isolation using employee relation
DROP POLICY IF EXISTS "auth_rw_performance_reviews" ON public.performance_reviews;
CREATE POLICY "auth_rw_performance_reviews" ON public.performance_reviews
  FOR ALL TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE tenant_id::text = public.get_my_tenant_id()
    )
  )
  WITH CHECK (
    employee_id IN (
      SELECT id FROM public.employees WHERE tenant_id::text = public.get_my_tenant_id()
    )
  );

COMMIT;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
