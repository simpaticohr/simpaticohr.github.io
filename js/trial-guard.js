/**
 * trial-guard.js — Simpatico HR Platform
 * ═══════════════════════════════════════════════════════════════════
 * Trial enforcement: 2-day free trial with strict usage limits
 *   • 1 job posting
 *   • 1 proctored interview
 *   • 2-day duration
 * Load AFTER supabase-client.js and shared-utils.js on dashboard pages.
 * ═══════════════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  const TRIAL_DAYS = 2;
  const TRIAL_LIMITS = {
    max_jobs: 1,
    max_interviews: 1,
  };

  function sb() {
    if (typeof getSupabaseClient === 'function') return getSupabaseClient();
    if (window._supabaseClient) return window._supabaseClient;
    if (window.SimpaticoDB) return window.SimpaticoDB;
    return null;
  }

  function getCompanyId() {
    try {
      const u = JSON.parse(localStorage.getItem('simpatico_user') || '{}');
      return u.company_id || u.tenant_id || null;
    } catch(e) { return null; }
  }

  // ── Check trial status (Worker-first, Supabase fallback) ──
  async function checkTrialStatus() {
    const companyId = getCompanyId();
    if (!companyId) return null;

    // 1) Try worker-verified subscription status (authoritative)
    try {
      const cfg = window.SIMPATICO_CONFIG || {};
      const workerUrl = cfg.workerUrl || 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev';
      const token = localStorage.getItem('simpatico_token') || sessionStorage.getItem('simpatico_token');
      if (token) {
        const res = await fetch(`${workerUrl}/billing/subscription`, {
          headers: { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': companyId },
        });
        if (res.ok) {
          const json = await res.json();
          const d = json.data || json;
          if (d.plan && d.plan !== 'trial') {
            // Worker confirms a paid plan — synthesize a company-like object
            return {
              id: companyId, subscription_plan: d.plan, is_active: true,
              subscription_end: d.expires || d.subscription?.current_period_end,
              _source: 'worker',
            };
          }
        }
      }
    } catch(e) {
      console.warn('[trial-guard] Worker check failed, falling back:', e.message);
    }

    // 2) Fallback: read from Supabase companies table
    const client = sb();
    if (!client) return null;
    try {
      const { data: company, error } = await client
        .from('companies')
        .select('id, name, subscription_plan, subscription_start, subscription_end, is_active')
        .eq('id', companyId)
        .maybeSingle();
      if (error || !company) return null;
      return company;
    } catch(e) {
      console.warn('[trial-guard] Supabase check failed:', e.message);
      return null;
    }
  }

  // ── Check usage counts for trial limits ──
  async function checkTrialUsage(companyId) {
    const client = sb();
    if (!client || !companyId) return { jobs: 0, interviews: 0 };

    try {
      const [jobsRes, interviewsRes] = await Promise.all([
        client.from('jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', companyId),
        client.from('interviews').select('id', { count: 'exact', head: true }).eq('tenant_id', companyId),
      ]);

      return {
        jobs: jobsRes.count || 0,
        interviews: interviewsRes.count || 0,
      };
    } catch(e) {
      console.warn('[trial-guard] Error checking usage:', e.message);
      return { jobs: 0, interviews: 0 };
    }
  }

  // ── Calculate remaining time ──
  function getTrialInfo(company) {
    const plan = (company.subscription_plan || 'trial').toLowerCase();
    const isTrialPlan = plan === 'trial' || plan === 'free_trial';
    const isPaid = ['starter', 'professional', 'enterprise', 'pro', 'business', 'premium'].includes(plan);

    if (isPaid) return { status: 'paid', plan, remaining: Infinity };

    if (!isTrialPlan) return { status: 'unknown', plan, remaining: 0 };

    // Calculate from subscription_start or subscription_end
    let endDate;
    if (company.subscription_end) {
      endDate = new Date(company.subscription_end);
    } else if (company.subscription_start) {
      endDate = new Date(company.subscription_start);
      endDate.setDate(endDate.getDate() + TRIAL_DAYS);
    } else {
      // No dates set — assume trial started now, set it
      return { status: 'trial_active', plan, remaining: TRIAL_DAYS * 24 * 60 * 60 * 1000, hoursLeft: TRIAL_DAYS * 24, daysLeft: TRIAL_DAYS };
    }

    const now = new Date();
    const remaining = endDate.getTime() - now.getTime();
    const hoursLeft = Math.max(0, Math.ceil(remaining / (1000 * 60 * 60)));
    const daysLeft = Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24)));

    if (remaining <= 0) {
      return { status: 'expired', plan, remaining: 0, hoursLeft: 0, daysLeft: 0 };
    }

    return { status: 'trial_active', plan, remaining, hoursLeft, daysLeft };
  }

  // ── Render trial banner with usage limits ──
  function showTrialBanner(info, usage) {
    // Remove any existing banner
    document.getElementById('trial-banner')?.remove();

    const banner = document.createElement('div');
    banner.id = 'trial-banner';

    if (info.status === 'trial_active') {
      const urgent = info.hoursLeft <= 12;
      const jobsUsed = usage.jobs || 0;
      const intUsed = usage.interviews || 0;
      const jobsLeft = Math.max(0, TRIAL_LIMITS.max_jobs - jobsUsed);
      const intLeft = Math.max(0, TRIAL_LIMITS.max_interviews - intUsed);

      banner.innerHTML = `
        <div style="
          background: ${urgent ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'};
          color: white; padding: 10px 20px; display: flex; align-items: center; justify-content: center; gap: 16px;
          font-size: 13px; font-weight: 600; position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15); flex-wrap: wrap;
        ">
          <span style="display:flex;align-items:center;gap:6px;">
            ${urgent ? '⚠️' : '⏱️'} Trial: <strong>${info.hoursLeft <= 48 ? info.hoursLeft + 'h' : info.daysLeft + 'd'} left</strong>
          </span>
          <span style="opacity:0.8;font-size:12px;">
            📋 Jobs: ${jobsUsed}/${TRIAL_LIMITS.max_jobs} &nbsp;|&nbsp; 🎙️ Interviews: ${intUsed}/${TRIAL_LIMITS.max_interviews}
          </span>
          <a href="/platform/pricing.html" style="
            background: rgba(255,255,255,0.2); color: white; padding: 5px 16px; border-radius: 6px;
            text-decoration: none; font-size: 12px; font-weight: 700; border: 1px solid rgba(255,255,255,0.3);
            transition: all 0.2s;
          " onmouseover="this.style.background='rgba(255,255,255,0.35)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
            Upgrade Now →
          </a>
          <button onclick="this.closest('#trial-banner').style.display='none';document.body.style.paddingTop='0'" style="
            background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 16px; margin-left: 4px;
          ">×</button>
        </div>
      `;

      document.body.prepend(banner);
      document.body.style.paddingTop = '42px';
    }
  }

  // ── Render expired paywall ──
  function showExpiredPaywall() {
    document.getElementById('trial-paywall')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'trial-paywall';
    overlay.innerHTML = `
      <div style="
        position: fixed; inset: 0; z-index: 100000;
        background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        animation: trialFadeIn 0.3s ease;
      ">
        <div style="
          background: white; border-radius: 20px; padding: 48px 40px;
          max-width: 520px; width: 90%; text-align: center;
          box-shadow: 0 25px 60px rgba(0,0,0,0.3);
          animation: trialSlideUp 0.4s ease;
        ">
          <div style="
            width: 72px; height: 72px; margin: 0 auto 20px; border-radius: 50%;
            background: linear-gradient(135deg, #fef3c7, #fde68a);
            display: flex; align-items: center; justify-content: center;
            font-size: 32px;
          ">⏰</div>

          <h2 style="font-size: 1.5rem; font-weight: 800; color: #0f172a; margin-bottom: 8px;">
            Your Free Trial Has Ended
          </h2>
          <p style="color: #64748b; font-size: 0.95rem; line-height: 1.6; margin-bottom: 24px;">
            Your ${TRIAL_DAYS}-day trial has expired. Upgrade to continue using all features including
            AI recruitment, payroll, proctored interviews, and full HR automation.
          </p>

          <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;">
            <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#f0fdf4;border-radius:10px;font-size:13px;color:#15803d;">
              <span style="font-size:16px">✓</span> Unlimited Job Postings & AI Screening
            </div>
            <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#eff6ff;border-radius:10px;font-size:13px;color:#1d4ed8;">
              <span style="font-size:16px">✓</span> Unlimited Proctored Interviews
            </div>
            <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#faf5ff;border-radius:10px;font-size:13px;color:#7c3aed;">
              <span style="font-size:16px">✓</span> Full HR Suite: Payroll, Attendance, Training
            </div>
          </div>

          <div style="display: flex; gap: 10px;">
            <a href="/platform/pricing.html" style="
              flex: 1; padding: 14px; border-radius: 12px;
              background: linear-gradient(135deg, #4f46e5, #7c3aed);
              color: white; text-decoration: none; font-weight: 700; font-size: 15px;
              display: flex; align-items: center; justify-content: center; gap: 8px;
              transition: all 0.2s; box-shadow: 0 4px 12px rgba(79,70,229,0.3);
            " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(79,70,229,0.4)'"
               onmouseout="this.style.transform='none';this.style.boxShadow='0 4px 12px rgba(79,70,229,0.3)'">
              🚀 View Plans & Upgrade
            </a>
          </div>

          <div style="margin-top: 16px; display: flex; justify-content: center; gap: 20px; font-size: 12px; color: #94a3b8;">
            <a href="mailto:simpaticohrconsultancy@gmail.com" style="color: #64748b; text-decoration: none;">
              📧 Contact Sales
            </a>
            <span>|</span>
            <a href="#" onclick="document.getElementById('trial-paywall').remove();return false;" style="color: #64748b; text-decoration: none;">
              Browse in Read-Only
            </a>
          </div>
        </div>
      </div>

      <style>
        @keyframes trialFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes trialSlideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      </style>
    `;

    document.body.appendChild(overlay);
  }

  // ── Show limit-hit modal (blocks the action, not the whole page) ──
  function showLimitReached(type) {
    document.getElementById('trial-limit-modal')?.remove();

    const title = type === 'job' ? 'Job Posting Limit Reached' : 'Interview Limit Reached';
    const msg = type === 'job'
      ? `Your free trial includes <strong>1 job posting</strong>. Upgrade your plan to post unlimited jobs.`
      : `Your free trial includes <strong>1 proctored interview</strong>. Upgrade to conduct unlimited interviews.`;

    const modal = document.createElement('div');
    modal.id = 'trial-limit-modal';
    modal.innerHTML = `
      <div style="
        position: fixed; inset: 0; z-index: 100001;
        background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        animation: trialFadeIn 0.2s ease;
      " onclick="if(event.target===this)this.remove()">
        <div style="
          background: white; border-radius: 16px; padding: 36px 32px;
          max-width: 440px; width: 90%; text-align: center;
          box-shadow: 0 20px 50px rgba(0,0,0,0.25);
          animation: trialSlideUp 0.3s ease;
        ">
          <div style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%;
            background: linear-gradient(135deg, #fee2e2, #fecaca);
            display: flex; align-items: center; justify-content: center; font-size: 24px;">🔒</div>

          <h3 style="font-size: 1.2rem; font-weight: 800; color: #0f172a; margin-bottom: 8px;">${title}</h3>
          <p style="color: #64748b; font-size: 0.9rem; line-height: 1.6; margin-bottom: 20px;">${msg}</p>

          <div style="display: flex; gap: 10px;">
            <button onclick="this.closest('#trial-limit-modal').remove()" style="
              flex: 1; padding: 12px; border-radius: 10px; background: #f1f5f9;
              color: #475569; font-weight: 600; font-size: 14px; border: none; cursor: pointer;
              font-family: inherit;
            ">Cancel</button>
            <a href="/platform/pricing.html" style="
              flex: 1; padding: 12px; border-radius: 10px;
              background: linear-gradient(135deg, #4f46e5, #7c3aed);
              color: white; text-decoration: none; font-weight: 700; font-size: 14px;
              display: flex; align-items: center; justify-content: center;
              transition: all 0.2s;
            ">Upgrade Now</a>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // ── Public: Check if a trial action is allowed ──
  // Returns true if allowed, shows modal and returns false if not
  async function canPerformTrialAction(actionType) {
    const info = window._simpaticoTrialInfo;
    if (!info || info.status === 'paid') return true;
    if (info.status === 'expired') return false;

    const companyId = getCompanyId();
    const usage = await checkTrialUsage(companyId);

    if (actionType === 'create_job' && usage.jobs >= TRIAL_LIMITS.max_jobs) {
      showLimitReached('job');
      return false;
    }
    if (actionType === 'create_interview' && usage.interviews >= TRIAL_LIMITS.max_interviews) {
      showLimitReached('interview');
      return false;
    }

    return true;
  }

  // ── Main init ──
  async function initTrialGuard() {
    const company = await checkTrialStatus();
    if (!company) return; // No company data — skip (probably no auth yet)

    const info = getTrialInfo(company);
    window._simpaticoTrialInfo = info; // expose for other modules
    window._simpaticoTrialLimits = TRIAL_LIMITS;

    switch (info.status) {
      case 'paid':
        // Paid plan — no banner, full access
        console.log('[trial-guard] Paid plan:', info.plan);
        break;

      case 'trial_active': {
        // Check usage and show countdown banner with limits
        const usage = await checkTrialUsage(company.id);
        window._simpaticoTrialUsage = usage;
        showTrialBanner(info, usage);
        console.log(`[trial-guard] Trial active: ${info.hoursLeft}h remaining | Jobs: ${usage.jobs}/${TRIAL_LIMITS.max_jobs} | Interviews: ${usage.interviews}/${TRIAL_LIMITS.max_interviews}`);
        break;
      }

      case 'expired':
        // Show paywall
        showExpiredPaywall();
        console.log('[trial-guard] Trial expired — showing paywall');
        break;

      default:
        console.log('[trial-guard] Unknown plan status:', info.plan);
    }
  }

  // Boot — wait for DOM + Supabase
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initTrialGuard, 500));
  } else {
    setTimeout(initTrialGuard, 500);
  }

  // Expose for manual re-check and action gating
  window.checkTrialStatus = initTrialGuard;
  window.canPerformTrialAction = canPerformTrialAction;
  window.TRIAL_LIMITS = TRIAL_LIMITS;
})();
