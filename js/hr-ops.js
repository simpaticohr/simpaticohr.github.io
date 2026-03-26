/**
 * hr-ops.js — Simpatico HR Platform
 * Leave management, policies (R2), HR tickets, org chart
 */

const OPS_CONFIG = {
  supabaseUrl: window.SIMPATICO_CONFIG?.supabaseUrl    || 'https://YOUR_PROJECT.supabase.co',
  supabaseKey: window.SIMPATICO_CONFIG?.supabaseAnonKey || 'YOUR_ANON_KEY',
  workerUrl:   window.SIMPATICO_CONFIG?.workerUrl       || 'https://hr-api.YOUR_SUBDOMAIN.workers.dev',
  r2PublicUrl: window.SIMPATICO_CONFIG?.r2PublicUrl     || 'https://files.YOUR_DOMAIN.com',
};

let _sb = null;
function sb() {
  if (_sb) return _sb;
  if (window.supabase) { _sb = window.supabase.createClient(OPS_CONFIG.supabaseUrl, OPS_CONFIG.supabaseKey); return _sb; }
  return null;
}

let allLeave   = [];
let allTickets = [];

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadUser(), loadLeave(), loadPolicies(), loadTickets(), loadEmployeeSelect()]);
});

async function loadUser() {
  const client = sb(); if (!client) return;
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    const el = document.getElementById('user-avatar');
    if (el) el.textContent = user.email?.slice(0,2).toUpperCase() || 'U';
  }
}

async function loadEmployeeSelect() {
  const client = sb(); if (!client) return;
  const { data } = await client.from('employees').select('id,first_name,last_name').eq('status','active').order('first_name');
  const sel = document.getElementById('leave-employee'); if (!sel) return;
  (data||[]).forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id; opt.textContent = `${e.first_name} ${e.last_name}`;
    sel.appendChild(opt);
  });
}

// ── Leave ──
async function loadLeave() {
  const client = sb(); if (!client) return;
  const today = new Date().toISOString().slice(0,10);
  const thirtyDaysAgo = new Date(Date.now()-30*24*60*60*1000).toISOString().slice(0,10);

  const { data, error } = await client
    .from('leave_requests')
    .select(`
      id, type, from_date, to_date, days, reason, status, created_at,
      employees(first_name, last_name),
      approver:employees!approver_id(first_name, last_name)
    `)
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }
  allLeave = data || [];

  const pending  = allLeave.filter(l => l.status === 'pending').length;
  const onToday  = allLeave.filter(l => l.status === 'approved' && l.from_date <= today && l.to_date >= today).length;
  const approved = allLeave.filter(l => l.status === 'approved' && l.created_at >= thirtyDaysAgo).length;

  setText('stat-pending', pending);
  setText('stat-today',   onToday);
  setText('stat-approved',approved);
  renderLeaveTable(allLeave);
}

function renderLeaveTable(list) {
  const tbody = document.getElementById('leave-tbody'); if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--hr-text-muted)">No leave requests found.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(l => {
    const emp  = l.employees;
    const name = emp ? `${emp.first_name} ${emp.last_name}` : '—';
    const type = l.type?.replace('_',' ');
    const badgeClass = { pending:'hr-badge-pending', approved:'hr-badge-active', rejected:'hr-badge-danger' }[l.status] || 'hr-badge-inactive';
    const actions = l.status === 'pending'
      ? `<button class="hr-btn hr-btn-primary hr-btn-sm" style="margin-right:4px" onclick="approveLeave('${l.id}')">Approve</button>
         <button class="hr-btn hr-btn-danger hr-btn-sm" onclick="rejectLeave('${l.id}')">Reject</button>`
      : `<span style="font-size:12px;color:var(--hr-text-muted)">${l.approver?`${l.approver.first_name} ${l.approver.last_name}`:''}</span>`;
    return `<tr>
      <td><span class="primary-text">${name}</span></td>
      <td>${type}</td>
      <td>${l.from_date || '—'}</td>
      <td>${l.to_date || '—'}</td>
      <td>${l.days || '—'}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.reason || '—'}</td>
      <td><span class="hr-badge ${badgeClass}">${l.status}</span></td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}

window.filterLeave = () => {
  const st   = document.getElementById('leave-status-filter')?.value || '';
  const type = document.getElementById('leave-type-filter')?.value || '';
  renderLeaveTable(allLeave.filter(l => (!st||l.status===st) && (!type||l.type===type)));
};

window.approveLeave = async (id) => updateLeaveStatus(id, 'approved');
window.rejectLeave  = async (id) => updateLeaveStatus(id, 'rejected');

async function updateLeaveStatus(id, status) {
  try {
    const res = await fetch(`${OPS_CONFIG.workerUrl}/leave/${id}/${status}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    if (!res.ok) throw new Error('Failed to update leave');
    showToast(`Leave ${status}`, 'success');
    await loadLeave();
  } catch (err) { showToast(err.message, 'error'); }
}

