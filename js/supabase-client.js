// supabase-client.js — Simpatico HR
// Initializes Supabase client globally
(function() {
  const CONFIG = window.SIMPATICO_CONFIG || {};
  const url = CONFIG.supabaseUrl || '';
  const key = CONFIG.supabaseAnonKey || '';
  if (url && key && window.supabase) {
    let token = localStorage.getItem('sh_token') || localStorage.getItem('simpatico_token') || '';
    if (!token) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          try { token = JSON.parse(localStorage.getItem(k)).access_token; } catch(e){}
        }
      }
    }
    const opts = token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {};
    const client = window.supabase.createClient(url, key, opts);
    window._supabaseClient = client;
    window.SimpaticoDB     = client; // For registration and older modules
    console.log('Supabase client initialized: [SimpaticoDB]');
  } else {
    console.warn('Supabase not configured — set SIMPATICO_CONFIG in hr-config.js');
    window._supabaseClient = null;
  }
})();
