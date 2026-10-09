-- ============================================================================
-- Migration 062: Create and Harden expenses, offboarding, and HR operations tables
-- ============================================================================
-- Fixes PGRST205: "Could not find the table 'public.expenses' in the schema cache"
-- and 42703: "column 'tenant_id' does not exist" on pre-existing tables.
-- ============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. EXPENSES TABLE (Create if missing + guarantee tenant_id and columns)
-- ════════════════════════════════════════════════════════════════════════════
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

-- Ensure all required columns exist even if table pre-existed from an older schema
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS expense_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS vendor TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS receipt_key TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS paid_in_payslip BOOLEAN DEFAULT false;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS payslip_id UUID REFERENCES public.payslips(id) ON DELETE SET NULL;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. OFFBOARDING_RECORDS TABLE (Create if missing + guarantee tenant_id)
-- ════════════════════════════════════════════════════════════════════════════
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

ALTER TABLE public.offboarding_records ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE public.offboarding_records ADD COLUMN IF NOT EXISTS resignation_date DATE;
ALTER TABLE public.offboarding_records ADD COLUMN IF NOT EXISTS last_working_day DATE;
ALTER TABLE public.offboarding_records ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.offboarding_records ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.offboarding_records ADD COLUMN IF NOT EXISTS notes TEXT;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. HR_POLICIES TABLE (Create if missing + guarantee tenant_id)
-- ════════════════════════════════════════════════════════════════════════════
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

ALTER TABLE public.hr_policies ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE public.hr_policies ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.hr_policies ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE public.hr_policies ADD COLUMN IF NOT EXISTS version TEXT DEFAULT '1.0';
ALTER TABLE public.hr_policies ADD COLUMN IF NOT EXISTS file_key TEXT;
ALTER TABLE public.hr_policies ADD COLUMN IF NOT EXISTS file_url TEXT;


-- ════════════════════════════════════════════════════════════════════════════
-- 4. HR_TICKETS TABLE (Create if missing + guarantee tenant_id)
-- ════════════════════════════════════════════════════════════════════════════
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

ALTER TABLE public.hr_tickets ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'SIMP_PRO_MAIN';
ALTER TABLE public.hr_tickets ADD COLUMN IF NOT EXISTS ticket_number TEXT;
ALTER TABLE public.hr_tickets ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE public.hr_tickets ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.hr_tickets ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.hr_tickets ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE public.hr_tickets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';


-- ════════════════════════════════════════════════════════════════════════════
-- 5. SAFELY BACKFILL tenant_id FROM company_id (IF company_id EXISTS)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'company_id') THEN
    EXECUTE 'UPDATE public.expenses SET tenant_id = company_id::text WHERE company_id IS NOT NULL AND (tenant_id IS NULL OR tenant_id = ''SIMP_PRO_MAIN'')';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'offboarding_records' AND column_name = 'company_id') THEN
    EXECUTE 'UPDATE public.offboarding_records SET tenant_id = company_id::text WHERE company_id IS NOT NULL AND (tenant_id IS NULL OR tenant_id = ''SIMP_PRO_MAIN'')';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hr_policies' AND column_name = 'company_id') THEN
    EXECUTE 'UPDATE public.hr_policies SET tenant_id = company_id::text WHERE company_id IS NOT NULL AND (tenant_id IS NULL OR tenant_id = ''SIMP_PRO_MAIN'')';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hr_tickets' AND column_name = 'company_id') THEN
    EXECUTE 'UPDATE public.hr_tickets SET tenant_id = company_id::text WHERE company_id IS NOT NULL AND (tenant_id IS NULL OR tenant_id = ''SIMP_PRO_MAIN'')';
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 6. INDEXES
-- ════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON public.expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_emp ON public.expenses(employee_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);

CREATE INDEX IF NOT EXISTS idx_offboarding_tenant ON public.offboarding_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_emp ON public.offboarding_records(employee_id);

CREATE INDEX IF NOT EXISTS idx_policies_tenant ON public.hr_policies(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tickets_tenant ON public.hr_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_emp ON public.hr_tickets(employee_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 7. ROW LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════════════════════
-- 8. PERMISSIONS & SCHEMA CACHE RELOAD
-- ════════════════════════════════════════════════════════════════════════════
GRANT ALL ON public.expenses TO authenticated, service_role;
GRANT ALL ON public.offboarding_records TO authenticated, service_role;
GRANT ALL ON public.hr_policies TO authenticated, service_role;
GRANT ALL ON public.hr_tickets TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
