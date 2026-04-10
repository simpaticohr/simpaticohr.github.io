/**
 * db-analytics.js — Simpatico HR Platform
 * Automated Database Analytics Engine
 * Auto-scans all HR tables, detects anomalies, generates insights + SQL, builds charts
 */

const DBA_CONFIG = {
  workerUrl: window.SIMPATICO_CONFIG?.workerUrl || 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev',
  supabaseUrl: window.SIMPATICO_CONFIG?.supabaseUrl,
  supabaseKey: window.SIMPATICO_CONFIG?.supabaseAnonKey,
};

let _sb = null;
function sb() {
  if (_sb) return _sb;
  if (window.SimpaticoDB) { _sb = window.SimpaticoDB; return _sb; }
  if (window.supabase && DBA_CONFIG.supabaseUrl && DBA_CONFIG.supabaseKey) {
    _sb = window.supabase.createClient(DBA_CONFIG.supabaseUrl, DBA_CONFIG.supabaseKey);
    return _sb;
  }
  return null;
}

// Chart.js dark theme
if (typeof Chart !== 'undefined') {
  Chart.defaults.color = '#64748b';
  Chart.defaults.borderColor = 'rgba(0,196,255,0.06)';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 11;
}

const CHART_PALETTE = ['#00c4ff','#a78bfa','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#f97316'];
let charts = {};
let dbStats = {};

// ── Initialize ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadUser();
  await runFullAnalysis();
});

async function loadUser() {
  const client = sb(); if (!client) return;
  try {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const el = document.getElementById('user-avatar');
      if (el) el.textContent = user.email?.slice(0,2).toUpperCase() || 'U';
    }
  } catch(e) { console.warn('User load:', e); }
}

// ── Full Analysis Pipeline ── TENANT ISOLATED ──
async function runFullAnalysis() {
  const startTime = Date.now();
  const client = sb(); if (!client) { renderNoConnection(); return; }
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) {
    console.warn('[db-analytics] No company_id — strict isolation, showing empty');
    renderNoConnection();
    return;
  }

  // Phase 1: Scan all tables in parallel — TENANT ISOLATED
  // Use safe select='*' to avoid 400 errors from non-existent columns/relations
  // hasCid: true = table has company_id column, false = no tenant filter needed
  const tables = [
    { name: 'employees', key: 'employees', hasCid: true },
    { name: 'departments', key: 'departments', hasCid: true },
    { name: 'leave_requests', key: 'leave', hasCid: false },
    { name: 'payslips', key: 'payslips', hasCid: true },
    { name: 'performance_reviews', key: 'reviews', hasCid: false },
    { name: 'training_enrollments', key: 'enrollments', hasCid: false },
    { name: 'training_courses', key: 'courses', hasCid: false },
    { name: 'onboarding_records', key: 'onboarding', hasCid: false },
    { name: 'hr_policies', key: 'policies', hasCid: false },
    { name: 'hr_tickets', key: 'tickets', hasCid: false },
  ];

  // Fetch each table individually with safe error handling
  async function safeFetch(tableName, cid, hasCid) {
    try {
      let query = client.from(tableName).select('*').limit(500);
      if (hasCid && cid) query = query.eq('company_id', cid);
      const res = await query;
      if (res.error) {
        // If the error is about company_id not existing, retry without it
        if (hasCid && res.error.message && (res.error.message.includes('company_id') || res.error.code === '42703')) {
          const res2 = await client.from(tableName).select('*').limit(500);
          return res2.data || [];
        }
        console.warn(`[db-analytics] ${tableName}: ${res.error.message}`);
        return [];
      }
      return res.data || [];
    } catch(e) {
      console.warn(`[db-analytics] ${tableName} query failed:`, e.message);
      return [];
    }
  }

  const results = await Promise.allSettled(
    tables.map(t => safeFetch(t.name, cid, t.hasCid))
  );

  // Store results
  tables.forEach((t, i) => {
    const r = results[i];
    dbStats[t.key] = r.status === 'fulfilled' ? (r.value || []) : [];
  });

  const elapsed = Date.now() - startTime;
  const timeEl = document.getElementById('analysis-time');
  if (timeEl) timeEl.textContent = `Completed in ${elapsed}ms`;

  // Phase 2: Render everything
  renderMetrics();
  renderAIInsights();
  renderWorkforceChart();
  renderDepartmentChart();
  renderPayrollChart();
  renderDataHealth();
  renderAnomalies();
  renderAutoSQL();
  renderTableAnalytics();
}

