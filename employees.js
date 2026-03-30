/**
 * employees.js — Simpatico HR Platform
 * Employees module: Supabase Direct Insert + Bulletproof Scope
 */

// ── Config ──
const EMP_CONFIG = {
  supabaseUrl:    window.SIMPATICO_CONFIG?.supabaseUrl    || 'https://YOUR_PROJECT.supabase.co',
  supabaseKey:    window.SIMPATICO_CONFIG?.supabaseAnonKey || 'YOUR_ANON_KEY',
  workerUrl:      window.SIMPATICO_CONFIG?.workerUrl       || 'https://hr-api.YOUR_SUBDOMAIN.workers.dev',
  r2PublicUrl:    window.SIMPATICO_CONFIG?.r2PublicUrl     || 'https://files.YOUR_DOMAIN.com',
};

// ── Supabase client ──
let _sb = null;
function sb() {
  if (_sb) return _sb;
  if (window.supabase) { _sb = window.supabase.createClient(EMP_CONFIG.supabaseUrl, EMP_CONFIG.supabaseKey); return _sb; }
  console.warn('[employees] Supabase not loaded');
  return null;
}

// ── In-memory state ──
let allEmployees = [];
let departments  = [];
let currentView  = 'list';

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([
    loadCurrentUser(),
    loadDepartments(),
    window.loadEmployees(), // Hooked to window
  ]);

  const empId = new URLSearchParams(location.search).get('id');
  if (empId && document.getElementById('profile-main')) {
    renderProfilePage(empId);
  }
});

// ── Auth ──
async function loadCurrentUser() {
  const client = sb(); if (!client) return;
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    const initials = user.email?.slice(0,2).toUpperCase() || 'U';
    const el = document.getElementById('user-avatar');
    if (el) el.textContent = initials;
    const { data: profile } = await client.from('org_profiles').select('name').single();
    const orgEl = document.getElementById('org-name');
    if (orgEl && profile) orgEl.textContent = profile.name;
  }
}

// ── Departments ──
async function loadDepartments() {
  const client = sb(); if (!client) return;
  const { data, error } = await client.from('departments').select('id, name').order('name');
  if (error) { console.error(error); return; }
  departments = data || [];

  ['dept-filter', 'emp-dept'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    departments.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id; opt.textContent = d.name;
      sel.appendChild(opt);
    });
  });
}

// ── Load employees ──
window.loadEmployees = async function() {
  const client = sb(); if (!client) return;
  showTableLoading(true);

  const { data, error } = await client
    .from('employees')
    .select(`
      id, first_name, last_name, email, job_title, employment_type,
      start_date, location, status, avatar_url, department_id,
      departments(name),
      manager:employees!manager_id(first_name, last_name)
    `)
    .order('first_name');

  showTableLoading(false);

  if (error) { window.showToast('Failed to load employees', 'error'); console.error(error); return; }
  allEmployees = data || [];
  updateStats();
  renderEmployees(allEmployees);
  populateManagerSelect();
};

// ── Stats ──
function updateStats() {
  const total    = allEmployees.length;
  const active   = allEmployees.filter(e => e.status === 'active').length;
  const onLeave  = allEmployees.filter(e => e.status === 'on_leave').length;
  const deptSet  = new Set(allEmployees.map(e => e.departments?.name).filter(Boolean));

  setText('stat-total',  total);
  setText('stat-active', active);
  setText('stat-leave',  onLeave);
  setText('stat-depts',  deptSet.size);
  setText('stat-total-trend', `${total} across ${deptSet.size} departments`);
  setText('stat-active-trend', total > 0 ? `${Math.round(active/total*100)}% of workforce` : '0%');
  setText('stat-leave-trend',  `${onLeave} currently away`);
}

// ── Render table ──
function renderEmployees(list) {
  if (currentView === 'list') renderTable(list);
  else renderGrid(list);
  setText('employee-count', `${list.length} employee${list.length !== 1 ? 's' : ''}`);
}

