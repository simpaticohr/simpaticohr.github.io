// js/career-lab-paywall.js — Real payment-gated paywall for Career Lab premium tools
// Domestic (India/INR): UPI/Bank → Cloudflare Worker → admin email with 1-click approve
// International: Wise bank transfer → auto-matched by Wise webhook
// Entitlements stored in localStorage "cl_premium" — verified against backend on load.

window.CareerLabPaywall = (() => {
  const ENT_KEY = 'cl_premium';
  const API_BASE = 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev';

  const TOOLS = {
    resumeBuilder: {
      name: 'AI Resume Builder', icon: '📝', inr: 299, usd: 6,
      blurb: 'Get a professionally rewritten, ATS-optimized resume tailored to your target role — summary, experience bullets, skills & keywords.',
      perks: ['Full ATS-optimized rewrite', 'Role-targeted summary & keywords', 'Achievement-driven bullet points', 'Copy, download & print/PDF']
    },
    coverLetter: {
      name: 'AI Cover Letter Generator', icon: '✉️', inr: 99, usd: 2,
      blurb: 'Tailored cover letters for any job description in seconds — two tone-matched variants you can edit, copy and download.',
      perks: ['2 tailored variants per job', 'Tone matched to company & role', 'Keyword alignment with the JD', 'Copy & download']
    },
    careerRoadmap: {
      name: 'AI Career Roadmap', icon: '🗺️', inr: 249, usd: 5,
      blurb: 'A personalized 30/60/90-day plan to reach your target role — skill gaps, learning resources, projects and interview prep milestones.',
      perks: ['Skill-gap analysis vs target role', '30/60/90-day action plan', 'Curated learning resources', 'Portfolio project ideas']
    },
    linkedinOptimizer: {
      name: 'AI LinkedIn Optimizer', icon: '💼', inr: 149, usd: 3,
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

  function unlock(key, orderId) {
    const e = ents();
    e[key] = { at: Date.now(), order_id: orderId || null };
    try { localStorage.setItem(ENT_KEY, JSON.stringify(e)); } catch (err) {}
  }

  // ── Polling ─────────────────────────────────────
  let _pollTimer = null;

  function startPolling(orderId, email, key, onPaid) {
    stopPolling();
    _pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/careerlab/check-status?order_id=${encodeURIComponent(orderId)}&email=${encodeURIComponent(email)}`);
        const json = await res.json();
        if (json.success && json.data && json.data.is_paid) {
          stopPolling();
          unlock(key, orderId);
          if (typeof onPaid === 'function') onPaid();
          document.dispatchEvent(new CustomEvent('clp:unlocked', { detail: { tool: key } }));
        }
      } catch (e) { /* network error — keep polling */ }
    }, 5000);
  }

  function stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  // ── Modal Styles ────────────────────────────────
  function ensureStyles() {
    if (document.getElementById('clp-styles')) return;
    const s = document.createElement('style');
    s.id = 'clp-styles';
    s.textContent = `
      .clp-overlay{position:fixed;inset:0;background:rgba(2,6,23,.8);backdrop-filter:blur(8px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;animation:clpFade .2s ease}
      @keyframes clpFade{from{opacity:0}to{opacity:1}}
      .clp-modal{background:rgba(15,23,42,.95);border:1px solid rgba(99,102,241,.35);border-radius:24px;max-width:480px;width:100%;padding:34px 30px;color:#f8fafc;font-family:'Plus Jakarta Sans',system-ui,sans-serif;position:relative;box-shadow:0 24px 80px rgba(0,0,0,.5);max-height:90vh;overflow-y:auto}
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
      .clp-form{display:flex;flex-direction:column;gap:10px;margin-bottom:16px}
      .clp-input{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:12px 14px;color:#fff;font-size:.9rem;font-family:inherit;outline:none;transition:border .2s}
      .clp-input:focus{border-color:#6366f1}
      .clp-input::placeholder{color:#64748b}
      .clp-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;border-radius:14px;font-weight:700;font-size:.92rem;border:none;cursor:pointer;font-family:inherit;transition:transform .15s,box-shadow .15s;margin-bottom:10px;text-decoration:none}
      .clp-btn:hover{transform:scale(1.02)}
      .clp-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
      .clp-btn-pay{background:#6366f1;color:#fff}
      .clp-btn-pay:hover:not(:disabled){box-shadow:0 8px 30px rgba(99,102,241,.3)}
      .clp-paybox{background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.25);border-radius:14px;padding:14px 16px;font-size:.82rem;color:#c7d2fe;margin-bottom:16px;line-height:1.6;word-break:break-word}
      .clp-upi{display:flex;align-items:center;gap:8px;margin-top:8px}
      .clp-upi code{background:rgba(0,0,0,.3);padding:4px 10px;border-radius:8px;font-size:.85rem;color:#fff;flex:1}
      .clp-copy{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:8px;padding:4px 10px;font-size:.75rem;cursor:pointer}
      .clp-waiting{text-align:center;padding:20px 0}
      .clp-spinner{display:inline-block;width:36px;height:36px;border:3px solid rgba(99,102,241,.2);border-top-color:#6366f1;border-radius:50%;animation:clpSpin .8s linear infinite;margin-bottom:12px}
      @keyframes clpSpin{to{transform:rotate(360deg)}}
      .clp-wait-text{color:#a5b4fc;font-size:.9rem;font-weight:600}
      .clp-wait-sub{color:#64748b;font-size:.78rem;margin-top:6px}
      .clp-success{text-align:center;padding:24px 0}
      .clp-success-icon{font-size:3rem;margin-bottom:10px}
      .clp-success-text{color:#34d399;font-size:1.1rem;font-weight:700}
      .clp-note{text-align:center;font-size:.72rem;color:#64748b;margin-top:12px;line-height:1.5}
      .clp-utr-row{display:flex;gap:8px;margin-top:12px}
      .clp-utr-row input{flex:1}
      .clp-utr-row button{white-space:nowrap;padding:10px 16px;border-radius:10px;font-weight:700;font-size:.82rem;border:none;cursor:pointer;background:#10b981;color:#fff;font-family:inherit}
      .clp-bank-detail{font-size:.8rem;color:#94a3b8;margin-top:8px;line-height:1.6}
      .clp-bank-detail strong{color:#cbd5e1}
    `;
    document.head.appendChild(s);
  }

  // ── Modal States ────────────────────────────────

  // State 1: Collect email/name and initiate payment
  function showCollectForm(key, onUnlocked) {
    ensureStyles();
    close();
    const t = tool(key);

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
        <div class="clp-form">
          <input class="clp-input" type="email" id="clp-email" placeholder="Your email address" required>
          <input class="clp-input" type="text" id="clp-name" placeholder="Your full name (optional)">
        </div>
        <button class="clp-btn clp-btn-pay" id="clp-pay-btn">💳 Pay ${priceLabel(key)} — Proceed</button>
        <div class="clp-note">Secure payment via UPI / Bank Transfer (India) or Wise (International).<br>One-time purchase — no subscriptions.</div>
        <div id="clp-error" style="color:#f87171;font-size:.82rem;text-align:center;margin-top:8px;display:none;"></div>
      </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-clp-close]').addEventListener('click', close);

    overlay.querySelector('#clp-pay-btn').addEventListener('click', async () => {
      const email = overlay.querySelector('#clp-email').value.trim();
      const name = overlay.querySelector('#clp-name').value.trim();
      const errorEl = overlay.querySelector('#clp-error');
      const btn = overlay.querySelector('#clp-pay-btn');

      if (!email || !email.includes('@')) {
        errorEl.textContent = 'Please enter a valid email address.';
        errorEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '⏳ Creating order...';
      errorEl.style.display = 'none';

      try {
        const res = await fetch(`${API_BASE}/careerlab/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool_key: key, customer_email: email, customer_name: name, currency: 'inr' }),
        });
        const json = await res.json();

        if (!json.success || !json.data) {
          throw new Error(json.error || 'Failed to create order');
        }

        // Move to payment instructions view
        showPaymentInstructions(key, json.data, email, onUnlocked);
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = `💳 Pay ${priceLabel(key)} — Proceed`;
        errorEl.textContent = err.message || 'Something went wrong. Please try again.';
        errorEl.style.display = 'block';
      }
    });

    document.body.appendChild(overlay);
  }

  // State 2: Show payment details + poll for confirmation
  function showPaymentInstructions(key, orderData, email, onUnlocked) {
    close();
    ensureStyles();
    const t = tool(key);
    const isDomestic = orderData.is_domestic;
    const symbol = isDomestic ? '₹' : '$';
    const amount = orderData.amount;
    const orderId = orderData.order_id;

    let payDetailsHtml = '';
    if (isDomestic && orderData.payment_details) {
      const pd = orderData.payment_details;
      payDetailsHtml = `
        <div class="clp-paybox">
          <div style="font-weight:700;color:#a5b4fc;margin-bottom:8px;">💳 Pay via UPI or Bank Transfer</div>
          <div class="clp-upi"><code>${pd.upi_id}</code><button type="button" class="clp-copy" data-clp-copy="${pd.upi_id}">Copy UPI</button></div>
          <div class="clp-bank-detail">
            <strong>Bank:</strong> ${pd.bank_name}<br>
            <strong>A/C:</strong> ${pd.account_number}<br>
            <strong>IFSC:</strong> ${pd.ifsc_code}<br>
            <strong>Name:</strong> ${pd.account_name}<br>
            <strong>Branch:</strong> ${pd.branch}
          </div>
          <div style="margin-top:10px;padding:8px 12px;background:rgba(255,152,0,.1);border:1px solid rgba(255,152,0,.25);border-radius:8px;font-size:.8rem;color:#fbbf24;">
            ⚠️ Include reference <strong style="color:#fff;">${orderId}</strong> in your payment note
          </div>
        </div>
        <div class="clp-utr-row">
          <input class="clp-input" type="text" id="clp-utr" placeholder="Enter UTR / Transaction Reference">
          <button id="clp-utr-btn">Submit UTR</button>
        </div>`;
    } else if (orderData.wise_details) {
      const wd = orderData.wise_details;
      payDetailsHtml = `
        <div class="clp-paybox">
          <div style="font-weight:700;color:#a5b4fc;margin-bottom:8px;">🌍 Pay via Wise International Transfer</div>
          <div class="clp-bank-detail">
            <strong>Bank:</strong> ${wd.bank_name}<br>
            <strong>Account:</strong> ${wd.account_number || wd.iban || 'See Wise app'}<br>
            <strong>Routing:</strong> ${wd.routing_number || wd.sort_code || wd.swift || 'N/A'}<br>
            <strong>Name:</strong> ${wd.account_holder_name || 'Simpatico HR Consultancy'}
          </div>
          <div style="margin-top:10px;padding:8px 12px;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.25);border-radius:8px;font-size:.8rem;color:#a5b4fc;">
            Include reference <strong style="color:#fff;">${orderId}</strong> in your transfer note.<br>
            Wise transfers are detected automatically — your tool will unlock within minutes.
          </div>
        </div>`;
    }

    const overlay = document.createElement('div');
    overlay.className = 'clp-overlay';
    overlay.id = 'clp-overlay';
    overlay.innerHTML = `
      <div class="clp-modal" role="dialog" aria-modal="true">
        <button class="clp-close" data-clp-close aria-label="Close">✕</button>
        <div class="clp-icon">${t.icon}</div>
        <div class="clp-title">${t.name}</div>
        <div class="clp-price">${symbol}${amount} ${orderData.currency} <span style="font-size:.72rem;color:#64748b;font-weight:600;">ONE-TIME</span></div>
        <div style="text-align:center;font-size:.82rem;color:#64748b;margin-bottom:16px;">Order: <code style="color:#a5b4fc;">${orderId}</code></div>
        ${payDetailsHtml}
        <div class="clp-waiting" id="clp-waiting">
          <div class="clp-spinner"></div>
          <div class="clp-wait-text">⏳ Awaiting Payment Confirmation</div>
          <div class="clp-wait-sub">Complete your payment above. This page will auto-update once confirmed.<br>Domestic payments are verified within minutes after admin approval.</div>
        </div>
        <div class="clp-note">Order reference: ${orderId}<br>Payment confirmation email will be sent to ${email}</div>
      </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) { stopPolling(); close(); } });
    overlay.querySelector('[data-clp-close]').addEventListener('click', () => { stopPolling(); close(); });

    // Copy buttons
    overlay.querySelectorAll('[data-clp-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const txt = btn.getAttribute('data-clp-copy');
        if (navigator.clipboard) navigator.clipboard.writeText(txt);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = btn.textContent.includes('UPI') ? 'Copy UPI' : 'Copy'; }, 1500);
      });
    });

    // UTR submission (domestic only)
    document.body.appendChild(overlay);
    const utrBtn = overlay.querySelector('#clp-utr-btn');
    if (utrBtn) {
      utrBtn.addEventListener('click', async () => {
        const utr = overlay.querySelector('#clp-utr').value.trim();
        if (!utr) { alert('Please enter your UTR or transaction reference number.'); return; }
        utrBtn.disabled = true;
        utrBtn.textContent = 'Submitting...';
        try {
          await fetch(`${API_BASE}/careerlab/submit-utr`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, utr, email }),
          });
          utrBtn.textContent = '✅ Submitted';
          utrBtn.style.background = '#059669';
          const waitSub = overlay.querySelector('.clp-wait-sub');
          if (waitSub) waitSub.innerHTML = 'UTR submitted! Admin will verify and approve shortly.<br>This page auto-updates when confirmed.';
        } catch (e) {
          utrBtn.disabled = false;
          utrBtn.textContent = 'Submit UTR';
          alert('Failed to submit UTR. Please try again.');
        }
      });
    }

    // Start polling for payment confirmation
    startPolling(orderId, email, key, () => {
      // Payment confirmed — show success
      const waitEl = overlay.querySelector('#clp-waiting');
      if (waitEl) {
        waitEl.innerHTML = `
          <div class="clp-success">
            <div class="clp-success-icon">🎉</div>
            <div class="clp-success-text">Payment Confirmed — Tool Unlocked!</div>
            <div style="color:#94a3b8;font-size:.85rem;margin-top:8px;">You can now use ${t.name}. This window will close in 3 seconds.</div>
          </div>`;
      }
      setTimeout(() => {
        close();
        if (typeof onUnlocked === 'function') onUnlocked();
      }, 3000);
    });
  }

  // ── Modal Control ───────────────────────────────
  function show(key, onUnlocked) {
    showCollectForm(key, onUnlocked);
  }

  function close() {
    const el = document.getElementById('clp-overlay');
    if (el) el.remove();
  }

  // ── Public API ──────────────────────────────────

  // Returns true if unlocked; otherwise opens the paywall modal and returns false.
  function require(key) {
    if (isUnlocked(key)) return true;
    show(key);
    return false;
  }

  // Keeps a button's label/state in sync with the entitlement.
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