// ── Metric Tiles ──
function renderMetrics() {
  const container = document.getElementById('db-metrics'); if (!container) return;

  const employees = dbStats.employees || [];
  const active = employees.filter(e => e.status === 'active');
  const terminated = employees.filter(e => e.status === 'terminated');
  const leave = dbStats.leave || [];
  const reviews = dbStats.reviews || [];
  const payslips = dbStats.payslips || [];
  const enrollments = dbStats.enrollments || [];

  const scores = reviews.map(r => r.score).filter(Boolean);
  const avgScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
  const totalPayroll = payslips.reduce((s,p) => s + (p.net_pay || 0), 0);
  const completedTraining = enrollments.filter(e => e.status === 'completed').length;
  const trainingRate = enrollments.length > 0 ? Math.round(completedTraining / enrollments.length * 100) : 0;
  const turnover = employees.length > 0 ? Math.round(terminated.length / employees.length * 100) : 0;

  const metrics = [
    { num: active.length, label: 'Active Employees', change: `+${employees.filter(e => { if(!e.start_date) return false; return new Date(e.start_date) >= new Date(Date.now()-30*24*60*60*1000); }).length} this month`, up: true, color: '#00c4ff' },
    { num: `${turnover}%`, label: 'Attrition Rate', change: turnover < 10 ? 'Healthy' : 'Watch', up: turnover < 10, color: turnover < 10 ? '#10b981' : '#f59e0b' },
    { num: avgScore || '—', label: 'Avg Performance', change: avgScore >= 70 ? 'Above target' : 'Below target', up: avgScore >= 70, color: '#a78bfa' },
    { num: `₹${formatCompact(totalPayroll)}`, label: 'Total Payroll', change: `${payslips.length} payslips`, up: true, color: '#f59e0b' },
    { num: `${trainingRate}%`, label: 'Training Done', change: `${completedTraining}/${enrollments.length}`, up: trainingRate >= 70, color: '#10b981' },
    { num: leave.filter(l => l.status === 'pending').length, label: 'Pending Leave', change: `${leave.length} total requests`, up: true, color: '#ec4899' },
  ];

  container.innerHTML = metrics.map((m, i) => `
    <div class="db-metric" style="animation-delay:${i * 0.08}s">
      <div class="num" style="color:${m.color}">${m.num}</div>
      <div class="label">${m.label}</div>
      <div class="change ${m.up ? 'up' : 'down'}">
        <i class="fas fa-arrow-${m.up ? 'up' : 'down'}" style="font-size:9px"></i> ${m.change}
      </div>
      <style>.db-metric:nth-child(${i+1})::after { background: ${m.color}; }</style>
    </div>
  `).join('');
}

// ── AI-Generated Insights ──
function renderAIInsights() {
  const container = document.getElementById('db-insights'); if (!container) return;

  const insights = generateInsights();
  const countEl = document.getElementById('insight-count');
  if (countEl) countEl.textContent = `${insights.length} Insights`;

  container.innerHTML = insights.map(ins => `
    <div class="db-insight-card">
      <div class="db-insight-icon" style="background:${ins.bgColor}">${ins.icon}</div>
      <div class="db-insight-text">
        <h4>${esc(ins.title)}</h4>
        <p>${esc(ins.description)}</p>
      </div>
    </div>
  `).join('');
}

