/**
 * analytics.js — Simpatico HR Platform
 * Analytics: Supabase aggregations + Cloudflare Workers analytics API + Chart.js
 */

const ANALYTICS_CONFIG = {
  supabaseUrl: window.SIMPATICO_CONFIG?.supabaseUrl,
  supabaseKey: window.SIMPATICO_CONFIG?.supabaseAnonKey,
  workerUrl:   window.SIMPATICO_CONFIG?.workerUrl || 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev',
};

function sb() {
  if (typeof getSupabaseClient === 'function') return getSupabaseClient();
  if (window._supabaseClient) return window._supabaseClient;
  if (window.SimpaticoDB) return window.SimpaticoDB;
  return null;
}

// Chart.js defaults for dark theme
if (typeof Chart !== 'undefined') {
  Chart.defaults.color          = '#94a3b8';
  Chart.defaults.borderColor    = '#1e2d45';
  Chart.defaults.backgroundColor= 'rgba(0,196,255,.1)';
  Chart.defaults.font.family    = "'IBM Plex Sans', sans-serif";
  Chart.defaults.font.size      = 12;
}

const CHART_COLORS = ['#00c4ff','#a78bfa','#10b981','#f59e0b','#ef4444','#06b6d4','#f97316','#ec4899'];
let charts = {};

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadUser(), loadAnalytics()]);
});

async function loadUser() {
  const client = sb(); if (!client) return;
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    const el = document.getElementById('user-avatar');
    if (el) el.textContent = user.email?.slice(0,2).toUpperCase() || 'U';
  }
}

async function loadAnalytics() {
  const days = parseInt(document.getElementById('period-selector')?.value || '90');
  const since = new Date(Date.now() - days * 24*60*60*1000).toISOString();
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { console.warn('[analytics] No company_id — strict isolation, showing empty'); return; }

  // Run all Supabase queries in parallel — TENANT ISOLATED
  const [
    { data: employees },
    { data: leaveData },
    { data: reviews },
    { data: enrollments },
    { data: payslips },
    { data: departments },
    { data: terminated },
    { data: salaries },
  ] = await Promise.all([
    client.from('employees').select('id, first_name, last_name, status, start_date, departments(id,name)').eq('tenant_id', cid),
    client.from('leave_requests').select('type, days, status').eq('tenant_id', cid).gte('created_at', since),
    client.from('performance_reviews').select('employee_id, score, employees(department_id)').eq('tenant_id', cid).not('score','is',null),
    client.from('training_enrollments').select('status').eq('tenant_id', cid).gte('enrolled_at', since),
    client.from('payslips').select('gross_pay, net_pay, period').eq('tenant_id', cid).order('period'),
    client.from('departments').select('id, name').eq('tenant_id', cid),
    client.from('employees').select('id').eq('tenant_id', cid).eq('status','terminated').gte('updated_at', since),
    client.from('employee_salaries').select('employee_id, base_salary, effective_date').eq('tenant_id', cid),
  ]);

  const active    = (employees||[]).filter(e => e.status === 'active');
  const headcount = active.length;
  const termCount = (terminated||[]).length;
  const turnover  = headcount > 0 ? Math.round(termCount/headcount*100) : 0;

  // Training completion
  const allEnrol    = (enrollments||[]).length;
  const doneEnrol   = (enrollments||[]).filter(e => e.status==='completed').length;
  const trainingPct = allEnrol > 0 ? Math.round(doneEnrol/allEnrol*100) : 0;

  // Avg performance
  const scores    = (reviews||[]).map(r => r.score).filter(Boolean);
  const avgScore  = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;

  // Update metric tiles
  setText('m-headcount', headcount);
  setText('m-headcount-c', `${active.filter(e=>e.status==='active').length} active`);
  document.getElementById('m-turnover').innerHTML = `${turnover}<span style="font-size:16px">%</span>`;
  setText('m-turnover-c', `${termCount} left in period`);
  setText('m-perf-score', avgScore || '—');
  document.getElementById('m-training').innerHTML = `${trainingPct}<span style="font-size:16px">%</span>`;
  setText('m-training-c', `${doneEnrol}/${allEnrol} completed`);

  // Fetch advanced metrics from Cloudflare Worker
  try {
    const res = await fetch(`${ANALYTICS_CONFIG.workerUrl}/analytics/summary?days=${days}`, { headers: authHeaders() });
    if (res.ok) {
      const { time_to_hire, absenteeism } = await res.json();
      document.getElementById('m-time-to-hire').innerHTML = `${time_to_hire||'—'}<span style="font-size:16px">d</span>`;
      document.getElementById('m-absentee').innerHTML = `${absenteeism||'—'}<span style="font-size:16px">%</span>`;
    }
  } catch { /* Worker optional */ }

  // Build charts
  renderHeadcountChart(employees || []);
  renderDeptChart(active, departments || []);
  renderPayrollChart(payslips || []);
  renderLeaveChart(leaveData || []);
  renderPerfDistChart(scores);
  await renderHiringChart(since);
  renderDeptBreakdown(active, reviews || [], departments || []);
  renderFlightRisk(active, salaries || [], reviews || []);
}

