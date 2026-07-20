const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://cvkxtsvgnynxexmemfuy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2a3h0c3ZnbnlueGV4bWVtZnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MjE2NTEsImV4cCI6MjA4Mjk5NzY1MX0.2mys8Cc-ucJ1uLThEGJubeDEg1TvfIAkW-xFsR4ecq4';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  console.log('Fetching companies...');
  const { data: companies, error: err1 } = await supabase.from('companies').select('*').limit(5);
  if (err1) {
    console.error('Error fetching companies:', err1);
  } else {
    console.log('Companies:', companies);
  }

  console.log('\nFetching payment transactions...');
  const { data: txns, error: err2 } = await supabase.from('payment_transactions').select('*').limit(5);
  if (err2) {
    console.error('Error fetching transactions:', err2);
  } else {
    console.log('Transactions:', txns);
  }
}

check();