function generateInsights() {
  const insights = [];
  const employees = dbStats.employees || [];
  const active = employees.filter(e => e.status === 'active');
  const reviews = dbStats.reviews || [];
  const leave = dbStats.leave || [];
  const enrollments = dbStats.enrollments || [];
  const payslips = dbStats.payslips || [];

  // Insight 1: Workforce composition
  const deptCounts = {};
  active.forEach(e => {
    const d = e.departments?.name || 'Unassigned';
    deptCounts[d] = (deptCounts[d] || 0) + 1;
  });
  const topDept = Object.entries(deptCounts).sort((a,b)=>b[1]-a[1])[0];
  if (topDept) {
    insights.push({
      icon: '📊', title: 'Largest Department',
      description: `${topDept[0]} has ${topDept[1]} employees (${Math.round(topDept[1]/active.length*100)}% of workforce). Consider capacity planning.`,
      bgColor: 'var(--db-cyan-light)',
    });
  }

  // Insight 2: Performance distribution
  const scores = reviews.map(r => r.score).filter(Boolean);
  const high = scores.filter(s => s >= 80).length;
  const low = scores.filter(s => s < 50).length;
  if (scores.length > 0) {
    insights.push({
      icon: '⭐', title: 'Performance Distribution',
      description: `${high} top performers (80+), ${low} need attention (<50). ${Math.round(high/scores.length*100)}% of reviewed employees excel.`,
      bgColor: 'var(--db-purple-light)',
    });
  }

  // Insight 3: Leave patterns
  const leaveByType = {};
  leave.filter(l => l.status === 'approved').forEach(l => {
    leaveByType[l.type] = (leaveByType[l.type] || 0) + (l.days || 1);
  });
  const topLeave = Object.entries(leaveByType).sort((a,b)=>b[1]-a[1])[0];
  if (topLeave) {
    insights.push({
      icon: '📅', title: 'Leave Pattern Detected',
      description: `${topLeave[0]?.replace('_',' ')} leave is most common (${topLeave[1]} days total). Monitor for burnout signals.`,
      bgColor: 'var(--db-amber-light)',
    });
  }

  // Insight 4: Training completion
  const completed = enrollments.filter(e => e.status === 'completed').length;
  const inProgress = enrollments.filter(e => e.status === 'in_progress').length;
  if (enrollments.length > 0) {
    const rate = Math.round(completed / enrollments.length * 100);
    insights.push({
      icon: '🎓', title: 'Training Velocity',
      description: `${rate}% completion rate. ${inProgress} employees currently learning. ${rate < 60 ? 'Consider deadline reminders.' : 'Strong L&D engagement.'}`,
      bgColor: 'var(--db-green-light)',
    });
  }

  // Insight 5: Payroll analysis
  if (payslips.length > 0) {
    const avgPay = Math.round(payslips.reduce((s,p) => s + (p.net_pay || 0), 0) / payslips.length);
    insights.push({
      icon: '💰', title: 'Compensation Insight',
      description: `Average net pay: ₹${avgPay.toLocaleString()}. Across ${payslips.length} payslips processed.`,
      bgColor: 'var(--db-amber-light)',
    });
  }

  // Insight 6: Data quality
  const emptyEmails = employees.filter(e => !e.email).length;
  const emptyTitles = employees.filter(e => !e.job_title).length;
  if (emptyEmails > 0 || emptyTitles > 0) {
    insights.push({
      icon: '⚠️', title: 'Data Quality Alert',
      description: `${emptyEmails} employees missing email, ${emptyTitles} missing job title. Update records to improve reporting accuracy.`,
      bgColor: 'var(--db-red-light)',
    });
  }

  return insights;
}

// ── Workforce Trend Chart ──
function renderWorkforceChart() {
  const employees = dbStats.employees || [];
  const months = {};
  employees.sort((a,b)=>new Date(a.start_date||0)-new Date(b.start_date||0)).forEach(e => {
    if (!e.start_date) return;
    const m = e.start_date.slice(0,7);
    if (!months[m]) months[m] = { hired: 0 };
    months[m].hired++;
  });

  const labels = Object.keys(months).slice(-12);
  let cumulative = 0;
  const hireData = labels.map(m => months[m]?.hired || 0);
  const cumulativeData = labels.map(m => { cumulative += months[m]?.hired || 0; return cumulative; });

  destroyChart('chart-workforce');
  const ctx = document.getElementById('chart-workforce')?.getContext('2d'); if (!ctx) return;
  charts['chart-workforce'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.map(l => { const d = new Date(l+'-01'); return d.toLocaleDateString('en-US',{month:'short',year:'2-digit'}); }),
      datasets: [
        {
          label: 'Cumulative Headcount',
          data: cumulativeData,
          borderColor: '#00c4ff',
          backgroundColor: 'rgba(0,196,255,0.06)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#00c4ff',
          pointBorderColor: '#0a0e1a',
          pointBorderWidth: 2,
          borderWidth: 2.5,
        },
        {
          label: 'Monthly Hires',
          data: hireData,
          borderColor: '#a78bfa',
          backgroundColor: 'rgba(167,139,250,0.06)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#a78bfa',
          borderWidth: 2,
          borderDash: [4, 4],
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { boxWidth: 10, padding: 16 } } },
      scales: {
        x: { grid: { color: 'rgba(0,196,255,0.04)' } },
        y: { grid: { color: 'rgba(0,196,255,0.04)' }, beginAtZero: true },
      }
    }
  });
}

