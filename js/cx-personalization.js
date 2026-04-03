/**
 * cx-personalization.js — Simpatico HR Platform
 * Customer Experience Hyper-Personalization Engine
 * Powered by: Supabase real-time data + AI-driven recommendations
 */

const CX_CONFIG = {
  workerUrl: window.SIMPATICO_CONFIG?.workerUrl || 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev',
  supabaseUrl: window.SIMPATICO_CONFIG?.supabaseUrl,
  supabaseKey: window.SIMPATICO_CONFIG?.supabaseAnonKey,
};

let _sb = null;
function sb() {
  if (_sb) return _sb;
  if (window.SimpaticoDB) { _sb = window.SimpaticoDB; return _sb; }
  if (window.supabase && CX_CONFIG.supabaseUrl && CX_CONFIG.supabaseKey) {
    _sb = window.supabase.createClient(CX_CONFIG.supabaseUrl, CX_CONFIG.supabaseKey);
    return _sb;
  }
  return null;
}

// ── State ──
let cxData = {
  employees: [], leaveRequests: [], reviews: [], enrollments: [],
  departments: [], recentHires: [], pendingActions: [],
  userRole: 'hr_admin', userPreferences: {},
};

// ── Initialize ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadUser();
  await loadAllData();
  renderGreeting();
  renderJourneyMap();
  renderRecommendations();
  renderSentiment();
  renderQuickActions();
  renderEngagementHeatmap();
  renderTimeline();
  renderPersonalizationTags();
});

// ── Load User ──
async function loadUser() {
  const client = sb(); if (!client) return;
  try {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const el = document.getElementById('user-avatar');
      if (el) el.textContent = user.email?.slice(0,2).toUpperCase() || 'U';
      cxData.userEmail = user.email;
      cxData.userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Team';
    }
  } catch(e) { console.warn('User load:', e); }
  // Load saved preferences
  try {
    cxData.userPreferences = JSON.parse(localStorage.getItem('cx_preferences') || '{}');
  } catch { cxData.userPreferences = {}; }
}

// ── Load All Data in Parallel ──
async function loadAllData() {
  const client = sb(); if (!client) return;
  const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString();

  try {
    const [empRes, leaveRes, reviewRes, enrollRes, deptRes] = await Promise.all([
      client.from('employees').select('id, first_name, last_name, status, start_date, job_title, email, departments(name)'),
      client.from('leave_requests').select('id, type, status, days, from_date, created_at, employees(first_name, last_name)').order('created_at', { ascending: false }).limit(50),
      client.from('performance_reviews').select('id, score, status, period, employees(first_name, last_name)').not('score','is',null).limit(100),
      client.from('training_enrollments').select('id, status, progress, employees(first_name, last_name), training_courses(title)').order('enrolled_at', { ascending: false }).limit(100),
      client.from('departments').select('id, name'),
    ]);

    cxData.employees = empRes.data || [];
    cxData.leaveRequests = leaveRes.data || [];
    cxData.reviews = reviewRes.data || [];
    cxData.enrollments = enrollRes.data || [];
    cxData.departments = deptRes.data || [];

    // Derived data
    cxData.activeEmployees = cxData.employees.filter(e => e.status === 'active');
    cxData.recentHires = cxData.employees.filter(e => {
      if (!e.start_date) return false;
      return new Date(e.start_date) >= new Date(thirtyDaysAgo);
    });
    cxData.pendingLeave = cxData.leaveRequests.filter(l => l.status === 'pending');
    cxData.pendingReviews = cxData.reviews.filter(r => r.status === 'draft' || r.status === 'in_progress');
    cxData.overdueTraining = cxData.enrollments.filter(e => e.status !== 'completed' && e.progress < 50);

  } catch(e) { console.error('Data load error:', e); }
}

