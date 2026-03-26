// supabase-client.js — Simpatico HR
// Initializes Supabase client globally
(function() {
  const CONFIG = window.SIMPATICO_CONFIG || {};
  const url = CONFIG.supabaseUrl || '';
  const key = CONFIG.supabaseAnonKey || '';
  if (url && key && window.supabase) {
    window._supabaseClient = window.supabase.createClient(url, key);
    console.log('Supabase client initialized');
  } else {
    console.warn('Supabase not configured — set SIMPATICO_CONFIG in hr-config.js');
    window._supabaseClient = null;
  }
})();
