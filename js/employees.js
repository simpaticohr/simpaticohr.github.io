/**
 * employees.js — Simpatico HR Platform
 * Uses window.SimpaticoDB (shared Supabase client)
 */

function db() { return window.SimpaticoDB || window.supabaseClient || null; }

async function authHeaders() {
  try {
    const client = db(); if (!client) return {};
    const { data } = await client.auth.getSession();
    const token = data?.session?.access_token || localStorage.getItem('simpatico_token') || '';
    return token ? { Authorization: 'Bearer ' + token } : {};
  } catch {
    const token = localStorage.getItem('simpatico_token') || '';
    return token ? { Authorization: 'Bearer ' + token } : {};
  }
}

// ── State ──
let allEmployees = [];
let filteredEmployees = [];
let currentView = 'list';
let editingId = null;

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  const wait = setInterval(() => {
    if (window.SimpaticoDB) {
      clearInterval(wait);
      loadEmployees();
      loadDepartments();
    }
  }, 100);
  setTimeout(() => clearInterval(wait), 5000);
});

// ── Load Employees ──
async function loadEmployees() {
  const client = db(); if (!client) return;
  try {
    const { data, error } = await client.from('employees').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    allEmployees = data || [];
    filteredEmployees = [...allEmployees];
    renderStats();
    renderEmployees();
  } catch (e) {
    showToast('Failed to load employees: ' + e.message, 'error');
  }
}

// ── Load Departments ──
async function loadDepartments() {
  const client = db(); if (!client) return;
  try {
    const { data } = await client.from('departments').select('*').order('name');
    const depts = data || [];
    // Populate department dropdowns
    ['emp-dept', 'filter-dept'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const placeholder = el.options[0];
      el.innerHTML = '';
      el.appendChild(placeholder);
      depts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id; opt.textContent = d.name;
        el.appendChild(opt);
      });
    });
    // Manager dropdown
    const mgr = document.getElementById('emp-manager');
    if (mgr && allEmployees.length) {
      mgr.innerHTML = '<option value="">No manager</option>';
      allEmployees.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.first_name + ' ' + e.last_name;
        mgr.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn('loadDepartments:', e.message);
  }
}

// ── Render Stats ──
function renderStats() {
  const total  = allEmployees.length;
  const active = allEmployees.filter(e => e.status === 'active').length;
  const onLeave = allEmployees.filter(e => e.status === 'on_leave').length;
  const depts  = new Set(allEmployees.map(e => e.department_id).filter(Boolean)).size;

  setText('stat-total',    total);
  setText('stat-active',   active);
  setText('stat-on-leave', onLeave);
  setText('stat-depts',    depts);
}

function setText(id, val) {
  const el = document.getElementById(id); if (el) el.textContent = val;
}