function renderHeadcountChart(employees) {
  // Group hires by month
  const months = {};
  employees.sort((a,b) => new Date(a.start_date)-new Date(b.start_date)).forEach(e => {
    if (!e.start_date) return;
    const m = e.start_date.slice(0,7);
    months[m] = (months[m] || 0) + 1;
  });
  const labels = Object.keys(months).slice(-12);
  let cumulative = 0;
  const data = labels.map(m => { cumulative += months[m]; return cumulative; });

  destroyChart('headcount-chart');
  const ctx = document.getElementById('headcount-chart')?.getContext('2d'); if (!ctx) return;
  charts['headcount-chart'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Headcount',
        data,
        borderColor: '#00c4ff',
        backgroundColor: 'rgba(0,196,255,.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#00c4ff',
      }]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ grid:{color:'rgba(30,45,69,.5)'} }, y:{ grid:{color:'rgba(30,45,69,.5)'}, beginAtZero:true } } }
  });
}

function renderDeptChart(active, departments) {
  const deptCounts = {};
  active.forEach(e => {
    const name = e.departments?.name || 'Other';
    deptCounts[name] = (deptCounts[name] || 0) + 1;
  });
  const sorted = Object.entries(deptCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const labels = sorted.map(d=>d[0]);
  const data   = sorted.map(d=>d[1]);

  destroyChart('dept-chart');
  const ctx = document.getElementById('dept-chart')?.getContext('2d'); if (!ctx) return;
  charts['dept-chart'] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS, borderColor: '#0d1320', borderWidth: 2 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{ boxWidth:10, padding:12 } } } }
  });
}

function renderPayrollChart(payslips) {
  const monthly = {};
  payslips.forEach(p => {
    if (!p.period) return;
    const m = p.period.slice(0,7);
    if (!monthly[m]) monthly[m] = { gross:0, net:0 };
    monthly[m].gross += p.gross_pay || 0;
    monthly[m].net   += p.net_pay   || 0;
  });
  const labels = Object.keys(monthly).slice(-12);
  const gross  = labels.map(m => monthly[m].gross);
  const net    = labels.map(m => monthly[m].net);

  destroyChart('payroll-chart');
  const ctx = document.getElementById('payroll-chart')?.getContext('2d'); if (!ctx) return;
  charts['payroll-chart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Gross', data:gross, backgroundColor:'rgba(0,196,255,.3)', borderColor:'#00c4ff', borderWidth:1 },
        { label:'Net',   data:net,   backgroundColor:'rgba(16,185,129,.3)', borderColor:'#10b981', borderWidth:1 },
      ]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'top' } }, scales:{ x:{ grid:{color:'rgba(30,45,69,.5)'} }, y:{ grid:{color:'rgba(30,45,69,.5)'}, ticks:{ callback: v => '$'+Math.round(v/1000)+'k' } } } }
  });
}

function renderLeaveChart(leaveData) {
  const types = {};
  leaveData.forEach(l => {
    if (l.status !== 'approved') return;
    types[l.type] = (types[l.type]||0) + (l.days||1);
  });
  const labels = Object.keys(types).map(t => t.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase()));
  const data   = Object.values(types);

  destroyChart('leave-chart');
  const ctx = document.getElementById('leave-chart')?.getContext('2d'); if (!ctx) return;
  charts['leave-chart'] = new Chart(ctx, {
    type: 'pie',
    data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS, borderColor:'#0d1320', borderWidth:2 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{ boxWidth:10, padding:12 } } } }
  });
}

