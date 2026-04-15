/**
 * attendance.js — Simpatico HR Platform
 * Employee attendance tracking: check-in/out, daily log, reports
 */

const ATT_CONFIG = {
  supabaseUrl: window.SIMPATICO_CONFIG?.supabaseUrl    || '',
  supabaseKey: window.SIMPATICO_CONFIG?.supabaseAnonKey || '',
  workerUrl:   window.SIMPATICO_CONFIG?.workerUrl       || 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev',
};

function sb() {
  if (typeof getSupabaseClient === 'function') return getSupabaseClient();
  if (window._supabaseClient) return window._supabaseClient;
  if (window.SimpaticoDB) return window.SimpaticoDB;
  return null;
}

let allAttendance = [];
let attEmployees  = [];

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadAttUser(), loadAttEmployees(), loadAttendance()]);
});

async function loadAttUser() {
  const client = sb(); if (!client) return;
  try {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const el = document.getElementById('user-avatar');
      if (el) el.textContent = user.email?.slice(0,2).toUpperCase() || 'U';
    }
  } catch(e) { /* auth may not be set up */ }
}

async function loadAttEmployees() {
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  let query = client.from('employees').select('id,first_name,last_name,job_title').eq('status','active').order('first_name');
  if (cid) query = query.eq('tenant_id', cid);
  const { data } = await query;
  attEmployees = data || [];

  // Populate the employee select
  const sel = document.getElementById('att-employee');
  if (sel && attEmployees.length) {
    attEmployees.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id; opt.textContent = `${e.first_name} ${e.last_name}`;
      sel.appendChild(opt);
    });
  }
}

async function loadAttendance() {
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { allAttendance = []; renderAttendance([]); return; }

  const today = new Date().toISOString().slice(0,10);
  const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().slice(0,10);

  const { data, error } = await client
    .from('attendance_records')
    .select(`
      id, date, check_in, check_out, status, hours_worked, notes,
      employees(first_name, last_name, job_title)
    `)
    .eq('tenant_id', cid)
    .gte('date', weekAgo)
    .order('date', { ascending: false });

  if (error) {
    // Table might not exist yet
    if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
      console.warn('[Attendance] Table not found — run migration 006');
      const container = document.getElementById('att-tbody');
      if (container) container.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--hr-text-muted)">Attendance module initializing. Please run the latest migration.</td></tr>';
      return;
    }
    console.error(error);
    return;
  }

  allAttendance = data || [];

  // Stats
  const todayRecords = allAttendance.filter(a => a.date === today);
  const present  = todayRecords.filter(a => ['present','late','remote'].includes(a.status)).length;
  const absent   = todayRecords.filter(a => a.status === 'absent').length;
  const late     = todayRecords.filter(a => a.status === 'late').length;

  setText('stat-att-present', present);
  setText('stat-att-absent', absent);
  setText('stat-att-late', late);
  setText('stat-att-total', attEmployees.length);

  renderAttendance(allAttendance);
}

function renderAttendance(list) {
  const tbody = document.getElementById('att-tbody'); if (!tbody) return;
  const _e = typeof escapeHtml === 'function' ? escapeHtml : s => s;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--hr-text-muted)">No attendance records found. Mark attendance to get started.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(a => {
    const emp  = a.employees;
    const name = emp ? _e(`${emp.first_name} ${emp.last_name}`) : '—';
    const role = emp?.job_title ? _e(emp.job_title) : '';
    const checkIn  = a.check_in ? new Date(a.check_in).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'}) : '—';
    const checkOut = a.check_out ? new Date(a.check_out).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'}) : '—';
    const hours = a.hours_worked ? `${a.hours_worked}h` : '—';

    const statusColors = {
      present: 'hr-badge-active', absent: 'hr-badge-danger', late: 'hr-badge-pending',
      half_day: 'hr-badge-pending', remote: 'hr-badge-info', on_leave: 'hr-badge-inactive'
    };
    const badge = statusColors[a.status] || 'hr-badge-inactive';
    const label = (a.status || '').replace('_', ' ');

    return `<tr>
      <td><span class="primary-text">${name}</span>${role ? `<div style="font-size:11px;color:var(--hr-text-muted)">${role}</div>` : ''}</td>
      <td>${typeof formatDate === 'function' ? formatDate(a.date) : a.date}</td>
      <td>${checkIn}</td>
      <td>${checkOut}</td>
      <td>${hours}</td>
      <td><span class="hr-badge ${badge}">${_e(label)}</span></td>
      <td>${_e(a.notes || '—')}</td>
    </tr>`;
  }).join('');
}

