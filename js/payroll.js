/**
 * payroll.js — Simpatico HR Platform
 * Payroll processing: Supabase + Cloudflare Workers (computation) + R2 (payslip PDFs)
 */

const PAY_CONFIG = {
  supabaseUrl: window.SIMPATICO_CONFIG?.supabaseUrl    || 'https://YOUR_PROJECT.supabase.co',
  supabaseKey: window.SIMPATICO_CONFIG?.supabaseAnonKey || 'YOUR_ANON_KEY',
  workerUrl:   window.SIMPATICO_CONFIG?.workerUrl       || 'https://hr-api.YOUR_SUBDOMAIN.workers.dev',
  r2PublicUrl: window.SIMPATICO_CONFIG?.r2PublicUrl     || 'https://files.YOUR_DOMAIN.com',
};

let _sb = null;
function sb() {
  if (_sb) return _sb;
  if (window.supabase) { _sb = window.supabase.createClient(PAY_CONFIG.supabaseUrl, PAY_CONFIG.supabaseKey); return _sb; }
  return null;
}

let allPayslips   = [];
let allSalaries   = [];
let allRuns       = [];
let allDeductions = [];

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadUser(), loadPayslips(), loadSalaryRegister(), loadPayrollRuns(), loadDeductions()]);
  setNextPayrollDate();
});

async function loadUser() {
  const client = sb(); if (!client) return;
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    const el = document.getElementById('user-avatar');
    if (el) el.textContent = user.email?.slice(0,2).toUpperCase() || 'U';
  }
}

// ── Payslips ──
async function loadPayslips() {
  const client = sb(); if (!client) return;
  const { data, error } = await client
    .from('payslips')
    .select(`
      id, period, gross_pay, deductions_total, net_pay, status, payslip_key, paid_at,
      employees(id, first_name, last_name, departments(name))
    `)
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }
  allPayslips = data || [];

  // Stats
  const currentMonth = new Date().toISOString().slice(0,7);
  const thisMonth = allPayslips.filter(p => p.period?.startsWith(currentMonth));
  const totalGross = thisMonth.reduce((s, p) => s + (p.gross_pay || 0), 0);
  const pending    = allPayslips.filter(p => p.status === 'generated').length;

  setText('stat-total-payroll', formatCurrency(totalGross));
  setText('stat-on-payroll', allPayslips.length > 0 ? new Set(allPayslips.map(p=>p.employees?.id)).size : '—');
  setText('stat-pending-payslips', pending);

  // Populate period filter
  const periods = [...new Set(allPayslips.map(p => p.period).filter(Boolean))];
  const sel = document.getElementById('payslip-period');
  if (sel) {
    periods.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p; opt.textContent = p;
      sel.appendChild(opt);
    });
  }

  renderPayslips(allPayslips);
}

