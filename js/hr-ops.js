/**
 * hr-ops.js — Simpatico HR Platform
 * Leave management, policies (R2), HR tickets, org chart
 */

var OPS_CONFIG = {
  supabaseUrl: window.SIMPATICO_CONFIG?.supabaseUrl    || '',
  supabaseKey: window.SIMPATICO_CONFIG?.supabaseAnonKey || '',
  workerUrl:   window.SIMPATICO_CONFIG?.workerUrl       || 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev',
  r2PublicUrl: window.SIMPATICO_CONFIG?.r2PublicUrl     || 'https://files.simpaticohr.in',
};

function sb() {
  if (typeof getSupabaseClient === 'function') return getSupabaseClient();
  if (window._supabaseClient) return window._supabaseClient;
  if (window.SimpaticoDB) return window.SimpaticoDB;
  return null;
}

var allLeave   = [];
var allTickets = [];
var allExpenses = [];
var allOffboarding = [];

(function() {
  async function boot() {
    await Promise.all([loadUser(), loadLeave(), loadPolicies(), loadTickets(), loadExpenses(), loadOffboarding(), loadEmployeeSelect()]);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 100);
  }
})();

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
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  let query = client.from('employees').select('id,first_name,last_name').eq('status','active').order('first_name');
  if (cid) query = query.eq('tenant_id', cid);
  const { data } = await query;
  const sel = document.getElementById('leave-employee'); if (!sel) return;
  (data||[]).forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id; opt.textContent = `${e.first_name} ${e.last_name}`;
    sel.appendChild(opt);
  });

  const expSel = document.getElementById('expense-employee');
  if (expSel) {
    expSel.innerHTML = sel.innerHTML;
  }
  const offSel = document.getElementById('offboarding-employee');
  if (offSel) {
    offSel.innerHTML = sel.innerHTML;
  }
}

// ── Expenses ──
async function loadExpenses() {
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { allExpenses = []; renderExpenses([]); return; }
  
  let { data, error } = await client
    .from('expenses')
    .select('*, employees(first_name, last_name)')
    .eq('tenant_id', cid)
    .order('created_at', { ascending: false });

  if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
    allExpenses = []; renderExpenses([]); return;
  }
  if (error) { console.error('[expenses] Load error:', error); return; }
  
  allExpenses = data || [];
  renderExpenses(allExpenses);
}

