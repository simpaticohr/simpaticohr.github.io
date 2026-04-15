-- ============================================================
-- Simpatico HR Platform — 006 Migration
-- Run in Supabase SQL editor
-- Fixes missing columns from failed migration 001 references
-- (wrong table names: performance_cycles→review_cycles, goals→performance_goals)
-- Also adds missing 'scope' column and attendance_records table
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- 1. FIX: review_cycles missing tenant_id + scope + company_id
--    (Migration 001 line 19 tried "performance_cycles" — wrong name)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.review_cycles ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE public.review_cycles ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE public.review_cycles ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'all';
CREATE INDEX IF NOT EXISTS idx_review_cycles_tenant ON review_cycles(tenant_id);

-- ═══════════════════════════════════════════════════════════
-- 2. FIX: performance_goals missing tenant_id
--    (Migration 001 line 21 tried "goals" — wrong name)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.performance_goals ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
CREATE INDEX IF NOT EXISTS idx_performance_goals_tenant ON performance_goals(tenant_id);

-- ═══════════════════════════════════════════════════════════
-- 3. FIX: training_courses missing company_id
--    (Code fallback at training.js:62 checks for this)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.training_courses ADD COLUMN IF NOT EXISTS company_id TEXT;

-- ═══════════════════════════════════════════════════════════
-- 4. NEW: attendance_records table (referenced by nav but never existed)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in      TIMESTAMPTZ,
  check_out     TIMESTAMPTZ,
  status        TEXT DEFAULT 'present' CHECK (status IN ('present','absent','late','half_day','remote','on_leave')),
  hours_worked  NUMERIC(4,2),
  notes         TEXT,
  tenant_id     TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_tenant ON attendance_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);

-- RLS
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_access" ON attendance_records FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tenant_read_attendance" ON attendance_records
  FOR SELECT TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- ═══════════════════════════════════════════════════════════
-- 5. FIX: Missing RLS policies for review_cycles + performance_goals
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.review_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_goals ENABLE ROW LEVEL SECURITY;

-- Drop if re-running
DROP POLICY IF EXISTS "service_full_access" ON review_cycles;
DROP POLICY IF EXISTS "service_full_access" ON performance_goals;
DROP POLICY IF EXISTS "tenant_read_cycles" ON review_cycles;
DROP POLICY IF EXISTS "tenant_read_goals" ON performance_goals;

CREATE POLICY "service_full_access" ON review_cycles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON performance_goals FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_read_cycles" ON review_cycles
  FOR SELECT TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

CREATE POLICY "tenant_read_goals" ON performance_goals
  FOR SELECT TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- ═══════════════════════════════════════════════════════════
-- 6. FIX: Ensure authenticated INSERT/UPDATE on key tables
--    (Console shows 400 on direct Supabase writes)
-- ═══════════════════════════════════════════════════════════

-- Allow authenticated users to insert leave requests for their tenant
DROP POLICY IF EXISTS "tenant_insert_leave" ON leave_requests;
CREATE POLICY "tenant_insert_leave" ON leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- Allow authenticated users to update leave requests in their tenant
DROP POLICY IF EXISTS "tenant_update_leave" ON leave_requests;
CREATE POLICY "tenant_update_leave" ON leave_requests
  FOR UPDATE TO authenticated
  USING (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- Allow authenticated insert on review_cycles
DROP POLICY IF EXISTS "tenant_insert_cycles" ON review_cycles;
CREATE POLICY "tenant_insert_cycles" ON review_cycles
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = COALESCE(
      (auth.jwt()->'app_metadata'->>'tenant_id'),
      (auth.jwt()->'user_metadata'->>'tenant_id'),
      'SIMP_PRO_MAIN'
    )
  );

-- Allow authenticated insert/read on attendance
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