function renderPayslips(list) {
  const tbody = document.getElementById('payslips-tbody'); if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--hr-text-muted)">No payslips found. Run payroll to generate them.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(p => {
    const emp  = p.employees;
    const name = emp ? `${emp.first_name} ${emp.last_name}` : '—';
    const badgeClass = { generated:'hr-badge-info', sent:'hr-badge-active', paid:'hr-badge-active' }[p.status] || 'hr-badge-inactive';
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="hr-emp-avatar" style="background:${avatarColor(emp?.id||p.id)};color:#fff;width:32px;height:32px;font-size:11px">${emp?`${emp.first_name[0]}${emp.last_name[0]}`:'?'}</div>
          <span class="primary-text">${name}</span>
        </div>
      </td>
      <td>${p.period || '—'}</td>
      <td class="hr-font-mono">${formatCurrency(p.gross_pay)}</td>
      <td class="hr-font-mono" style="color:var(--hr-danger)">-${formatCurrency(p.deductions_total)}</td>
      <td class="hr-font-mono" style="color:var(--hr-success);font-weight:600">${formatCurrency(p.net_pay)}</td>
      <td><span class="hr-badge ${badgeClass}">${p.status}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          ${p.payslip_key ? `<button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="downloadPayslip('${p.payslip_key}')">Download</button>` : ''}
          ${p.status === 'generated' ? `<button class="hr-btn hr-btn-primary hr-btn-sm" onclick="sendPayslip('${p.id}')">Send</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

window.filterPayslips = () => {
  const q  = (document.getElementById('payslip-search')?.value || '').toLowerCase();
  const pr = document.getElementById('payslip-period')?.value || '';
  renderPayslips(allPayslips.filter(p => {
    const name = `${p.employees?.first_name||''} ${p.employees?.last_name||}`.toLowerCase();
    return (!q||name.includes(q)) && (!pr||p.period===pr);
  }));
};

// ── Salary Register ──
async function loadSalaryRegister() {
  const client = sb(); if (!client) return;
  const { data, error } = await client
    .from('employee_salaries')
    .select(`
      id, base_salary, currency, employment_type, effective_date,
      employees(id, first_name, last_name, job_title, departments(name))
    `)
    .order('effective_date', { ascending: false });

  if (error) { console.error(error); return; }
  allSalaries = data || [];
  renderSalaryRegister(allSalaries);
}

function renderSalaryRegister(list) {
  const tbody = document.getElementById('salary-tbody'); if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--hr-text-muted)">No salary records found.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(s => {
    const emp = s.employees;
    const name = emp ? `${emp.first_name} ${emp.last_name}` : '—';
    return `<tr>
      <td><span class="primary-text">${name}</span></td>
      <td>${emp?.departments?.name || '—'}</td>
      <td>${emp?.job_title || '—'}</td>
      <td>${formatEnum(s.employment_type)}</td>
      <td class="hr-font-mono" style="font-weight:600">${formatCurrency(s.base_salary, s.currency)}</td>
      <td>${s.currency || 'USD'}</td>
      <td>${s.effective_date ? new Date(s.effective_date).toLocaleDateString() : '—'}</td>
      <td><button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="editSalary('${s.id}')">Edit</button></td>
    </tr>`;
  }).join('');
}

// ── Payroll Runs ──
async function loadPayrollRuns() {
  const client = sb(); if (!client) return;
  const { data, error } = await client
    .from('payroll_runs')
    .select(`
      id, period, type, total_gross, total_net, employee_count, status, pay_date, notes, created_at,
      run_by:employees!run_by_id(first_name, last_name)
    `)
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }
  allRuns = data || [];
  renderPayrollRuns(allRuns);
}

function renderPayrollRuns(list) {
  const tbody = document.getElementById('runs-tbody'); if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--hr-text-muted)">No payroll runs yet.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(r => {
    const badgeClass = { processing:'hr-badge-info', completed:'hr-badge-active', failed:'hr-badge-danger' }[r.status] || 'hr-badge-pending';
    const runBy = r.run_by ? `${r.run_by.first_name} ${r.run_by.last_name}` : '—';
    return `<tr>
      <td><span class="primary-text">${r.period}</span></td>
      <td>${formatEnum(r.type)}</td>
      <td class="hr-font-mono">${formatCurrency(r.total_gross)}</td>
      <td class="hr-font-mono" style="color:var(--hr-success);font-weight:600">${formatCurrency(r.total_net)}</td>
      <td>${r.employee_count || '—'}</td>
      <td><span class="hr-badge ${badgeClass}">${r.status}</span></td>
      <td>${runBy}</td>
      <td>
        <button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="viewRunDetails('${r.id}')">Details</button>
      </td>
    </tr>`;
  }).join('');
}

// ── Deductions ──
async function loadDeductions() {
  const client = sb(); if (!client) return;
  const { data, error } = await client
    .from('payroll_deductions')
    .select(`
      id, type, amount, frequency, start_date, end_date, status,
      employees(first_name, last_name)
    `)
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }
  allDeductions = data || [];
  renderDeductions(allDeductions);
}

function renderDeductions(list) {
  const tbody = document.getElementById('deductions-tbody'); if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--hr-text-muted)">No deductions configured.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(d => {
    const emp = d.employees;
    const name = emp ? `${emp.first_name} ${emp.last_name}` : '—';
    const badgeClass = d.status === 'active' ? 'hr-badge-active' : 'hr-badge-inactive';
    return `<tr>
      <td><span class="primary-text">${name}</span></td>
      <td>${formatEnum(d.type)}</td>
      <td class="hr-font-mono">${formatCurrency(d.amount)}</td>
      <td>${formatEnum(d.frequency)}</td>
      <td>${d.start_date || '—'}</td>
      <td>${d.end_date || 'Ongoing'}</td>
      <td><span class="hr-badge ${badgeClass}">${d.status}</span></td>
    </tr>`;
  }).join('');
}

// ── Run Payroll ──
window.openRunPayrollModal = function() {
  const payDateInput = document.getElementById('run-pay-date');
  if (payDateInput) payDateInput.valueAsDate = new Date();
  openModal('run-payroll-modal');
};

window.calculatePayroll = async function() {
  const period = document.getElementById('run-period')?.value.trim();
  if (!period) { showToast('Enter a pay period first', 'error'); return; }
  setText('run-preview', 'Calculating…');
  try {
    const res = await fetch(`${PAY_CONFIG.workerUrl}/payroll/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ period }),
    });
    const { total_gross, total_net, employee_count, deductions_total } = await res.json();
    document.getElementById('run-preview').innerHTML = `
      <strong>${employee_count}</strong> employees &nbsp;|&nbsp;
      Gross: <strong>${formatCurrency(total_gross)}</strong> &nbsp;|&nbsp;
      Deductions: <span style="color:var(--hr-danger)">-${formatCurrency(deductions_total)}</span> &nbsp;|&nbsp;
      Net: <strong style="color:var(--hr-success)">${formatCurrency(total_net)}</strong>`;
  } catch { setText('run-preview', 'Calculation failed. Check worker connection.'); }
};