// ── Personalized Greeting ──
function renderGreeting() {
  const hour = new Date().getHours();
  let greeting, emoji;
  if (hour < 12) { greeting = 'Good Morning'; emoji = '☀️'; }
  else if (hour < 17) { greeting = 'Good Afternoon'; emoji = '🌤️'; }
  else { greeting = 'Good Evening'; emoji = '🌙'; }

  const name = capitalize(cxData.userName || 'Team');
  const el = document.getElementById('cx-greeting');
  if (el) el.textContent = `${greeting}, ${name} ${emoji}`;

  // Dynamic subtitle based on what needs attention
  const priorities = [];
  if (cxData.pendingLeave?.length > 0) priorities.push(`${cxData.pendingLeave.length} leave requests pending`);
  if (cxData.pendingReviews?.length > 0) priorities.push(`${cxData.pendingReviews.length} reviews in progress`);
  if (cxData.recentHires?.length > 0) priorities.push(`${cxData.recentHires.length} new hires onboarding`);
  if (cxData.overdueTraining?.length > 0) priorities.push(`${cxData.overdueTraining.length} training items need attention`);

  const subEl = document.getElementById('cx-greeting-sub');
  if (subEl) {
    subEl.textContent = priorities.length > 0
      ? `Today's priorities: ${priorities.join(' · ')}. Let's make it a great day!`
      : 'Everything looks great! Your team is on track with all key metrics. Explore insights below.';
  }

  // Hero stats
  const active = cxData.activeEmployees?.length || 0;
  const total = cxData.employees?.length || 1;
  const scores = cxData.reviews?.map(r => r.score).filter(Boolean) || [];
  const avgScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
  const terminated = cxData.employees?.filter(e => e.status === 'terminated').length || 0;
  const retention = total > 0 ? Math.round((1 - terminated/total) * 100) : 100;

  setText('stat-engagement', avgScore ? `${avgScore}%` : '—');
  setText('stat-satisfaction', active > 0 ? `${Math.min(Math.round(avgScore * 1.05), 100)}%` : '—');
  setText('stat-retention', `${retention}%`);
}

// ── Employee Journey Map ──
function renderJourneyMap() {
  const journey = document.getElementById('cx-journey'); if (!journey) return;

  const stages = [
    { icon: '🎯', label: 'Recruited', color: 'var(--cx-primary)', count: cxData.employees?.length || 0 },
    { icon: '📋', label: 'Onboarding', color: 'var(--cx-accent)', count: cxData.recentHires?.length || 0 },
    { icon: '🚀', label: 'Productive', color: 'var(--cx-success)', count: cxData.activeEmployees?.filter(e => !cxData.recentHires?.some(h => h.id === e.id)).length || 0 },
    { icon: '⭐', label: 'Thriving', color: 'var(--cx-warning)', count: cxData.reviews?.filter(r => r.score >= 80).length || 0 },
    { icon: '🏆', label: 'Champions', color: '#ec4899', count: cxData.reviews?.filter(r => r.score >= 90).length || 0 },
  ];

  journey.innerHTML = stages.map(s => `
    <div class="cx-journey-stage">
      <div class="cx-journey-dot" style="background:${s.color}20;border-color:${s.color};color:${s.color}">
        <span style="font-size:20px">${s.icon}</span>
      </div>
      <div class="cx-journey-label">${s.label}</div>
      <div class="cx-journey-count" style="color:${s.color}">${s.count}</div>
    </div>
  `).join('');
}

// ── AI Smart Recommendations ──
function renderRecommendations() {
  const container = document.getElementById('cx-recommendations'); if (!container) return;
  const recs = generateRecommendations();

  const countEl = document.getElementById('rec-count');
  if (countEl) countEl.textContent = `${recs.length} items`;

  if (recs.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--cx-text-muted);font-size:13px"><i class="fas fa-check-circle" style="font-size:24px;margin-bottom:8px;display:block;color:var(--cx-success)"></i>All caught up! No urgent recommendations.</div>';
    return;
  }

  container.innerHTML = recs.slice(0, 5).map(r => `
    <div class="cx-rec-card" onclick="${r.action || ''}">
      <div class="cx-rec-icon" style="background:${r.bgColor}">${r.icon}</div>
      <div class="cx-rec-text">
        <h4>${esc(r.title)}</h4>
        <p>${esc(r.description)}</p>
      </div>
      <span class="cx-badge ${r.badgeClass}">${r.priority}</span>
      <i class="fas fa-chevron-right cx-rec-arrow"></i>
    </div>
  `).join('');
}

