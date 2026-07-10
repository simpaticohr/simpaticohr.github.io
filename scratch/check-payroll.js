import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://cvkxtsvgnynxexmemfuy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2a3h0c3ZnbnlueGV4bWVtZnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MjE2NTEsImV4cCI6MjA4Mjk5NzY1MX0.2mys8Cc-ucJ1uLThEGJubeDEg1TvfIAkW-xFsR4ecq4'
);

const tenantId = 'a0000000-0000-0000-0000-000000000001';

async function run() {
  console.log(`Checking payroll status for tenant: ${tenantId}\n`);
  
  // 1. Check active employees
  const { data: emps, error: empErr } = await supabase
    .from('employees')
    .select('id, first_name, last_name, status')
    .eq('tenant_id', tenantId);
    
  if (empErr) console.error("Employees error:", empErr);
  else console.log(`Active Employees found: ${emps?.length || 0}`, emps);
  
  // 2. Check salaries
  const { data: sals, error: salErr } = await supabase
    .from('employee_salaries')
    .select('*')
    .eq('tenant_id', tenantId);
    
  if (salErr) console.error("Salaries error:", salErr);
  else console.log(`Salary records found: ${sals?.length || 0}`, sals);
  
  // 3. Check deductions
  const { data: deds, error: dedErr } = await supabase
    .from('payroll_deductions')
    .select('*')
    .eq('tenant_id', tenantId);
    
  if (dedErr) console.error("Deductions error:", dedErr);
  else console.log(`Deduction records found: ${deds?.length || 0}`, deds);
  
  // 4. Check payroll runs
  const { data: runs, error: runErr } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('tenant_id', tenantId);
    
  if (runErr) console.error("Payroll runs error:", runErr);
  else console.log(`Payroll runs found: ${runs?.length || 0}`, runs);

  // 5. Check payslips
  const { data: payslips, error: payErr } = await supabase
    .from('payslips')
    .select('*')
    .eq('tenant_id', tenantId);
    
  if (payErr) console.error("Payslips error:", payErr);
  else console.log(`Payslips found: ${payslips?.length || 0}`, payslips);
}

run();
