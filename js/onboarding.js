/**
 * onboarding.js — Simpatico HR Platform
 * Onboarding module: Supabase + Cloudflare Workers + AI task suggestions
 */

const OB_CONFIG = {
  supabaseUrl: window.SIMPATICO_CONFIG?.supabaseUrl    || 'https://YOUR_PROJECT.supabase.co',
  supabaseKey: window.SIMPATICO_CONFIG?.supabaseAnonKey || 'YOUR_ANON_KEY',
  workerUrl:   window.SIMPATICO_CONFIG?.workerUrl       || 'https://hr-api.YOUR_SUBDOMAIN.workers.dev',
};

let _sb = null;
function sb() {
  if (_sb) return _sb;
  if (window.supabase) { _sb = window.supabase.createClient(OB_CONFIG.supabaseUrl, OB_CONFIG.supabaseKey); return _sb; }
  return null;
}

let onboardingRecords = [];

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([
    loadUser(),
    loadEmployeeSelects(),
    loadTemplates(),
    loadOnboarding(),
  ]);

  // Set default start date
  const startInput = document.getElementById('ob-start');
  if (startInput) startInput.valueAsDate = new Date();
});

async function loadUser() {
  const client = sb(); if (!client) return;
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    const el = document.getElementById('user-avatar');
    if (el) el.textContent = user.email?.slice(0,2).toUpperCase() || 'U';
  }
}

async function loadEmployeeSelects() {
  const client = sb(); if (!client) return;
  const { data } = await client
    .from('employees')
    .select('id, first_name, last_name')
    .eq('status', 'active')
    .order('first_name');

  ['ob-employee','ob-buddy'].forEach(selId => {
    const sel = document.getElementById(selId); if (!sel) return;
    (data || []).forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.first_name} ${e.last_name}`;
      sel.appendChild(opt);
    });
  });
}

async function loadTemplates() {
  const client = sb(); if (!client) return;
  const { data } = await client
    .from('onboarding_templates')
    .select('id, name')
    .order('name');

  const sel = document.getElementById('ob-template'); if (!sel) return;
  (data || []).forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id; opt.textContent = t.name;
    sel.appendChild(opt);
  });
}

async function loadOnboarding() {
  const client = sb(); if (!client) return;
  const { data, error } = await client
    .from('onboarding_records')
    .select(`
      id, stage, start_date, completion_pct,
      employees(id, first_name, last_name, job_title, departments(name)),
      onboarding_tasks(id, title, due_date, status, notes)
    `)
    .order('start_date', { ascending: false });

  if (error) { console.error(error); return; }
  onboardingRecords = data || [];
  updateStats();
  renderPipeline();
}

function updateStats() {
  const inProgress  = onboardingRecords.filter(r => ['week_1','in_progress'].includes(r.stage)).length;
  const completed   = onboardingRecords.filter(r => r.stage === 'completed').length;
  const allTasks    = onboardingRecords.flatMap(r => r.onboarding_tasks || []);
  const overdue     = allTasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()).length;
  const avgPct      = onboardingRecords.length
    ? Math.round(onboardingRecords.reduce((s, r) => s + (r.completion_pct || 0), 0) / onboardingRecords.length)
    : 0;

  setText('stat-progress',  inProgress);
  setText('stat-completed', completed);
  setText('stat-overdue',   overdue);
  document.getElementById('stat-avg').innerHTML = `${avgPct}<span style="font-size:18px">%</span>`;
}

function renderPipeline() {
  const stages = ['not_started','week_1','in_progress','completed'];
  stages.forEach(stage => {
    const container = document.getElementById(`cards-${stage}`); if (!container) return;
    const records = onboardingRecords.filter(r => r.stage === stage);
    container.innerHTML = records.length === 0
      ? `<div style="padding:20px;text-align:center;color:var(--hr-text-muted);font-size:13px;border:1px dashed var(--hr-border);border-radius:var(--hr-radius)">No employees</div>`
      : records.map(r => renderOnboardCard(r)).join('');
  });
}

function renderOnboardCard(r) {
  const emp      = r.employees;
  const name     = emp ? `${emp.first_name} ${emp.last_name}` : 'Unknown';
  const dept     = emp?.departments?.name || '';
  const role     = emp?.job_title || '';
  const pct      = r.completion_pct || 0;
  const tasks    = r.onboarding_tasks || [];
  const done     = tasks.filter(t => t.status === 'done').length;
  const color    = avatarColor(emp?.id || r.id);
  const initials = emp ? `${emp.first_name[0]}${emp.last_name[0]}` : '??';
  const overdue  = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()).length;

  return `
  <div class="onboard-card" style="margin-bottom:10px" onclick="openChecklist('${r.id}')">
    <div class="hr-emp-avatar" style="background:${color};color:#fff;width:38px;height:38px;font-size:13px">${initials}</div>
    <div class="emp-info">
      <h4>${name}</h4>
      <div class="sub">${role}${dept ? ` · ${dept}` : ''}</div>
      <div style="margin-top:8px">
        <div class="hr-progress-bar"><div class="hr-progress-fill" style="width:${pct}%"></div></div>
        <div style="font-size:11px;color:var(--hr-text-muted);margin-top:4px">${done}/${tasks.length} tasks${overdue ? ` · <span style="color:var(--hr-warning)">${overdue} overdue</span>` : ''}</div>
      </div>
    </div>
    <div class="progress-col">
      <div class="pct">${pct}%</div>
    </div>
  </div>`;
}

window.openChecklist = function(recordId) {
  location.href = `onboarding-checklist.html?id=${recordId}`;
};

window.startOnboarding = async function() {
  const empId    = document.getElementById('ob-employee')?.value;
  const template = document.getElementById('ob-template')?.value;
  const start    = document.getElementById('ob-start')?.value;
  const buddy    = document.getElementById('ob-buddy')?.value;

  if (!empId) { showToast('Please select an employee', 'error'); return; }

  showToast('Starting onboarding…', 'info');
  try {
    const res = await fetch(`${OB_CONFIG.workerUrl}/onboarding/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        employee_id: empId,
        template_id: template || null,
        start_date:  start || new Date().toISOString().slice(0,10),
      }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to start onboarding');
    showToast('Onboarding started!', 'success');
    closeModal('start-modal');
    await loadOnboarding();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.openStartModal    = () => openModal('start-modal');
window.openTemplateModal = () => showToast('Template manager coming soon', 'info');

// ── AI-generated checklist suggestions via Cloudflare AI ──
window.generateAIChecklist = async function(role, department) {
  try {
    const res = await fetch(`${OB_CONFIG.workerUrl}/ai/onboarding-checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ role, department }),
    });
    const { tasks } = await res.json();
    return tasks || [];
  } catch { return []; }
};

function authHeaders() {
  let token = localStorage.getItem('simpatico_token') || localStorage.getItem('sb-token') || '';
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
            try { token = JSON.parse(localStorage.getItem(k)).access_token; } catch(e){}
        }
    }
  }
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}
function avatarColor(id) {
  const colors = ['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4'];
  let h = 0; for (const c of (id||'')) h = (h*31+c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
window.openModal  = id => document.getElementById(id)?.classList.add('open');
window.closeModal = id => document.getElementById(id)?.classList.remove('open');
window.showToast  = (msg, type='info') => {
  const c = document.getElementById('toasts'); if (!c) return;
  const t = document.createElement('div');
  t.className = `hr-toast ${type}`;
  t.textContent = msg; c.appendChild(t);
  setTimeout(() => t.remove(), 3800);
};