window.openLeaveRequestModal = () => openModal('leave-modal');

window.submitLeaveRequest = async function() {
  const empId  = document.getElementById('leave-employee')?.value;
  const type   = document.getElementById('leave-type')?.value;
  const from   = document.getElementById('leave-from')?.value;
  const to     = document.getElementById('leave-to')?.value;
  const reason = document.getElementById('leave-reason')?.value.trim();

  if (!empId || !from || !to) { showToast('Employee and dates required', 'error'); return; }

  const days = Math.round((new Date(to) - new Date(from)) / (1000*60*60*24)) + 1;

  try {
    const res = await fetch(`${OPS_CONFIG.workerUrl}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ employee_id: empId, type, from_date: from, to_date: to, days, reason }),
    });
    if (!res.ok) throw new Error('Failed to submit request');
    showToast('Leave request submitted', 'success');
    closeModal('leave-modal');
    await loadLeave();
  } catch (err) { showToast(err.message, 'error'); }
};

// ── Policies ──
async function loadPolicies() {
  const client = sb(); if (!client) return;
  const { data } = await client
    .from('hr_policies')
    .select('id, name, category, version, file_key, updated_at')
    .order('updated_at', { ascending: false });

  const container = document.getElementById('policies-list'); if (!container) return;
  const policies = data || [];
  if (policies.length === 0) {
    container.innerHTML = '<div class="hr-empty" style="grid-column:1/-1"><p>No policies uploaded yet.</p></div>';
    return;
  }

  container.innerHTML = policies.map(p => {
    const updated = new Date(p.updated_at).toLocaleDateString();
    const catColors = { hr:'#0ea5e9', legal:'#ef4444', it:'#8b5cf6', finance:'#f59e0b' };
    const color = catColors[p.category] || '#64748b';
    return `
    <div class="hr-card" style="cursor:pointer" onclick="downloadPolicy('${p.file_key}','${p.name}')">
      <div style="display:flex;align-items:flex-start;gap:12px">
        <div style="width:40px;height:40px;border-radius:8px;background:rgba(${hexToRgb(color)},.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${color}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:14px">${p.name}</div>
          <div style="font-size:12px;color:var(--hr-text-muted);margin-top:3px">v${p.version} · Updated ${updated}</div>
          <span class="hr-chip" style="margin-top:8px">${p.category || 'General'}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

window.downloadPolicy = async function(key, name) {
  try {
    const res = await fetch(`${OPS_CONFIG.workerUrl}/r2/signed-url?key=${encodeURIComponent(key)}`, { headers: authHeaders() });
    const { url } = await res.json();
    window.open(url, '_blank');
  } catch { showToast('Failed to open policy', 'error'); }
};

window.uploadPolicy = async function() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.pdf,.doc,.docx';
  input.onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const name = prompt('Policy name:', file.name.replace(/\.[^.]+$/,''));
    if (!name) return;
    showToast('Uploading policy…', 'info');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    try {
      const res = await fetch(`${OPS_CONFIG.workerUrl}/policies`, {
        method: 'POST', headers: authHeaders(), body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      showToast('Policy uploaded', 'success');
      await loadPolicies();
    } catch (err) { showToast(err.message, 'error'); }
  };
  input.click();
};

// ── HR Tickets ──
async function loadTickets() {
  const client = sb(); if (!client) return;
  const { data, error } = await client
    .from('hr_tickets')
    .select(`
      id, ticket_number, category, subject, priority, status, created_at,
      employees(first_name, last_name),
      assignee:employees!assignee_id(first_name, last_name)
    `)
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }
  allTickets = data || [];
  setText('stat-tickets', allTickets.filter(t => t.status === 'open').length);
  renderTickets(allTickets);
}

function renderTickets(list) {
  const tbody = document.getElementById('tickets-tbody'); if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--hr-text-muted)">No tickets found.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(t => {
    const emp = t.employees;
    const assignee = t.assignee ? `${t.assignee.first_name} ${t.assignee.last_name}` : 'Unassigned';
    const pBadge = { high:'hr-badge-danger', medium:'hr-badge-pending', low:'hr-badge-inactive' }[t.priority] || 'hr-badge-inactive';
    const sBadge = { open:'hr-badge-info', in_progress:'hr-badge-pending', resolved:'hr-badge-active', closed:'hr-badge-inactive' }[t.status] || 'hr-badge-inactive';
    return `<tr>
      <td><span class="primary-text hr-font-mono">${t.ticket_number || t.id.slice(0,8).toUpperCase()}</span></td>
      <td>${emp ? `${emp.first_name} ${emp.last_name}` : '—'}</td>
      <td>${t.category || '—'}</td>
      <td>${t.subject}</td>
      <td><span class="hr-badge ${pBadge}">${t.priority}</span></td>
      <td><span class="hr-badge ${sBadge}">${t.status?.replace('_',' ')}</span></td>
      <td>${assignee}</td>
    </tr>`;
  }).join('');
}

