-- Migration to add tenant_id to training and performance tables to resolve 42703 column not found errors

-- 1. Add to training_courses
ALTER TABLE training_courses ADD COLUMN IF NOT EXISTS tenant_id UUID;
-- Alternatively, if company_id exists instead, we can rename it or copy it:
-- UPDATE training_courses SET tenant_id = company_id WHERE tenant_id IS NULL AND company_id IS NOT NULL;

-- 2. Add to training_enrollments
ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- 3. Add to review_cycles
ALTER TABLE review_cycles ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- 4. Add to performance_reviews
ALTER TABLE performance_reviews ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- 5. Add to performance_goals
ALTER TABLE performance_goals ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Add indexes for better query performance on tenant_id
CREATE INDEX IF NOT EXISTS idx_training_courses_tenant_id ON training_courses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_enrollments_tenant_id ON training_enrollments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_review_cycles_tenant_id ON review_cycles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_tenant_id ON performance_reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_performance_goals_tenant_id ON performance_goals(tenant_id);
