-- ============================================================
-- ASSESSMENT SCHEMA FIX - Create proper assessment table
-- Run in Supabase SQL editor
-- ============================================================

-- Create assessments table (replace temporary hr_policies storage)
CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_title TEXT NOT NULL,
  questions JSONB NOT NULL,
  difficulty TEXT CHECK (difficulty IN ('junior', 'mid', 'senior')),
  created_by_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  company_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Service role full access" ON assessments FOR ALL TO service_role USING (true);
CREATE POLICY "Users see own company assessments" ON assessments
  FOR SELECT TO authenticated 
  USING (
    company_id = (
      SELECT company_id FROM users 
      WHERE auth_id = auth.jwt()->>'sub'
      LIMIT 1
    )
  );
CREATE POLICY "HR staff create assessments" ON assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.jwt()->>'sub'
      AND u.role IN ('hr', 'hr_manager', 'company_admin', 'admin', 'superadmin')
    )
    AND company_id = (
      SELECT company_id FROM users 
      WHERE auth_id = auth.jwt()->>'sub'
      LIMIT 1
    )
  );

-- Create candidate_assessments table (for tracking candidate responses & scores)
CREATE TABLE IF NOT EXISTS candidate_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  responses JSONB DEFAULT '{}',
  score NUMERIC(5,2),
  status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'scored')),
  company_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on candidate_assessments
ALTER TABLE candidate_assessments ENABLE ROW LEVEL SECURITY;

-- RLS policies for candidate_assessments
CREATE POLICY "Service role full access" ON candidate_assessments FOR ALL TO service_role USING (true);
CREATE POLICY "HR view candidate assessments" ON candidate_assessments
  FOR SELECT TO authenticated
  USING (
    company_id = (
      SELECT company_id FROM users 
      WHERE auth_id = auth.jwt()->>'sub'
      LIMIT 1
    )
  );
CREATE POLICY "Candidates see own assessments" ON candidate_assessments
  FOR SELECT TO authenticated
  USING (
    candidate_id = (
      SELECT id FROM employees 
      WHERE email = auth.jwt()->>'email'
      LIMIT 1
    )
  );

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_assessments_company ON assessments(company_id);
CREATE INDEX IF NOT EXISTS idx_assessments_created_by ON assessments(created_by_id);
CREATE INDEX IF NOT EXISTS idx_candidate_assessments_assessment ON candidate_assessments(assessment_id);
CREATE INDEX IF NOT EXISTS idx_candidate_assessments_candidate ON candidate_assessments(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_assessments_status ON candidate_assessments(status);
CREATE INDEX IF NOT EXISTS idx_candidate_assessments_company ON candidate_assessments(company_id);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
