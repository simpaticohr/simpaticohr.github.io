-- ============================================================
-- Simpatico HR Platform — New Features (Expenses, Offboarding, Pulse Surveys)
-- ============================================================

-- ════════════════════════════════════════════════════════
-- EXPENSES & REIMBURSEMENTS
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL, -- references companies(id)
  amount          NUMERIC(10,2) NOT NULL,
  currency        TEXT DEFAULT 'USD',
  category        TEXT DEFAULT 'general' CHECK (category IN ('travel','meals','office_supplies','software','general')),
  vendor          TEXT,
  expense_date    DATE,
  description     TEXT,
  receipt_key     TEXT,   -- R2 object key
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
  approver_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_employee ON expenses(employee_id);

-- ════════════════════════════════════════════════════════
-- OFFBOARDING & EXIT INTERVIEWS
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS offboarding_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL,
  resignation_date DATE,
  last_working_day DATE,
  reason          TEXT,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  exit_interview_notes TEXT,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offboarding_tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offboarding_record_id UUID NOT NULL REFERENCES offboarding_records(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  category              TEXT DEFAULT 'general' CHECK (category IN ('it_recovery','hr','payroll','general')),
  assigned_to           UUID REFERENCES employees(id),
  status                TEXT DEFAULT 'pending' CHECK (status IN ('pending','done','skipped')),
  completed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_offboarding_company ON offboarding_records(company_id);

-- ════════════════════════════════════════════════════════
-- PULSE SURVEYS
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pulse_surveys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  title           TEXT NOT NULL,
  questions       JSONB DEFAULT '[]', -- array of question objects
  status          TEXT DEFAULT 'active' CHECK (status IN ('draft','active','closed')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pulse_survey_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id       UUID NOT NULL REFERENCES pulse_surveys(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  answers         JSONB DEFAULT '{}', -- key-value of question -> answer
  sentiment_score NUMERIC(5,2), -- AI evaluated sentiment (-1.0 to 1.0 or 0 to 100)
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (survey_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_surveys_company ON pulse_surveys(company_id);

-- ════════════════════════════════════════════════════════
-- TRIGGERS & RLS
-- ════════════════════════════════════════════════════════

CREATE TRIGGER t_expenses_updated BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_offboarding_updated BEFORE UPDATE ON offboarding_records FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulse_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulse_survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service full access expenses" ON expenses FOR ALL TO service_role USING (true);
CREATE POLICY "Auth users read expenses" ON expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert expenses" ON expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users update expenses" ON expenses FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Service full access offboarding" ON offboarding_records FOR ALL TO service_role USING (true);
CREATE POLICY "Auth users read offboarding" ON offboarding_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert offboarding" ON offboarding_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users update offboarding" ON offboarding_records FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Service full access offboarding_tasks" ON offboarding_tasks FOR ALL TO service_role USING (true);
CREATE POLICY "Auth users read offboarding_tasks" ON offboarding_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users update offboarding_tasks" ON offboarding_tasks FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Service full access pulse_surveys" ON pulse_surveys FOR ALL TO service_role USING (true);
CREATE POLICY "Auth users read pulse_surveys" ON pulse_surveys FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service full access pulse_responses" ON pulse_survey_responses FOR ALL TO service_role USING (true);
CREATE POLICY "Auth users insert pulse_responses" ON pulse_survey_responses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users read pulse_responses" ON pulse_survey_responses FOR SELECT TO authenticated USING (true);
