// js/app.js
// SimpaticoHR Main Application Logic

const SB_URL = "https://cvkxtsvgnynxexmemfuy.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2a3h0c3ZnbnlueGV4bWVtZnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MjE2NTEsImV4cCI6MjA4Mjk5NzY1MX0.2mys8Cc-ucJ1uLThEGJubeDEg1TvfIAkW-xFsR4ecq4";

function sbHeaders() {
  return {
    "apikey": SB_KEY,
    "Authorization": "Bearer " + SB_KEY,
```

    "Content-Type": "application/json"
  };
}

async function sbFetch(table, query) {
  const r = await fetch(SB_URL + "/rest/v1/" + table + "?" + (query || ""), { headers: sbHeaders() });
  return r.json();
}

async function sbInsert(table, data) {
  const r = await fetch(SB_URL + "/rest/v1/" + table, {
    method: "POST",
    headers: { ...sbHeaders(), "Prefer": "return=representation" },
    body: JSON.stringify(data)
  });
  return r.json();
}

async function sbUpdate(table, data, filter) {
  const r = await fetch(SB_URL + "/rest/v1/" + table + "?" + filter, {
    method: "PATCH",
    headers: { ...sbHeaders(), "Prefer": "return=representation" },
    body: JSON.stringify(data)
  });
  return r.json();
}

let currentCompanyId = null;

// ==========================================
// PAGE NAVIGATION
// ==========================================
function showPage(pageId) {
  document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.remove('hidden');

  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  const menuItem = document.querySelector('.menu-item[data-page="' + pageId + '"]');
  if (menuItem) menuItem.classList.add('active');

  const bc = document.getElementById('breadcrumbCurrent');
  if (bc) bc.textContent = pageId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  switch (pageId) {
    case 'jobs': loadJobs(); break;
    case 'applications': loadAllApplications(); break;
    case 'pipeline': loadPipelineJobs(); break;
    case 'interviews': loadInterviews(); break;
    case 'automation': loadAutomationRules(); break;
    case 'onboarding': loadOnboarding(); break;
    case 'proctoring': loadProctoringReports(); break;
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('active'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('active'); }
function openCreateJobModal() { openModal('createJobModal'); }
function toggleNotifications() { openModal('notificationPanel'); }

// ==========================================
// DASHBOARD DATA LOADING
// ==========================================
async function loadDashboardData(companyId) {
  currentCompanyId = companyId;
  try {
    const [jobs, apps, ints] = await Promise.all([
      sbFetch("jobs", "select=*&order=created_at.desc&limit=50"),
      sbFetch("applications", "select=*&order=created_at.desc&limit=100"),
      sbFetch("interviews", "select=*&order=created_at.desc&limit=50")
    ]);

    const jobsArr = Array.isArray(jobs) ? jobs : [];
    const appsArr = Array.isArray(apps) ? apps : [];
    const intsArr = Array.isArray(ints) ? ints : [];

    const activeJobs = jobsArr.filter(j => j.is_active || j.status === 'active');

    document.getElementById("statActiveJobs").textContent = activeJobs.length;
    document.getElementById("statApplications").textContent = appsArr.length;
    document.getElementById("statInterviews").textContent = intsArr.length;
    document.getElementById("statHired").textContent = appsArr.filter(a => a.status === "hired").length;

    if (document.getElementById("badgeJobs")) document.getElementById("badgeJobs").textContent = activeJobs.length;
    if (document.getElementById("badgeApplications")) document.getElementById("badgeApplications").textContent = appsArr.length;
    if (document.getElementById("badgeInterviews")) document.getElementById("badgeInterviews").textContent = intsArr.length;

    renderRecentApplications(appsArr.slice(0, 5));
    renderUpcomingInterviews(intsArr.slice(0, 5));
    renderJobsTable(jobsArr);
    renderInterviewsTable(intsArr);

    if (document.getElementById("allApplicationsTable")) renderAllApplications(appsArr);

  } catch(e) {
    console.error("[loadDashboardData]", e);
  }
}

// ==========================================
// RENDER FUNCTIONS
// ==========================================
function renderRecentApplications(apps) {
  const tbody = document.getElementById('recentApplicationsTable');
  if (!tbody) return;
  if (!apps || !apps.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray" style="padding:2rem;">No applications yet</td></tr>';
    return;
  }
  tbody.innerHTML = apps.map(app => {
    const name = app.name || app.candidate_name || 'Unknown';
    const email = app.email || app.candidate_email || '';
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2);
    const score = app.ats_score || app.ai_match_score || null;
    return '<tr>' +
      '<td><div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="width:32px;height:32px;border-radius:50%;background:var(--primary-100);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:0.75rem;color:var(--primary);">' + initials + '</div>' +
        '<div><div style="font-weight:600;font-size:0.85rem;">' + name + '</div>' +
        '<div style="font-size:0.75rem;color:var(--gray-500);">' + email + '</div></div>' +
      '</div></td>' +
      '<td style="font-size:0.85rem;">' + (app.job_title || 'N/A') + '</td>' +
      '<td><span style="padding:2px 8px;border-radius:6px;font-size:0.75rem;font-weight:600;background:rgba(99,102,241,0.1);color:#6366f1;">' + (score !== null ? score + '%' : '--') + '</span></td>' +
      '<td><span class="badge badge-' + getStatusBadgeClass(app.status) + '">' + formatStatus(app.status) + '</span></td>' +
      '<td style="font-size:0.8rem;color:var(--gray-500);">' + timeAgo(app.created_at) + '</td>' +
      '<td><div style="display:flex;gap:4px;">' +
        '<button class="btn btn-ghost btn-sm" onclick="viewApplication(\'' + app.id + '\')"><i class="fas fa-eye"></i></button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
}

function renderAllApplications(apps) {
  const tbody = document.getElementById('allApplicationsTable');
  if (!tbody) return;
  if (!apps || !apps.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray" style="padding:2rem;">No applications found.</td></tr>';
    return;
  }
  tbody.innerHTML = apps.map(app => {
    const name = app.name || app.candidate_name || 'Unknown';
    const email = app.email || app.candidate_email || '';
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2);
    const score = app.ats_score || app.ai_match_score || null;
    return '<tr>' +
      '<td><div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="width:32px;height:32px;border-radius:50%;background:var(--primary-100);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:0.75rem;color:var(--primary);">' + initials + '</div>' +
        '<div><div style="font-weight:600;font-size:0.85rem;">' + name + '</div>' +
        '<div style="font-size:0.75rem;color:var(--gray-500);">' + email + '</div></div>' +
      '</div></td>' +
      '<td style="font-size:0.85rem;">' + (app.job_title || 'N/A') + '</td>' +
      '<td><span style="padding:2px 8px;border-radius:6px;font-size:0.75rem;font-weight:600;background:rgba(99,102,241,0.1);color:#6366f1;">' + (score !== null ? score + '%' : '--') + '</span></td>' +
      '<td><span class="badge badge-' + getStatusBadgeClass(app.status) + '">' + formatStatus(app.status) + '</span></td>' +
      '<td style="font-size:0.8rem;color:var(--gray-500);">' + timeAgo(app.created_at) + '</td>' +
      '<td><div style="display:flex;gap:4px;">' +
        '<button class="btn btn-ghost btn-sm" onclick="viewApplication(\'' + app.id + '\')"><i class="fas fa-eye"></i></button>' +
        '<button class="btn btn-ghost btn-sm" onclick="moveApplication(\'' + app.id + '\', \'shortlisted\')"><i class="fas fa-star"></i></button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
}

function renderUpcomingInterviews(ints) {
  const container = document.getElementById('upcomingInterviews');
  if (!container) return;
  if (!ints || !ints.length) {
    container.innerHTML = '<p class="text-gray text-center" style="padding:1rem;">No interviews yet</p>';
    return;
  }
  container.innerHTML = ints.map(i => {
    const name = i.candidate_name || 'Candidate';
    const role = i.interview_role || '';
    const status = i.status || 'pending';
    const score = i.overall_score !== null && i.overall_score !== undefined ? i.overall_score + '%' : '--';
    return '<div style="display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px;">' +
      '<div style="width:36px;height:36px;border-radius:50%;background:var(--info-light);display:flex;align-items:center;justify-content:center;">' +
        '<i class="fas fa-video" style="color:var(--info);font-size:0.8rem;"></i>' +
      '</div>' +
      '<div style="flex:1;">' +
        '<div style="font-weight:600;font-size:0.85rem;">' + name + '</div>' +
        '<div style="font-size:0.75rem;color:var(--gray-500);">' + role + ' • Score: ' + score + '</div>' +
      '</div>' +
      '<span class="badge badge-' + (status === 'completed' ? 'success' : status === 'in_progress' ? 'warning' : 'info') + '">' + status + '</span>' +
    '</div>';
  }).join('');
}

function renderJobsTable(jobs) {
  const tbody = document.getElementById('jobsTable');
  if (!tbody) return;
  if (!jobs || !jobs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray" style="padding:2rem;">No jobs yet. Click "Create Job" to get started!</td></tr>';
    return;
  }
  tbody.innerHTML = jobs.map(job => {
    const status = job.status || (job.is_active ? 'active' : 'draft');
    return '<tr>' +
      '<td><div style="font-weight:600;">' + (job.title || 'Untitled') + '</div>' +
        '<div style="font-size:0.75rem;color:var(--gray-500);">' + (job.location || 'Remote') + ' • ' + (job.level || 'Mid-Level') + '</div></td>' +
      '<td>' + (job.department || '-') + '</td>' +
      '<td><span style="font-weight:600;color:var(--primary);">' + (job.applications_count || 0) + '</span></td>' +
      '<td><span class="badge badge-' + (status === 'active' ? 'success' : status === 'draft' ? 'gray' : 'warning') + '">' + status + '</span></td>' +
      '<td style="font-size:0.85rem;color:var(--gray-500);">' + formatDate(job.created_at) + '</td>' +
      '<td><div style="display:flex;gap:4px;">' +
        '<button class="btn btn-ghost btn-sm" title="View Pipeline" onclick="showPage(\'pipeline\')"><i class="fas fa-columns"></i></button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
}

function renderInterviewsTable(ints) {
  const tbody = document.getElementById('interviewsTable');
  if (!tbody) return;
  if (!ints || !ints.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray" style="padding:2rem;">No interviews yet.</td></tr>';
    return;
  }

  const scheduled = ints.filter(i => i.status === 'pending').length;
  const completed = ints.filter(i => i.status === 'completed').length;
  const flagged = ints.filter(i => i.violation_count > 0).length;
  const scored = ints.filter(i => i.overall_score != null);
  const avgTrust = scored.length ? Math.round(scored.reduce((s,i) => s + (i.trust_score || i.overall_score || 0), 0) / scored.length) : null;

  if (document.getElementById('intScheduled')) document.getElementById('intScheduled').textContent = scheduled;
  if (document.getElementById('intCompleted')) document.getElementById('intCompleted').textContent = completed;
  if (document.getElementById('intFlagged')) document.getElementById('intFlagged').textContent = flagged;
  if (document.getElementById('intAvgTrust')) document.getElementById('intAvgTrust').textContent = avgTrust !== null ? avgTrust + '%' : '--';

  tbody.innerHTML = ints.map(i => {
    const name = i.candidate_name || 'Candidate';
    const role = i.interview_role || '-';
    const status = i.status || 'pending';
    const score = i.overall_score != null ? i.overall_score + '%' : '--';
    const trust = i.trust_score != null ? i.trust_score + '%' : '--';
    const badgeColor = status === 'completed' ? '#059669' : status === 'in_progress' ? '#D97706' : '#6366f1';
    const url = 'https://simpaticohr.in/evalis-platform.html?token=' + i.token;
    return '<tr>' +
      '<td style="font-weight:600;font-size:0.85rem;">' + name + '</td>' +
      '<td style="font-size:0.85rem;">' + role + '</td>' +
      '<td style="font-size:0.85rem;">' + (i.interview_type || 'AI') + '</td>' +
      '<td style="font-size:0.8rem;color:var(--gray-500);">' + timeAgo(i.created_at) + '</td>' +
      '<td><span style="font-weight:700;color:' + (i.trust_score >= 70 ? 'var(--success)' : 'var(--warning)') + ';">' + trust + '</span></td>' +
      '<td><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:' + badgeColor + '22;color:' + badgeColor + ';border:1px solid ' + badgeColor + '44">' + status + '</span></td>' +
      '<td><div style="display:flex;gap:4px;">' +
        (status === 'completed' ? '<button onclick="viewInterviewReport(\'' + i.id + '\')" class="btn btn-ghost btn-sm"><i class="fas fa-chart-bar"></i></button>' : '') +
        '<button onclick="navigator.clipboard.writeText(\'' + url + '\').then(()=>showToast(\'Link copied!\',\'success\'))" class="btn btn-ghost btn-sm"><i class="fas fa-link"></i></button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
}

// ==========================================
// JOBS MANAGEMENT
// ==========================================
async function loadJobs() {
  try {
    const jobs = await sbFetch("jobs", "select=*&order=created_at.desc&limit=50");
    renderJobsTable(Array.isArray(jobs) ? jobs : []);
  } catch (e) {
    console.error('Error loading jobs:', e);
  }
}

async function publishJob() {
  const title = document.getElementById('newJobTitle').value;
  if (!title) { showToast('Job title is required', 'error'); return; }
  try {
    const skills = document.getElementById('newJobSkills').value.split(',').map(s => s.trim()).filter(Boolean);
    await sbInsert("jobs", {
      title,
      department: document.getElementById('newJobDept').value,
      location: document.getElementById('newJobLocation').value,
      skills: skills,
      description: document.getElementById('newJobDesc').value,
      level: 'Mid-Level',
      is_active: true,
      status: 'active',
      created_at: new Date().toISOString()
    });
    closeModal('createJobModal');
    showToast('Job published successfully!', 'success');
    loadDashboardData(currentCompanyId);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function saveJobDraft() {
  const title = document.getElementById('newJobTitle').value;
  if (!title) { showToast('Job title is required', 'error'); return; }
  try {
    await sbInsert("jobs", { title, department: document.getElementById('newJobDept').value, description: document.getElementById('newJobDesc').value, status: 'draft', is_active: false, created_at: new Date().toISOString() });
    closeModal('createJobModal');
    showToast('Job saved as draft', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ==========================================
// APPLICATIONS
// ==========================================
async function loadAllApplications() {
  const tbody = document.getElementById('allApplicationsTable');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray" style="padding:2rem;">Loading...</td></tr>';
  try {
    const apps = await sbFetch("applications", "select=*&order=created_at.desc&limit=100");
    renderAllApplications(Array.isArray(apps) ? apps : []);
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:2rem;color:red;">' + e.message + '</td></tr>';
  }
}

async function moveApplication(appId, status) {
  try {
    await sbUpdate("applications", { status }, "id=eq." + appId);
    showToast('Moved to ' + status, 'success');
    loadDashboardData(currentCompanyId);
  } catch (e) { showToast(e.message, 'error'); }
}

function viewApplication(id) {
  showToast('Application ID: ' + id, 'info');
}

// ==========================================
// INTERVIEWS
// ==========================================
async function loadInterviews() {
  const tbody = document.getElementById('interviewsTable');
  if (!tbody) return;
  try {
    const ints = await sbFetch("interviews", "select=*&order=created_at.desc&limit=50");
    renderInterviewsTable(Array.isArray(ints) ? ints : []);
  } catch (e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding:2rem;color:red;text-align:center;">' + e.message + '</td></tr>';
  }
}

function viewInterviewReport(id) {
  window.open('/interview/results.html?interview_id=' + id, '_blank');
}

// ==========================================
// PIPELINE
// ==========================================
const PIPELINE_STAGES = [
  { key: 'applied', label: 'Applied', color: 'var(--gray-500)' },
  { key: 'shortlisted', label: 'Shortlisted', color: 'var(--primary)' },
  { key: 'interviewed', label: 'Interviewed', color: 'var(--warning)' },
  { key: 'hired', label: 'Hired', color: 'var(--success)' },
  { key: 'rejected', label: 'Rejected', color: 'var(--danger)' }
];

async function loadPipelineJobs() {
  try {
    const jobs = await sbFetch("jobs", "select=id,title&is_active=eq.true");
    const select = document.getElementById('pipelineJobFilter');
    if (!select) return;
    select.innerHTML = '<option value="">Select Job</option>' + (Array.isArray(jobs) ? jobs : []).map(j => '<option value="' + j.id + '">' + j.title + '</option>').join('');
  } catch(e) { console.error(e); }
}

async function loadPipeline(jobId) {
  if (!jobId) return;
  try {
    const apps = await sbFetch("applications", "select=*&job_id=eq." + jobId + "&order=created_at.desc");
    const board = document.getElementById('pipelineBoard');
    if (!board) return;
    board.innerHTML = PIPELINE_STAGES.map(stage => {
      const stageApps = (Array.isArray(apps) ? apps : []).filter(a => a.status === stage.key);
      return '<div class="pipeline-stage" data-stage="' + stage.key + '">' +
        '<div class="pipeline-stage-header"><div style="display:flex;align-items:center;gap:8px;"><div style="width:10px;height:10px;border-radius:50%;background:' + stage.color + ';"></div><h4>' + stage.label + '</h4></div><span class="count">' + stageApps.length + '</span></div>' +
        '<div class="pipeline-cards" ondragover="event.preventDefault()" ondrop="handleDrop(event,\'' + stage.key + '\')">' +
          stageApps.map(app => '<div class="pipeline-card" draggable="true" ondragstart="event.dataTransfer.setData(\'text\',\'' + app.id + '\')">' +
            '<div style="font-weight:600;font-size:0.85rem;">' + (app.name || app.candidate_name || 'Unknown') + '</div>' +
            '<div style="font-size:0.75rem;color:var(--gray-500);">' + (app.email || app.candidate_email || '') + '</div>' +
            '<div style="font-size:0.75rem;margin-top:4px;">ATS: <strong>' + (app.ats_score || '--') + '</strong></div>' +
          '</div>').join('') +
        '</div></div>';
    }).join('');
  } catch(e) { console.error(e); }
}

async function handleDrop(event, newStage) {
  event.preventDefault();
  const appId = event.dataTransfer.getData('text');
  try {
    await sbUpdate("applications", { status: newStage }, "id=eq." + appId);
    showToast('Moved to ' + newStage, 'success');
    const jobId = document.getElementById('pipelineJobFilter').value;
    if (jobId) loadPipeline(jobId);
  } catch(e) { showToast(e.message, 'error'); }
}

// ==========================================
// GLOBAL SEARCH
// ==========================================
function handleGlobalSearch(val) {
  if (!val || val.length < 2) return;
  console.log('Search:', val);
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function getStatusBadgeClass(status) {
  switch (status) {
    case 'hired': return 'success';
    case 'shortlisted': return 'primary';
    case 'interviewed': return 'warning';
    case 'rejected': return 'danger';
    default: return 'gray';
  }
}

function formatStatus(status) {
  if (!status) return 'N/A';
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function timeAgo(dateStr) {
  if (!dateStr) return 'N/A';
  const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
  if (seconds < 2592000) return Math.floor(seconds / 86400) + ' days ago';
  return Math.floor(seconds / 2592000) + ' months ago';
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function showToast(message, type) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#6366f1' };
  toast.style.cssText = 'padding:12px 20px;border-radius:8px;background:' + (colors[type] || colors.info) + ';color:#fff;font-size:0.85rem;font-weight:600;margin-top:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function doLogout() {
  localStorage.removeItem('simpatico_token');
  localStorage.removeItem('simpatico_user');
  window.location.href = '/auth/login.html';
}

// ==========================================
// STUBS
// ==========================================
function loadNotifications() { console.log('Notifications not yet implemented'); }
function triggerAutomation(event, id, data) { console.log('Automation:', event, id, data); }
function setupRealtimeSubscriptions(companyId) { console.log('Realtime subscriptions not yet implemented'); }

function searchCandidates() { alert('Candidate Sourcing coming soon!'); }


function api(endpoint, options) {
  const token = localStorage.getItem('simpatico_token') || '';
  const workerUrl = 'https://evalis-ai.simpaticohrconsultancy.workers.dev';
  return fetch(workerUrl + endpoint, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, ...((options || {}).headers || {}) }
  }).then(r => r.json());
}