// ── Render Employees ──
function renderEmployees() {
  const container = document.getElementById('employees-container');
  if (!container) return;

  if (!filteredEmployees.length) {
    container.innerHTML = `<div style="text-align:center;padding:60px;color:var(--hr-text-muted)">
      <div style="font-size:48px;margin-bottom:16px">👥</div>
      <div style="font-size:16px;font-weight:600">No employees found</div>
      <div style="font-size:13px;margin-top:8px">Add your first employee to get started</div>
    </div>`;
    return;
  }

  if (currentView === 'grid') {
    container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;padding:16px">
      ${filteredEmployees.map(e => employeeCard(e)).join('')}
    </div>`;
  } else {
    container.innerHTML = `<table class="hr-table" style="width:100%">
      <thead><tr>
        <th>Employee</th><th>Job Title</th><th>Department</th>
        <th>Type</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>${filteredEmployees.map(e => employeeRow(e)).join('')}</tbody>
    </table>`;
  }
}

function employeeCard(e) {
  const initials = (e.first_name?.[0] || '') + (e.last_name?.[0] || '');
  const statusColor = e.status === 'active' ? 'var(--hr-success)' : e.status === 'on_leave' ? 'var(--hr-warning)' : 'var(--hr-danger)';
  return `<div class="hr-card" style="padding:20px;cursor:pointer" onclick="viewEmployee('${e.id}')">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <div style="width:44px;height:44px;border-radius:50%;background:var(--hr-primary-dim);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:var(--hr-primary)">${initials}</div>
      <div>
        <div style="font-weight:600">${e.first_name} ${e.last_name}</div>
        <div style="font-size:12px;color:var(--hr-text-muted)">${e.employee_id || ''}</div>
      </div>
    </div>
    <div style="font-size:13px;color:var(--hr-text-secondary);margin-bottom:4px">${e.job_title || '—'}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
      <span style="font-size:11px;padding:3px 8px;border-radius:20px;background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44">${e.status}</span>
      <div style="display:flex;gap:6px">
        <button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="event.stopPropagation();editEmployee('${e.id}')">Edit</button>
      </div>
    </div>
  </div>`;
}

function employeeRow(e) {
  const initials = (e.first_name?.[0] || '') + (e.last_name?.[0] || '');
  const statusColor = e.status === 'active' ? 'var(--hr-success)' : e.status === 'on_leave' ? 'var(--hr-warning)' : 'var(--hr-danger)';
  return `<tr>
    <td>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;border-radius:50%;background:var(--hr-primary-dim);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:var(--hr-primary)">${initials}</div>
        <div>
          <div style="font-weight:600">${e.first_name} ${e.last_name}</div>
          <div style="font-size:12px;color:var(--hr-text-muted)">${e.email}</div>
        </div>
      </div>
    </td>
    <td>${e.job_title || '—'}</td>
    <td>${e.department_id || '—'}</td>
    <td><span style="font-size:12px">${e.employment_type || '—'}</span></td>
    <td><span style="font-size:11px;padding:3px 8px;border-radius:20px;background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44">${e.status}</span></td>
    <td>
      <div style="display:flex;gap:4px">
        <button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="viewEmployee('${e.id}')">View</button>
        <button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="editEmployee('${e.id}')">Edit</button>
        <button class="hr-btn hr-btn-ghost hr-btn-sm" style="color:var(--hr-danger)" onclick="deleteEmployee('${e.id}')">Delete</button>
      </div>
    </td>
  </tr>`;
}

// ── Search & Filter ──
window.searchEmployees = function() {
  const q = (document.getElementById('search-employees')?.value || '').toLowerCase();
  applyFilters(q);
};

window.filterByDept = function() {
  applyFilters();
};

window.filterByStatus = function() {
  applyFilters();
};

function applyFilters(searchQ) {
  const q      = searchQ ?? (document.getElementById('search-employees')?.value || '').toLowerCase();
  const dept   = document.getElementById('filter-dept')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';

  filteredEmployees = allEmployees.filter(e => {
    const name = (e.first_name + ' ' + e.last_name + ' ' + (e.email||'') + ' ' + (e.job_title||'')).toLowerCase();
    if (q && !name.includes(q)) return false;
    if (dept && e.department_id !== dept) return false;
    if (status && e.status !== status) return false;
    return true;
  });
  renderEmployees();
}

// ── View Toggle ──
window.setView = function(view) {
  currentView = view;
  document.getElementById('btn-grid')?.classList.toggle('active', view === 'grid');
  document.getElementById('btn-list')?.classList.toggle('active', view === 'list');
  renderEmployees();
};

// ── Modal ──
window.openAddModal = function() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Add New Employee';
  document.getElementById('emp-form')?.reset();
  document.getElementById('emp-modal').classList.add('active');
  loadDepartments();
};

window.closeEmpModal = function() {
  document.getElementById('emp-modal')?.classList.remove('active');
};

window.editEmployee = function(id) {
  const emp = allEmployees.find(e => e.id === id);
  if (!emp) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'Edit Employee';

  setValue('emp-first', emp.first_name);
  setValue('emp-last',  emp.last_name);
  setValue('emp-email', emp.email);
  setValue('emp-phone', emp.phone);
  setValue('emp-title', emp.job_title);
  setValue('emp-dept',  emp.department_id);
  setValue('emp-type',  emp.employment_type);
  setValue('emp-status', emp.status);
  setValue('emp-start', emp.start_date);
  setValue('emp-location', emp.location);
  setValue('emp-salary', emp.salary);
  setValue('emp-manager', emp.manager_id);

  document.getElementById('emp-modal').classList.add('active');
};

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el && val !== null && val !== undefined) el.value = val;
}

window.saveEmployee = async function() {
  const client = db(); if (!client) return;

  const firstName = document.getElementById('emp-first')?.value.trim();
  const lastName  = document.getElementById('emp-last')?.value.trim();
  const email     = document.getElementById('emp-email')?.value.trim();

  if (!firstName || !lastName || !email) {
    showToast('First name, last name and email are required', 'error');
    return;
  }

  const data = {
    first_name:       firstName,
    last_name:        lastName,
    email,
    phone:            document.getElementById('emp-phone')?.value.trim() || null,
    job_title:        document.getElementById('emp-title')?.value.trim() || null,
    department_id:    document.getElementById('emp-dept')?.value || null,
    employment_type:  document.getElementById('emp-type')?.value || 'full_time',
    status:           document.getElementById('emp-status')?.value || 'active',
    start_date:       document.getElementById('emp-start')?.value || null,
    location:         document.getElementById('emp-location')?.value.trim() || null,
    salary:           parseFloat(document.getElementById('emp-salary')?.value) || null,
    manager_id:       document.getElementById('emp-manager')?.value || null,
    updated_at:       new Date().toISOString(),
  };

  try {
    if (editingId) {
      const { error } = await client.from('employees').update(data).eq('id', editingId);
      if (error) throw error;
      showToast('Employee updated!', 'success');
    } else {
      // Generate employee ID
      data.employee_id = 'EMP-' + String(Date.now()).slice(-5);
      data.created_at = new Date().toISOString();
      const { error } = await client.from('employees').insert(data);
      if (error) throw error;
      showToast('Employee added!', 'success');
    }
    closeEmpModal();
    loadEmployees();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
};

window.deleteEmployee = async function(id) {
  if (!confirm('Delete this employee?')) return;
  const client = db(); if (!client) return;
  try {
    const { error } = await client.from('employees').delete().eq('id', id);
    if (error) throw error;
    showToast('Employee deleted', 'success');
    loadEmployees();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
};

window.viewEmployee = function(id) {
  window.location.href = `employee-profile.html?id=${id}`;
};

// ── Export ──
window.exportEmployees = function() {
  if (!allEmployees.length) { showToast('No employees to export', 'info'); return; }
  const headers = ['ID', 'First Name', 'Last Name', 'Email', 'Job Title', 'Status', 'Employment Type', 'Start Date'];
  const rows = allEmployees.map(e => [
    e.employee_id, e.first_name, e.last_name, e.email,
    e.job_title, e.status, e.employment_type, e.start_date
  ].map(v => `"${v || ''}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `employees-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('Exported!', 'success');
};

// ── Toast ──
window.showToast = function(msg, type = 'info') {
  const c = document.getElementById('toasts'); if (!c) return;
  const t = document.createElement('div');
  t.className = `hr-toast ${type}`; t.textContent = msg;
  c.appendChild(t); setTimeout(() => t.remove(), 3800);
};