function renderTable(list) {
  const tbody = document.getElementById('employees-tbody');
  const table = document.getElementById('employees-table');
  const empty = document.getElementById('table-empty');
  if (!tbody) return;

  if (list.length === 0) {
    if (table) table.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (table) table.style.display = 'table';
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = list.map(e => {
    const fName   = String(e.first_name || '').trim();
    const lName   = String(e.last_name || '').trim();
    const name    = (fName || lName) ? `${fName} ${lName}` : 'Unknown';
    const initials= (fName ? fName[0] : '') + (lName ? lName[0] : '') || 'EM';
    
    const color   = avatarColor(e.id);
    const dept    = e.departments?.name || '—';
    const badge   = statusBadge(e.status);
    const started = e.start_date ? new Date(e.start_date).toLocaleDateString('en-US', {month:'short',year:'numeric'}) : '—';
    const avatar  = e.avatar_url
      ? `<img src="${EMP_CONFIG.r2PublicUrl}/${e.avatar_url}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">`
      : `<div class="hr-emp-avatar" style="background:${color};color:#fff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;">${initials.toUpperCase()}</div>`;

    return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          ${avatar}
          <div>
            <div class="primary-text"><a href="employee-profile.html?id=${e.id}" style="color:var(--text-primary);font-weight:600;text-decoration:none;">${name}</a></div>
            <div style="font-size:11.5px;color:var(--text-secondary)">${e.email || ''}</div>
          </div>
        </div>
      </td>
      <td>${dept}</td>
      <td><span class="primary-text" style="font-weight:500;">${e.job_title || '—'}</span></td>
      <td>${e.location || '—'}</td>
      <td>${started}</td>
      <td>${badge}</td>
      <td>
        <div style="display:flex;gap:6px">
          <a href="employee-profile.html?id=${e.id}" class="btn-sm-action view" style="text-decoration:none;"><i class="fas fa-eye"></i></a>
          <button class="btn-sm-action edit" onclick="window.editEmployee('${e.id}')"><i class="fas fa-pen"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderGrid(list) {
  const grid = document.getElementById('employees-grid');
  if (!grid) return;
  if (list.length === 0) { grid.innerHTML = '<p style="color:var(--text-secondary);text-align:center;grid-column:1/-1;padding:40px">No employees found.</p>'; return; }
  grid.innerHTML = list.map(e => {
    const fName   = String(e.first_name || '').trim();
    const lName   = String(e.last_name || '').trim();
    const name    = (fName || lName) ? `${fName} ${lName}` : 'Unknown';
    const initials= (fName ? fName[0] : '') + (lName ? lName[0] : '') || 'EM';
    const color   = avatarColor(e.id);
    const dept    = e.departments?.name || '';
    const badge   = statusBadge(e.status);
    return `
    <div class="card" style="cursor:pointer; padding:20px; transition:0.2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'" onclick="location.href='employee-profile.html?id=${e.id}'">
      <div style="text-align:center;margin-bottom:14px">
        <div style="background:${color};color:#fff;width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;margin:0 auto 10px">
          ${e.avatar_url ? `<img src="${EMP_CONFIG.r2PublicUrl}/${e.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : initials.toUpperCase()}
        </div>
        <div style="font-weight:600;color:var(--text-primary)">${name}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${e.job_title || ''}</div>
        <div style="margin-top:8px">${badge}</div>
      </div>
      <hr style="border-top:1px solid var(--border); margin:12px 0;">
      <div style="font-size:12px;color:var(--text-secondary);text-align:center;">${dept}</div>
    </div>`;
  }).join('');
}

// ── Globals for UI Controls ──
window.filterEmployees = function() {
  const q      = (document.getElementById('search-input')?.value || '').toLowerCase();
  const dept   = document.getElementById('dept-filter')?.value || '';
  const status = document.getElementById('status-filter')?.value || '';

  const filtered = allEmployees.filter(e => {
    const name = `${e.first_name} ${e.last_name} ${e.email} ${e.job_title || ''}`.toLowerCase();
    const matchQ    = !q || name.includes(q);
    const matchDept = !dept || e.departments?.id === dept || String(e.department_id) === dept;
    const matchSt   = !status || e.status === status;
    return matchQ && matchDept && matchSt;
  });
  renderEmployees(filtered);
};

window.toggleView = function(v) {
  currentView = v;
  document.getElementById('list-view').style.display = v === 'list' ? 'block' : 'none';
  document.getElementById('grid-view').style.display = v === 'grid' ? 'block' : 'none';
  window.filterEmployees();
};

window.openAddModal = function() { 
    window.openModal('add-modal'); 
};

// ── 🔥 The Fixed Direct Supabase Save Function ──
window.saveEmployee = async function() {
  const btn = document.getElementById('save-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving…';
  }

  const first = document.getElementById('emp-first')?.value.trim();
  const last  = document.getElementById('emp-last')?.value.trim();
  const email = document.getElementById('emp-email')?.value.trim();
  
  if (!first || !last || !email) {
    window.showToast('First name, last name and email are required', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Save Employee'; }
    return;
  }

  const payload = {
    first_name:       first,
    last_name:        last,
    email:            email,
    department_id:    document.getElementById('emp-dept')?.value || null,
    job_title:        document.getElementById('emp-title')?.value.trim() || null,
    start_date:       document.getElementById('emp-start')?.value || null,
    employment_type:  document.getElementById('emp-type')?.value || 'full_time',
    location:         document.getElementById('emp-location')?.value.trim() || null,
    manager_id:       document.getElementById('emp-manager')?.value || null,
    status:           'active',
  };

  try {
    const client = sb();
    if (!client) throw new Error("Database connection not found");

    // Insert directly into Supabase
    const { data, error } = await client.from('employees').insert([payload]);
    if (error) throw error;

    window.showToast(`${first} ${last} added successfully`, 'success');
    window.closeModal('add-modal');
    
    // Reset Form
    document.getElementById('emp-first').value = '';
    document.getElementById('emp-last').value = '';
    document.getElementById('emp-email').value = '';
    document.getElementById('emp-title').value = '';
    document.getElementById('emp-location').value = '';

    // Refresh Table
    await window.loadEmployees();
  } catch (err) {
    window.showToast(err.message, 'error');
    console.error("Save Error:", err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save Employee';
    }
  }
};

window.editEmployee = async function(id) {
  location.href = `employee-profile.html?id=${id}`;
};

// ── Profile Page / AI / Docs / Export ──
window.showTab = function(name) {
  ['overview','documents','performance','training'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.style.display = t === name ? 'block' : 'none';
  });
  document.querySelectorAll('#profile-tabs .hr-tab').forEach((btn, i) => {
    btn.classList.toggle('active', ['overview','documents','performance','training'][i] === name);
  });
};

window.exportEmployees = function() {
  const headers = ['First Name','Last Name','Email','Department','Title','Location','Status','Start Date'];
  const rows = allEmployees.map(e => [
    e.first_name, e.last_name, e.email,
    e.departments?.name || '',
    e.job_title || '', e.location || '', e.status,
    e.start_date || ''
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `employees-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  window.showToast('Export downloaded', 'success');
};

function populateManagerSelect() {
  const sel = document.getElementById('emp-manager'); if (!sel) return;
  sel.innerHTML = '<option value="">No manager</option>'; // reset
  allEmployees.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = `${e.first_name} ${e.last_name}`;
    sel.appendChild(opt);
  });
}

// ── Helpers ──
function statusBadge(s) {
  const map = { active:'status-badge active', on_leave:'status-badge pending', terminated:'status-badge cancelled' };
  return `<span class="${map[s]||'status-badge closed'}">${s?.replace('_',' ') || 'Unknown'}</span>`;
}
function avatarColor(id) {
  const colors = ['#4f46e5','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6'];
  let h = 0; for (const c of (id||'')) h = (h*31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}
function showTableLoading(v) {
  const l = document.getElementById('table-loading');
  const t = document.getElementById('employees-table');
  if (l) l.style.display = v ? 'block' : 'none';
  if (t && v) t.style.display = 'none';
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// Attach utility functions to window for HTML access
window.openModal  = function(id) { 
    const el = document.getElementById(id);
    if (el && el.classList.contains('modal')) {
        // Bootstrap Modal
        new bootstrap.Modal(el).show();
    } else if (el) {
        // Vanilla Overlay Modal
        el.classList.add('open'); 
    }
};
window.closeModal = function(id) { 
    const el = document.getElementById(id);
    if (el && el.classList.contains('modal')) {
        // Bootstrap Modal
        const m = bootstrap.Modal.getInstance(el);
        if (m) m.hide();
    } else if (el) {
        // Vanilla Overlay Modal
        el.classList.remove('open'); 
    }
};

window.showToast = function(msg, type='success') {
  const c = document.getElementById('toastContainer') || document.getElementById('toasts'); 
  if (!c) return;
  const t = document.createElement('div');
  const icon = type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle';
  const color = type === 'error' ? 'var(--danger)' : 'var(--success)';
  t.className = `toast-msg ${type === 'error' ? 'error' : ''}`;
  t.innerHTML = `<i class="fas ${icon}" style="color:${color};font-size:1.2rem;"></i><span style="font-weight:500; font-size:0.9rem;">${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3800);
};

// Handle clicks outside of custom vanilla modals
document.querySelectorAll('.hr-modal-overlay').forEach(m =>
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); })
);