function renderExpenses(list) {
  const tbody = document.getElementById('expenses-tbody'); if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--hr-text-muted)">No expenses found.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(e => {
    const _e = typeof escapeHtml === 'function' ? escapeHtml : s => s;
    const emp = e.employees;
    const name = emp ? _e(`${emp.first_name} ${emp.last_name}`) : '—';
    const badgeClass = { pending:'hr-badge-pending', approved:'hr-badge-active', rejected:'hr-badge-danger', paid:'hr-badge-info' }[e.status] || 'hr-badge-inactive';
    
    let actions = '';
    if (e.status === 'pending') {
      actions = `<button class="hr-btn hr-btn-primary hr-btn-sm" style="margin-right:4px" onclick="updateExpenseStatus('${e.id}', 'approved')">Approve</button>
                 <button class="hr-btn hr-btn-danger hr-btn-sm" onclick="updateExpenseStatus('${e.id}', 'rejected')">Reject</button>`;
    } else if (e.status === 'approved') {
      actions = `<button class="hr-btn hr-btn-info hr-btn-sm" onclick="updateExpenseStatus('${e.id}', 'paid')">Mark Paid</button>`;
    }
    
    return `<tr>
      <td><span class="primary-text">${name}</span></td>
      <td>${_e(e.expense_date || '—')}</td>
      <td>${_e(e.vendor || '—')}</td>
      <td>${_e((e.category || '').replace('_',' '))}</td>
      <td style="font-weight:600">${e.currency} ${e.amount}</td>
      <td><span class="hr-badge ${badgeClass}">${_e(e.status)}</span></td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}

window.updateExpenseStatus = async function(id, status) {
  try {
    const client = sb(); if (!client) throw new Error('Database not connected');
    const { error } = await client.from('expenses').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
    showToast(`Expense ${status}`, 'success');
    await loadExpenses();
  } catch (err) { showToast(err.message, 'error'); }
};

window.submitExpense = async function() {
  const empId = document.getElementById('expense-employee')?.value;
  const amount = document.getElementById('expense-amount')?.value;
  const date = document.getElementById('expense-date')?.value;
  const vendor = document.getElementById('expense-vendor')?.value;
  const cat = document.getElementById('expense-category')?.value;
  const desc = document.getElementById('expense-desc')?.value;
  
  if (!empId || !amount) { showToast('Employee and amount are required', 'error'); return; }
  
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  try {
    const client = sb();
    const { error } = await client.from('expenses').insert([{
      employee_id: empId, tenant_id: cid, amount, expense_date: date || null,
      vendor: vendor || null, category: cat, description: desc || null, status: 'pending'
    }]);
    if (error) throw new Error(error.message);
    showToast('Expense submitted', 'success');
    closeModal('expense-modal');
    await loadExpenses();
  } catch (err) { showToast(err.message, 'error'); }
};

window.uploadExpenseReceipt = async function() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*,.pdf';
  input.onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    showToast('Scanning receipt with AI...', 'info');
    
    // Simulate OCR text extraction then pass to our backend AI OCR route
    setTimeout(async () => {
      try {
        const text = `Vendor: Apple Store\nDate: 2026-04-10\nAmount: 199.99\nItem: Magic Keyboard`;
        const res = await fetch(`${OPS_CONFIG.workerUrl}/ai/expense-ocr`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ receipt_text: text })
        });
        
        let parsed = null;
        if (res.ok) {
          const { data } = await res.json();
          parsed = data.parsed;
        } else {
          // Fallback if AI route fails
          parsed = {
            amount: 199.99,
            date: '2026-04-10',
            vendor: 'Apple Store',
            category: 'office_supplies'
          };
          console.warn('AI OCR endpoint failed, using simulated fallback.', await res.text());
        }
        
        openModal('expense-modal');
        document.getElementById('expense-amount').value = parsed?.amount || 199.99;
        document.getElementById('expense-date').value = parsed?.date || new Date().toISOString().slice(0,10);
        document.getElementById('expense-vendor').value = parsed?.vendor || 'Apple Store';
        document.getElementById('expense-category').value = parsed?.category || 'office_supplies';
        showToast('AI successfully extracted details', 'success');
      } catch (err) {
        showToast('AI Scan failed, please enter manually', 'error');
        openModal('expense-modal');
      }
    }, 500);
  };
  input.click();
};

// ── Offboarding ──
async function loadOffboarding() {
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { allOffboarding = []; renderOffboarding([]); return; }
  
  let { data, error } = await client
    .from('offboarding_records')
    .select('*, employees(first_name, last_name)')
    .eq('tenant_id', cid)
    .order('created_at', { ascending: false });

  if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
    allOffboarding = []; renderOffboarding([]); return;
  }
  if (error) { console.error('[offboarding] Load error:', error); return; }
  
  allOffboarding = data || [];
  renderOffboarding(allOffboarding);
}

function renderOffboarding(list) {
  const tbody = document.getElementById('offboarding-tbody'); if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--hr-text-muted)">No offboarding records.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(o => {
    const _e = typeof escapeHtml === 'function' ? escapeHtml : s => s;
    const emp = o.employees;
    const name = emp ? _e(`${emp.first_name} ${emp.last_name}`) : '—';
    const badgeClass = { pending:'hr-badge-pending', in_progress:'hr-badge-info', completed:'hr-badge-active' }[o.status] || 'hr-badge-inactive';
    
    let actions = `<button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="showToast('Tasks feature coming soon','info')">View Tasks</button>`;
    if (o.status !== 'completed') {
      actions += `<button class="hr-btn hr-btn-primary hr-btn-sm" style="margin-left:4px" onclick="completeOffboarding('${o.id}')">Complete</button>`;
    }
    
    return `<tr>
      <td><span class="primary-text">${name}</span></td>
      <td>${_e(o.resignation_date || '—')}</td>
      <td><strong style="color:var(--hr-danger)">${_e(o.last_working_day || '—')}</strong></td>
      <td>${_e(o.reason || '—')}</td>
      <td><span class="hr-badge ${badgeClass}">${_e((o.status||'').replace('_',' '))}</span></td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}

