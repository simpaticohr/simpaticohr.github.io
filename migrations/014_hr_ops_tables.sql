CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(50) NOT NULL REFERENCES companies(company_id),
    employee_id UUID REFERENCES employees(id),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    expense_date DATE NOT NULL,
    vendor VARCHAR(255),
    category VARCHAR(50),
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    receipt_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offboarding_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(50) NOT NULL REFERENCES companies(company_id),
    employee_id UUID REFERENCES employees(id),
    resignation_date DATE,
    last_working_day DATE NOT NULL,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(50) NOT NULL REFERENCES companies(company_id),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50),
    version VARCHAR(50),
    file_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(50) NOT NULL REFERENCES companies(company_id),
    ticket_number VARCHAR(50) NOT NULL,
    employee_id UUID REFERENCES employees(id),
    assignee_id UUID REFERENCES employees(id),
    category VARCHAR(50),
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(50) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE hr_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_hr_policies" ON hr_policies FOR ALL USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation_expenses" ON expenses FOR ALL USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation_offboarding" ON offboarding_records FOR ALL USING (tenant_id = current_setting('app.current_tenant', true));
CREATE POLICY "tenant_isolation_hr_tickets" ON hr_tickets FOR ALL USING (tenant_id = current_setting('app.current_tenant', true));
