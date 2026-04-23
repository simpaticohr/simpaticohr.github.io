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
  /**
   * Ensure company_id / tenant_id is available before loading payroll data.
   * Mirrors the fix applied to training.js — independently resolves tenant from
   * users → employees → companies tables when the dashboard hasn't set it yet.
   */
  async function ensureTenantId() {
    if (typeof getCompanyId === 'function' && getCompanyId()) return;

    const client = sb(); if (!client) return;
    try {
      let authUser = null;
      try {
        const { data: sesData } = await client.auth.getSession();
        authUser = sesData?.session?.user || null;
      } catch(e) {}
      if (!authUser) {
        const { data: { user: u } } = await client.auth.getUser();
        authUser = u;
      }
      if (!authUser) return;

      // Strategy 1: users table
      const { data: profiles } = await client.from('users')
        .select('company_id').eq('auth_id', authUser.id).limit(1);
      if (profiles?.[0]?.company_id) {
        patchLocalUser(profiles[0].company_id);
        console.log('[payroll] ✅ Resolved tenant from users table:', profiles[0].company_id);
        return;
      }

      // Strategy 2: employees table (user is an employee)
      const { data: emps } = await client.from('employees')
        .select('tenant_id').eq('email', authUser.email).limit(1);
      if (emps?.[0]?.tenant_id) {
        patchLocalUser(emps[0].tenant_id);
        console.log('[payroll] ✅ Resolved tenant from employees table:', emps[0].tenant_id);
        return;
      }

      // Strategy 3: companies table (user is owner)
      const { data: companies } = await client.from('companies')
        .select('id').eq('owner_id', authUser.id).limit(1);
      if (companies?.[0]?.id) {
        patchLocalUser(companies[0].id);
        console.log('[payroll] ✅ Resolved tenant from companies table:', companies[0].id);
        return;
      }

      // Strategy 4: SIMPATICO_CONFIG global fallback
      if (typeof SIMPATICO_CONFIG !== 'undefined' && SIMPATICO_CONFIG.tenantId) {
        patchLocalUser(SIMPATICO_CONFIG.tenantId);
        console.log('[payroll] ✅ Resolved tenant from SIMPATICO_CONFIG fallback:', SIMPATICO_CONFIG.tenantId);
        return;
      }

      console.warn('[payroll] ⚠ Could not resolve tenant_id — payroll data will be empty');
    } catch(e) {
      console.warn('[payroll] tenant resolution error:', e.message);
    }
  }

  function patchLocalUser(tenantId) {
    try {
      const u = JSON.parse(localStorage.getItem('simpatico_user') || '{}');
      u.company_id = tenantId;
      u.tenant_id = tenantId;
      localStorage.setItem('simpatico_user', JSON.stringify(u));
      sessionStorage.setItem('company_id', tenantId);
      sessionStorage.setItem('tenant_id', tenantId);
    } catch(e) {}
  }

  async function boot() {
    // Step 1: Ensure tenant ID is resolved before ANY data load
    await ensureTenantId();

    // Step 2: Load dependencies first
    await Promise.all([loadUser(), loadSalaryRegister(), loadPayrollRuns(), loadDeductions()]);
    // Step 3: Load payslips (requires allSalaries for currency logic)
    await loadPayslips();
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

// ── Country-Aware Tax Engine ──
const TAX_PROFILES = {
  IN: {
    name: 'India (Old Regime)',
    slabs: [
      { min: 0, max: 300000, rate: 0 },
      { min: 300000, max: 500000, rate: 0.05 },
      { min: 500000, max: 1000000, rate: 0.20 },
      { min: 1000000, max: Infinity, rate: 0.30 }
    ],
    pf: { rate: 0.12, cap: 15000 },        // EPF: 12% of basic, capped at ₹15K
    esi: { rate: 0.0075, ceiling: 21000 },  // ESI: 0.75% if salary ≤ ₹21K
    professionalTax: 200,                   // Monthly PT (varies by state)
    cess: 0.04                              // 4% Health & Education Cess on tax
  },
  IN_NEW: {
    name: 'India (New Regime)',
    slabs: [
      { min: 0, max: 300000, rate: 0 },
      { min: 300000, max: 700000, rate: 0.05 },
      { min: 700000, max: 1000000, rate: 0.10 },
      { min: 1000000, max: 1200000, rate: 0.15 },
      { min: 1200000, max: 1500000, rate: 0.20 },
      { min: 1500000, max: Infinity, rate: 0.30 }
    ],
    pf: { rate: 0.12, cap: 15000 },        // EPF: 12% of basic, capped at ₹15K
    esi: { rate: 0.0075, ceiling: 21000 },  // ESI: 0.75% if salary ≤ ₹21K
    professionalTax: 200,                   // Monthly PT (varies by state)
    cess: 0.04                              // 4% Health & Education Cess on tax
  },
  US: {
    name: 'United States',
    slabs: [
      { min: 0, max: 11600, rate: 0.10 },
      { min: 11600, max: 47150, rate: 0.12 },
      { min: 47150, max: 100525, rate: 0.22 },
      { min: 100525, max: 191950, rate: 0.24 },
      { min: 191950, max: 243725, rate: 0.32 },
      { min: 243725, max: 609350, rate: 0.35 },
      { min: 609350, max: Infinity, rate: 0.37 }
    ],
    fica: { ss: 0.062, ssWageCap: 168600, medicare: 0.0145 },
    state: 0.05  // Approximate state tax
  },
  UK: {
    name: 'United Kingdom',
    slabs: [
      { min: 0, max: 12570, rate: 0 },
      { min: 12570, max: 50270, rate: 0.20 },
      { min: 50270, max: 125140, rate: 0.40 },
      { min: 125140, max: Infinity, rate: 0.45 }
    ],
    ni: { rate: 0.08, threshold: 12570 }  // National Insurance
  },
  AE: {
    name: 'UAE',
    slabs: [{ min: 0, max: Infinity, rate: 0 }],  // No income tax
    gratuity: { rate: 0.0575 }  // EOSB provision ~21 days/year
  },
  CA: {
    name: 'Canada',
    slabs: [
      { min: 0, max: 53359, rate: 0.15 },
      { min: 53359, max: 106717, rate: 0.205 },
      { min: 106717, max: 165430, rate: 0.26 },
      { min: 165430, max: 235675, rate: 0.29 },
      { min: 235675, max: Infinity, rate: 0.33 }
    ],
    cpp: { rate: 0.0595, max: 3867.50 }, // Canada Pension Plan
    ei: { rate: 0.0166, max: 1049.12 }   // Employment Insurance
  },
  AU: {
    name: 'Australia',
    slabs: [
      { min: 0, max: 18200, rate: 0 },
      { min: 18200, max: 45000, rate: 0.19 },
      { min: 45000, max: 120000, rate: 0.325 },
      { min: 120000, max: 180000, rate: 0.37 },
      { min: 180000, max: Infinity, rate: 0.45 }
    ],
    medicare: 0.02, // Medicare levy
    super: 0.11     // Superannuation guarantee (employer paid, but tracked)
  },
  DE: {
    name: 'Germany (EU)',
    slabs: [
      { min: 0, max: 10908, rate: 0 },
      { min: 10908, max: 62809, rate: 0.24 }, // simplified progressive band
      { min: 62809, max: 277825, rate: 0.42 },
      { min: 277825, max: Infinity, rate: 0.45 }
    ],
    social: {
      health: 0.073,
      pension: 0.093,
      unemployment: 0.013,
      care: 0.01525
    }
  },
  NZ: {
    name: 'New Zealand',
    slabs: [
      { min: 0, max: 14000, rate: 0.105 },
      { min: 14000, max: 48000, rate: 0.175 },
      { min: 48000, max: 70000, rate: 0.30 },
      { min: 70000, max: 180000, rate: 0.33 },
      { min: 180000, max: Infinity, rate: 0.39 }
    ],
    acc: 0.0139 // ACC levy
  },
  SG: {
    name: 'Singapore',
    slabs: [
      { min: 0, max: 20000, rate: 0 },
      { min: 20000, max: 30000, rate: 0.02 },
      { min: 30000, max: 40000, rate: 0.035 },
      { min: 40000, max: 80000, rate: 0.07 },
      { min: 80000, max: 120000, rate: 0.115 },
      { min: 120000, max: 160000, rate: 0.15 },
      { min: 160000, max: 200000, rate: 0.18 },
      { min: 200000, max: 240000, rate: 0.19 },
      { min: 240000, max: 280000, rate: 0.195 },
      { min: 280000, max: 320000, rate: 0.20 },
      { min: 320000, max: 500000, rate: 0.22 },
      { min: 500000, max: 1000000, rate: 0.23 },
      { min: 1000000, max: Infinity, rate: 0.24 }
    ],
    cpf: { rate: 0.20, maxWage: 6800 } // employee portion of CPF
  }
};

/**
 * Calculate slab-based annual tax, then return monthly equivalent.
 * @param {number} monthlyIncome - Monthly taxable income
 * @param {string} countryCode - 'IN', 'US', 'UK', 'AE'
 * @returns {{ incomeTax, socialTax, totalTax, breakdown }}
 */
function calculateTax(monthlyIncome, countryCode = 'IN', taxRegime = 'old') {
  let profileKey = countryCode;
  if (countryCode === 'IN' && taxRegime === 'new') profileKey = 'IN_NEW';
  const profile = TAX_PROFILES[profileKey] || TAX_PROFILES['IN'];
  const annual = monthlyIncome * 12;
  let remainingIncome = annual;
  let annualTax = 0;
  const breakdown = [];

  // Slab-based income tax
  for (const slab of profile.slabs) {
    if (remainingIncome <= 0) break;
    const taxableInSlab = Math.min(remainingIncome, slab.max - slab.min);
    const slabTax = taxableInSlab * slab.rate;
    if (slabTax > 0) breakdown.push({ slab: `${slab.rate * 100}%`, amount: slabTax / 12 });
    annualTax += slabTax;
    remainingIncome -= taxableInSlab;
  }

  let monthlyIncomeTax = annualTax / 12;
  let socialTax = 0;

  // Country-specific social contributions
  if (countryCode === 'IN') {
    // EPF (capped)
    socialTax += Math.min(monthlyIncome * profile.pf.rate, profile.pf.cap);
    // ESI (if below ceiling)
    if (monthlyIncome <= profile.esi.ceiling) socialTax += monthlyIncome * profile.esi.rate;
    // Professional Tax
    socialTax += profile.professionalTax;
    // Cess on income tax
    monthlyIncomeTax *= (1 + profile.cess);
  } else if (countryCode === 'US') {
    // FICA: Social Security (capped) + Medicare
    const annualSoFar = monthlyIncome * 12;
    if (annualSoFar <= profile.fica.ssWageCap) socialTax += monthlyIncome * profile.fica.ss;
    socialTax += monthlyIncome * profile.fica.medicare;
    // State tax (simplified)
    socialTax += monthlyIncome * profile.state;
  } else if (countryCode === 'UK') {
    // National Insurance
    const niable = Math.max(0, monthlyIncome - profile.ni.threshold / 12);
    socialTax += niable * profile.ni.rate;
  } else if (countryCode === 'AE') {
    // End-of-service gratuity provision
    socialTax += monthlyIncome * (profile.gratuity?.rate || 0);
  } else if (countryCode === 'CA') {
    // CPP & EI (capped annually, approximated monthly)
    socialTax += Math.min(monthlyIncome * profile.cpp.rate, profile.cpp.max / 12);
    socialTax += Math.min(monthlyIncome * profile.ei.rate, profile.ei.max / 12);
  } else if (countryCode === 'AU') {
    // Medicare levy
    socialTax += monthlyIncome * profile.medicare;
  } else if (countryCode === 'DE') {
    // German Social Security contributions
    socialTax += monthlyIncome * (profile.social.health + profile.social.pension + profile.social.unemployment + profile.social.care);
  } else if (countryCode === 'NZ') {
    // ACC Levy
    socialTax += monthlyIncome * profile.acc;
  } else if (countryCode === 'SG') {
    // CPF
    socialTax += Math.min(monthlyIncome, profile.cpf.maxWage) * profile.cpf.rate;
  }

  return {
    incomeTax: Math.max(0, Math.round(monthlyIncomeTax * 100) / 100),
    socialTax: Math.max(0, Math.round(socialTax * 100) / 100),
    totalTax: Math.max(0, Math.round((monthlyIncomeTax + socialTax) * 100) / 100),
    breakdown,
    country: profile.name
  };
}

/** Map currency to likely country code for tax calculation */
function currencyToCountry(currency) {
  return { INR: 'IN', USD: 'US', GBP: 'UK', AED: 'AE', EUR: 'DE', CAD: 'CA', AUD: 'AU', NZD: 'NZ', SGD: 'SG' }[currency] || 'IN';
}

// ── Payslips ── (Worker-first: auth-based tenant isolation)
async function loadPayslips() {
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;

  // Worker-first: Worker uses auth token for tenant isolation
  const _authHdrs = authHeaders();
  const _hasPayToken = !!_authHdrs['Authorization'];
  try {
    if (!_hasPayToken) throw new Error('No auth token — skipping Worker');
    const res = await fetch(`${PAY_CONFIG.workerUrl}/payroll/payslips/all`, {
      method: 'GET',
      headers: { ..._authHdrs, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Worker ${res.status}`);
    const json = await res.json();
    const payload = (json && json.success && json.data) ? json.data : json;
    allPayslips = payload.payslips || payload.data || (Array.isArray(payload) ? payload : []);
    console.log('[payroll] Loaded', allPayslips.length, 'payslips from worker');
  } catch (workerErr) {
    if (_hasPayToken) console.warn('[payroll] Worker payslips failed, falling back to Supabase:', workerErr.message);
    if (!cid) { allPayslips = []; renderPayslips([]); return; }
    const client = sb(); if (!client) { allPayslips = []; renderPayslips([]); return; }
    let { data, error } = await client
      .from('payslips')
      .select(`
        id, period, gross_pay, deductions_total, net_pay, status, payslip_key, paid_at,
        employees(id, first_name, last_name, departments(name))
      `)
      .eq('tenant_id', cid)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[payroll] Payslips error:', error.message);
      const fallback = await client.from('payslips').select('*').eq('tenant_id', cid).order('created_at', { ascending: false });
      data = fallback.data || [];
    }
    allPayslips = data || [];
  }

  // Stats
  const currentMonth = new Date().toISOString().slice(0,7);
  const thisMonth = allPayslips.filter(p => p.period?.startsWith(currentMonth));
  const totalGross = thisMonth.reduce((s, p) => s + (p.gross_pay || 0), 0);
  const pending    = allPayslips.filter(p => p.status === 'generated').length;

  setText('stat-total-payroll', formatCurrency(totalGross, window._lastPayslipsCurrency || 'USD'));
  setText('stat-on-payroll', allPayslips.length > 0 ? new Set(allPayslips.map(p=>p.employees?.id || p.employee_id)).size : '—');
  setText('stat-pending-payslips', pending);

  // Populate period filter
  const periods = [...new Set(allPayslips.map(p => p.period).filter(Boolean))];
  const sel = document.getElementById('payslip-period');
  if (sel) {
    sel.innerHTML = '<option value="">All Periods</option>';
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
    const emp = p.employees;
    const name = emp ? `${emp.first_name} ${emp.last_name}` : '—';
    const badgeClass = { generated:'hr-badge-info', sent:'hr-badge-active', paid:'hr-badge-active' }[p.status] || 'hr-badge-inactive';
    const empSalary = typeof allSalaries !== 'undefined' ? allSalaries.find(s => s.employee_id === (emp?.id || p.employee_id)) : null;
    const currency = p.currency || empSalary?.currency || window._lastPayslipsCurrency || 'USD';
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="hr-emp-avatar" style="background:${avatarColor(emp?.id||p.id)};color:#fff;width:32px;height:32px;font-size:11px">${emp?`${emp.first_name?.[0]||''}${emp.last_name?.[0]||''}`:'?'}</div>
          <span class="primary-text">${name}</span>
        </div>
      </td>
      <td>${p.period || '—'}</td>
      <td class="hr-font-mono">${formatCurrency(p.gross_pay, currency)}</td>
      <td class="hr-font-mono" style="color:var(--hr-danger)">-${formatCurrency(p.deductions_total, currency)}</td>
      <td class="hr-font-mono" style="color:var(--hr-success);font-weight:600">${formatCurrency(p.net_pay, currency)}</td>
      <td><span class="hr-badge ${badgeClass}">${p.status}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="downloadPayslip('${p.id}')">Download</button>
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
  let { data, error } = await client
    .from('employee_salaries')
    .select(`
      id, base_salary, currency, employment_type, effective_date,
      employees(id, first_name, last_name, job_title, departments(name))
    `)
    .eq('tenant_id', cid)
    .order('effective_date', { ascending: false });

  if (error) { 
     console.warn('[payroll] Salary config error:', error.message); 
     const fallback = await client.from('employee_salaries').select('*').eq('tenant_id', cid).order('effective_date', { ascending: false });
     data = fallback.data || [];
  }
  allSalaries = data;
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

// ── Payroll Runs ── (Worker-first)
async function loadPayrollRuns() {
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;

  try {
    const res = await fetch(`${PAY_CONFIG.workerUrl}/payroll/runs`, {
      method: 'GET',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Worker ${res.status}`);
    const json = await res.json();
    const payload = (json && json.success && json.data) ? json.data : json;
    allRuns = payload.runs || payload.data || (Array.isArray(payload) ? payload : []);
    console.log('[payroll] Loaded', allRuns.length, 'payroll runs from worker');
  } catch (workerErr) {
    console.warn('[payroll] Worker runs failed, falling back to Supabase:', workerErr.message);
    if (!cid) { allRuns = []; renderPayrollRuns([]); return; }
    const client = sb(); if (!client) { allRuns = []; renderPayrollRuns([]); return; }
    let { data, error } = await client
      .from('payroll_runs')
      .select(`
        id, period, type, total_gross, total_net, employee_count, status, pay_date, notes, created_at,
        run_by:employees!run_by_id(first_name, last_name)
      `)
      .eq('tenant_id', cid)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[payroll] Payroll Runs error:', error.message);
      const fallback = await client.from('payroll_runs').select('*').eq('tenant_id', cid).order('created_at', { ascending: false });
      data = fallback.data || [];
    }
    allRuns = data || [];
  }
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
      <td class="hr-font-mono">${formatCurrency(r.total_gross, r.currency)}</td>
      <td class="hr-font-mono" style="color:var(--hr-success);font-weight:600">${formatCurrency(r.total_net, r.currency)}</td>
      <td>${r.employee_count || '—'}</td>
      <td><span class="hr-badge ${badgeClass}">${r.status}</span></td>
      <td>${runBy}</td>
      <td>
        <button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="viewRunDetails('${r.id}')">Details</button>
      </td>
    </tr>`;
  }).join('');
}

// ── Deductions ── (Supabase with tenant guard)
async function loadDeductions() {
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { allDeductions = []; renderDeductions([]); return; }
  const client = sb(); if (!client) { allDeductions = []; renderDeductions([]); return; }
  let { data, error } = await client
    .from('payroll_deductions')
    .select(`
      id, employee_id, type, amount, frequency, start_date, end_date, status,
      employees(first_name, last_name)
    `)
    .eq('tenant_id', cid)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[payroll] Deductions error:', error.message);
    const fallback = await client.from('payroll_deductions').select('*').eq('tenant_id', cid).order('created_at', { ascending: false });
    data = fallback.data || [];
  }
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
    
    // Find the employee's assigned currency to correctly format deductions
    const empSalary = typeof allSalaries !== 'undefined' ? allSalaries.find(s => s.employee_id === d.employee_id) : null;
    const currency = empSalary?.currency || window._lastPayslipsCurrency || 'USD';

    return `<tr>
      <td><span class="primary-text">${name}</span></td>
      <td>${formatEnum(d.type)}</td>
      <td class="hr-font-mono">${formatCurrency(d.amount, currency)}</td>
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
                     (typeof getCompanyId === 'function' ? getCompanyId() : null) ||
                     (typeof SIMPATICO_CONFIG !== 'undefined' ? SIMPATICO_CONFIG.tenantId : null);

  // Direct Supabase calculation
  try {
    if (!companyId) throw new Error('No company linked to account.');
    const client = sb();
    if (!client) throw new Error('Database not connected.');

    const currency = document.getElementById('run-currency')?.value || 'USD';
    const { data: salaries, error: salErr } = await client
      .from('employee_salaries')
      .select('employee_id, base_salary')
      .eq('tenant_id', companyId)
      .eq('currency', currency);

    const { data: deductions } = await client
      .from('payroll_deductions')
      .select('employee_id, amount')
      .eq('tenant_id', companyId)
      .eq('status', 'active');

    // Fetch unpaid leave for proration
    const { data: unpaidLeaves } = await client
      .from('leave_requests')
      .select('employee_id, days')
      .eq('tenant_id', companyId)
      .eq('status', 'approved')
      .eq('leave_type', 'unpaid')
      .gte('start_date', period + '-01')
      .lt('start_date', period.split('-')[0] + '-' + (parseInt(period.split('-')[1]) + 1).toString().padStart(2, '0') + '-01');

    const unpaidLeaveMap = {};
    (unpaidLeaves || []).forEach(ul => { unpaidLeaveMap[ul.employee_id] = (unpaidLeaveMap[ul.employee_id] || 0) + (ul.days || 0); });

    // Fetch approved expenses for reimbursements
    const { data: expenses } = await client
      .from('employee_expenses')
      .select('employee_id, amount')
      .eq('tenant_id', companyId)
      .eq('status', 'approved')
      .is('paid_in_payslip', null);

    const expenseMap = {};
    (expenses || []).forEach(ex => { expenseMap[ex.employee_id] = (expenseMap[ex.employee_id] || 0) + (ex.amount || 0); });

    // Link Performance Data for Bonuses
    const { data: reviews } = await client
      .from('performance_reviews')
      .select('employee_id, score, status')
      .eq('tenant_id', companyId)
      .eq('status', 'completed');
    
    // Get latest score per employee
    const perfMap = {};
    (reviews || []).sort((a,b)=>b.id-a.id).forEach(r => {
       if(!perfMap[r.employee_id] && r.score) perfMap[r.employee_id] = r.score;
    });

    const dedMap = {};
    (deductions || []).forEach(d => { dedMap[d.employee_id] = (dedMap[d.employee_id] || 0) + (d.amount || 0); });

    const countryCode = currencyToCountry(currency);
    const taxProfile = TAX_PROFILES[countryCode];
    const empCount = (salaries || []).length;
    let totalGross = 0, totalDed = 0, totalBonus = 0, totalIncomeTax = 0, totalSocialTax = 0, totalProration = 0;

    (salaries || []).forEach(s => {
      let base = s.base_salary || 0;
      let allowances = s.allowances || {};
      let totalAllowances = (allowances.hra || 0) + (allowances.special || 0);
      
      let score = perfMap[s.employee_id] || 0;
      let bonus = 0;
      if (score >= 90) bonus = base * 0.10;
      else if (score >= 80) bonus = base * 0.05;

      // Leave proration
      let unpaidDays = unpaidLeaveMap[s.employee_id] || 0;
      let dailyRate = (base + totalAllowances) / 22;
      let prorationAdj = dailyRate * unpaidDays;

      // ★ Country-aware slab-based tax calculation
      let taxableIncome = base + totalAllowances + bonus - prorationAdj;
      const taxResult = calculateTax(taxableIncome, countryCode, s.tax_regime || 'old');

      let reimbursements = expenseMap[s.employee_id] || 0;

      totalBonus += bonus;
      totalGross += base + totalAllowances + bonus + reimbursements;
      totalProration += prorationAdj;
      totalIncomeTax += taxResult.incomeTax;
      totalSocialTax += taxResult.socialTax;
      totalDed += (dedMap[s.employee_id] || 0) + taxResult.totalTax + prorationAdj;
    });
    const totalTaxes = totalIncomeTax + totalSocialTax;
    const totalNet = totalGross - totalDed;

    let bonusHtml = totalBonus > 0 ? `Perf Bonus: <strong style="color:var(--hr-info)">+${formatCurrency(totalBonus, currency)}</strong> &nbsp;|&nbsp; ` : '';

    // Tax label based on country
    const taxLabels = {
      IN: 'Income Tax (Slab) + EPF/ESI/PT',
      US: 'Federal Tax (Bracket) + FICA + State',
      UK: 'PAYE (Band) + NI',
      AE: 'Gratuity Provision',
      CA: 'Federal Tax + CPP + EI',
      AU: 'Income Tax + Medicare Levy',
      DE: 'Lohnsteuer + Social Security',
      NZ: 'Income Tax + ACC Levy',
      SG: 'Income Tax + CPF'
    };

    document.getElementById('run-preview').innerHTML = `
      <div style="margin-bottom:6px"><strong>${empCount}</strong> employees &nbsp;|&nbsp; ${bonusHtml}Gross: <strong>${formatCurrency(totalGross, currency)}</strong></div>
      <div style="font-size:12px;color:var(--hr-text-muted);margin-bottom:4px">
        <strong>${taxProfile?.name || countryCode}</strong> Tax Engine &nbsp;·&nbsp;
        ${taxLabels[countryCode] || 'Standard Tax'}: <span style="color:var(--hr-danger)">-${formatCurrency(totalTaxes, currency)}</span>
      </div>
      <div style="font-size:11px;color:var(--hr-text-muted)">
        Income Tax: <span style="color:var(--hr-danger)">-${formatCurrency(totalIncomeTax, currency)}</span> &nbsp;|&nbsp;
        Social: <span style="color:var(--hr-danger)">-${formatCurrency(totalSocialTax, currency)}</span> &nbsp;|&nbsp;
        Leave Proration: <span style="color:var(--hr-danger)">-${formatCurrency(totalProration, currency)}</span>
      </div>
      <div style="margin-top:8px">Net Payout: <strong style="color:var(--hr-success);font-size:16px">${formatCurrency(totalNet, currency)}</strong></div>`;
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

  // ★ Duplicate run guard — prevent double payslip generation
  try {
    const client = sb();
    const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
    if (client && cid) {
      const { data: existing } = await client.from('payroll_runs')
        .select('id, status')
        .eq('tenant_id', cid)
        .eq('period', period)
        .eq('status', 'completed')
        .limit(1);
      if (existing?.length > 0) {
        const proceed = confirm(`⚠️ Payroll for "${period}" was already processed.\n\nRunning again will create duplicate payslips.\n\nContinue anyway?`);
        if (!proceed) return;
      }
    }
  } catch(e) { console.warn('[payroll] Duplicate check failed:', e.message); }

  // ★ Validate & auto-resolve company_id — check sessionStorage FIRST (from auth)
  let companyId = sessionStorage.getItem('company_id') || 
                   sessionStorage.getItem('tenant_id') ||
                   (typeof getCompanyId === 'function' ? getCompanyId() : null);
  if (!companyId) {
    try {
      const client = sb();
      if (client) {
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
            sessionStorage.setItem('company_id', companyId);
            sessionStorage.setItem('tenant_id', companyId);
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
  
  // Worker-first: The /payroll/run endpoint handles calculation, payslip generation,
  // audit trails, and webhook dispatch with proper tenant isolation.
  try {
    const payload = {
      period,
      pay_date: payDate,
      type: type || 'monthly',
      notes: notes || null,
      currency: document.getElementById('run-currency')?.value || 'USD',
    };

    const res = await fetch(`${PAY_CONFIG.workerUrl}/payroll/run`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error?.message || errBody.message || `Worker payroll run failed (${res.status})`);
    }

    const result = await res.json();
    const data = (result && result.success && result.data) ? result.data : result;
    const count = data.totals?.count || '—';
    showToast(`Payroll complete — ${count} payslips generated`, 'success');
    console.log('[payroll] Worker run complete:', data);
  } catch (workerErr) {
    console.error('[payroll] Worker payroll/run failed:', workerErr.message);
    showToast(workerErr.message, 'error');
    closeModal('run-payroll-modal');
    return;
  }

  closeModal('run-payroll-modal');
  await Promise.all([loadPayslips(), loadPayrollRuns()]);
};

// ── Payslip actions ──
window.downloadPayslip = async function(id) {
  try {
    showToast('Generating PDF...', 'info');
    const res = await fetch(`${PAY_CONFIG.workerUrl}/payroll/payslips/${id}/pdf`, { headers: authHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(()=>({}));
      throw new Error(err.error || 'Failed to generate PDF');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    
    // Extract filename from Content-Disposition if present
    let filename = `Payslip_${id}.pdf`;
    const disposition = res.headers.get('Content-Disposition');
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const matches = /filename="([^"]+)"/.exec(disposition);
      if (matches != null && matches[1]) filename = matches[1];
    }
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.sendPayslip = async function(payslipId) {
  try {
    const res = await fetch(`${PAY_CONFIG.workerUrl}/payroll/payslips/${payslipId}/send`, {
      method: 'POST', headers: authHeaders(),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error?.message || errBody.message || 'Send failed');
    }
    showToast('Payslip sent to employee', 'success');
    await loadPayslips();
  } catch (err) { showToast(err.message, 'error'); }
};

window.sendAllPayslips = async function() {
  const unsent = allPayslips.filter(p => p.status === 'generated');
  if (unsent.length === 0) { showToast('No unsent payslips', 'info'); return; }
  // Determine period from the first unsent payslip
  const period = unsent[0]?.period || '';
  showToast(`Sending ${unsent.length} payslips…`, 'info');
  try {
    const res = await fetch(`${PAY_CONFIG.workerUrl}/payroll/payslips/send-all`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ period }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error?.message || errBody.message || 'Bulk send failed');
    }
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

// ── Salary CRUD ──
window.openAddSalaryModal = async function() {
  document.getElementById('salary-modal-title').textContent = 'Add Salary';
  document.getElementById('edit-salary-id').value = '';
  document.getElementById('edit-salary-amount').value = '';
  document.getElementById('salary-hra-amount').value = '';
  document.getElementById('salary-special-amount').value = '';
  document.getElementById('salary-tax-regime').value = 'old';
  document.getElementById('salary-effective-date').valueAsDate = new Date();

  // Populate employee select
  const sel = document.getElementById('salary-employee');
  if (sel && sel.options.length <= 1) {
    const client = sb(); if (!client) return;
    const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
    let query = client.from('employees').select('id,first_name,last_name').eq('status','active').order('first_name');
    if (cid) query = query.eq('tenant_id', cid);
    const { data } = await query;
    (data || []).forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id; opt.textContent = `${e.first_name} ${e.last_name}`;
      sel.appendChild(opt);
    });
  }
  sel.value = '';
  openModal('edit-salary-modal');
};

window.editSalary = async function(id) {
  const salary = allSalaries.find(s => s.id === id);
  if (!salary) { showToast('Salary record not found', 'error'); return; }

  await window.openAddSalaryModal();
  document.getElementById('salary-modal-title').textContent = 'Edit Salary';
  document.getElementById('edit-salary-id').value = id;
  document.getElementById('salary-employee').value = salary.employee_id || '';
  document.getElementById('edit-salary-amount').value = salary.base_salary || '';
  
  const allowances = salary.allowances || {};
  const hraEl = document.getElementById('salary-hra-amount');
  if (hraEl) hraEl.value = allowances.hra || '';
  const specialEl = document.getElementById('salary-special-amount');
  if (specialEl) specialEl.value = allowances.special || '';
  
  const taxEl = document.getElementById('salary-tax-regime');
  if (taxEl) taxEl.value = salary.tax_regime || 'old';
  document.getElementById('salary-currency').value = salary.currency || 'INR';
  document.getElementById('salary-emp-type').value = salary.employment_type || 'full_time';
  if (salary.effective_date) document.getElementById('salary-effective-date').value = salary.effective_date;
};

window.saveSalary = async function() {
  const empId   = document.getElementById('salary-employee')?.value;
  const amount  = parseFloat(document.getElementById('edit-salary-amount')?.value);
  
  const hraAmount = parseFloat(document.getElementById('salary-hra-amount')?.value) || 0;
  const specialAmount = parseFloat(document.getElementById('salary-special-amount')?.value) || 0;
  const taxRegime = document.getElementById('salary-tax-regime')?.value || 'old';
  
  const currency = document.getElementById('salary-currency')?.value || 'INR';
  const empType = document.getElementById('salary-emp-type')?.value || 'full_time';
  const effDate = document.getElementById('salary-effective-date')?.value;
  const editId  = document.getElementById('edit-salary-id')?.value;

  if (!empId) { showToast('Select an employee', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Enter a valid salary amount', 'error'); return; }

  const cid = typeof getCompanyId === 'function' ? getCompanyId() : 'SIMP_PRO_MAIN';

  const payload = {
    employee_id: empId,
    base_salary: amount,
    currency: currency,
    employment_type: empType,
    effective_date: effDate || new Date().toISOString().slice(0,10),
    company_id: cid,
    tenant_id: cid,
  };

  try {
    const client = sb(); if (!client) throw new Error('Database not connected');

    if (editId) {
      // Update existing
      const { error } = await client.from('employee_salaries').update(payload).eq('id', editId);
      if (error) throw new Error(error.message);
      showToast('Salary updated', 'success');
    } else {
      // Insert new
      const { error } = await client.from('employee_salaries').insert([payload]);
      if (error) throw new Error(error.message);
      showToast('Salary added', 'success');
    }
    closeModal('edit-salary-modal');
    await loadSalaryRegister();
  } catch(err) {
    showToast(err.message, 'error');
  }
};

window.openSalaryUpdateModal = () => showToast('Bulk salary update — use Add Salary for individual records', 'info');
window.viewRunDetails = id => showToast('Run details — view payslips in the Payslips tab', 'info');

// ── Deduction CRUD ──
window.openAddDeductionModal = async function() {
  // Populate employee select if needed
  const sel = document.getElementById('deduction-employee');
  if (sel && sel.options.length <= 1) {
    const client = sb(); if (!client) return;
    const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
    let query = client.from('employees').select('id,first_name,last_name').eq('status','active').order('first_name');
    if (cid) query = query.eq('tenant_id', cid);
    const { data } = await query;
    (data || []).forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id; opt.textContent = `${e.first_name} ${e.last_name}`;
      sel.appendChild(opt);
    });
  }
  openModal('add-deduction-modal');
};

window.saveDeduction = async function() {
  const empId  = document.getElementById('deduction-employee')?.value;
  const type   = document.getElementById('deduction-type')?.value?.trim();
  const amount = parseFloat(document.getElementById('deduction-amount')?.value);

  if (!empId) { showToast('Select an employee', 'error'); return; }
  if (!type)  { showToast('Enter deduction type', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }

  const cid = typeof getCompanyId === 'function' ? getCompanyId() : 'SIMP_PRO_MAIN';

  try {
    const client = sb(); if (!client) throw new Error('Database not connected');
    const { error } = await client.from('payroll_deductions').insert([{
      employee_id: empId,
      type: type,
      amount: amount,
      frequency: 'monthly',
      status: 'active',
      start_date: new Date().toISOString().slice(0,10),
      company_id: cid,
      tenant_id: cid,
    }]);
    if (error) throw new Error(error.message);
    showToast('Deduction added', 'success');
    closeModal('add-deduction-modal');
    await loadDeductions();
  } catch(err) {
    showToast(err.message, 'error');
  }
};

function setNextPayrollDate() {
  var today = new Date();
  var m = today.getMonth() + 1; // next month
  var y = today.getFullYear();
  if (m > 11) { m = 0; y++; }
  var next = new Date(y, m, 1);
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  setText('stat-next-date', months[next.getMonth()] + ' 1');
  var msPerDay = 1000 * 60 * 60 * 24;
  var diff = next.getTime() - today.getTime();
  var days = Math.ceil(diff / msPerDay);
  setText('stat-next-sub', 'In ' + days + ' days');
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
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    // Multi-tenant isolation: always include tenant ID
    const tenantId = (typeof getCompanyId === 'function' && getCompanyId()) ||
                     sessionStorage.getItem('company_id') ||
                     sessionStorage.getItem('tenant_id') || '';
    if (tenantId) headers['X-Tenant-ID'] = tenantId;
    return headers;
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


