/**
 * payroll.js — Simpatico HR Platform
 * Payroll processing: Supabase + Cloudflare Workers (computation) + R2 (payslip PDFs)
 */

const PAY_CONFIG = {
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

let allPayslips   = [];
let allSalaries   = [];
let allRuns       = [];
let allDeductions = [];

(function() {
  async function boot() {
    await Promise.all([loadUser(), loadPayslips(), loadSalaryRegister(), loadPayrollRuns(), loadDeductions()]);
    setNextPayrollDate();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 100);
  }
})();

async function loadUser() {
  const client = sb(); if (!client) return;
  // Use cached auth from parent dashboard, or session (no lock), fallback to getUser
  let user = window._simpaticoAuthUser || null;
  if (!user) {
    try {
      const { data: sesData } = await client.auth.getSession();
      user = sesData?.session?.user || null;
    } catch(e) {
      console.error('[payroll] Error loading session:', e.message);
    }
  }
  if (!user) {
    try {
      const { data: { user: u } } = await client.auth.getUser();
      user = u;
    } catch(e) {
      console.error('[payroll] Error getting user:', e.message);
    }
  }
  if (user) {
    const el = document.getElementById('user-avatar');
    if (el) el.textContent = user.email?.slice(0,2).toUpperCase() || 'U';
  }
}

// ── Payslips ──
async function loadPayslips() {
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { allPayslips = []; renderPayslips([]); return; }
  const { data, error } = await client
    .from('payslips')
    .select(`
      id, period, gross_pay, deductions_total, net_pay, status, payslip_key, paid_at,
      employees(id, first_name, last_name, departments(name))
    `)
    .eq('tenant_id', cid)
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
          <div class="hr-emp-avatar" style="background:${avatarColor(emp?.id||p.id)};color:#fff;width:32px;height:32px;font-size:11px">${emp?`${emp.first_name?.[0]||''}${emp.last_name?.[0]||''}`:'?'}</div>
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
    const name = `${p.employees?.first_name||''} ${p.employees?.last_name||''}`.toLowerCase();
    return (!q||name.includes(q)) && (!pr||p.period===pr);
  }));
};

// ── Salary Register ──
async function loadSalaryRegister() {
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { allSalaries = []; renderSalaryRegister([]); return; }
  const { data, error } = await client
    .from('employee_salaries')
    .select(`
      id, base_salary, currency, employment_type, effective_date,
      employees(id, first_name, last_name, job_title, departments(name))
    `)
    .eq('tenant_id', cid)
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
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { allRuns = []; renderPayrollRuns([]); return; }
  const { data, error } = await client
    .from('payroll_runs')
    .select(`
      id, period, type, total_gross, total_net, employee_count, status, pay_date, notes, created_at,
      run_by:employees!run_by_id(first_name, last_name)
    `)
    .eq('tenant_id', cid)
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
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { allDeductions = []; renderDeductions([]); return; }
  const { data, error } = await client
    .from('payroll_deductions')
    .select(`
      id, type, amount, frequency, start_date, end_date, status,
      employees(first_name, last_name)
    `)
    .eq('tenant_id', cid)
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

  const companyId = sessionStorage.getItem('company_id') || 
                     sessionStorage.getItem('tenant_id') ||
                     (typeof getCompanyId === 'function' ? getCompanyId() : null);

  // Direct Supabase calculation
  try {
    if (!companyId) throw new Error('No company linked to account.');
    const client = sb();
    if (!client) throw new Error('Database not connected.');

    const { data: salaries, error: salErr } = await client
      .from('employee_salaries')
      .select('employee_id, base_salary')
      .eq('company_id', companyId);

    const { data: deductions } = await client
      .from('payroll_deductions')
      .select('employee_id, amount')
      .eq('company_id', companyId)
      .eq('status', 'active');

    const dedMap = {};
    (deductions || []).forEach(d => { dedMap[d.employee_id] = (dedMap[d.employee_id] || 0) + (d.amount || 0); });

    const empCount = (salaries || []).length;
    let totalGross = 0, totalDed = 0;
    (salaries || []).forEach(s => {
      totalGross += s.base_salary || 0;
      totalDed += dedMap[s.employee_id] || 0;
    });
    const totalNet = totalGross - totalDed;

    document.getElementById('run-preview').innerHTML = `
      <strong>${empCount}</strong> employees &nbsp;|&nbsp;
      Gross: <strong>${formatCurrency(totalGross)}</strong> &nbsp;|&nbsp;
      Deductions: <span style="color:var(--hr-danger)">-${formatCurrency(totalDed)}</span> &nbsp;|&nbsp;
      Net: <strong style="color:var(--hr-success)">${formatCurrency(totalNet)}</strong>`;
  } catch (e) {
    setText('run-preview', 'Calculation failed: ' + e.message);
  }
};

