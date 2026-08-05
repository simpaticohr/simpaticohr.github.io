// js/career-lab-paywall.js — Shared premium-tool paywall for Career Lab
// Reads payment config from localStorage "adminConfig" (set via mock-admin.html):
//   customPayLink  — external checkout link (Razorpay payment page, Stripe, etc.)
//   upiId          — UPI ID shown for direct payment
//   razorpayKey    — presence indicates Razorpay gateway is active
//   careerLabPassword — internal access key, doubles as admin unlock key
//   toolPrices     — optional { resumeBuilder: 199, coverLetter: 49, ... } INR overrides
// Entitlements are stored in localStorage "cl_premium".

window.CareerLabPaywall = (() => {
  const ENT_KEY = 'cl_premium';

  const TOOLS = {
    resumeBuilder: {
      name: 'AI Resume Builder',
      icon: '📝',
      inr: 299,
      usd: 6,
      blurb: 'Get a professionally rewritten, ATS-optimized resume tailored to your target role — summary, experience bullets, skills & keywords.',
      perks: ['Full ATS-optimized rewrite', 'Role-targeted summary & keywords', 'Achievement-driven bullet points', 'Copy, download & print/PDF']
    },
    coverLetter: {
      name: 'AI Cover Letter Generator',
      icon: '✉️',
      inr: 99,
      usd: 2,
      blurb: 'Tailored cover letters for any job description in seconds — two tone-matched variants you can edit, copy and download.',
      perks: ['2 tailored variants per job', 'Tone matched to company & role', 'Keyword alignment with the JD', 'Copy & download']
    },
    careerRoadmap: {
      name: 'AI Career Roadmap',
      icon: '🗺️',
      inr: 249,
      usd: 5,
      blurb: 'A personalized 30/60/90-day plan to reach your target role — skill gaps, learning resources, projects and interview prep milestones.',
      perks: ['Skill-gap analysis vs target role', '30/60/90-day action plan', 'Curated learning resources', 'Portfolio project ideas']
    },
    linkedinOptimizer: {
      name: 'AI LinkedIn Optimizer',
      icon: '💼',
      inr: 149,
      usd: 3,
      blurb: 'Turn your LinkedIn into a recruiter magnet — optimized headline options, About section, experience bullets and profile keywords.',
      perks: ['5 headline options', 'Rewritten About section', 'Achievement-based experience bullets', 'Recruiter-search keywords']
    }
  };

  // ── Config helpers ──────────────────────────────
  function cfg() {
    try { return JSON.parse(localStorage.getItem('adminConfig') || '{}'); } catch (e) { return {}; }
  }

  function tool(key) { return TOOLS[key] || { name: key, icon: '💎', inr: 199, usd: 5, blurb: '', perks: [] }; }

  function priceINR(key) {
    const c = cfg();
    const override = c.toolPrices && c.toolPrices[key];
    const n = parseInt(override, 10);
    return Number.isFinite(n) && n > 0 ? n : tool(key).inr;
  }

  function priceLabel(key) {
    const t = tool(key);
    return '₹' + priceINR(key) + ' / $' + t.usd;
  }

  // ── Entitlements ────────────────────────────────
  function ents() {
    try { return JSON.parse(localStorage.getItem(ENT_KEY) || '{}'); } catch (e) { return {}; }
  }

  function isUnlocked(key) { return !!ents()[key]; }

  function unlock(key) {
    const e = ents();
    e[key] = { at: Date.now() };
    try { localStorage.setItem(ENT_KEY, JSON.stringify(e)); } catch (err) {}
  }

  // ── Modal UI ────────────────────────────────────
  function ensureStyles() {
    if (document.getElementById('clp-styles')) return;
    const s = document.createElement('style');
    s.id = 'clp-styles';
    s.textContent = `
      .clp-overlay{position:fixed;inset:0;background:rgba(2,6,23,.8);backdrop-filter:blur(8px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;animation:clpFade .2s ease}
      @keyframes clpFade{from{opacity:0}to{opacity:1}}
      .clp-modal{background:rgba(15,23,42,.95);border:1px solid rgba(99,102,241,.35);border-radius:24px;max-width:440px;width:100%;padding:34px 30px;color:#f8fafc;font-family:'Plus Jakarta Sans',system-ui,sans-serif;position:relative;box-shadow:0 24px 80px rgba(0,0,0,.5);max-height:90vh;overflow-y:auto}
      .clp-modal::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;border-radius:24px 24px 0 0;background:linear-gradient(90deg,#6366f1,#8b5cf6,#6366f1)}
      .clp-close{position:absolute;top:14px;right:16px;background:none;border:none;color:#94a3b8;font-size:1.3rem;cursor:pointer;line-height:1}
      .clp-close:hover{color:#fff}
      .clp-icon{font-size:2.6rem;text-align:center;margin-bottom:10px}
      .clp-title{font-size:1.35rem;font-weight:800;text-align:center;margin-bottom:6px}
      .clp-price{text-align:center;font-size:1.05rem;font-weight:800;color:#a5b4fc;margin-bottom:14px}
      .clp-blurb{color:#94a3b8;font-size:.88rem;line-height:1.6;text-align:center;margin-bottom:16px}
      .clp-perks{list-style:none;margin:0 0 20px;padding:0}
      .clp-perks li{display:flex;gap:8px;align-items:center;font-size:.85rem;color:#cbd5e1;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)}
      .clp-perks li:last-child{border-bottom:none}
      .clp-paybox{background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.25);border-radius:14px;padding:14px 16px;font-size:.82rem;color:#c7d2fe;margin-bottom:16px;line-height:1.6;word-break:break-word}
      .clp-upi{display:flex;align-items:center;gap:8px;margin-top:8px}
      .clp-upi code{background:rgba(0,0,0,.3);padding:4px 10px;border-radius:8px;font-size:.85rem;color:#fff;flex:1}
      .clp-copy{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:8px;padding:4px 10px;font-size:.75rem;cursor:pointer}
      .clp-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;border-radius:14px;font-weight:700;font-size:.92rem;border:none;cursor:pointer;font-family:inherit;transition:transform .15s,box-shadow .15s;margin-bottom:10px;text-decoration:none}
      .clp-btn:hover{transform:scale(1.02)}
      .clp-btn-pay{background:#6366f1;color:#fff}
      .clp-btn-pay:hover{box-shadow:0 8px 30px rgba(99,102,241,.3)}
      .clp-btn-confirm{background:#10b981;color:#fff}
      .clp-btn-confirm:hover{box-shadow:0 8px 30px rgba(16,185,129,.3)}
      .clp-admin{display:block;text-align:center;font-size:.75rem;color:#64748b;cursor:pointer;text-decoration:underline;margin-top:4px}
      .clp-admin:hover{color:#94a3b8}
      .clp-note{text-align:center;font-size:.72rem;color:#64748b;margin-top:12px;line-height:1.5}
    `;
    document.head.appendChild(s);
  }

  function paymentInfoHTML(key) {
    const c = cfg();
    const parts = [];
    if (c.customPayLink) {
      parts.push('💳 Complete your payment securely via our payment gateway, then return here and tap <strong>"I\'ve Paid — Unlock"</strong>.');
    } else if (c.upiId) {
      parts.push('💳 Pay <strong>' + priceLabel(key) + '</strong> via UPI to the ID below, then tap <strong>"I\'ve Paid — Unlock"</strong>.');
    } else if (c.razorpayKey) {
      parts.push('💳 Payment via <strong>Razorpay / UPI / Wise</strong>. Pay using the details shared by our team, then tap <strong>"I\'ve Paid — Unlock"</strong>.');
    } else {
      parts.push('💳 Payment gateway: <strong>Razorpay / UPI / Wise</strong> (admin configurable in Super Admin). Tap <strong>"I\'ve Paid — Unlock"</strong> after payment.');
    }
    let html = parts.join('');
    if (!c.customPayLink && c.upiId) {
      html += '<div class="clp-upi"><code>' + c.upiId + '</code><button type="button" class="clp-copy" data-clp-copy="' + c.upiId + '">Copy</button></div>';
    }
    return html;
  }

  function show(key, onUnlocked) {
    ensureStyles();
    close();
    const t = tool(key);
    const c = cfg();

    const overlay = document.createElement('div');
    overlay.className = 'clp-overlay';
    overlay.id = 'clp-overlay';
    overlay.innerHTML = `
      <div class="clp-modal" role="dialog" aria-modal="true">
        <button class="clp-close" data-clp-close aria-label="Close">✕</button>
        <div class="clp-icon">${t.icon}</div>
        <div class="clp-title">${t.name}</div>
        <div class="clp-price">🔓 ${priceLabel(key)} <span style="font-size:.72rem;color:#64748b;font-weight:600;">ONE-TIME</span></div>
        <p class="clp-blurb">${t.blurb}</p>
        <ul class="clp-perks">${t.perks.map(p => `<li><span style="color:#34d399;">✓</span> ${p}</li>`).join('')}</ul>
        <div class="clp-paybox">${paymentInfoHTML(key)}</div>
        ${c.customPayLink ? `<a class="clp-btn clp-btn-pay" href="${c.customPayLink}" target="_blank" rel="noopener">💳 Pay ${priceLabel(key)}</a>` : ''}
        <button class="clp-btn clp-btn-confirm" data-clp-confirm>✅ I've Paid — Unlock Access</button>
        <a class="clp-admin" data-clp-admin>Admin unlock</a>
        <div class="clp-note">Instant unlock after payment confirmation.<br>Price &amp; gateway configurable in Super Admin.</div>
      </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-clp-close]').addEventListener('click', close);
    overlay.querySelector('[data-clp-confirm]').addEventListener('click', () => {
      unlock(key);
      close();
      if (typeof onUnlocked === 'function') onUnlocked();
      document.dispatchEvent(new CustomEvent('clp:unlocked', { detail: { tool: key } }));
    });
    overlay.querySelector('[data-clp-admin]').addEventListener('click', () => {
      const pass = prompt('Enter admin access key:');
      if (pass === null) return;
      const correct = cfg().careerLabPassword;
      if (!correct) { alert('Admin access key not configured. Set it in Super Admin.'); return; }
      if (pass === correct) {
        unlock(key);
        close();
        if (typeof onUnlocked === 'function') onUnlocked();
        document.dispatchEvent(new CustomEvent('clp:unlocked', { detail: { tool: key } }));
      } else {
        alert('Incorrect admin access key.');
      }
    });
    const copyBtn = overlay.querySelector('[data-clp-copy]');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const txt = copyBtn.getAttribute('data-clp-copy');
      if (navigator.clipboard) navigator.clipboard.writeText(txt);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    });

    document.body.appendChild(overlay);
  }

  function close() {
    const el = document.getElementById('clp-overlay');
    if (el) el.remove();
  }

  // ── Public API for tool pages ───────────────────
  // Returns true if unlocked; otherwise opens the paywall modal and returns false.
  function require(key) {
    if (isUnlocked(key)) return true;
    show(key);
    return false;
  }

  // Keeps a button's label/state in sync with the entitlement.
  // lockedLabel defaults to "🔒 Unlock — <price>"; unlockedLabel restores the button's data-label.
  function decorateButton(btn, key, unlockedLabel) {
    if (!btn) return;
    if (!btn.dataset.label) btn.dataset.label = unlockedLabel || btn.innerHTML;
    const render = () => {
      btn.innerHTML = isUnlocked(key) ? btn.dataset.label : '🔒 Unlock — ' + priceLabel(key);
    };
    render();
    document.addEventListener('clp:unlocked', e => { if (e.detail.tool === key) render(); });
  }

  return { TOOLS, isUnlocked, unlock, show, close, require, decorateButton, priceLabel };
})();