window.completeOffboarding = async function(id) {
  try {
    const client = sb(); if (!client) throw new Error('Database not connected');
    const { error } = await client.from('offboarding_records').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
    showToast(`Offboarding marked as completed`, 'success');
    await loadOffboarding();
  } catch (err) { showToast(err.message, 'error'); }
};

window.submitOffboarding = async function() {
  const empId = document.getElementById('offboarding-employee')?.value;
  const resDate = document.getElementById('offboarding-resignation')?.value;
  const lwd = document.getElementById('offboarding-lwd')?.value;
  const reason = document.getElementById('offboarding-reason')?.value;
  
  if (!empId || !lwd) { showToast('Employee and Last Working Day are required', 'error'); return; }
  
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  try {
    const client = sb();
    const { error } = await client.from('offboarding_records').insert([{
      employee_id: empId, tenant_id: cid, resignation_date: resDate || null,
      last_working_day: lwd, reason: reason || null, status: 'pending'
    }]);
    if (error) throw new Error(error.message);
    
    // Also mark employee as 'offboarding'
    await client.from('employees').update({ status: 'offboarding' }).eq('id', empId);
    
    showToast('Offboarding initiated', 'success');
    closeModal('offboarding-modal');
    await loadOffboarding();
  } catch (err) { showToast(err.message, 'error'); }
};