function renderPerfDistChart(scores) {
  const bins = { '0–49':0, '50–59':0, '60–69':0, '70–79':0, '80–89':0, '90–100':0 };
  scores.forEach(s => {
    if (s<50) bins['0–49']++;
    else if (s<60) bins['50–59']++;
    else if (s<70) bins['60–69']++;
    else if (s<80) bins['70–79']++;
    else if (s<90) bins['80–89']++;
    else bins['90–100']++;
  });

  destroyChart('perf-dist-chart');
  const ctx = document.getElementById('perf-dist-chart')?.getContext('2d'); if (!ctx) return;
  charts['perf-dist-chart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(bins),
      datasets: [{
        label: 'Employees',
        data: Object.values(bins),
        backgroundColor: Object.keys(bins).map((_,i) => CHART_COLORS[i % CHART_COLORS.length]),
        borderRadius: 4,
      }]
    },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{grid:{color:'rgba(30,45,69,.5)'}}, y:{grid:{color:'rgba(30,45,69,.5)'},beginAtZero:true,ticks:{stepSize:1}} } }
  });
}

async function renderHiringChart(since) {
  // Try to load from existing pipeline/candidates — TENANT ISOLATED
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  let hireQuery = client.from('job_applications').select('status').gte('created_at', since).limit(500);
  if (cid) hireQuery = hireQuery.eq('tenant_id', cid);
  const { data } = await hireQuery;

  const stages = ['Applied','Screening','Interview','Offer','Hired'];
  const counts = stages.map(s => (data||[]).filter(c=>c.status?.toLowerCase()===s.toLowerCase()).length);

  destroyChart('hiring-chart');
  const ctx = document.getElementById('hiring-chart')?.getContext('2d'); if (!ctx) return;
  charts['hiring-chart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: stages,
      datasets: [{
        label: 'Candidates',
        data: counts,
        backgroundColor: stages.map((_,i) => CHART_COLORS[i % CHART_COLORS.length]),
        borderRadius: 4,
      }]
    },
    options: { responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{grid:{color:'rgba(30,45,69,.5)'},beginAtZero:true}, y:{grid:{display:false}} } }
  });
}

function renderFlightRisk(active, salaries, reviews) {
  const tbody = document.getElementById('ai-flight-risk-tbody'); if(!tbody) return;
  
  // Aggregate data per employee
  const riskList = [];
  const now = Date.now();
  
  // Map salaries and reviews
  const salaryMap = {};
  salaries.forEach(s => {
    if(!salaryMap[s.employee_id] || new Date(s.effective_date) > new Date(salaryMap[s.employee_id].date)) {
      salaryMap[s.employee_id] = { date: s.effective_date, amount: s.base_salary };
    }
  });

  const reviewMap = {};
  reviews.forEach(r => {
    if(!reviewMap[r.employee_id]) reviewMap[r.employee_id] = [];
    reviewMap[r.employee_id].push(r.score);
  });

  active.forEach(emp => {
    if (!emp.start_date) return;
    let riskScore = 0;
    const factors = [];
    
    // Check 1: Tenure vs Salary Stagnation
    const tenureYears = (now - new Date(emp.start_date).getTime()) / (1000*60*60*24*365);
    const lastSalaryDate = salaryMap[emp.id]?.date ? new Date(salaryMap[emp.id].date).getTime() : now;
    const salaryAgeYears = (now - lastSalaryDate) / (1000*60*60*24*365);
    
    if (tenureYears > 2 && salaryAgeYears > 1.5) {
      riskScore += 45;
      factors.push('Compensation Stagnation (>18mo no raise)');
    } else if (tenureYears > 1.5 && salaryAgeYears > 1.2) {
      riskScore += 25;
      factors.push('Delayed compensation review');
    }

    // Check 2: Performance Drop
    const empReviews = reviewMap[emp.id] || [];
    if (empReviews.length >= 2) {
      // Very basic mock check: if recent score dropped
      // (Assumes last added is most recent in this naive mapping)
      const lastScore = empReviews[empReviews.length-1];
      const prevScore = empReviews[empReviews.length-2];
      if (lastScore < prevScore && prevScore - lastScore >= 10) {
        riskScore += 40;
        factors.push(`Significant Performance Drop (-${prevScore - lastScore} pts)`);
      }
    } else if (empReviews.length > 0 && empReviews[0] < 60) {
       riskScore += 30;
       factors.push('Consistently low performance rating');
    }
    
    // Calculate Risk Level Matrix
    let riskLabel = 'Low';
    let labelColor = 'var(--hr-success)';
    let action = 'Regular check-in';
    
    if (riskScore >= 70) {
      riskLabel = 'High'; labelColor = 'var(--hr-danger)'; action = 'Schedule immediate 1-on-1 & review comp';
    } else if (riskScore >= 40) {
      riskLabel = 'Medium'; labelColor = 'var(--hr-warning)'; action = 'Proactive career growth discussion';
    }

    if (riskScore >= 40) {
      riskList.push({
        id: emp.id,
        name: `${emp.first_name || ''} ${emp.last_name || ''}`,
        dept: emp.departments?.name || 'Unassigned',
        score: riskScore,
        label: riskLabel,
        color: labelColor,
        factors: factors.join(', '),
        action: action
      });
    }
  });

  riskList.sort((a,b) => b.score - a.score);

  if (riskList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--hr-text-muted)">No high-risk employees identified by AI presently.</td></tr>';
    return;
  }

  tbody.innerHTML = riskList.slice(0, 5).map(r => {
    return `<tr style="transition: background 0.2s">
      <td><span class="primary-text" style="font-weight:600">${r.name}</span></td>
      <td>${r.dept}</td>
      <td><span class="hr-badge" style="background:transparent;border:1px solid ${r.color};color:${r.color}">${r.label}</span></td>
      <td style="font-size:12px;color:var(--hr-text-secondary);max-width:300px">${r.factors}</td>
      <td style="font-size:12px;">
        <button class="hr-btn hr-btn-ghost hr-btn-sm" style="font-size:11px" onclick="location.href='/employees/employee-profile.html?id=${r.id}'">${r.action}</button>
      </td>
    </tr>`;
  }).join('');
}