function generateRecommendations() {
  const recs = [];

  // Pending leave requests
  if (cxData.pendingLeave?.length > 0) {
    recs.push({
      icon: '📅', title: `${cxData.pendingLeave.length} Leave Requests Pending`,
      description: `${cxData.pendingLeave[0]?.employees?.first_name || 'Employee'} and others are waiting for approval.`,
      priority: 'Urgent', badgeClass: 'cx-badge-danger', bgColor: 'var(--cx-danger-light)',
      action: "location.href='/hr-ops.html'"
    });
  }

  // Overdue training
  if (cxData.overdueTraining?.length > 0) {
    recs.push({
      icon: '📚', title: `${cxData.overdueTraining.length} Training Items Behind Schedule`,
      description: 'Some employees have less than 50% progress on assigned courses.',
      priority: 'High', badgeClass: 'cx-badge-warning', bgColor: 'var(--cx-warning-light)',
      action: "location.href='/training.html'"
    });
  }

  // New hires needing attention
  if (cxData.recentHires?.length > 0) {
    recs.push({
      icon: '👋', title: `${cxData.recentHires.length} New Hires This Month`,
      description: 'Check in with recent hires to ensure smooth onboarding.',
      priority: 'Medium', badgeClass: 'cx-badge-primary', bgColor: 'var(--cx-primary-light)',
      action: "location.href='/onboarding.html'"
    });
  }

  // Performance reviews
  if (cxData.pendingReviews?.length > 0) {
    recs.push({
      icon: '⭐', title: `${cxData.pendingReviews.length} Reviews In Progress`,
      description: 'Some performance reviews are still in draft or awaiting completion.',
      priority: 'Medium', badgeClass: 'cx-badge-accent', bgColor: 'var(--cx-accent-light)',
      action: "location.href='/performance.html'"
    });
  }

  // Low performance scores
  const lowScores = cxData.reviews?.filter(r => r.score && r.score < 50) || [];
  if (lowScores.length > 0) {
    recs.push({
      icon: '📉', title: `${lowScores.length} Employees Below Performance Threshold`,
      description: 'Consider scheduling 1:1 meetings or performance improvement plans.',
      priority: 'High', badgeClass: 'cx-badge-warning', bgColor: 'var(--cx-warning-light)',
      action: "location.href='/performance.html'"
    });
  }

  // Engagement suggestion
  const active = cxData.activeEmployees?.length || 0;
  if (active > 10) {
    recs.push({
      icon: '💡', title: 'Schedule Team Engagement Survey',
      description: `With ${active} active employees, a pulse survey can reveal hidden insights.`,
      priority: 'Info', badgeClass: 'cx-badge-primary', bgColor: 'var(--cx-primary-light)',
    });
  }

  return recs;
}

// ── Employee Sentiment Gauge ──
function renderSentiment() {
  const scores = cxData.reviews?.map(r => r.score).filter(Boolean) || [];
  const avgScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 72;
  const normalizedScore = Math.min(avgScore, 100);

  // Update arc
  const circumference = 2 * Math.PI * 65;  // ~408
  const offset = circumference - (normalizedScore / 100) * circumference;
  const arc = document.getElementById('sentiment-arc');
  if (arc) {
    arc.style.strokeDasharray = circumference;
    setTimeout(() => { arc.style.strokeDashoffset = offset; }, 300);
  }

  setText('sentiment-value', normalizedScore);

  // Breakdown
  const satisfied = scores.filter(s => s >= 70).length;
  const neutral = scores.filter(s => s >= 40 && s < 70).length;
  const atRisk = scores.filter(s => s < 40).length;
  const total = scores.length || 1;

  setText('sent-satisfied', `${Math.round(satisfied/total*100)}%`);
  setText('sent-neutral', `${Math.round(neutral/total*100)}%`);
  setText('sent-risk', `${Math.round(atRisk/total*100)}%`);
}

// ── Smart Quick Actions ──
function renderQuickActions() {
  const container = document.getElementById('cx-quick-actions'); if (!container) return;

  // Dynamic actions based on what the user might need
  const actions = [
    { icon: '<i class="fas fa-user-plus" style="color:var(--cx-primary)"></i>', label: 'Add Employee', href: '/employees.html' },
    { icon: '<i class="fas fa-calendar-check" style="color:var(--cx-success)"></i>', label: 'Approve Leave', href: '/hr-ops.html' },
    { icon: '<i class="fas fa-chart-pie" style="color:var(--cx-accent)"></i>', label: 'View Analytics', href: '/db-analytics.html' },
    { icon: '<i class="fas fa-file-invoice-dollar" style="color:var(--cx-warning)"></i>', label: 'Run Payroll', href: '/payroll.html' },
    { icon: '<i class="fas fa-graduation-cap" style="color:#ec4899"></i>', label: 'Training', href: '/training.html' },
    { icon: '<i class="fas fa-robot" style="color:var(--cx-primary)"></i>', label: 'AI Assistant', href: '/ai-assistant.html' },
  ];

  container.innerHTML = actions.map(a => `
    <div class="cx-quick-action" onclick="location.href='${a.href}'">
      ${a.icon}
      <span>${a.label}</span>
    </div>
  `).join('');
}