// ── Mark Attendance ──
window.openMarkAttendanceModal = () => {
  if (typeof openModal === 'function') openModal('att-modal');
};

window.markAttendance = async function() {
  const empId   = document.getElementById('att-employee')?.value;
  const status  = document.getElementById('att-status')?.value || 'present';
  const date    = document.getElementById('att-date')?.value || new Date().toISOString().slice(0,10);
  const notes   = document.getElementById('att-notes')?.value?.trim() || null;

  if (!empId) { showToast('Select an employee', 'error'); return; }

  const cid = typeof getCompanyId === 'function' ? getCompanyId() : 'SIMP_PRO_MAIN';
  const now = new Date().toISOString();

  const payload = {
    employee_id: empId,
    date: date,
    status: status,
    check_in: ['present','late','remote','half_day'].includes(status) ? now : null,
    notes: notes,
    tenant_id: cid,
  };

  // Calculate default hours_worked
  if (status === 'present' || status === 'remote') payload.hours_worked = 8;
  else if (status === 'half_day') payload.hours_worked = 4;
  else if (status === 'late') payload.hours_worked = 7;
  else payload.hours_worked = 0;

  try {
    const client = sb(); if (!client) throw new Error('Database not connected');
    const { error } = await client.from('attendance_records').upsert([payload], { onConflict: 'employee_id,date' });
    if (error) throw new Error(error.message);
    showToast('Attendance marked', 'success');
    if (typeof closeModal === 'function') closeModal('att-modal');
    await loadAttendance();
  } catch(err) {
    showToast(err.message, 'error');
  }
};

// ── Bulk Mark ──
window.bulkMarkPresent = async function() {
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : 'SIMP_PRO_MAIN';
  const today = new Date().toISOString().slice(0,10);
  const now = new Date().toISOString();

  const records = attEmployees.map(e => ({
    employee_id: e.id,
    date: today,
    status: 'present',
    check_in: now,
    hours_worked: 8,
    tenant_id: cid,
  }));

  if (records.length === 0) { showToast('No active employees', 'error'); return; }

  try {
    const client = sb(); if (!client) throw new Error('Database not connected');
    const { error } = await client.from('attendance_records').upsert(records, { onConflict: 'employee_id,date' });
    if (error) throw new Error(error.message);
    showToast(`${records.length} employees marked present`, 'success');
    await loadAttendance();
  } catch(err) {
    showToast(err.message, 'error');
  }
};

// ── Filter ──
window.filterAttendance = function() {
  const dateFilter   = document.getElementById('att-date-filter')?.value || '';
  const statusFilter = document.getElementById('att-status-filter')?.value || '';
  const filtered = allAttendance.filter(a =>
    (!dateFilter || a.date === dateFilter) &&
    (!statusFilter || a.status === statusFilter)
  );
  renderAttendance(filtered);
};

// ── Export ──
window.exportAttendance = function() {
  const headers = ['Employee','Date','Check-In','Check-Out','Hours','Status','Notes'];
  const rows = allAttendance.map(a => [
    a.employees ? `${a.employees.first_name} ${a.employees.last_name}` : '',
    a.date,
    a.check_in ? new Date(a.check_in).toLocaleTimeString() : '',
    a.check_out ? new Date(a.check_out).toLocaleTimeString() : '',
    a.hours_worked || 0,
    a.status,
    a.notes || '',
  ]);
  if (typeof downloadCsv === 'function') {
    downloadCsv(headers, rows, `attendance-${new Date().toISOString().slice(0,10)}.csv`);
  } else {
    showToast('Export function not available', 'error');
  }
};
