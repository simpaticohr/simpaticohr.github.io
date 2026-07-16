BEGIN;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.company_id
  FROM public.users AS u
  WHERE u.auth_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_company_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE u.auth_id = auth.uid()
      AND u.role IN ('owner', 'admin', 'consulting_admin', 'hr_admin')
  )
$$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_is_company_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_company_admin() TO authenticated, service_role;

DO $$
DECLARE
  table_name TEXT;
  tenant_tables TEXT[] := ARRAY[
    'departments','employees','employee_documents','onboarding_templates',
    'onboarding_template_tasks','onboarding_records','onboarding_tasks',
    'training_courses','training_enrollments','training_paths','training_path_courses',
    'review_cycles','performance_reviews','performance_goals','leave_requests',
    'attendance_records','hr_policies','hr_tickets','employee_salaries',
    'payroll_deductions','payroll_runs','payslips','org_profiles',
    'automation_rules','automation_logs','subscriptions','payment_transactions'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id UUID', table_name);
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', table_name, table_name || '_company_id_fkey');
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE', table_name, table_name || '_company_id_fkey');
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(company_id)', 'idx_' || table_name || '_company_id', table_name);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', table_name);
    END IF;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.consulting_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'strategy',
  stage TEXT NOT NULL DEFAULT 'discovery', progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  milestone TEXT, start_date DATE DEFAULT CURRENT_DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.consulting_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL, overall_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  category_scores JSONB NOT NULL DEFAULT '{}', answers JSONB NOT NULL DEFAULT '[]', recommendations JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.consulting_swot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL, type TEXT NOT NULL CHECK (type IN ('strengths','weaknesses','opportunities','threats')),
  content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.consulting_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL, name TEXT NOT NULL, current_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  target_value NUMERIC(14,2) NOT NULL DEFAULT 100, unit TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.consulting_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'report',
  doc_type TEXT NOT NULL DEFAULT 'pdf', notes TEXT, file_path TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.consulting_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL, title TEXT NOT NULL, date DATE NOT NULL, time TIME NOT NULL DEFAULT '10:00',
  type TEXT NOT NULL DEFAULT 'strategy', status TEXT NOT NULL DEFAULT 'scheduled', notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.consulting_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, action TEXT NOT NULL, entity TEXT, entity_id UUID, detail TEXT,
  read BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.consulting_kpi_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kpi_id UUID NOT NULL REFERENCES public.consulting_kpis(id) ON DELETE CASCADE, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(), value NUMERIC(14,2) NOT NULL
);

DO $$
DECLARE
  t RECORD;
  p RECORD;
BEGIN
  FOR t IN
    SELECT c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col ON col.table_schema = n.nspname AND col.table_name = c.relname AND col.column_name = 'company_id'
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'users'
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(company_id)', 'idx_' || t.table_name || '_company_id', t.table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t.table_name);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t.table_name LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t.table_name);
    END LOOP;
    EXECUTE format('CREATE POLICY tenant_select ON public.%I FOR SELECT TO authenticated USING (company_id = public.current_company_id())', t.table_name);
    EXECUTE format('CREATE POLICY tenant_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (company_id = public.current_company_id())', t.table_name);
    EXECUTE format('CREATE POLICY tenant_update ON public.%I FOR UPDATE TO authenticated USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id())', t.table_name);
    EXECUTE format('CREATE POLICY tenant_delete ON public.%I FOR DELETE TO authenticated USING (company_id = public.current_company_id() AND public.current_user_is_company_admin())', t.table_name);
  END LOOP;
END $$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;

DO $$ DECLARE p RECORD; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='users' LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', p.policyname); END LOOP;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='companies' LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.companies', p.policyname); END LOOP;
END $$;

CREATE POLICY users_same_company_select ON public.users FOR SELECT TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY users_self_update ON public.users FOR UPDATE TO authenticated USING (auth_id = auth.uid()) WITH CHECK (auth_id = auth.uid() AND company_id = public.current_company_id());
CREATE POLICY companies_own_select ON public.companies FOR SELECT TO authenticated USING (id = public.current_company_id());
CREATE POLICY companies_admin_update ON public.companies FOR UPDATE TO authenticated USING (id = public.current_company_id() AND public.current_user_is_company_admin()) WITH CHECK (id = public.current_company_id());

-- Prevent a child row from referencing a KPI owned by another company.
ALTER TABLE public.consulting_kpi_history
  DROP CONSTRAINT IF EXISTS consulting_kpi_history_kpi_id_fkey;
ALTER TABLE public.consulting_kpis
  ADD CONSTRAINT consulting_kpis_id_company_unique UNIQUE (id, company_id);
ALTER TABLE public.consulting_kpi_history
  ADD CONSTRAINT consulting_kpi_history_kpi_company_fkey
  FOREIGN KEY (kpi_id, company_id)
  REFERENCES public.consulting_kpis(id, company_id)
  ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_consulting_kpi_history_kpi_company
  ON public.consulting_kpi_history(kpi_id, company_id);

-- Anonymous clients receive no direct table privileges. Authenticated grants remain
-- subject to the forced RLS policies above.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
