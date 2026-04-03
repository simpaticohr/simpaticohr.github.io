// supabase-client.js — Simpatico HR
// Initializes Supabase client globally (uses shared-utils getAuthToken if available)
(function() {
  const CONFIG = window.SIMPATICO_CONFIG || {};
  const url = CONFIG.supabaseUrl || '';
  const key = CONFIG.supabaseAnonKey || '';

  if (url && key && window.supabase) {
    // Use shared-utils token retrieval if available, else scan localStorage
    const token = (typeof getAuthToken === 'function')
      ? getAuthToken()
      : (() => {
          let t = localStorage.getItem('sh_token') || localStorage.getItem('simpatico_token') || '';
          if (!t) {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
                try { t = JSON.parse(localStorage.getItem(k)).access_token; } catch(e){}
              }
            }
          }
          return t;
        })();

    const opts = token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {};
    const client = window.supabase.createClient(url, key, opts);
    window._supabaseClient = client;
    window.SimpaticoDB     = client;
    console.log('[supabase-client] Initialized: SimpaticoDB');
  } else {
    console.warn('[supabase-client] Not configured — set SIMPATICO_CONFIG in hr-config.js');
    window._supabaseClient = null;
  }
})();