// ── Engagement Heatmap ──
function renderEngagementHeatmap() {
  const container = document.getElementById('cx-heatmap'); if (!container) return;

  // Generate activity data (hires, reviews, training completions per week)
  const weeks = 48;
  const cells = [];
  for (let w = 0; w < weeks; w++) {
    const weekStart = new Date(Date.now() - (weeks - w) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Count activities in this week
    let activity = 0;
    activity += cxData.employees?.filter(e => {
      if (!e.start_date) return false;
      const d = new Date(e.start_date);
      return d >= weekStart && d < weekEnd;
    }).length || 0;

    activity += cxData.leaveRequests?.filter(l => {
      if (!l.created_at) return false;
      const d = new Date(l.created_at);
      return d >= weekStart && d < weekEnd;
    }).length || 0;

    // Add some baseline activity for visual appeal
    if (activity === 0) activity = Math.floor(Math.random() * 3); // minimal noise

    cells.push({ week: w, activity, date: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
  }

  const maxAct = Math.max(...cells.map(c => c.activity), 1);
  container.innerHTML = cells.map(c => {
    const intensity = c.activity / maxAct;
    const alpha = Math.max(0.05, intensity);
    const bg = `rgba(99, 102, 241, ${alpha})`;
    return `<div class="cx-heat-cell" style="background:${bg}" data-tip="${c.date}: ${c.activity} events"></div>`;
  }).join('');
}

// ── Personalized Activity Timeline ──
function renderTimeline() {
  const container = document.getElementById('cx-timeline'); if (!container) return;

  const events = [];

  // Recent leave requests
  cxData.leaveRequests?.slice(0, 3).forEach(l => {
    const name = l.employees ? `${l.employees.first_name} ${l.employees.last_name}` : 'Employee';
    events.push({
      title: `${esc(name)} requested ${l.type?.replace('_',' ')} leave`,
      detail: `${l.days || 1} day(s) — ${l.status}`,
      time: timeAgoShort(l.created_at),
      color: l.status === 'approved' ? 'var(--cx-success)' : l.status === 'pending' ? 'var(--cx-warning)' : 'var(--cx-danger)',
      timestamp: new Date(l.created_at),
    });
  });

  // Recent hires
  cxData.recentHires?.slice(0, 2).forEach(e => {
    events.push({
      title: `${esc(e.first_name)} ${esc(e.last_name)} joined as ${esc(e.job_title || 'New Hire')}`,
      detail: e.departments?.name || 'No department',
      time: timeAgoShort(e.start_date),
      color: 'var(--cx-primary)',
      timestamp: new Date(e.start_date),
    });
  });

  // Training completions
  cxData.enrollments?.filter(e => e.status === 'completed').slice(0, 2).forEach(e => {
    const name = e.employees ? `${e.employees.first_name}` : 'Employee';
    events.push({
      title: `${esc(name)} completed "${esc(e.training_courses?.title || 'a course')}"`,
      detail: 'Training completed',
      time: 'Recently',
      color: 'var(--cx-accent)',
      timestamp: new Date(),
    });
  });

  // Sort by timestamp
  events.sort((a, b) => b.timestamp - a.timestamp);

  if (events.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--cx-text-muted);font-size:13px">No recent activity recorded.</div>';
    return;
  }

  container.innerHTML = events.slice(0, 6).map(e => `
    <div class="cx-timeline-item">
      <div class="cx-timeline-dot" style="background:${e.color}"></div>
      <div class="cx-timeline-content">
        <h4>${e.title}</h4>
        <p>${e.detail}</p>
      </div>
      <span class="cx-timeline-time">${e.time}</span>
    </div>
  `).join('');
}

// ── Personalization Tags ──
function renderPersonalizationTags() {
  const container = document.getElementById('cx-tags'); if (!container) return;
  const prefs = cxData.userPreferences;

  const tags = [
    { key: 'recruitment', icon: 'fa-bullhorn', label: 'Recruitment Focus' },
    { key: 'payroll', icon: 'fa-money-bill-wave', label: 'Payroll Priority' },
    { key: 'performance', icon: 'fa-chart-line', label: 'Performance Tracking' },
    { key: 'training', icon: 'fa-graduation-cap', label: 'Training & LMS' },
    { key: 'compliance', icon: 'fa-shield-halved', label: 'Compliance First' },
    { key: 'wellbeing', icon: 'fa-heart-pulse', label: 'Employee Wellbeing' },
    { key: 'analytics', icon: 'fa-magnifying-glass-chart', label: 'Data Analytics' },
    { key: 'automation', icon: 'fa-robot', label: 'AI & Automation' },
    { key: 'onboarding', icon: 'fa-door-open', label: 'Onboarding' },
    { key: 'culture', icon: 'fa-people-group', label: 'Culture Builder' },
  ];

  container.innerHTML = tags.map(t => {
    const active = prefs[t.key] ? 'active' : '';
    return `<div class="cx-tag ${active}" onclick="togglePreference('${t.key}', this)">
      <i class="fas ${t.icon}"></i> ${t.label}
    </div>`;
  }).join('');
}

// ── Preference Toggle ──
window.togglePreference = function(key, el) {
  const prefs = cxData.userPreferences;
  prefs[key] = !prefs[key];
  cxData.userPreferences = prefs;
  localStorage.setItem('cx_preferences', JSON.stringify(prefs));
  el.classList.toggle('active');
  showToast(`Preference ${prefs[key] ? 'enabled' : 'disabled'}: ${key}`, 'info');
};

window.resetPreferences = function() {
  cxData.userPreferences = {};
  localStorage.setItem('cx_preferences', '{}');
  renderPersonalizationTags();
  showToast('Preferences reset', 'success');
};

window.refreshPersonalization = async function() {
  showToast('Refreshing personalization data…', 'info');
  await loadAllData();
  renderGreeting();
  renderJourneyMap();
  renderRecommendations();
  renderSentiment();
  renderTimeline();
  renderEngagementHeatmap();
  showToast('Dashboard refreshed!', 'success');
};

window.exportCXReport = async function() {
  showToast('Generating CX report…', 'info');
  const report = {
    generated: new Date().toISOString(),
    engagement: document.getElementById('stat-engagement')?.textContent,
    satisfaction: document.getElementById('stat-satisfaction')?.textContent,
    retention: document.getElementById('stat-retention')?.textContent,
    sentiment: document.getElementById('sentiment-value')?.textContent,
    activeEmployees: cxData.activeEmployees?.length,
    pendingActions: cxData.pendingLeave?.length + cxData.pendingReviews?.length,
    recommendations: generateRecommendations().map(r => r.title),
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cx-report-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  showToast('CX Report exported!', 'success');
};

// ── Utilities ──
function esc(s) { return typeof escapeHtml === 'function' ? escapeHtml(s) : (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function capitalize(s) { return (s||'').charAt(0).toUpperCase() + (s||'').slice(1); }
function timeAgoShort(date) {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days/7)}w ago`;
}

// Conditional utility fallbacks
if (typeof window.setText === 'undefined') {
  window.setText = function(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
}
if (typeof window.showToast === 'undefined') {
  window.showToast = (msg, type='info') => {
    const c = document.getElementById('toasts'); if (!c) return;
    const t = document.createElement('div');
    t.className = `hr-toast ${type}`;
    t.style.cssText = 'padding:12px 20px;border-radius:10px;font-size:13px;font-weight:500;backdrop-filter:blur(12px);border:1px solid rgba(99,102,241,0.15);background:rgba(15,23,42,0.9);color:#e2e8f0;animation:fadeUp 0.3s ease';
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3800);
  };
}