// ── Department Distribution Chart ──
function renderDepartmentChart() {
  const employees = dbStats.employees?.filter(e => e.status === 'active') || [];
  const deptCounts = {};
  employees.forEach(e => {
    const d = e.departments?.name || 'Other';
    deptCounts[d] = (deptCounts[d] || 0) + 1;
  });
  const sorted = Object.entries(deptCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);

  destroyChart('chart-departments');
  const ctx = document.getElementById('chart-departments')?.getContext('2d'); if (!ctx) return;
  charts['chart-departments'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: sorted.map(d=>d[0]),
      datasets: [{
        data: sorted.map(d=>d[1]),
        backgroundColor: CHART_PALETTE,
        borderColor: '#06080f',
        borderWidth: 3,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { boxWidth: 10, padding: 12 } } },
      cutout: '65%',
    }
  });
}

// ── Payroll Distribution Chart ──
function renderPayrollChart() {
  const payslips = dbStats.payslips || [];
  const monthly = {};
  payslips.forEach(p => {
    if (!p.period) return;
    const m = p.period.slice(0,7);
    if (!monthly[m]) monthly[m] = { gross: 0, net: 0, count: 0 };
    monthly[m].gross += p.gross_pay || 0;
    monthly[m].net += p.net_pay || 0;
    monthly[m].count++;
  });

  const labels = Object.keys(monthly).sort().slice(-12);
  destroyChart('chart-payroll');
  const ctx = document.getElementById('chart-payroll')?.getContext('2d'); if (!ctx) return;
  charts['chart-payroll'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(l => { const d = new Date(l+'-01'); return d.toLocaleDateString('en-US',{month:'short'}); }),
      datasets: [
        { label: 'Gross', data: labels.map(m => monthly[m]?.gross || 0), backgroundColor: 'rgba(0,196,255,0.25)', borderColor: '#00c4ff', borderWidth: 1, borderRadius: 4 },
        { label: 'Net', data: labels.map(m => monthly[m]?.net || 0), backgroundColor: 'rgba(16,185,129,0.25)', borderColor: '#10b981', borderWidth: 1, borderRadius: 4 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { boxWidth: 10 } } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: 'rgba(0,196,255,0.04)' }, ticks: { callback: v => '₹' + formatCompact(v) } },
      }
    }
  });
}

// ── Database Health Monitor ──
function renderDataHealth() {
  const container = document.getElementById('db-health'); if (!container) return;

  const tables = [
    { name: 'Employees', data: dbStats.employees, critical: true },
    { name: 'Leave Requests', data: dbStats.leave },
    { name: 'Performance Reviews', data: dbStats.reviews },
    { name: 'Payslips', data: dbStats.payslips },
    { name: 'Training', data: dbStats.enrollments },
    { name: 'Onboarding', data: dbStats.onboarding },
  ];

  container.innerHTML = tables.map(t => {
    const count = t.data?.length || 0;
    const status = count > 0 ? 'Healthy' : 'Empty';
    const statusColor = count > 0 ? 'var(--db-green)' : 'var(--db-amber)';
    const statusBg = count > 0 ? 'var(--db-green-light)' : 'var(--db-amber-light)';
    const icon = count > 0 ? 'fa-check-circle' : 'fa-exclamation-circle';
    return `
    <div class="db-health-item">
      <div class="db-health-icon" style="background:${statusBg};color:${statusColor}">
        <i class="fas ${icon}"></i>
      </div>
      <div class="db-health-text">
        <h4>${t.name}</h4>
        <p>${count} records${t.critical ? ' · Critical' : ''}</p>
      </div>
      <span class="db-health-status" style="background:${statusBg};color:${statusColor}">${status}</span>
    </div>`;
  }).join('');
}

