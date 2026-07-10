import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://cvkxtsvgnynxexmemfuy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2a3h0c3ZnbnlueGV4bWVtZnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MjE2NTEsImV4cCI6MjA4Mjk5NzY1MX0.2mys8Cc-ucJ1uLThEGJubeDEg1TvfIAkW-xFsR4ecq4'
);

async function run() {
  const { data, error } = await supabase
    .from('users')
    .select('email, role, company_id')
    .limit(5);
  
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Users:", data);
  }
}

run();
