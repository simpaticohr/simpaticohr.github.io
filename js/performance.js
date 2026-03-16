/**
 * performance.js — Simpatico HR Platform
 * Performance reviews, goals, 9-box grid, AI-assisted feedback
 */

const PERF_CONFIG = {
  supabaseUrl: window.SIMPATICO_CONFIG?.supabaseUrl    || 'https://YOUR_PROJECT.supabase.co',
  supabaseKey: window.SIMPATICO_CONFIG?.supabaseAnonKey || 'YOUR_ANON_KEY',
  workerUrl:   window.SIMPATICO_CONFIG?.workerUrl       || 'https://hr-api.YOUR_SUBDOMAIN.workers.dev',
};

let _sb = null;
function sb() {
  if (_sb) return _sb;
  if (window.supabase) { _sb = window.supabase.createClient(PERF_CONFIG.supabaseUrl, PERF_CONFIG.supabaseKey); return _sb; }
  return null;
}

let allReviews = [];
let allGoals   = [];
let allCycles  = [];

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadUser(), loadCycles(), loadReviews(), loadGoals()]);
  renderNineBox();
});

async function loadUser() {
  const client = window.SimpaticoDB; if (!client) return;
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    const el = document.getElementById('user-avatar');
    if (el) el.textContent = user.email?.slice(0,2).toUpperCase() || 'U';
  }
}

async function loadCycles() {
  const client = window.SimpaticoDB; if (!client) return;
  const { data } = await client
    .from('review_cycles')
    .select('id, name, type, start_date, end_date, status')
    .order('created_at', { ascending: false });
  allCycles = data || [];

  const sel = document.getElementById('cycle-filter'); if (!sel) return;
  allCycles.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.name;
    sel.appendChild(opt);
  });

  const active = allCycles.filter(c => c.status === 'active').length;
  setText('stat-cycles', active);
}

async function loadReviews() {
  const client = window.SimpaticoDB; if (!client) return;
  const { data, error } = await client
    .from('performance_reviews')
    .select(`
      id, period, score, status, created_at, cycle_id,
      employees(id, first_name, last_name, job_title, departments(name)),
      reviewer:employees!reviewer_id(first_name, last_name)
    `)
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }
  allReviews = data || [];

  const pending  = allReviews.filter(r => r.status === 'draft' || r.status === 'in_progress').length;
  const scores   = allReviews.filter(r => r.score).map(r => r.score);
  const avgScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;

  setText('stat-pending', pending);
  setText('stat-avg-score', avgScore || '—');
  if (avgScore) setText('stat-avg-sub', `${avgScore}/100 average`);

  renderReviews(allReviews);
}

function renderReviews(list) {
  const container = document.getElementById('reviews-list'); if (!container) return;
  if (list.length === 0) {
    container.innerHTML = '<div class="hr-empty" style="grid-column:1/-1"><p>No reviews found.</p><button class="hr-btn hr-btn-primary" style="margin-top:16px" onclick="openReviewCycleModal()">Start a Review Cycle</button></div>';
    return;
  }
  container.innerHTML = list.map(r => {
    const emp      = r.employees;
    const name     = emp ? `${emp.first_name} ${emp.last_name}` : 'Unknown';
    const dept     = emp?.departments?.name || '';
    const role     = emp?.job_title || '';
    const color    = avatarColor(emp?.id || r.id);
    const initials = emp ? `${emp.first_name[0]}${emp.last_name[0]}` : '?';
    const badgeClass = { draft:'hr-badge-pending', in_progress:'hr-badge-info', submitted:'hr-badge-info', completed:'hr-badge-active' }[r.status] || 'hr-badge-inactive';

    return `
    <div class="review-card" onclick="openReview('${r.id}')">
      <div class="rc-head">
        <div class="emp-row">
          <div class="hr-emp-avatar" style="background:${color};color:#fff;width:38px;height:38px;font-size:13px">${initials}</div>
          <div>
            <div style="font-weight:600;font-size:14px">${name}</div>
            <div style="font-size:12px;color:var(--hr-text-muted)">${role}${dept?' · '+dept:''}</div>
          </div>
        </div>
        ${r.score ? `<div class="score-display">${r.score}<small>/100</small></div>` : '<div style="color:var(--hr-text-muted);font-size:13px">No score yet</div>'}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:13px;color:var(--hr-text-secondary)">${r.period}</div>
        <span class="hr-badge ${badgeClass}">${r.status?.replace('_',' ')}</span>
      </div>
      <div style="display:flex;gap:6px;margin-top:12px">
        <button class="hr-btn hr-btn-ghost hr-btn-sm hr-w-full" onclick="event.stopPropagation();openReview('${r.id}')">
          ${r.status === 'completed' ? 'View' : 'Continue'}
        </button>
        <button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="event.stopPropagation();generateAIFeedback('${r.id}')">? AI</button>
      </div>
    </div>`;
  }).join('');
}

async function loadGoals() {
  const client = window.SimpaticoDB; if (!client) return;
  const { data, error } = await client
    .from('performance_goals')
    .select(`
      id, title, description, period, progress, status, due_date,
      employees(first_name, last_name)
    `)
    .order('due_date');

  if (error) { console.error(error); return; }
  allGoals = data || [];

  const achieved = allGoals.filter(g => g.status === 'achieved').length;
  const pct = allGoals.length ? Math.round(achieved / allGoals.length * 100) : 0;
  document.getElementById('stat-goals').innerHTML = `${pct}<span style="font-size:18px">%</span>`;

  renderGoals(allGoals);
}

function renderGoals(list) {
  const tbody = document.getElementById('goals-tbody'); if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--hr-text-muted);padding:40px">No goals set yet.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(g => {
    const emp  = g.employees;
    const name = emp ? `${emp.first_name} ${emp.last_name}` : '—';
    const pct  = g.progress || (g.status === 'achieved' ? 100 : 0);
    const badgeClass = { achieved:'hr-badge-active', in_progress:'hr-badge-info', not_started:'hr-badge-inactive', cancelled:'hr-badge-danger' }[g.status] || 'hr-badge-pending';
    return `<tr>
      <td><span class="primary-text">${name}</span></td>
      <td><div style="font-weight:500">${g.title}</div><div style="font-size:12px;color:var(--hr-text-muted)">${g.description?.slice(0,60) || ''}</div></td>
      <td>${g.period || '—'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="hr-progress-bar" style="width:80px"><div class="hr-progress-fill" style="width:${pct}%"></div></div>
          <span style="font-size:12px;color:var(--hr-text-muted)">${pct}%</span>
        </div>
      </td>
      <td><span class="hr-badge ${badgeClass}">${g.status?.replace('_',' ')}</span></td>
      <td>
        <button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="updateGoalProgress('${g.id}')">Update</button>
      </td>
    </tr>`;
  }).join('');
}

// -- 9-Box Grid --
function renderNineBox() {
  const grid = document.getElementById('nine-box-grid'); if (!grid) return;
  const boxes = [
    { label:'Low Performer\nLow Potential',   bg:'rgba(239,68,68,.08)',  borderColor:'rgba(239,68,68,.2)'  },
    { label:'Core Employee\nLow Potential',   bg:'rgba(245,158,11,.08)', borderColor:'rgba(245,158,11,.2)' },
    { label:'High Performer\nLow Potential',  bg:'rgba(16,185,129,.08)', borderColor:'rgba(16,185,129,.2)' },
    { label:'Low Performer\nMedium Potential',bg:'rgba(245,158,11,.08)', borderColor:'rgba(245,158,11,.2)' },
    { label:'Core Employee\nMedium Potential',bg:'rgba(99,102,241,.08)', borderColor:'rgba(99,102,241,.2)' },
    { label:'High Performer\nMedium Potential',bg:'rgba(16,185,129,.08)',borderColor:'rgba(16,185,129,.2)' },
    { label:'Low Performer\nHigh Potential',  bg:'rgba(99,102,241,.08)', borderColor:'rgba(99,102,241,.2)' },
    { label:'Rising Star\nHigh Potential',    bg:'rgba(0,196,255,.08)',   borderColor:'rgba(0,196,255,.2)'  },
    { label:'Star Performer\nHigh Potential', bg:'rgba(0,196,255,.12)',   borderColor:'rgba(0,196,255,.35)' },
  ];
  // Axis labels
  grid.style.position = 'relative';
  grid.innerHTML = boxes.map((b, i) => `
    <div style="background:${b.bg};border:1px solid ${b.borderColor};border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:6px">
      <div style="font-size:11px;font-weight:600;color:var(--hr-text-secondary);white-space:pre-line;line-height:1.3">${b.label}</div>
      <div id="nine-box-${i}" style="display:flex;flex-wrap:wrap;gap:4px;flex:1;align-content:flex-start"></div>
    </div>`).join('');

  // Place employees (based on score quartiles and tenure as proxy for potential)
  allReviews.filter(r => r.score && r.employees).forEach(r => {
    const perf = r.score >= 80 ? 2 : r.score >= 60 ? 1 : 0;
    // Tenure as potential proxy
    const potential = 1; // Middle row default without deeper data
    const idx = potential * 3 + perf;
    const cell = document.getElementById(`nine-box-${idx}`);
    if (cell) {
      const emp = r.employees;
      const initials = `${emp.first_name[0]}${emp.last_name[0]}`;
      const color = avatarColor(emp.id);
      cell.innerHTML += `<div title="${emp.first_name} ${emp.last_name}" class="hr-emp-avatar" style="background:${color};color:#fff;width:26px;height:26px;font-size:9px;cursor:pointer" onclick="location.href='employee-profile.html?id=${emp.id}'">${initials}</div>`;
    }
  });
}

// -- Review Cycle --
window.openReviewCycleModal = () => openModal('review-cycle-modal');

window.createReviewCycle = async function() {
  const name  = document.getElementById('cycle-name')?.value.trim();
  const start = document.getElementById('cycle-start')?.value;
  const end   = document.getElementById('cycle-end')?.value;
  const type  = document.getElementById('cycle-type')?.value;
  const scope = document.getElementById('cycle-scope')?.value;

  if (!name) { showToast('Cycle name required', 'error'); return; }

  try {
    const res = await fetch(`${PERF_CONFIG.workerUrl}/performance/cycles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name, start_date: start, end_date: end, type, scope }),
    });
    if (!res.ok) throw new Error('Failed to create cycle');
    showToast('Review cycle launched!', 'success');
    closeModal('review-cycle-modal');
    await Promise.all([loadCycles(), loadReviews()]);
  } catch (err) { showToast(err.message, 'error'); }
};

// -- AI Feedback via Cloudflare AI --
window.generateAIFeedback = async function(reviewId) {
  showToast('Generating AI feedback suggestions…', 'info');
  try {
    const res = await fetch(`${PERF_CONFIG.workerUrl}/ai/performance-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ review_id: reviewId }),
    });
    const { feedback } = await res.json();
    if (feedback) {
      // Open a simple display
      alert(`AI Feedback Suggestions:\n\n${feedback}`);
    }
  } catch { showToast('AI feedback unavailable', 'error'); }
};

window.openReview = function(id) {
  location.href = `review-form.html?id=${id}`;
};
window.openGoalsModal   = () => openModal('goals-modal');
window.openAddGoalModal = () => showToast('Add goal — coming soon', 'info');
window.updateGoalProgress = (id) => showToast('Update goal — coming soon', 'info');
window.filterReviews = () => {
  const q  = (document.getElementById('review-search')?.value || '').toLowerCase();
  const cy = document.getElementById('cycle-filter')?.value || '';
  const st = document.getElementById('review-status-filter')?.value || '';
  const filtered = allReviews.filter(r => {
    const name = `${r.employees?.first_name||''} ${r.employees?.last_name||}`.toLowerCase();
    return (!q || name.includes(q)) && (!cy || r.cycle_id === cy) && (!st || r.status === st);
  });
  renderReviews(filtered);
};

window.switchPerfTab = function(btn, tabId) {
  document.querySelectorAll('#perf-tabs .hr-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['tab-reviews','tab-goals','tab-nine-box'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === tabId ? 'block' : 'none';
  });
  if (tabId === 'tab-nine-box') renderNineBox();
};

function authHeaders() {
  const token = (await window.SimpaticoDB.auth.getSession())?.data?.session?.access_token || localStorage.getItem('sb-token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}
function avatarColor(id) {
  const c = ['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4'];
  let h=0; for(const ch of (id||'')) h=(h*31+ch.charCodeAt(0))&0xffffffff;
  return c[Math.abs(h)%c.length];
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
window.openModal  = id => document.getElementById(id)?.classList.add('open');
window.closeModal = id => document.getElementById(id)?.classList.remove('open');
window.showToast  = (msg, type='info') => {
  const c = document.getElementById('toasts'); if (!c) return;
  const t = document.createElement('div'); t.className = `hr-toast ${type}`; t.textContent = msg;
  c.appendChild(t); setTimeout(() => t.remove(), 3800);
};