window.openTicketModal = () => showToast('New ticket modal — coming soon', 'info');

// ── Org Chart (simple tree) ──
window.loadOrgChart = async function() {
  const client = sb(); if (!client) return;
  const { data } = await client
    .from('employees')
    .select('id, first_name, last_name, job_title, manager_id, departments(name)')
    .eq('status', 'active');

  const employees = data || [];
  const container = document.getElementById('org-chart'); if (!container) return;

  function buildTree(managerId, depth=0) {
    const reports = employees.filter(e => e.manager_id === managerId || (!managerId && !e.manager_id));
    if (reports.length === 0) return '';
    return reports.map(e => {
      const color = avatarColor(e.id);
      const initials = `${e.first_name[0]}${e.last_name[0]}`;
      return `<div style="display:inline-flex;flex-direction:column;align-items:center;margin:0 12px">
        <div style="display:flex;flex-direction:column;align-items:center;padding:12px 16px;background:var(--hr-bg-card);border:1px solid var(--hr-border);border-radius:var(--hr-radius-lg);min-width:140px;position:relative">
          <div class="hr-emp-avatar" style="background:${color};color:#fff;margin-bottom:6px">${initials}</div>
          <div style="font-weight:600;font-size:13px;text-align:center">${e.first_name} ${e.last_name}</div>
          <div style="font-size:11px;color:var(--hr-text-muted);text-align:center">${e.job_title||''}</div>
        </div>
        ${buildTree(e.id, depth+1) ? `<div style="width:1px;height:20px;background:var(--hr-border)"></div><div style="display:flex;gap:0">${buildTree(e.id, depth+1)}</div>` : ''}
      </div>`;
    }).join('');
  }

  container.innerHTML = `<div style="display:flex;justify-content:center">${buildTree(null)}</div>`;
};

window.switchOpsTab = function(btn, tabId) {
  document.querySelectorAll('#ops-tabs .hr-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['tab-leave','tab-policies','tab-tickets','tab-org'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === tabId ? 'block' : 'none';
  });
  if (tabId === 'tab-org') loadOrgChart();
};

window.exportLeave = function() {
  const headers = ['Employee','Type','From','To','Days','Status'];
  const rows = allLeave.map(l => [
    l.employees ? `${l.employees.first_name} ${l.employees.last_name}` : '',
    l.type, l.from_date, l.to_date, l.days, l.status,
  ]);
  const csv = [headers,...rows].map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = `leave-requests-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('Export downloaded', 'success');
};

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
function authHeaders() {
  const token = sb()?.auth?.session()?.access_token || localStorage.getItem('sb-token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}
function avatarColor(id) {
  const c=['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4'];
  let h=0; for(const ch of (id||'')) h=(h*31+ch.charCodeAt(0))&0xffffffff;
  return c[Math.abs(h)%c.length];
}
function setText(id,v) { const el=document.getElementById(id); if(el) el.textContent=v; }
window.openModal  = id => document.getElementById(id)?.classList.add('open');
window.closeModal = id => document.getElementById(id)?.classList.remove('open');
window.showToast  = (msg,type='info') => {
  const c=document.getElementById('toasts'); if(!c) return;
  const t=document.createElement('div'); t.className=`hr-toast ${type}`; t.textContent=msg;
  c.appendChild(t); setTimeout(()=>t.remove(),3800);
};
