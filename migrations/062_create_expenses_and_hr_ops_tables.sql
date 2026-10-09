-- ============================================================================
-- Migration 062: Create expenses, offboarding, and HR operations tables
-- ============================================================================
-- Fixes PGRST205: "Could not find the table 'public.expenses' in the schema cache"
-- Creates public.expenses, offboarding_records, hr_policies, and hr_tickets
-- with multi-tenant isolation, proper RLS policies, and schema cache reload.
-- ============================================================================

BEGIN;

-- 1. Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  expense_date DATE DEFAULT CURRENT_DATE,
  vendor TEXT,
  category TEXT DEFAULT 'general',
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  receipt_url TEXT,
  receipt_key TEXT,
  approver_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_in_payslip BOOLEAN DEFAULT false,
  payslip_id UUID REFERENCES public.payslips(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create offboarding_records table
CREATE TABLE IF NOT EXISTS public.offboarding_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  resignation_date DATE,
  last_working_day DATE,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create hr_policies table
CREATE TABLE IF NOT EXISTS public.hr_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  name TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  version TEXT DEFAULT '1.0',
  file_key TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create hr_tickets table
CREATE TABLE IF NOT EXISTS public.hr_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN',
  ticket_number TEXT,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  assignee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'general',
  subject TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON public.expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_emp ON public.expenses(employee_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_created ON public.expenses(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_offboarding_tenant ON public.offboarding_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_emp ON public.offboarding_records(employee_id);

CREATE INDEX IF NOT EXISTS idx_policies_tenant ON public.hr_policies(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tickets_tenant ON public.hr_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_emp ON public.hr_tickets(employee_id);

-- 6. Row Level Security
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offboarding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_tickets ENABLE ROW LEVEL SECURITY;

-- Service role bypass
DROP POLICY IF EXISTS "service_full_access" ON public.expenses;
CREATE POLICY "service_full_access" ON public.expenses FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.offboarding_records;
CREATE POLICY "service_full_access" ON public.offboarding_records FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.hr_policies;
CREATE POLICY "service_full_access" ON public.hr_policies FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_full_access" ON public.hr_tickets;
CREATE POLICY "service_full_access" ON public.hr_tickets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated multi-tenant policies
DROP POLICY IF EXISTS "tenant_all_expenses" ON public.expenses;
DROP POLICY IF EXISTS "tenant_isolation_expenses" ON public.expenses;
DROP POLICY IF EXISTS "Auth users read expenses" ON public.expenses;
DROP POLICY IF EXISTS "Auth users insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Auth users update expenses" ON public.expenses;
CREATE POLICY "tenant_all_expenses" ON public.expenses FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id() OR tenant_id = 'SIMP_PRO_MAIN')
  WITH CHECK (tenant_id::text = public.get_my_tenant_id() OR tenant_id = 'SIMP_PRO_MAIN');

DROP POLICY IF EXISTS "tenant_all_offboarding" ON public.offboarding_records;
DROP POLICY IF EXISTS "tenant_isolation_offboarding" ON public.offboarding_records;
CREATE POLICY "tenant_all_offboarding" ON public.offboarding_records FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id() OR tenant_id = 'SIMP_PRO_MAIN')
  WITH CHECK (tenant_id::text = public.get_my_tenant_id() OR tenant_id = 'SIMP_PRO_MAIN');

DROP POLICY IF EXISTS "tenant_all_policies" ON public.hr_policies;
DROP POLICY IF EXISTS "tenant_isolation_hr_policies" ON public.hr_policies;
CREATE POLICY "tenant_all_policies" ON public.hr_policies FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id() OR tenant_id = 'SIMP_PRO_MAIN')
  WITH CHECK (tenant_id::text = public.get_my_tenant_id() OR tenant_id = 'SIMP_PRO_MAIN');

DROP POLICY IF EXISTS "tenant_all_tickets" ON public.hr_tickets;
DROP POLICY IF EXISTS "tenant_isolation_hr_tickets" ON public.hr_tickets;
CREATE POLICY "tenant_all_tickets" ON public.hr_tickets FOR ALL TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id() OR tenant_id = 'SIMP_PRO_MAIN')
  WITH CHECK (tenant_id::text = public.get_my_tenant_id() OR tenant_id = 'SIMP_PRO_MAIN');

-- 7. Permissions
GRANT ALL ON public.expenses TO authenticated, service_role;
GRANT ALL ON public.offboarding_records TO authenticated, service_role;
GRANT ALL ON public.hr_policies TO authenticated, service_role;
GRANT ALL ON public.hr_tickets TO authenticated, service_role;

COMMIT;

-- 8. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