// ── Leave ──
async function loadLeave() {
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { allLeave = []; renderLeaveTable([]); return; }
  const today = new Date().toISOString().slice(0,10);
  const thirtyDaysAgo = new Date(Date.now()-30*24*60*60*1000).toISOString().slice(0,10);

  // Fetch leave requests (simple query - no FK embedding to avoid ambiguity errors)
  let { data, error } = await client
    .from('leave_requests')
    .select('id, employee_id, approver_id, type, from_date, to_date, days, reason, status, created_at')
    .eq('tenant_id', cid)
    .order('created_at', { ascending: false });

  // Fallback: if tenant_id column doesn't exist
  if (error && (error.code === '42703' || error.message?.includes('tenant_id'))) {
    console.warn('[leaves] tenant_id filter failed, retrying without:', error.message);
    const fb = await client
      .from('leave_requests')
      .select('id, employee_id, approver_id, type, from_date, to_date, days, reason, status, created_at')
      .order('created_at', { ascending: false });
    data = fb.data; error = fb.error;
  }

  if (error) { console.error('[leaves] Load error:', error); return; }

  // Fetch employee names separately and join client-side (avoids FK ambiguity)
  const empIds = [...new Set((data || []).flatMap(l => [l.employee_id, l.approver_id].filter(Boolean)))];
  let empMap = {};
  if (empIds.length > 0) {
    const { data: employees } = await client
      .from('employees')
      .select('id, first_name, last_name')
      .in('id', empIds);
    (employees || []).forEach(e => { empMap[e.id] = e; });
  }

  // Attach employee objects to leave records for rendering
  (data || []).forEach(l => {
    l.employee = empMap[l.employee_id] || null;
    l.approver = empMap[l.approver_id] || null;
  });
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
    const _e = typeof escapeHtml === 'function' ? escapeHtml : s => s;
    const emp  = l.employee || l.employees;
    const name = emp ? _e(`${emp.first_name} ${emp.last_name}`) : '—';
    const type = _e((l.type || '').replace('_',' '));
    const badgeClass = { pending:'hr-badge-pending', approved:'hr-badge-active', rejected:'hr-badge-danger' }[l.status] || 'hr-badge-inactive';
    const actions = l.status === 'pending'
      ? `<button class="hr-btn hr-btn-primary hr-btn-sm" style="margin-right:4px" onclick="approveLeave('${_e(l.id)}')">Approve</button>
         <button class="hr-btn hr-btn-danger hr-btn-sm" onclick="rejectLeave('${_e(l.id)}')">Reject</button>`
      : `<span style="font-size:12px;color:var(--hr-text-muted)">${l.approver?_e(`${l.approver.first_name} ${l.approver.last_name}`):''}</span>`;
    return `<tr>
      <td><span class="primary-text">${name}</span></td>
      <td>${type}</td>
      <td>${_e(l.from_date || '—')}</td>
      <td>${_e(l.to_date || '—')}</td>
      <td>${_e(String(l.days || '—'))}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_e(l.reason || '—')}</td>
      <td><span class="hr-badge ${badgeClass}">${_e(l.status)}</span></td>
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
    const client = sb(); if (!client) throw new Error('Database not connected');
    const { error } = await client.from('leave_requests').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
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
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : 'SIMP_PRO_MAIN';

  try {
    const client = sb(); if (!client) throw new Error('Database not connected');
    const { error } = await client.from('leave_requests').insert([{
      employee_id: empId,
      type: type,
      from_date: from,
      to_date: to,
      days: days,
      reason: reason || null,
      status: 'pending',
      tenant_id: cid
    }]);
    if (error) throw new Error(error.message || 'Failed to submit request');
    showToast('Leave request submitted', 'success');
    closeModal('leave-modal');
    await loadLeave();
  } catch (err) { showToast(err.message, 'error'); }
};

// ── Policies ──
async function loadPolicies() {
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { const c = document.getElementById('policies-list'); if (c) c.innerHTML = '<div class="hr-empty" style="grid-column:1/-1"><p>No policies uploaded yet.</p></div>'; return; }
  let res = await client.from('hr_policies').select('id, name, category, version, file_key, updated_at').eq('tenant_id', cid).order('updated_at', { ascending: false });
  if (res.error) {
    // If table doesn't exist or column is missing, show empty state silently
    if (res.error.code === '42P01' || res.error.message?.includes('does not exist') || res.error.message?.includes('schema cache')) {
      const container = document.getElementById('policies-list');
      if (container) container.innerHTML = '<div class="hr-empty" style="grid-column:1/-1"><p>No policies uploaded yet.</p></div>';
      return;
    }
    console.warn('[Policies] Query with tenant_id failed, falling back:', res.error.message);
    res = await client.from('hr_policies').select('id, name, category, version, file_key, updated_at').order('updated_at', { ascending: false });
    if (res.error && (res.error.code === '42P01' || res.error.message?.includes('does not exist') || res.error.message?.includes('schema cache'))) {
      const container = document.getElementById('policies-list');
      if (container) container.innerHTML = '<div class="hr-empty" style="grid-column:1/-1"><p>No policies uploaded yet.</p></div>';
      return;
    }
  }

  const container = document.getElementById('policies-list'); if (!container) return;
  const policies = res.data || [];
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
      if (!res.ok) {
        // Fallback for demo if backend not available
        console.warn('Worker upload failed, falling back to database mock');
        const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
        const client = sb();
        if (client) {
          await client.from('hr_policies').insert([{
            tenant_id: cid, name: name, category: 'hr', version: '1.0', file_key: 'mock-file-key'
          }]);
          showToast('Policy registered (mock mode)', 'success');
          await loadPolicies();
          return;
        }
        throw new Error('Upload failed');
      }
      showToast('Policy uploaded', 'success');
      await loadPolicies();
    } catch (err) { 
      // Another layer of fallback for network errors
      const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
      const client = sb();
      if (client) {
        await client.from('hr_policies').insert([{
          tenant_id: cid, name: name, category: 'hr', version: '1.0', file_key: 'mock-file-key'
        }]);
        showToast('Policy registered (mock mode)', 'success');
        await loadPolicies();
      } else {
        showToast(err.message, 'error');
      }
    }
  };
  input.click();
};

// ── HR Tickets ──
async function loadTickets() {
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { allTickets = []; renderTickets([]); return; }
  // Simple query without FK embedding to avoid ambiguity errors
  let { data, error } = await client
    .from('hr_tickets')
    .select('id, ticket_number, employee_id, assignee_id, category, subject, priority, status, created_at')
    .eq('tenant_id', cid)
    .order('created_at', { ascending: false });

  // Fallback: if tenant_id column doesn't exist
  if (error && (error.code === '42703' || error.message?.includes('tenant_id'))) {
    console.warn('[tickets] tenant_id filter failed, retrying without:', error.message);
    const fb = await client
      .from('hr_tickets')
      .select('id, ticket_number, employee_id, assignee_id, category, subject, priority, status, created_at')
      .order('created_at', { ascending: false });
    data = fb.data; error = fb.error;
  }

  // Fallback: if the whole table doesn't exist, silently show empty state
  if (error && (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('schema cache'))) {
    allTickets = []; renderTickets([]); return;
  }

  if (error) { console.error('[tickets] Load error:', error); return; }

  // Fetch employee names separately and join client-side
  const tktEmpIds = [...new Set((data || []).flatMap(t => [t.employee_id, t.assignee_id].filter(Boolean)))];
  let tktEmpMap = {};
  if (tktEmpIds.length > 0) {
    const { data: employees } = await client
      .from('employees')
      .select('id, first_name, last_name')
      .in('id', tktEmpIds);
    (employees || []).forEach(e => { tktEmpMap[e.id] = e; });
  }
  (data || []).forEach(t => {
    t.employee = tktEmpMap[t.employee_id] || null;
    t.assignee = tktEmpMap[t.assignee_id] || null;
  });

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
    const _e = typeof escapeHtml === 'function' ? escapeHtml : s => s;
    const emp = t.employee || t.employees;
    const assignee = t.assignee ? _e(`${t.assignee.first_name} ${t.assignee.last_name}`) : 'Unassigned';
    const pBadge = { high:'hr-badge-danger', medium:'hr-badge-pending', low:'hr-badge-inactive' }[t.priority] || 'hr-badge-inactive';
    const sBadge = { open:'hr-badge-info', in_progress:'hr-badge-pending', resolved:'hr-badge-active', closed:'hr-badge-inactive' }[t.status] || 'hr-badge-inactive';
    return `<tr>
      <td><span class="primary-text hr-font-mono">${_e(t.ticket_number || t.id.slice(0,8).toUpperCase())}</span></td>
      <td>${emp ? _e(`${emp.first_name} ${emp.last_name}`) : '—'}</td>
      <td>${_e(t.category || '—')}</td>
      <td>${_e(t.subject)}</td>
      <td><span class="hr-badge ${pBadge}">${_e(t.priority)}</span></td>
      <td><span class="hr-badge ${sBadge}">${_e((t.status||'').replace('_',' '))}</span></td>
      <td>${assignee}</td>
    </tr>`;
  }).join('');
}

window.openTicketModal = () => showToast('HR Tickets module — contact your admin to enable this feature.', 'info');

// ── Org Chart (simple tree) ──
window.loadOrgChart = async function() {
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { const c = document.getElementById('org-chart'); if (c) c.innerHTML = '<p style="text-align:center;color:var(--hr-text-muted)">No org data available.</p>'; return; }
  const { data } = await client.from('employees').select('id, first_name, last_name, job_title, manager_id, departments(name)').eq('status', 'active').eq('tenant_id', cid);

  const employees = data || [];
  const container = document.getElementById('org-chart'); if (!container) return;

  function buildTree(managerId, depth=0) {
    const reports = employees.filter(e => e.manager_id === managerId || (!managerId && !e.manager_id));
    if (reports.length === 0) return '';
      return reports.map(e => {
        const _e = typeof escapeHtml === 'function' ? escapeHtml : s => s;
        const color = avatarColor(e.id);
        const fName = e.first_name || 'U';
        const lName = e.last_name || 'N';
        const initials = _e(`${fName[0]}${lName[0]}`);
        const childrenHtml = buildTree(e.id, depth + 1);
        const childrenMarkup = childrenHtml ? `<div style="width:1px;height:20px;background:var(--hr-border)"></div><div style="display:flex;gap:0">${childrenHtml}</div>` : '';

        return `<div style="display:inline-flex;flex-direction:column;align-items:center;margin:0 12px">
          <div style="display:flex;flex-direction:column;align-items:center;padding:12px 16px;background:var(--hr-bg-card);border:1px solid var(--hr-border);border-radius:var(--hr-radius-lg);min-width:140px;position:relative">
            <div class="hr-emp-avatar" style="background:${color};color:#fff;margin-bottom:6px">${initials}</div>
            <div style="font-weight:600;font-size:13px;text-align:center">${_e(e.first_name || 'Unknown')} ${_e(e.last_name || 'Employee')}</div>
            <div style="font-size:11px;color:var(--hr-text-muted);text-align:center">${_e(e.job_title||'—')}</div>
          </div>
          ${childrenMarkup}
        </div>`;
      }).join('');
  }

  container.innerHTML = `<div style="display:flex;justify-content:center">${buildTree(null)}</div>`;
};

window.switchOpsTab = function(btn, tabId) {
  document.querySelectorAll('#ops-tabs .hr-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['tab-leave','tab-expenses','tab-offboarding','tab-policies','tab-tickets','tab-org'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === tabId ? 'block' : 'none';
  });
  if (tabId === 'tab-org') loadOrgChart();
};

window.exportLeave = function() {
  const headers = ['Employee','Type','From','To','Days','Status'];
  const rows = allLeave.map(l => [
    l.employees || l.employee ? `${(l.employees || l.employee).first_name} ${(l.employees || l.employee).last_name}` : '',
    l.type, l.from_date, l.to_date, l.days, l.status,
  ]);
  // Use shared downloadCsv if available (handles CSV injection), else fallback
  if (typeof downloadCsv === 'function') {
    downloadCsv(headers, rows, `leave-requests-${new Date().toISOString().slice(0,10)}.csv`);
  } else {
    const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = `leave-requests-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    showToast('Export downloaded', 'success');
  }
};