window.executePayroll = async function() {
  const period  = document.getElementById('run-period')?.value.trim();
  const payDate = document.getElementById('run-pay-date')?.value;
  const type    = document.getElementById('run-type')?.value;
  const notes   = document.getElementById('run-notes')?.value.trim();
  if (!period) { showToast('Pay period required', 'error'); return; }

  showToast('Processing payroll…', 'info');
  try {
    const res = await fetch(`${PAY_CONFIG.workerUrl}/payroll/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ period, pay_date: payDate, type, notes }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Payroll run failed');
    showToast(`Payroll run complete — ${result.employee_count} payslips generated`, 'success');
    closeModal('run-payroll-modal');
    await Promise.all([loadPayslips(), loadPayrollRuns()]);
  } catch (err) { showToast(err.message, 'error'); }
};

// ── Payslip actions ──
window.downloadPayslip = async function(key) {
  try {
    const res = await fetch(`${PAY_CONFIG.workerUrl}/r2/signed-url?key=${encodeURIComponent(key)}`, { headers: authHeaders() });
    const { url } = await res.json();
    window.open(url, '_blank');
  } catch { showToast('Failed to download payslip', 'error'); }
};

window.sendPayslip = async function(payslipId) {
  try {
    const res = await fetch(`${PAY_CONFIG.workerUrl}/payroll/payslips/${payslipId}/send`, {
      method: 'POST', headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Send failed');
    showToast('Payslip sent to employee', 'success');
    await loadPayslips();
  } catch (err) { showToast(err.message, 'error'); }
};

window.sendAllPayslips = async function() {
  const unsent = allPayslips.filter(p => p.status === 'generated');
  if (unsent.length === 0) { showToast('No unsent payslips', 'info'); return; }
  showToast(`Sending ${unsent.length} payslips…`, 'info');
  try {
    const res = await fetch(`${PAY_CONFIG.workerUrl}/payroll/payslips/send-all`, {
      method: 'POST', headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Bulk send failed');
    showToast(`${unsent.length} payslips sent`, 'success');
    await loadPayslips();
  } catch (err) { showToast(err.message, 'error'); }
};

window.exportPayroll = function() {
  const headers = ['Employee','Period','Gross Pay','Deductions','Net Pay','Status'];
  const rows = allPayslips.map(p => [
    p.employees ? `${p.employees.first_name} ${p.employees.last_name}` : '',
    p.period, p.gross_pay, p.deductions_total, p.net_pay, p.status,
  ]);
  const csv = [headers,...rows].map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = `payroll-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('Export downloaded', 'success');
};

window.editSalary = id => showToast('Edit salary — coming soon', 'info');
window.viewRunDetails = id => showToast('Run details — coming soon', 'info');
window.openAddDeductionModal = () => showToast('Add deduction — coming soon', 'info');
window.openSalaryUpdateModal = () => showToast('Bulk salary update — coming soon', 'info');

function setNextPayrollDate() {
  const today = new Date();
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  setText('stat-next-date', next.toLocaleDateString('en-US',{month:'short',day:'numeric'}));
  const days = Math.round((next - today) / (1000*60*60*24));
  setText('stat-next-sub', `In ${days} days`);
}

window.switchPayrollTab = function(btn, tabId) {
  document.querySelectorAll('#payroll-tabs .hr-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['tab-payslips','tab-salary','tab-runs','tab-deductions'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === tabId ? 'block' : 'none';
  });
};

function formatCurrency(amount, currency='USD') {
  if (!amount && amount !== 0) return '—';
  return new Intl.NumberFormat('en-US', { style:'currency', currency, maximumFractionDigits:0 }).format(amount);
}
function formatEnum(s) { return (s||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); }
function avatarColor(id) {
  const c=['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4'];
  let h=0; for(const ch of (id||'')) h=(h*31+ch.charCodeAt(0))&0xffffffff;
  return c[Math.abs(h)%c.length];
}
function authHeaders() {
  const token = sb()?.auth?.session()?.access_token || localStorage.getItem('sb-token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}
function setText(id, v) { const el=document.getElementById(id); if(el) el.textContent=v; }
window.openModal  = id => document.getElementById(id)?.classList.add('open');
window.closeModal = id => document.getElementById(id)?.classList.remove('open');
window.showToast  = (msg, type='info') => {
  const c=document.getElementById('toasts'); if(!c) return;
  const t=document.createElement('div'); t.className=`hr-toast ${type}`; t.textContent=msg;
  c.appendChild(t); setTimeout(()=>t.remove(),3800);
};

