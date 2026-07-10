-- Migration 036: Fix attendance_records RLS for upsert operations
-- Problem: "Mark All Present" and "Geo Check-In" buttons cause
--          "new row violates row-level security policy" errors.
-- Root cause: Missing WITH CHECK on service_role policy, and no UPDATE
--             policy for authenticated role (needed by upsert/merge-duplicates).

-- 1. Fix the service_role policy: add WITH CHECK (true)
DROP POLICY IF EXISTS "Service role full access" ON attendance_records;
DROP POLICY IF EXISTS "service_full_access" ON attendance_records;
CREATE POLICY "service_full_access" ON attendance_records
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. Add UPDATE policy for authenticated users (upsert merge-duplicates requires it)
DROP POLICY IF EXISTS "tenant_update_attendance" ON attendance_records;
CREATE POLICY "tenant_update_attendance" ON attendance_records
  FOR UPDATE TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  )
  WITH CHECK (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- 3. Ensure the INSERT policy also exists with WITH CHECK
DROP POLICY IF EXISTS "tenant_insert_attendance" ON attendance_records;
CREATE POLICY "tenant_insert_attendance" ON attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );
