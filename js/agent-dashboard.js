// ═══════════════════════════════════════════════════════════════
// Simpatico HR — Agent Dashboard JS
// ═══════════════════════════════════════════════════════════════

const API_BASE = 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev';

const AGENT_META = {
  recruitment: { icon: 'fa-crosshairs', label: 'Recruitment Agent', iconClass: 'icon-recruit',
    desc: 'Scores incoming applications against job descriptions using AI. Auto-shortlists candidates above threshold.' },
  onboarding: { icon: 'fa-hand-wave', label: 'Onboarding Agent', iconClass: 'icon-onboard',
    desc: 'Monitors onboarding tasks and flags overdue items. Sends nudge reminders to assignees.' },
  debrief: { icon: 'fa-video', label: 'Interview Debrief', iconClass: 'icon-debrief',
    desc: 'Generates structured scorecards from completed interview transcripts. Recommends hire/no-hire.' },
  leave: { icon: 'fa-calendar-check', label: 'Leave Agent', iconClass: 'icon-leave',
    desc: 'Auto-processes simple leave requests (≤2 days sick/annual). Escalates complex requests.' },
  anomaly: { icon: 'fa-magnifying-glass-chart', label: 'Anomaly Detection', iconClass: 'icon-anomaly',
    desc: 'Detects salary outliers (>3x median) and attendance anomalies. Flags for HR review.' },
  ticket: { icon: 'fa-ticket', label: 'Ticket Triage', iconClass: 'icon-ticket',
    desc: 'Escalates HR tickets open longer than 48 hours. Prioritizes by severity and age.' },
};

const ACTION_ICONS = {
  shortlist_candidate: 'fa-user-check',
  score_candidate: 'fa-star-half-stroke',
  flag_overdue_task: 'fa-flag',
  generate_scorecard: 'fa-clipboard-check',
  auto_approve_leave: 'fa-calendar-check',
  approve_leave: 'fa-calendar-plus',
  escalate_leave: 'fa-arrow-up-right-from-square',
  salary_outlier: 'fa-triangle-exclamation',
  escalate_ticket: 'fa-ticket',
};

const DOT_COLORS = {
  recruitment: 'dot-blue', onboarding: 'dot-green', debrief: 'dot-cyan',
  leave: 'dot-amber', anomaly: 'dot-red', ticket: 'dot-cyan',
};

// ── Auth ──
function getToken() {
  try {
    const raw = localStorage.getItem('sb-auth-token') || localStorage.getItem('supabase.auth.token');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.currentSession?.access_token || parsed?.access_token || parsed;
  } catch { return localStorage.getItem('sb-auth-token'); }
}

function authHeaders() {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const tenantId = localStorage.getItem('tenant_id') || localStorage.getItem('company_id');
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  return headers;
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders(), ...opts });
  if (res.status === 401) {
    window.location.href = 'platform/login.html?redirect=agent-dashboard.html';
    throw new Error('Unauthorized');
  }
  return res.json();
}

// ── State ──
let agentConfig = null;
let pendingActions = [];
let recentActions = [];

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  const token = getToken();
  if (!token) {
    window.location.href = 'platform/login.html?redirect=agent-dashboard.html';
    return;
  }
  await loadAll();
});

async function loadAll() {
  await Promise.all([loadConfig(), loadStats(), loadPending(), loadActivity()]);
}

// ── Load Config ──
async function loadConfig() {
  try {
    const res = await apiFetch('/agents/config');
    if (!res.success) throw new Error(res.error);
    agentConfig = res.data;

    const planLimits = agentConfig.plan_limits || {};
    const isAllowed = planLimits.allowed;

    // Update plan badge
    const badge = document.getElementById('planBadge');
    const plan = (agentConfig.plan || 'free').toLowerCase();
    if (plan.includes('enterprise')) {
      badge.textContent = 'ENTERPRISE';
      badge.className = 'plan-badge plan-enterprise';
    } else if (plan.includes('professional') || plan.includes('pro')) {
      badge.textContent = 'PROFESSIONAL';
      badge.className = 'plan-badge plan-pro';
    } else {
      badge.textContent = plan.toUpperCase();
      badge.className = 'plan-badge plan-locked';
    }

    // Show/hide upgrade banner
    document.getElementById('upgradeBanner').style.display = isAllowed ? 'none' : 'block';

    // Master toggle
    const toggle = document.getElementById('masterToggle');
    toggle.checked = !!agentConfig.agent_mode;
    toggle.disabled = !isAllowed;

    // Run Now button
    document.getElementById('btnRunNow').disabled = !agentConfig.agent_mode;

    // Render agent cards
    renderAgentCards(agentConfig, planLimits);
  } catch (err) {
    console.error('Failed to load agent config:', err);
  }
}

// ── Render Agent Cards ──
function renderAgentCards(config, planLimits) {
  const grid = document.getElementById('agentsGrid');
  const allAgents = ['recruitment', 'onboarding', 'debrief', 'leave', 'anomaly', 'ticket'];
  const allowedAgents = planLimits.agents || [];
  const existingConfigs = config.configs || [];

  let activeCount = 0;
  grid.innerHTML = '';

  for (const agentType of allAgents) {
    const meta = AGENT_META[agentType];
    const isAllowed = allowedAgents.includes(agentType);
    const cfg = existingConfigs.find(c => c.agent_type === agentType);
    const isEnabled = cfg ? cfg.enabled : isAllowed;
    const isAutoApprove = cfg ? cfg.auto_approve : false;

    if (isEnabled && isAllowed) activeCount++;

    const card = document.createElement('div');
    card.className = `agent-card${isAllowed ? '' : ' locked'}`;
    card.innerHTML = `
      ${!isAllowed ? `<div class="locked-overlay"><i class="fas fa-lock" style="font-size:1.4rem;"></i><span>Enterprise Only</span></div>` : ''}
      <div class="agent-card-top">
        <div class="agent-card-info">
          <div class="agent-icon ${meta.iconClass}"><i class="fas ${meta.icon}"></i></div>
          <span class="agent-name">${meta.label}</span>
        </div>
      </div>
      <div class="agent-desc">${meta.desc}</div>
      <div class="agent-controls">
        <div class="agent-control-item">
          <span>Enabled</span>
          <label class="mini-toggle">
            <input type="checkbox" ${isEnabled ? 'checked' : ''} ${!isAllowed ? 'disabled' : ''} onchange="saveAgentConfig('${agentType}', this.checked, ${isAutoApprove})">
            <span class="slider"></span>
          </label>
        </div>
        <div class="agent-control-item">
          <span>Auto-approve</span>
          <label class="mini-toggle">
            <input type="checkbox" ${isAutoApprove ? 'checked' : ''} ${!isAllowed || !planLimits.canAutoApprove ? 'disabled' : ''} onchange="saveAgentConfig('${agentType}', ${isEnabled}, this.checked)">
            <span class="slider"></span>
          </label>
        </div>
      </div>
    `;
    grid.appendChild(card);
  }

  document.getElementById('agentCountBadge').textContent = `${activeCount} Active`;
}

// ── Load Stats ──
async function loadStats() {
  try {
    const res = await apiFetch('/agents/stats');
    if (!res.success) return;
    const d = res.data;
    document.getElementById('statActions').textContent = d.actions_today || 0;
    document.getElementById('statAuto').textContent = d.auto_approved || 0;
    document.getElementById('statPending').textContent = d.pending_review || 0;
    document.getElementById('statSaved').textContent = d.time_saved_minutes || 0;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// ── Load Pending Approvals ──
async function loadPending() {
  try {
    const res = await apiFetch('/agents/actions?status=pending_approval&limit=20');
    if (!res.success) return;
    pendingActions = res.data || [];
    renderPending();
  } catch (err) {
    console.error('Failed to load pending:', err);
  }
}

function renderPending() {
  const container = document.getElementById('pendingList');
  document.getElementById('pendingCountBadge').textContent = pendingActions.length;

  if (!pendingActions.length) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><p>No pending approvals. All clear!</p></div>`;
    return;
  }

  container.innerHTML = '';
  for (const action of pendingActions) {
    const meta = AGENT_META[action.agent_type] || {};
    const icon = ACTION_ICONS[action.action_type] || 'fa-circle';
    const card = document.createElement('div');
    card.className = 'approval-card';
    card.id = `approval-${action.id}`;
    card.innerHTML = `
      <div class="approval-left">
        <div class="approval-icon ${meta.iconClass || 'icon-recruit'}"><i class="fas ${icon}"></i></div>
        <div>
          <div class="approval-text">${escHtml(action.description || action.action_type)}</div>
          <div class="approval-time">${timeAgo(action.created_at)} · ${meta.label || action.agent_type}</div>
        </div>
      </div>
      <div class="approval-actions">
        <button class="btn-approve" title="Approve" onclick="approveAction('${action.id}')"><i class="fas fa-check"></i></button>
        <button class="btn-reject" title="Reject" onclick="rejectAction('${action.id}')"><i class="fas fa-times"></i></button>
      </div>
    `;
    container.appendChild(card);
  }
}

// ── Load Activity Timeline ──
async function loadActivity() {
  try {
    const res = await apiFetch('/agents/actions?limit=30');
    if (!res.success) return;
    recentActions = res.data || [];
    renderActivity();
  } catch (err) {
    console.error('Failed to load activity:', err);
  }
}

function renderActivity() {
  const container = document.getElementById('activityList');

  if (!recentActions.length) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-robot"></i><p>No agent activity yet. Enable agents and run them to see results here.</p></div>`;
    return;
  }

  container.innerHTML = '';
  for (const action of recentActions) {
    const dotColor = DOT_COLORS[action.agent_type] || 'dot-blue';
    const statusIcon = action.status === 'executed' ? '✓' : action.status === 'pending_approval' ? '⏳' : action.status === 'approved' ? '✅' : action.status === 'rejected' ? '❌' : '•';
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <div class="timeline-dot ${dotColor}"></div>
      <div class="timeline-content">
        <div class="timeline-text">${statusIcon} ${escHtml(action.description || action.action_type)}</div>
        <div class="timeline-time">${formatTime(action.created_at)} · ${(AGENT_META[action.agent_type]?.label || action.agent_type)}</div>
      </div>
    `;
    container.appendChild(item);
  }
}

// ── Actions ──

async function toggleAgentMode(enabled) {
  try {
    const res = await apiFetch('/agents/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
    if (!res.success) {
      alert(res.error || 'Failed to toggle agent mode');
      document.getElementById('masterToggle').checked = !enabled;
      return;
    }
    document.getElementById('btnRunNow').disabled = !enabled;
    showToast(enabled ? '⚡ Agent Mode activated!' : 'Agent Mode deactivated');
  } catch (err) {
    alert('Error: ' + err.message);
    document.getElementById('masterToggle').checked = !enabled;
  }
}

async function saveAgentConfig(agentType, enabled, autoApprove) {
  try {
    await apiFetch('/agents/config', {
      method: 'POST',
      body: JSON.stringify({ agent_type: agentType, enabled, auto_approve: autoApprove }),
    });
    await loadConfig();
  } catch (err) {
    alert('Failed to save config: ' + err.message);
  }
}

async function approveAction(actionId) {
  const card = document.getElementById(`approval-${actionId}`);
  if (card) card.style.opacity = '0.5';
  try {
    const res = await apiFetch(`/agents/actions/${actionId}/approve`, { method: 'POST' });
    if (!res.success) throw new Error(res.error);
    showToast('✅ Action approved and executed');
    await Promise.all([loadPending(), loadStats(), loadActivity()]);
  } catch (err) {
    alert('Approve failed: ' + err.message);
    if (card) card.style.opacity = '1';
  }
}

async function rejectAction(actionId) {
  const card = document.getElementById(`approval-${actionId}`);
  if (card) card.style.opacity = '0.5';
  try {
    const res = await apiFetch(`/agents/actions/${actionId}/reject`, { method: 'POST' });
    if (!res.success) throw new Error(res.error);
    showToast('❌ Action rejected');
    await Promise.all([loadPending(), loadStats(), loadActivity()]);
  } catch (err) {
    alert('Reject failed: ' + err.message);
    if (card) card.style.opacity = '1';
  }
}

async function runAgentsNow() {
  const btn = document.getElementById('btnRunNow');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
  try {
    const res = await apiFetch('/agents/run-now', { method: 'POST' });
    if (!res.success) throw new Error(res.error);
    showToast('⚡ Agent run triggered! Refreshing...');
    setTimeout(async () => {
      await loadAll();
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-play"></i> Run Now';
    }, 3000);
  } catch (err) {
    alert('Run failed: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-play"></i> Run Now';
  }
}

// ── Helpers ──

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) + ' · ' +
         d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '24px', right: '24px', background: 'rgba(15,20,35,0.95)',
    border: '1px solid rgba(99,102,241,0.3)', color: '#e2e8f0', padding: '12px 20px',
    borderRadius: '12px', fontSize: '.88rem', fontWeight: '600', zIndex: '9999',
    backdropFilter: 'blur(12px)', boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
    animation: 'fadeInUp .3s ease', fontFamily: 'Inter, sans-serif',
  });

  const style = document.createElement('style');
  style.textContent = '@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(style);

  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}
