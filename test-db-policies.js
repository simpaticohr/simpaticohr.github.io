const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: 'backend/.env'});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const sql = `SELECT * FROM pg_policies WHERE tablename = 'companies';`;
    const { data, error } = await supabase.rpc('execute_sql', { sql: sql });
    console.log('data:', data, 'error:', error);
}
run();