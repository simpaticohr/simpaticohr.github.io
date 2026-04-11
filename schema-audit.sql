-- ============================================================
-- SCHEMA AUDIT - Payroll & Assessment Tables
-- Run in Supabase SQL editor to validate schema integrity
-- ============================================================

-- 1. Check all payroll-related tables exist
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN (
  'employees', 'employee_salaries', 'payroll_deductions', 'payroll_runs', 'payslips', 'leave_requests'
);

-- 2. Verify company_id columns exist on payroll tables (added by migrations)
SELECT table_name, column_name FROM information_schema.columns 
WHERE table_name IN ('payslips', 'payroll_runs', 'employee_salaries', 'payroll_deductions')
AND column_name IN ('company_id', 'tenant_id')
ORDER BY table_name, column_name;

-- 3. Check RLS is enabled on payroll tables
SELECT tablename FROM pg_tables 
WHERE schemaname='public' AND tablename IN ('payslips', 'payroll_deductions', 'payroll_runs', 'employee_salaries')
AND rowsecurity = true;

-- 4. Verify payslips RLS policies (service role + HR insert + employee read)
SELECT schemaname, tablename, policyname FROM pg_policies 
WHERE tablename = 'payslips'
ORDER BY policyname;

-- 5. Verify payroll_deductions RLS policies
SELECT schemaname, tablename, policyname FROM pg_policies 
WHERE tablename = 'payroll_deductions'
ORDER BY policyname;

-- 6. Check assessment-related tables exist
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN (
  'hr_policies', 'assessments'
);

-- 7. Verify foreign keys for payroll (migration 002 should have created these)
SELECT constraint_name, table_name, column_name
FROM information_schema.key_column_usage
WHERE table_name IN ('payslips', 'employee_salaries', 'payroll_runs', 'payroll_deductions')
AND constraint_name LIKE '%fkey%'
ORDER BY table_name, constraint_name;

-- 8. Check indexes exist for performance
SELECT tablename, indexname FROM pg_indexes 
WHERE schemaname='public' AND tablename LIKE 'payroll%' OR tablename LIKE 'payslip%'
ORDER BY tablename, indexname;

-- 9. Verify leave_requests has company_id (needed for unpaid leave calculations)
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'leave_requests' 
AND column_name IN ('company_id', 'tenant_id', 'leave_type')
ORDER BY column_name;

-- 10. Summary: Validate all migrations applied successfully
-- (If any query above returns no rows, that indicates a schema problem to fix)
SELECT 
  'Payslips table' as check_item,
  CASE WHEN EXISTS(SELECT 1 FROM pg_tables WHERE tablename='payslips') THEN 'OK' ELSE 'MISSING' END as status
UNION ALL SELECT 'Payslips company_id', CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='company_id') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Payslips RLS enabled', CASE WHEN EXISTS(SELECT 1 FROM pg_tables WHERE tablename='payslips' AND rowsecurity=true) THEN 'OK' ELSE 'DISABLED' END
UNION ALL SELECT 'Payroll deductions table', CASE WHEN EXISTS(SELECT 1 FROM pg_tables WHERE tablename='payroll_deductions') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Leave requests company_id', CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='company_id') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'Employee salaries company_id', CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='employee_salaries' AND column_name='company_id') THEN 'OK' ELSE 'MISSING' END;