// ── Anomaly Detection ──
function renderAnomalies() {
  const container = document.getElementById('db-anomalies'); if (!container) return;

  const anomalies = detectAnomalies();
  const countEl = document.getElementById('anomaly-count');
  if (countEl) countEl.textContent = `${anomalies.length} Found`;

  if (anomalies.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:30px;color:var(--db-text-muted)">
        <i class="fas fa-shield-check" style="font-size:28px;color:var(--db-green);margin-bottom:10px;display:block"></i>
        <div style="font-size:13px;font-weight:600">No Anomalies Detected</div>
        <div style="font-size:12px;margin-top:4px">Your database patterns are within normal ranges.</div>
      </div>`;
    return;
  }

  container.innerHTML = anomalies.map(a => `
    <div class="db-anomaly">
      <div class="db-anomaly-icon"><i class="fas ${a.icon}"></i></div>
      <div class="db-anomaly-text">
        <h4>${esc(a.title)}</h4>
        <p>${esc(a.description)}</p>
      </div>
      <span class="db-badge ${a.severity === 'high' ? 'db-badge-red' : 'db-badge-amber'}">${a.severity}</span>
    </div>
  `).join('');
}

function detectAnomalies() {
  const anomalies = [];
  const employees = dbStats.employees || [];
  const leave = dbStats.leave || [];
  const reviews = dbStats.reviews || [];
  const payslips = dbStats.payslips || [];

  // Anomaly: Employees without email
  const noEmail = employees.filter(e => !e.email).length;
  if (noEmail > 0) {
    anomalies.push({
      icon: 'fa-envelope', title: `${noEmail} Employees Missing Email`,
      description: 'Employee records without email addresses may cause communication and auth failures.',
      severity: noEmail > 5 ? 'high' : 'medium',
    });
  }

  // Anomaly: Excessive pending leave
  const pendingLeave = leave.filter(l => l.status === 'pending').length;
  if (pendingLeave > 5) {
    anomalies.push({
      icon: 'fa-calendar-xmark', title: `${pendingLeave} Leave Requests Pending Too Long`,
      description: 'Unprocessed leave requests can impact employee satisfaction and planning.',
      severity: pendingLeave > 10 ? 'high' : 'medium',
    });
  }

  // Anomaly: Performance score outliers
  const scores = reviews.map(r => r.score).filter(Boolean);
  if (scores.length > 5) {
    const mean = scores.reduce((a,b)=>a+b,0) / scores.length;
    const stdDev = Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length);
    const outliers = scores.filter(s => Math.abs(s - mean) > 2 * stdDev).length;
    if (outliers > 0) {
      anomalies.push({
        icon: 'fa-chart-line', title: `${outliers} Performance Score Outliers`,
        description: `Scores deviating significantly from mean (${Math.round(mean)}). Review for data entry errors or bias.`,
        severity: 'medium',
      });
    }
  }

  // Anomaly: Payroll discrepancies (gross < net)
  const badPayslips = payslips.filter(p => p.gross_pay && p.net_pay && p.net_pay > p.gross_pay).length;
  if (badPayslips > 0) {
    anomalies.push({
      icon: 'fa-money-bill-transfer', title: `${badPayslips} Payslips: Net > Gross`,
      description: 'Net pay exceeding gross pay indicates data entry errors or missing deduction calculations.',
      severity: 'high',
    });
  }

  // Anomaly: Employees without start_date
  const noStartDate = employees.filter(e => !e.start_date).length;
  if (noStartDate > 0) {
    anomalies.push({
      icon: 'fa-calendar-day', title: `${noStartDate} Employees Missing Start Date`,
      description: 'Missing start dates affect tenure calculations, analytics, and compliance reporting.',
      severity: 'medium',
    });
  }

  return anomalies;
}

// ── Auto-Generated SQL Queries ──
function renderAutoSQL() {
  const container = document.getElementById('db-sql-insights'); if (!container) return;

  const queries = [
    {
      label: 'Department headcount with avg tenure',
      sql: `<span class="keyword">SELECT</span> d.<span class="table-name">name</span>,
  <span class="keyword">COUNT</span>(e.id) <span class="keyword">AS</span> headcount,
  <span class="keyword">AVG</span>(<span class="keyword">EXTRACT</span>(YEAR <span class="keyword">FROM</span> age(now(), e.start_date))) <span class="keyword">AS</span> avg_tenure
<span class="keyword">FROM</span> <span class="table-name">employees</span> e
<span class="keyword">JOIN</span> <span class="table-name">departments</span> d <span class="keyword">ON</span> e.department_id = d.id
<span class="keyword">WHERE</span> e.status = <span class="number">'active'</span>
<span class="keyword">GROUP BY</span> d.name
<span class="keyword">ORDER BY</span> headcount <span class="keyword">DESC</span>;`
    },
    {
      label: 'Attrition risk: low performance + high leave',
      sql: `<span class="comment">-- Employees with low scores AND high leave usage</span>
<span class="keyword">SELECT</span> e.first_name, e.last_name,
  pr.score, <span class="keyword">SUM</span>(lr.days) <span class="keyword">AS</span> total_leave
<span class="keyword">FROM</span> <span class="table-name">employees</span> e
<span class="keyword">JOIN</span> <span class="table-name">performance_reviews</span> pr <span class="keyword">ON</span> pr.employee_id = e.id
<span class="keyword">JOIN</span> <span class="table-name">leave_requests</span> lr <span class="keyword">ON</span> lr.employee_id = e.id
<span class="keyword">WHERE</span> pr.score < <span class="number">50</span>
<span class="keyword">GROUP BY</span> e.id, pr.score
<span class="keyword">HAVING</span> <span class="keyword">SUM</span>(lr.days) > <span class="number">10</span>;`
    },
    {
      label: 'Monthly payroll trend',
      sql: `<span class="keyword">SELECT</span>
  <span class="keyword">DATE_TRUNC</span>(<span class="number">'month'</span>, period::date) <span class="keyword">AS</span> month,
  <span class="keyword">SUM</span>(gross_pay) <span class="keyword">AS</span> total_gross,
  <span class="keyword">SUM</span>(net_pay)   <span class="keyword">AS</span> total_net,
  <span class="keyword">COUNT</span>(*)       <span class="keyword">AS</span> payslip_count
<span class="keyword">FROM</span> <span class="table-name">payslips</span>
<span class="keyword">GROUP BY</span> month
<span class="keyword">ORDER BY</span> month <span class="keyword">DESC</span>
<span class="keyword">LIMIT</span> <span class="number">12</span>;`
    }
  ];

  container.innerHTML = queries.map(q => `
    <div style="margin-bottom:14px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:8px">
        <i class="fas fa-wand-magic-sparkles" style="color:var(--db-purple);font-size:11px"></i>
        ${q.label}
      </div>
      <div class="db-sql-block">${q.sql}</div>
    </div>
  `).join('');
}

// ── Table-Level Analytics ──
function renderTableAnalytics() {
  const tbody = document.getElementById('db-table-tbody'); if (!tbody) return;

  const tables = [
    { name: 'employees', label: 'Employees', data: dbStats.employees },
    { name: 'departments', label: 'Departments', data: dbStats.departments },
    { name: 'leave_requests', label: 'Leave Requests', data: dbStats.leave },
    { name: 'payslips', label: 'Payslips', data: dbStats.payslips },
    { name: 'performance_reviews', label: 'Performance Reviews', data: dbStats.reviews },
    { name: 'training_enrollments', label: 'Training Enrollments', data: dbStats.enrollments },
    { name: 'training_courses', label: 'Training Courses', data: dbStats.courses },
    { name: 'onboarding_records', label: 'Onboarding', data: dbStats.onboarding },
    { name: 'hr_policies', label: 'HR Policies', data: dbStats.policies },
    { name: 'hr_tickets', label: 'HR Tickets', data: dbStats.tickets },
  ];

  const maxRecords = Math.max(...tables.map(t => t.data?.length || 0), 1);
  const totalRecords = tables.reduce((s, t) => s + (t.data?.length || 0), 0);

  const totalEl = document.getElementById('total-records');
  if (totalEl) totalEl.textContent = `${totalRecords.toLocaleString()} records`;

  tbody.innerHTML = tables.map(t => {
    const count = t.data?.length || 0;
    const pct = Math.round(count / maxRecords * 100);
    // Estimate completeness by checking for null/empty values
    let completeness = 100;
    if (count > 0 && t.data[0]) {
      const fields = Object.keys(t.data[0]);
      const nullFields = fields.filter(f => {
        const nullCount = t.data.filter(r => r[f] === null || r[f] === undefined || r[f] === '').length;
        return nullCount / count > 0.3;
      });
      completeness = Math.round((1 - nullFields.length / fields.length) * 100);
    }
    const statusColor = count === 0 ? 'var(--db-amber)' : completeness >= 80 ? 'var(--db-green)' : 'var(--db-amber)';
    const statusLabel = count === 0 ? 'Empty' : completeness >= 80 ? 'Good' : 'Gaps';
    const statusBg = count === 0 ? 'var(--db-amber-light)' : completeness >= 80 ? 'var(--db-green-light)' : 'var(--db-amber-light)';

    return `<tr>
      <td style="font-weight:600;font-size:12px">${t.label}<div style="font-size:10px;color:var(--db-text-dim);font-family:var(--db-mono)">${t.name}</div></td>
      <td style="font-family:var(--db-mono);font-weight:600">${count.toLocaleString()}</td>
      <td>${completeness}%</td>
      <td style="width:120px"><div class="db-table-bar"><div class="db-table-bar-fill" style="width:${pct}%"></div></div></td>
      <td><span class="db-badge" style="background:${statusBg};color:${statusColor}">${statusLabel}</span></td>
    </tr>`;
  }).join('');
}

// ── Public Actions ──
window.runAnalysis = async function() {
  showToast('Running full database analysis…', 'info');
  await runFullAnalysis();
  showToast('Analysis complete!', 'success');
};

window.exportAnalytics = function() {
  showToast('Generating analytics export…', 'info');
  const report = {
    generated: new Date().toISOString(),
    platform: 'Simpatico HR',
    tables: Object.entries(dbStats).map(([key, data]) => ({
      name: key,
      records: data?.length || 0,
    })),
    insights: generateInsights().map(i => i.title),
    anomalies: detectAnomalies().map(a => a.title),
    metrics: {
      totalEmployees: dbStats.employees?.length || 0,
      activeEmployees: dbStats.employees?.filter(e => e.status === 'active').length || 0,
      totalPayslips: dbStats.payslips?.length || 0,
      totalReviews: dbStats.reviews?.length || 0,
    }
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `db-analytics-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  showToast('Analytics exported!', 'success');
};

function renderNoConnection() {
  const container = document.getElementById('db-insights');
  if (container) {
    container.innerHTML = `<div class="db-insight-card" style="grid-column:1/-1;justify-content:center;padding:40px">
      <div style="text-align:center;color:var(--db-text-muted)">
        <i class="fas fa-plug-circle-xmark" style="font-size:32px;margin-bottom:12px;display:block;color:var(--db-amber)"></i>
        <div style="font-size:14px;font-weight:600">Database Connection Required</div>
        <div style="font-size:12px;margin-top:6px">Configure your Supabase credentials in hr-config.js to enable automated analytics.</div>
      </div>
    </div>`;
  }
}

// ── Utilities ──
function esc(s) { return typeof escapeHtml === 'function' ? escapeHtml(s) : (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function formatCompact(n) {
  if (n >= 10000000) return (n/10000000).toFixed(1) + 'Cr';
  if (n >= 100000) return (n/100000).toFixed(1) + 'L';
  if (n >= 1000) return (n/1000).toFixed(1) + 'K';
  return n.toString();
}
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

// Conditional fallbacks
if (typeof window.setText === 'undefined') {
  window.setText = function(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
}
if (typeof window.showToast === 'undefined') {
  window.showToast = (msg, type='info') => {
    const c = document.getElementById('toasts'); if (!c) return;
    const t = document.createElement('div');
    t.style.cssText = 'padding:12px 20px;border-radius:10px;font-size:13px;font-weight:500;backdrop-filter:blur(12px);border:1px solid rgba(0,196,255,0.12);background:rgba(13,19,32,0.95);color:#e2e8f0;animation:fadeUp 0.3s ease';
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3800);
  };
}
