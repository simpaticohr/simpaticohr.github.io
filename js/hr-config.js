// js/hr-config.js
// Connects all new HR modules to the existing Supabase client
// Must be loaded AFTER supabase-client.js

(function () {
  const MAX_RETRIES = 40;       // 40 × 50ms = 2s max wait
  let retryCount = 0;

  function init() {
    if (!window.SimpaticoDB) {
      retryCount++;
      if (retryCount >= MAX_RETRIES) {
        console.error('[HR Config] SimpaticoDB not found after 2s. Check supabase-client.js is loaded.');
        return;
      }
      setTimeout(init, 50);
      return;
    }

    // ── Validate the Supabase client has a real URL ──
    const supabaseUrl = window.SimpaticoDB?.supabaseUrl 
                     || window.SimpaticoDB?.restUrl 
                     || '';
    
    if (supabaseUrl.includes('your_project') || supabaseUrl.includes('your-project')) {
      console.error(
        '[HR Config] ❌ Supabase URL is still a placeholder! ' +
        'Update SUPABASE_URL in supabase-client.js with your real project URL.'
      );
      // Optionally show a visible warning
      if (typeof window.showHRToast === 'function') {
        window.showHRToast('Database not configured. Contact admin.', 'error');
      }
      return;
    }

    // ── Expose shared DB client for all HR modules ──
    window.db = window.SimpaticoDB;

    // ── Expose worker URL (ensure no trailing slash) ──
    window.WORKER_URL = (
      window.WORKER_URL || 'https://evalis-ai.simpaticohrconsultancy.workers.dev'
    ).replace(/\/+$/, '');

    // ── Get current authenticated company ID ──
    window.getCompanyId = async function () {
      if (window.currentCompanyId) return window.currentCompanyId;

      try {
        const { data: { user }, error: authError } = await window.db.auth.getUser();
        
        if (authError) {
          console.warn('[HR Config] Auth error:', authError.message);
          return null;
        }
        if (!user) {
          console.warn('[HR Config] No authenticated user found.');
          return null;
        }

        // Try company_profiles first
        const { data: companyProfile, error: companyErr } = await window.db
          .from('company_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (companyErr && companyErr.code !== 'PGRST116') {
          // PGRST116 = "no rows found" — that's okay, try fallback
          // Any other error = log it
          console.warn('[HR Config] company_profiles query error:', companyErr.message);
        }

        let profile = companyProfile;

        // Fallback: try org_profiles
        if (!profile) {
          const { data: orgProfile, error: orgErr } = await window.db
            .from('org_profiles')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();

          if (orgErr && orgErr.code !== 'PGRST116') {
            console.warn('[HR Config] org_profiles query error:', orgErr.message);
          }

          profile = orgProfile;
        }

        if (profile?.id) {
          window.currentCompanyId = profile.id;
          return profile.id;
        }

        console.warn('[HR Config] No company profile found for user:', user.id);
        return null;

      } catch (e) {
        console.error('[HR Config] getCompanyId exception:', e);
        return null;
      }
    };

    // ── Shared toast function (fallback if hr-modules not loaded) ──
    if (!window.showHRToast) {
      window.showHRToast = function (msg, type = 'info') {
        const container = document.getElementById('toasts') 
                       || document.getElementById('hr-toasts');

        if (!container) {
          // Create a toast container dynamically
          const fallback = document.createElement('div');
          fallback.id = 'hr-toasts';
          fallback.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 10000;
            display: flex; flex-direction: column; gap: 8px;
          `;
          document.body.appendChild(fallback);
          return window.showHRToast(msg, type); // Retry now that container exists
        }

        const toast = document.createElement('div');
        toast.className = `hr-toast ${type}`;
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(() => {
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 300);
        }, 3800);
      };
    }

    // ── Helper: safe Supabase query wrapper ──
    window.safeQuery = async function (tableName, queryFn) {
      try {
        const result = await queryFn(window.db.from(tableName));
        if (result.error) {
          console.error(`[HR Query] ${tableName}:`, result.error.message);
          return { data: null, error: result.error };
        }
        return result;
      } catch (e) {
        console.error(`[HR Query] ${tableName} exception:`, e);
        return { data: null, error: e };
      }
    };

    console.log('[HR Config] ✅ Supabase bridge ready');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