function renderDeptBreakdown(active, reviews, departments) {
  const tbody = document.getElementById('dept-breakdown-tbody'); if (!tbody) return;
  const deptMap = {};
  active.forEach(e => {
    const id   = e.departments?.id;
    const name = e.departments?.name || 'Other';
    if (!deptMap[id]) deptMap[id] = { name, count:0, totalSalary:0, totalTenure:0, scores:[] };
    deptMap[id].count++;
    const years = e.start_date ? (Date.now()-new Date(e.start_date).getTime())/(1000*60*60*24*365) : 0;
    deptMap[id].totalTenure += years;
  });
  reviews.forEach(r => {
    const deptId = r.employees?.department_id;
    if (deptId && deptMap[deptId] && r.score) deptMap[deptId].scores.push(r.score);
  });

  const rows = Object.values(deptMap).sort((a,b)=>b.count-a.count);
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--hr-text-muted)">No data available</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(d => {
    const avgTenure = d.count > 0 ? (d.totalTenure/d.count).toFixed(1) : '—';
    const avgScore  = d.scores.length > 0 ? Math.round(d.scores.reduce((a,b)=>a+b,0)/d.scores.length) : '—';
    return `<tr>
      <td><span class="primary-text">${d.name}</span></td>
      <td>${d.count}</td>
      <td style="color:var(--hr-text-muted)">—</td>
      <td>${avgTenure}y</td>
      <td style="color:var(--hr-text-muted)">—%</td>
      <td>${avgScore !== '—' ? `<span style="color:var(--hr-primary);font-weight:600">${avgScore}</span>` : '—'}</td>
    </tr>`;
  }).join('');
}

window.changePeriod = () => loadAnalytics();

window.exportReport = async function() {
  showToast('Generating report…', 'info');
  try {
    const days = document.getElementById('period-selector')?.value || '90';
    const res = await fetch(`${ANALYTICS_CONFIG.workerUrl}/analytics/report?days=${days}&format=csv`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hr-analytics-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    showToast('Report downloaded', 'success');
  } catch { showToast('Export failed — check worker', 'error'); }
};

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}
// ── Utility functions: defer to shared-utils.js if loaded ──
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
if (typeof window.showToast === 'undefined') {
  window.showToast = (msg, type='info') => {
    const c=document.getElementById('toasts'); if(!c) return;
    const t=document.createElement('div'); t.className=`hr-toast ${type}`; t.textContent=msg;
    c.appendChild(t); setTimeout(()=>t.remove(),3800);
  };
}


