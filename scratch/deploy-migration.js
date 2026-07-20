const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const sql = fs.readFileSync('migrations/044_allow_superadmin_consulting_tables.sql', 'utf8');
  console.log('Deploying migration...');
  const { data, error } = await supabase.rpc('execute_sql', { sql: sql });
  if (error) {
    console.error('Migration failed:', error);
  } else {
    console.log('Migration deployed successfully! Result:', data);
  }
}

run();
