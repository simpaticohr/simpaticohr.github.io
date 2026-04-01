// supabase-client.js — Simpatico HR
// Initializes Supabase client globally
(function() {
  const CONFIG = window.SIMPATICO_CONFIG || {};
  const url = CONFIG.supabaseUrl || '';
  const key = CONFIG.supabaseAnonKey || '';
  if (url && key && window.supabase) {
    const client = window.supabase.createClient(url, key);
    window._supabaseClient = client;
    window.SimpaticoDB     = client; // For registration and older modules
    console.log('Supabase client initialized: [SimpaticoDB]');
  } else {
    console.warn('Supabase not configured — set SIMPATICO_CONFIG in hr-config.js');
    window._supabaseClient = null;
  }
})();
