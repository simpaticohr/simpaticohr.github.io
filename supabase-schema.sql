-- ============================================================
-- Simpatico HR Platform — New Modules Schema
-- Run in Supabase SQL editor
-- This extends the existing schema, does NOT modify existing tables
-- ============================================================

-- ── Enable UUID extension (if not already enabled) ──
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ════════════════════════════════════════════════════════
-- DEPARTMENTS (may already exist - use IF NOT EXISTS)
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  manager_id  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════
-- EMPLOYEES
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     TEXT UNIQUE,  -- e.g. EMP-001
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  phone           TEXT,
  job_title       TEXT,
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  manager_id      UUID REFERENCES employees(id) ON DELETE SET NULL,
  employment_type TEXT DEFAULT 'full_time' CHECK (employment_type IN ('full_time','part_time','contractor','intern')),
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','on_leave','terminated','offboarding')),
  start_date      DATE,
  end_date        DATE,
  location        TEXT,
  avatar_url      TEXT,    -- R2 key
  salary          NUMERIC(12,2),
  currency        TEXT DEFAULT 'USD',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════
-- EMPLOYEE DOCUMENTS (R2 backed)
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS employee_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         TEXT DEFAULT 'general',   -- contract, id, certificate, etc.
  file_key     TEXT NOT NULL,            -- R2 object key
  uploaded_by  UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════
-- ONBOARDING
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS onboarding_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onboarding_template_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  category     TEXT DEFAULT 'general',
  due_days     INT DEFAULT 7,
  description  TEXT
);

CREATE TABLE IF NOT EXISTS onboarding_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  template_id     UUID REFERENCES onboarding_templates(id),
  buddy_id        UUID REFERENCES employees(id),
  stage           TEXT DEFAULT 'not_started' CHECK (stage IN ('not_started','week_1','in_progress','completed')),
  completion_pct  INT DEFAULT 0,
  start_date      DATE,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_record_id  UUID NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  category              TEXT DEFAULT 'general',
  due_date              DATE,
  assigned_to           UUID REFERENCES employees(id),
  status                TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','skipped')),
  completed_at          TIMESTAMPTZ,
  notes                 TEXT
);

-- ════════════════════════════════════════════════════════
-- TRAINING & LMS
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS training_courses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT DEFAULT 'general' CHECK (category IN ('compliance','technical','leadership','soft_skills','onboarding','general')),
  duration_hours NUMERIC(5,1),
  content_url    TEXT,
  thumbnail_key  TEXT,   -- R2 key
  is_required    BOOLEAN DEFAULT FALSE,
  created_by     UUID,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_enrollments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  status       TEXT DEFAULT 'enrolled' CHECK (status IN ('enrolled','in_progress','completed','failed','cancelled')),
  progress     INT DEFAULT 0,  -- percentage
  enrolled_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  due_date     DATE,
  UNIQUE (employee_id, course_id)
);