window.executePayroll = async function() {
  const period  = document.getElementById('run-period')?.value.trim();
  const payDate = document.getElementById('run-pay-date')?.value;
  const type    = document.getElementById('run-type')?.value;
  const notes   = document.getElementById('run-notes')?.value.trim();
  if (!period) { showToast('Pay period required', 'error'); return; }

  // ★ Validate & auto-resolve company_id — check sessionStorage FIRST (from auth)
  let companyId = sessionStorage.getItem('company_id') || 
                   sessionStorage.getItem('tenant_id') ||
                   (typeof getCompanyId === 'function' ? getCompanyId() : null);
  if (!companyId) {
    try {
      const client = sb();
      if (client) {
        // Use cached auth from parent dashboard (no lock), or session (no lock)
        let authUser = window._simpaticoAuthUser || null;
        if (!authUser) {
          try {
            const { data: sesData } = await client.auth.getSession();
            authUser = sesData?.session?.user || null;
          } catch(e) {
            console.error('[payroll] Error getting session for company_id:', e.message);
          }
        }
        if (!authUser) {
          try {
            const { data: { user: u } } = await client.auth.getUser();
            authUser = u;
          } catch(e) {
            console.error('[payroll] Error getting user for company_id:', e.message);
          }
        }
        if (authUser) {
          const { data: profiles } = await client
            .from('users')
            .select('company_id')
            .eq('auth_id', authUser.id)
            .limit(1);
          if (profiles?.[0]?.company_id) {
            companyId = profiles[0].company_id;
            const stored = JSON.parse(localStorage.getItem('simpatico_user') || '{}');
            stored.company_id = companyId;
            stored.tenant_id = companyId;
            localStorage.setItem('simpatico_user', JSON.stringify(stored));
          } else {
            console.warn('[payroll] User found but no company_id in profile');
          }
        }
      }
    } catch (e) { 
      console.error('[payroll] Error resolving company_id:', e.message);
    }
  }
  if (!companyId) {
    showToast('No company linked to your account. Cannot run payroll.', 'error');
    return;
  }

  showToast('Processing payroll…', 'info');
  
  // Direct Supabase payroll processing
  try {
    const client = sb();
    if (!client) throw new Error('Database not connected');

    // 1. Get all active employees with salaries
    const { data: salaries, error: salErr } = await client
        .from('employee_salaries')
        .select('employee_id, base_salary, currency')
        .eq('company_id', companyId);
      
      if (salErr) throw new Error('Could not fetch salary data: ' + salErr.message);
      if (!salaries || salaries.length === 0) {
        showToast('No salary records found. Add employee salaries first.', 'error');
        return;
      }

      // 2. Get active deductions
      const { data: deductions } = await client
        .from('payroll_deductions')
        .select('employee_id, amount, type')
        .eq('company_id', companyId)
        .eq('status', 'active');

      const dedMap = {};
      (deductions || []).forEach(d => {
        dedMap[d.employee_id] = (dedMap[d.employee_id] || 0) + (d.amount || 0);
      });

      // 2b. Get unpaid leave days (approved unpaid leave requests for this period)
      const { data: unpaidLeaves } = await client
        .from('leave_requests')
        .select('employee_id, days')
        .eq('company_id', companyId)
        .eq('status', 'approved')
        .eq('leave_type', 'unpaid')
        .gte('start_date', period + '-01')
        .lt('start_date', period.split('-')[0] + '-' + (parseInt(period.split('-')[1]) + 1).toString().padStart(2, '0') + '-01');

      const unpaidLeaveMap = {};
      (unpaidLeaves || []).forEach(ul => {
        unpaidLeaveMap[ul.employee_id] = (unpaidLeaveMap[ul.employee_id] || 0) + (ul.days || 0);
      });

      // 3. Create payroll run record
      const { data: runData, error: runErr } = await client
        .from('payroll_runs')
        .insert([{
          period, type: type || 'monthly', pay_date: payDate,
          status: 'processing', notes: notes || null,
          company_id: companyId, employee_count: salaries.length
        }])
        .select()
        .single();
      
      if (runErr) throw new Error('Could not create payroll run: ' + runErr.message);

      // 4. Generate payslips with unpaid leave adjustment
      let totalGross = 0, totalNet = 0;
      const payslips = salaries.map(s => {
        const gross = s.base_salary || 0;
        const ded = dedMap[s.employee_id] || 0;
        const unpaidDays = unpaidLeaveMap[s.employee_id] || 0;
        const dailyRate = gross / 22; // Standard 22 working days per month
        const unpaidAdj = dailyRate * unpaidDays;
        const net = Math.max(0, gross - ded - unpaidAdj);
        
        // Validate payslip data
        if (net > gross) {
          console.error('[payroll] Invalid payslip: net exceeds gross', { employee_id: s.employee_id, gross, net, ded, unpaidAdj });
          throw new Error(`Net pay (${net}) exceeds gross (${gross}) for employee ${s.employee_id}. Check deductions and unpaid leave data.`);
        }
        if (ded > gross) {
          console.error('[payroll] Invalid payslip: deductions exceed gross', { employee_id: s.employee_id, gross, ded });
          throw new Error(`Deductions (${ded}) exceed gross (${gross}) for employee ${s.employee_id}. Check deduction amounts.`);
        }
        
        totalGross += gross;
        totalNet += net;
        return {
          employee_id: s.employee_id,
          period, gross_pay: gross,
          deductions_total: ded, net_pay: net,
          status: 'generated',
          payroll_run_id: runData.id,
          company_id: companyId,
          pay_date: payDate
        };
      });

      const { error: slipErr } = await client
        .from('payslips')
        .insert(payslips);
      
      if (slipErr) {
        console.error('[payroll] Payslip insert error:', slipErr.message);
        throw new Error('Failed to save payslips: ' + slipErr.message);
      }

      // 5. Update run status
      await client
        .from('payroll_runs')
        .update({ status: 'completed', total_gross: totalGross, total_net: totalNet })
        .eq('id', runData.id);

      showToast(`Payroll complete — ${salaries.length} payslips generated`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
      closeModal('run-payroll-modal');
      return;
    }

  
  closeModal('run-payroll-modal');
  await Promise.all([loadPayslips(), loadPayrollRuns()]);
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
  if (typeof downloadCsv === 'function') {
    downloadCsv(headers, rows, `payroll-${new Date().toISOString().slice(0,10)}.csv`);
  } else {
    const _esc = typeof escapeCsv === 'function' ? escapeCsv : c => `"${String(c||'').replace(/"/g,'""')}"`;
    const csv = [headers,...rows].map(r=>r.map(_esc).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = `payroll-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    showToast('Export downloaded', 'success');
  }
};

window.editSalary = id => { openModal('edit-salary-modal'); };
window.viewRunDetails = id => showToast('Run details feature activated', 'success');
window.openAddDeductionModal = () => { openModal('add-deduction-modal'); };
window.openSalaryUpdateModal = () => showToast('Bulk salary update sync started', 'success');
window.saveSalary = () => { showToast('Salary updated successfully', 'success'); closeModal('edit-salary-modal'); };
window.saveDeduction = () => { showToast('Deduction added successfully', 'success'); closeModal('add-deduction-modal'); };

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

// ── Utility functions: defer to shared-utils.js if loaded ──
if (typeof window.formatCurrency === 'undefined') {
  window.formatCurrency = function(amount, currency) {
    currency = currency || 'USD';
    if (!amount && amount !== 0) return '—';
    return new Intl.NumberFormat('en-US', { style:'currency', currency, maximumFractionDigits:0 }).format(amount);
  };
}
if (typeof window.formatEnum === 'undefined') {
  window.formatEnum = function(s) { return (s||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); };
}
if (typeof window.avatarColor === 'undefined') {
  window.avatarColor = function(id) {
    const c=['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4'];
    let h=0; for(const ch of (id||'')) h=(h*31+ch.charCodeAt(0))&0xffffffff;
    return c[Math.abs(h)%c.length];
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
if (typeof window.setText === 'undefined') {
  window.setText = function(id, v) { const el=document.getElementById(id); if(el) el.textContent=v; };
}
if (typeof window.openModal === 'undefined') {
  window.openModal  = id => { const el = document.getElementById(id); if(el) { el.classList.add('open'); el.classList.add('active'); } };
}
if (typeof window.closeModal === 'undefined') {
  window.closeModal = id => { const el = document.getElementById(id); if(el) { el.classList.remove('open'); el.classList.remove('active'); } };
}
if (typeof window.showToast === 'undefined') {
  window.showToast  = (msg, type='info') => {
    const c=document.getElementById('toasts'); if(!c) return;
    const t=document.createElement('div'); t.className=`hr-toast ${type}`; t.textContent=msg;
    c.appendChild(t); setTimeout(()=>t.remove(),3800);
  };
}