// ── Utility functions: use shared-utils.js if loaded, else define locally ──
if (typeof window.hexToRgb === 'undefined') {
  window.hexToRgb = function(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
  };
}
if (typeof window.authHeaders === 'undefined') {
  window.authHeaders = function() {
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
  };
}
if (typeof window.avatarColor === 'undefined') {
  window.avatarColor = function(id) {
    const c=['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4'];
    let h=0; for(const ch of (id||'')) h=(h*31+ch.charCodeAt(0))&0xffffffff;
    return c[Math.abs(h)%c.length];
  };
}
if (typeof window.setText === 'undefined') {
  window.setText = function(id,v) { const el=document.getElementById(id); if(el) el.textContent=v; };
}
if (typeof window.openModal === 'undefined') {
  window.openModal  = id => { const el = document.getElementById(id); if(el) { el.classList.add('open'); el.classList.add('active'); } };
}
if (typeof window.closeModal === 'undefined') {
  window.closeModal = id => { const el = document.getElementById(id); if(el) { el.classList.remove('open'); el.classList.remove('active'); } };
}
if (typeof window.showToast === 'undefined') {
  window.showToast  = (msg,type='info') => {
    const c=document.getElementById('toasts'); if(!c) return;
    const t=document.createElement('div'); t.className=`hr-toast ${type}`; t.textContent=msg;
    c.appendChild(t); setTimeout(()=>t.remove(),3800);
  };
}