CREATE TABLE IF NOT EXISTS training_paths (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  role        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_path_courses (
  path_id   UUID REFERENCES training_paths(id) ON DELETE CASCADE,
  course_id UUID REFERENCES training_courses(id) ON DELETE CASCADE,
  order_num INT DEFAULT 0,
  PRIMARY KEY (path_id, course_id)
);

-- ════════════════════════════════════════════════════════
-- PERFORMANCE
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS review_cycles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  type       TEXT DEFAULT 'annual' CHECK (type IN ('annual','mid_year','quarterly','probation','360')),
  scope      TEXT DEFAULT 'all',
  status     TEXT DEFAULT 'active' CHECK (status IN ('draft','active','closed')),
  start_date DATE,
  end_date   DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reviewer_id  UUID REFERENCES employees(id),
  cycle_id     UUID REFERENCES review_cycles(id),
  period       TEXT,
  score        INT CHECK (score BETWEEN 0 AND 100),
  status       TEXT DEFAULT 'draft' CHECK (status IN ('draft','in_progress','submitted','completed')),
  strengths    TEXT,
  improvements TEXT,
  comments     TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_goals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  period       TEXT,
  progress     INT DEFAULT 0,
  status       TEXT DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','achieved','cancelled')),
  due_date     DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════
-- HR OPS — LEAVE
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS leave_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('annual','sick','parental','unpaid','other')),
  from_date    DATE NOT NULL,
  to_date      DATE NOT NULL,
  days         NUMERIC(5,1),
  reason       TEXT,
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  approver_id  UUID REFERENCES employees(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════
-- HR OPS — POLICIES
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hr_policies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  category    TEXT DEFAULT 'hr',
  version     TEXT DEFAULT '1.0',
  file_key    TEXT NOT NULL,   -- R2 key
  created_by  UUID,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════
-- HR OPS — TICKETS
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS hr_tickets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number  TEXT UNIQUE,
  employee_id    UUID REFERENCES employees(id),
  category       TEXT,
  subject        TEXT NOT NULL,
  description    TEXT,
  priority       TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status         TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assignee_id    UUID REFERENCES employees(id),
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Auto ticket number
CREATE OR REPLACE FUNCTION set_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ticket_number := 'TKT-' || LPAD(nextval('ticket_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS ticket_seq START 1000;
DROP TRIGGER IF EXISTS ticket_number_trigger ON hr_tickets;
CREATE TRIGGER ticket_number_trigger BEFORE INSERT ON hr_tickets FOR EACH ROW EXECUTE FUNCTION set_ticket_number();

-- ════════════════════════════════════════════════════════
-- PAYROLL
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS employee_salaries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  base_salary     NUMERIC(12,2) NOT NULL,
  currency        TEXT DEFAULT 'USD',
  employment_type TEXT DEFAULT 'full_time',
  effective_date  DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_deductions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,  -- tax, health, pension, etc.
  amount       NUMERIC(10,2) NOT NULL,
  frequency    TEXT DEFAULT 'monthly' CHECK (frequency IN ('once','weekly','biweekly','monthly')),
  start_date   DATE,
  end_date     DATE,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period           TEXT NOT NULL,
  type             TEXT DEFAULT 'monthly' CHECK (type IN ('monthly','biweekly','weekly')),
  pay_date         DATE,
  total_gross      NUMERIC(14,2),
  total_net        NUMERIC(14,2),
  deductions_total NUMERIC(14,2),
  employee_count   INT,
  status           TEXT DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  notes            TEXT,
  run_by_id        UUID REFERENCES employees(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payslips (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  payroll_run_id   UUID REFERENCES payroll_runs(id),
  period           TEXT NOT NULL,
  gross_pay        NUMERIC(12,2),
  deductions_total NUMERIC(10,2),
  net_pay          NUMERIC(12,2),
  status           TEXT DEFAULT 'generated' CHECK (status IN ('generated','sent','paid')),
  payslip_key      TEXT,   -- R2 PDF key
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════
-- ORG PROFILES (SaaS multi-tenancy - one per org)
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS org_profiles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  logo_key   TEXT,
  domain     TEXT UNIQUE,
  plan       TEXT DEFAULT 'starter',
  settings   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_employees_status       ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_department   ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager      ON employees(manager_id);
CREATE INDEX IF NOT EXISTS idx_leave_employee         ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_status           ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_perf_employee          ON performance_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_perf_cycle             ON performance_reviews(cycle_id);
CREATE INDEX IF NOT EXISTS idx_training_employee      ON training_enrollments(employee_id);
CREATE INDEX IF NOT EXISTS idx_training_course        ON training_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employee      ON payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_period        ON payslips(period);
CREATE INDEX IF NOT EXISTS idx_onboarding_employee    ON onboarding_records(employee_id);

-- ════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (multi-tenant)
-- ════════════════════════════════════════════════════════
ALTER TABLE employees          ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips           ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_records ENABLE ROW LEVEL SECURITY;

-- Service role bypass (used by Cloudflare Worker)
CREATE POLICY "Service role full access" ON employees          FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access" ON leave_requests     FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access" ON performance_reviews FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access" ON training_enrollments FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access" ON payslips           FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access" ON onboarding_records FOR ALL TO service_role USING (true);

-- Authenticated users can read employees
CREATE POLICY "Auth users read employees" ON employees
  FOR SELECT TO authenticated USING (true);

-- Employees can read own payslips
CREATE POLICY "Own payslips" ON payslips
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM employees WHERE email = auth.jwt()->>'email'));

-- HR staff can insert payslips (for payroll processing)
CREATE POLICY "HR insert payslips" ON payslips
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN users u ON e.id = u.auth_id
      WHERE e.email = auth.jwt()->>'email'
      AND u.role IN ('hr', 'hr_manager', 'company_admin', 'payroll', 'admin', 'superadmin')
    )
  );

-- ════════════════════════════════════════════════════════
-- FUNCTIONS
-- ════════════════════════════════════════════════════════

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_employees_updated       BEFORE UPDATE ON employees           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_leave_updated           BEFORE UPDATE ON leave_requests      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_perf_updated            BEFORE UPDATE ON performance_reviews FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Recalculate onboarding completion % when tasks change
CREATE OR REPLACE FUNCTION update_onboarding_pct()
RETURNS TRIGGER AS $$
DECLARE
  total  INT;
  done   INT;
  pct    INT;
  stage  TEXT;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'done')
  INTO total, done
  FROM onboarding_tasks
  WHERE onboarding_record_id = COALESCE(NEW.onboarding_record_id, OLD.onboarding_record_id);

  pct := CASE WHEN total > 0 THEN ROUND(done::NUMERIC/total*100) ELSE 0 END;
  stage := CASE
    WHEN pct = 0 THEN 'not_started'
    WHEN pct < 30 THEN 'week_1'
    WHEN pct < 100 THEN 'in_progress'
    ELSE 'completed'
  END;

  UPDATE onboarding_records
  SET completion_pct = pct, stage = stage,
      completed_at = CASE WHEN pct = 100 THEN NOW() ELSE NULL END
  WHERE id = COALESCE(NEW.onboarding_record_id, OLD.onboarding_record_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_onboarding_pct
  AFTER INSERT OR UPDATE OR DELETE ON onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION update_onboarding_pct();
