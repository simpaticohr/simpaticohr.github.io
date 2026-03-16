// js/hr-config.js
// Connects all new HR modules to the existing Supabase client
// Must be loaded AFTER supabase-client.js

(function () {
  // Wait for SimpaticoDB to be available
  function init() {
    if (!window.SimpaticoDB) {
      setTimeout(init, 50);
      return;
    }

    // Expose shared DB client for all HR modules
    window.db = window.SimpaticoDB;

    // Expose worker URL
    window.WORKER_URL = window.WORKER_URL || 'https://evalis-ai.simpaticohrconsultancy.workers.dev';

    // Get current authenticated company ID
    window.getCompanyId = async function () {
      if (window.currentCompanyId) return window.currentCompanyId;
      try {
        const { data: { user } } = await window.db.auth.getUser();
        if (!user) return null;

        // Try company_profiles first, then org_profiles
        let { data: profile } = await window.db
          .from('company_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!profile) {
          const { data: org } = await window.db
            .from('org_profiles')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();
          profile = org;
        }

        if (profile?.id) window.currentCompanyId = profile.id;
        return profile?.id || null;
      } catch (e) {
        console.warn('getCompanyId error:', e);
        return null;
      }
    };

    // Shared toast function (fallback if hr-modules not loaded)
    if (!window.showHRToast) {
      window.showHRToast = function (msg, type = 'info') {
        const c = document.getElementById('toasts') || document.getElementById('hr-toasts');
        if (!c) { console.log(`[${type}] ${msg}`); return; }
        const t = document.createElement('div');
        t.className = `hr-toast ${type}`;
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(() => t.remove(), 3800);
      };
    }

    console.log('[HR Config] Supabase bridge ready');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
