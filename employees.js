/**
 * employees.js — Simpatico HR Platform
 * Employees module: Supabase + Cloudflare Workers + R2
 */

// ── Config (pulled from existing app config if available) ──
const EMP_CONFIG = {
  supabaseUrl:    window.SIMPATICO_CONFIG?.supabaseUrl    || 'https://YOUR_PROJECT.supabase.co',
  supabaseKey:    window.SIMPATICO_CONFIG?.supabaseAnonKey || 'YOUR_ANON_KEY',
  workerUrl:      window.SIMPATICO_CONFIG?.workerUrl       || 'https://hr-api.YOUR_SUBDOMAIN.workers.dev',
  r2PublicUrl:    window.SIMPATICO_CONFIG?.r2PublicUrl     || 'https://files.YOUR_DOMAIN.com',
};

// ── Supabase client (lazy-loads existing if present) ──
let _sb = null;
function sb() {
  if (_sb) return _sb;
  if (window.supabase) { _sb = window.supabase.createClient(EMP_CONFIG.supabaseUrl, EMP_CONFIG.supabaseKey); return _sb; }
  console.warn('[employees] Supabase not loaded – load supabase-js before employees.js');
  return null;
}

// ── In-memory state ──
let allEmployees = [];
let departments  = [];
let currentView  = 'list';

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([
    loadCurrentUser(),
    loadDepartments(),
    loadEmployees(),
  ]);

  const empId = new URLSearchParams(location.search).get('id');
  if (empId && document.getElementById('profile-main')) {
    renderProfilePage(empId);
  }
});

// ── Auth ──
async function loadCurrentUser() {
  const client = sb(); if (!client) return;
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    const initials = user.email?.slice(0,2).toUpperCase() || 'U';
    const el = document.getElementById('user-avatar');
    if (el) el.textContent = initials;

    // load org name
    const { data: profile } = await client.from('org_profiles').select('name').single();
    const orgEl = document.getElementById('org-name');
    if (orgEl && profile) orgEl.textContent = profile.name;
  }
}

// ── Departments ──
async function loadDepartments() {
  const client = sb(); if (!client) return;
  const { data, error } = await client
    .from('departments')
    .select('id, name')
    .order('name');

  if (error) { console.error(error); return; }
  departments = data || [];

  // populate department selects
  ['dept-filter', 'emp-dept'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    departments.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id; opt.textContent = d.name;
      sel.appendChild(opt);
    });
  });
}

// ── Load employees ──
async function loadEmployees() {
  const client = sb(); if (!client) return;
  showTableLoading(true);

  const { data, error } = await client
    .from('employees')
    .select(`
      id, first_name, last_name, email, job_title, employment_type,
      start_date, location, status, avatar_url,
      departments(name),
      manager:employees!manager_id(first_name, last_name)
    `)
    .order('first_name');

  showTableLoading(false);

  if (error) { showToast('Failed to load employees', 'error'); console.error(error); return; }
  allEmployees = data || [];
  updateStats();
  renderEmployees(allEmployees);
  populateManagerSelect();
}

// ── Stats ──
function updateStats() {
  const total    = allEmployees.length;
  const active   = allEmployees.filter(e => e.status === 'active').length;
  const onLeave  = allEmployees.filter(e => e.status === 'on_leave').length;
  const deptSet  = new Set(allEmployees.map(e => e.departments?.name).filter(Boolean));

  setText('stat-total',  total);
  setText('stat-active', active);
  setText('stat-leave',  onLeave);
  setText('stat-depts',  deptSet.size);
  setText('stat-total-trend', `${total} across ${deptSet.size} departments`);
  setText('stat-active-trend', `${Math.round(active/Math.max(total,1)*100)}% of workforce`);
  setText('stat-leave-trend',  `${onLeave} currently away`);
}

// ── Render table ──
function renderEmployees(list) {
  if (currentView === 'list') renderTable(list);
  else renderGrid(list);
  setText('employee-count', `${list.length} employee${list.length !== 1 ? 's' : ''}`);
}

function renderTable(list) {
  const tbody = document.getElementById('employees-tbody');
  const table = document.getElementById('employees-table');
  const empty = document.getElementById('table-empty');
  if (!tbody) return;

  if (list.length === 0) {
    if (table) table.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (table) table.style.display = 'table';
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = list.map(e => {
    const name    = `${e.first_name || ''} ${e.last_name || ''}`;
    const initials= e.first_name && e.last_name ? `${e.first_name[0]}${e.last_name[0]}`.toUpperCase() : '??';
    const color   = avatarColor(e.id);
    const dept    = e.departments?.name || '—';
    const mgr     = e.manager ? `${e.manager.first_name} ${e.manager.last_name}` : '—';
    const badge   = statusBadge(e.status);
    const started = e.start_date ? new Date(e.start_date).toLocaleDateString('en-US', {month:'short',year:'numeric'}) : '—';
    const avatar  = e.avatar_url
      ? `<img src="${EMP_CONFIG.r2PublicUrl}/${e.avatar_url}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">`
      : `<div class="hr-emp-avatar" style="background:${color};color:#fff">${initials}</div>`;

    return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          ${avatar}
          <div>
            <div class="primary-text"><a href="employee-profile.html?id=${e.id}" style="color:inherit;text-decoration:none;transition:.15s" onmouseover="this.style.color='var(--hr-primary)'" onmouseout="this.style.color='inherit'">${name}</a></div>
            <div style="font-size:11.5px;color:var(--hr-text-muted)">${e.email}</div>
          </div>
        </div>
      </td>
      <td>${dept}</td>
      <td><span class="primary-text">${e.job_title || '—'}</span></td>
      <td>${e.location || '—'}</td>
      <td>${started}</td>
      <td>${badge}</td>
      <td>
        <div style="display:flex;gap:6px">
          <a href="employee-profile.html?id=${e.id}" class="hr-btn hr-btn-ghost hr-btn-sm">View</a>
          <button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="editEmployee('${e.id}')">Edit</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderGrid(list) {
  const grid = document.getElementById('employees-grid');
  if (!grid) return;
  if (list.length === 0) { grid.innerHTML = '<p style="color:var(--hr-text-muted);text-align:center;grid-column:1/-1;padding:40px">No employees found.</p>'; return; }
  grid.innerHTML = list.map(e => {
    const name    = `${e.first_name || ''} ${e.last_name || ''}`;
    const initials= e.first_name && e.last_name ? `${e.first_name[0]}${e.last_name[0]}`.toUpperCase() : '??';
    const color   = avatarColor(e.id);
    const dept    = e.departments?.name || '';
    const badge   = statusBadge(e.status);
    return `
    <div class="hr-card" style="cursor:pointer" onclick="location.href='employee-profile.html?id=${e.id}'">
      <div style="text-align:center;margin-bottom:14px">
        <div class="hr-emp-avatar" style="background:${color};color:#fff;width:56px;height:56px;font-size:18px;margin:0 auto 10px">
          ${e.avatar_url ? `<img src="${EMP_CONFIG.r2PublicUrl}/${e.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : initials}
        </div>
        <div style="font-weight:600;color:var(--hr-text-primary)">${name}</div>
        <div style="font-size:12px;color:var(--hr-text-muted);margin-top:2px">${e.job_title || ''}</div>
        <div style="margin-top:8px">${badge}</div>
      </div>
      <hr class="hr-divider" style="margin:12px 0">
      <div style="font-size:12px;color:var(--hr-text-muted)">${dept}</div>
    </div>`;
  }).join('');
}

// ── Filter ──
function filterEmployees() {
  const q      = (document.getElementById('search-input')?.value || '').toLowerCase();
  const dept   = document.getElementById('dept-filter')?.value || '';
  const status = document.getElementById('status-filter')?.value || '';

  const filtered = allEmployees.filter(e => {
    const name = `${e.first_name} ${e.last_name} ${e.email} ${e.job_title || ''}`.toLowerCase();
    const matchQ    = !q || name.includes(q);
    const matchDept = !dept || e.departments?.id === dept || String(e.department_id) === dept;
    const matchSt   = !status || e.status === status;
    return matchQ && matchDept && matchSt;
  });
  renderEmployees(filtered);
}

// ── View toggle ──
function toggleView(v) {
  currentView = v;
  document.getElementById('list-view').style.display = v === 'list' ? 'block' : 'none';
  document.getElementById('grid-view').style.display = v === 'grid' ? 'block' : 'none';
  document.getElementById('btn-list').className = `hr-btn hr-btn-sm ${v==='list'?'hr-btn-secondary':'hr-btn-ghost'}`;
  document.getElementById('btn-grid').className = `hr-btn hr-btn-sm ${v==='grid'?'hr-btn-secondary':'hr-btn-ghost'}`;
  filterEmployees();
}

// ── Add Employee ──
function openAddModal() { openModal('add-modal'); }

async function saveEmployee() {
  const btn = document.getElementById('save-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving…';
  }

  const first = document.getElementById('emp-first')?.value.trim();
  const last  = document.getElementById('emp-last')?.value.trim();
  const email = document.getElementById('emp-email')?.value.trim();
  if (!first || !last || !email) {
    showToast('First name, last name and email are required', 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save Employee';
    }
    return;
  }

  const payload = {
    first_name:       first,
    last_name:        last,
    email,
    department_id:    document.getElementById('emp-dept')?.value || null,
    job_title:        document.getElementById('emp-title')?.value.trim() || null,
    start_date:       document.getElementById('emp-start')?.value || null,
    employment_type:  document.getElementById('emp-type')?.value || 'full_time',
    location:         document.getElementById('emp-location')?.value.trim() || null,
    manager_id:       document.getElementById('emp-manager')?.value || null,
    status:           'active',
  };

  // Call Cloudflare Worker (handles server-side logic, sends welcome email, etc.)
  try {
    const res = await fetch(`${EMP_CONFIG.workerUrl}/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to create employee');

    showToast(`${first} ${last} added successfully`, 'success');
    closeModal('add-modal');
    await loadEmployees();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save Employee';
    }
  }
}

// ── Edit Employee ──
async function editEmployee(id) {
  location.href = `employee-profile.html?id=${id}`;
}

// ── Profile Page ──
async function renderProfilePage(id) {
  const client = sb(); if (!client) return;
  const loading = document.getElementById('profile-loading');
  const content = document.getElementById('profile-content');

  const { data: emp, error } = await client
    .from('employees')
    .select(`
      *, 
      departments(id, name),
      manager:employees!manager_id(id, first_name, last_name, job_title),
      employee_documents(id, name, type, file_key, created_at),
      performance_reviews(id, period, score, status, created_at),
      training_enrollments(id, course_id, status, completed_at, training_courses(title))
    `)
    .eq('id', id)
    .single();

  if (loading) loading.style.display = 'none';
  if (error || !emp) {
    if (content) { content.style.display='block'; content.innerHTML='<div class="hr-empty"><p>Employee not found.</p></div>'; }
    return;
  }

  const initials = `${emp.first_name[0]}${emp.last_name[0]}`.toUpperCase();
  const color    = avatarColor(emp.id);
  const latestReview = emp.performance_reviews?.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
  const perfScore = latestReview?.score || 0;
  const circumference = 2 * Math.PI * 30;
  const dash = ((100-perfScore)/100) * circumference;

  if (content) {
    content.style.display = 'block';
    content.innerHTML = `
    <div class="profile-hero">
      <div class="profile-avatar-lg" style="background:${color};color:#fff" onclick="document.getElementById('photo-upload').click()">
        ${emp.avatar_url
          ? `<img src="${EMP_CONFIG.r2PublicUrl}/${emp.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
          : initials}
        <div class="change-photo">Change<br>Photo</div>
      </div>
      <div class="profile-info">
        <h1>${emp.first_name} ${emp.last_name}</h1>
        <div class="role">${emp.job_title || 'No title'} · ${emp.departments?.name || 'No department'}</div>
        <div class="profile-meta">
          <div class="profile-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            ${emp.email}
          </div>
          ${emp.phone ? `<div class="profile-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${emp.phone}</div>` : ''}
          <div class="profile-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${emp.location || 'Remote'}
          </div>
          <div class="profile-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Started ${emp.start_date ? new Date(emp.start_date).toLocaleDateString('en-US',{month:'long',year:'numeric'}) : '—'}
          </div>
        </div>
      </div>
      <div class="profile-actions">
        ${statusBadge(emp.status)}
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="hr-btn hr-btn-secondary hr-btn-sm" onclick="editProfileField()">Edit</button>
          <button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="openAiInsight('${emp.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            AI Insight
          </button>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="hr-tabs" id="profile-tabs">
      <button class="hr-tab active" onclick="showTab('overview')">Overview</button>
      <button class="hr-tab" onclick="showTab('documents')">Documents</button>
      <button class="hr-tab" onclick="showTab('performance')">Performance</button>
      <button class="hr-tab" onclick="showTab('training')">Training</button>
    </div>

    <!-- Overview Tab -->
    <div id="tab-overview">
      <div class="hr-grid-2">
        <div class="hr-card">
          <div class="hr-card-head"><h3>Personal Information</h3><button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="enableEdit()">Edit</button></div>
          <div class="info-grid">
            <div class="info-field"><div class="if-label">Employee ID</div><div class="if-value hr-font-mono">${emp.employee_id || emp.id.slice(0,8).toUpperCase()}</div></div>
            <div class="info-field"><div class="if-label">Employment Type</div><div class="if-value">${formatEnum(emp.employment_type)}</div></div>
            <div class="info-field"><div class="if-label">Department</div><div class="if-value">${emp.departments?.name || '—'}</div></div>
            <div class="info-field"><div class="if-label">Manager</div><div class="if-value">${emp.manager ? `${emp.manager.first_name} ${emp.manager.last_name}` : '—'}</div></div>
            <div class="info-field"><div class="if-label">Work Phone</div><div class="if-value">${emp.phone || '—'}</div></div>
            <div class="info-field"><div class="if-label">Office</div><div class="if-value">${emp.location || '—'}</div></div>
          </div>
        </div>
        <div class="hr-card">
          <div class="hr-card-head"><h3>Performance Score</h3></div>
          <div style="display:flex;align-items:center;gap:20px">
            <div class="perf-ring">
              <svg viewBox="0 0 80 80" width="80" height="80">
                <circle cx="40" cy="40" r="30" fill="none" stroke="var(--hr-border)" stroke-width="8"/>
                <circle cx="40" cy="40" r="30" fill="none" stroke="var(--hr-primary)" stroke-width="8"
                  stroke-dasharray="${circumference}" stroke-dashoffset="${dash}"
                  stroke-linecap="round"/>
              </svg>
              <div class="score">${perfScore}</div>
            </div>
            <div>
              <div style="font-size:13px;color:var(--hr-text-secondary);margin-bottom:8px">Latest review</div>
              <div style="font-size:13px;font-weight:500">${latestReview ? `${latestReview.period} · ${formatEnum(latestReview.status)}` : 'No reviews yet'}</div>
              <a href="../performance/performance.html?employee=${emp.id}" class="hr-btn hr-btn-ghost hr-btn-sm" style="margin-top:10px">View all reviews</a>
            </div>
          </div>
        </div>
      </div>

      <!-- Training progress -->
      <div class="hr-card" style="margin-top:20px">
        <div class="hr-card-head"><h3>Training Progress</h3><a href="../training/training.html?employee=${emp.id}" class="hr-btn hr-btn-ghost hr-btn-sm">View all</a></div>
        ${(emp.training_enrollments || []).slice(0,4).map(en => `
        <div class="hr-progress-wrap" style="margin-bottom:12px">
          <div class="hr-progress-info">
            <span style="font-size:13px;color:var(--hr-text-primary)">${en.training_courses?.title || 'Course'}</span>
            <span class="hr-badge ${en.status === 'completed' ? 'hr-badge-active' : 'hr-badge-pending'}">${en.status}</span>
          </div>
          <div class="hr-progress-bar">
            <div class="hr-progress-fill" style="width:${en.status==='completed'?100:en.progress||0}%"></div>
          </div>
        </div>`).join('') || '<p style="color:var(--hr-text-muted);font-size:13px">No training enrolled.</p>'}
      </div>
    </div>

    <!-- Documents Tab -->
    <div id="tab-documents" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <span style="font-size:14px;color:var(--hr-text-secondary)">${(emp.employee_documents||[]).length} document(s)</span>
        <button class="hr-btn hr-btn-primary hr-btn-sm" onclick="uploadDocument('${emp.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Upload
        </button>
      </div>
      ${(emp.employee_documents || []).map(doc => `
      <div class="doc-item" onclick="downloadDoc('${doc.file_key}')">
        <div class="doc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
        <div style="flex:1">
          <div style="font-weight:500;font-size:13.5px">${doc.name}</div>
          <div style="font-size:12px;color:var(--hr-text-muted)">${doc.type} · ${new Date(doc.created_at).toLocaleDateString()}</div>
        </div>
        <button class="hr-btn hr-btn-ghost hr-btn-sm">Download</button>
      </div>`).join('') || '<div class="hr-empty"><p>No documents uploaded yet.</p></div>'}
    </div>

    <!-- Performance Tab -->
    <div id="tab-performance" style="display:none">
      ${(emp.performance_reviews || []).map(r => `
      <div class="hr-card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:600">${r.period}</div>
            <div style="font-size:12px;color:var(--hr-text-muted);margin-top:3px">${new Date(r.created_at).toLocaleDateString()}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-family:var(--hr-font-display);font-size:24px;font-weight:700;color:var(--hr-primary)">${r.score}/100</div>
            <span class="hr-badge ${r.status==='completed'?'hr-badge-active':'hr-badge-pending'}">${r.status}</span>
          </div>
        </div>
      </div>`).join('') || '<div class="hr-empty"><p>No performance reviews yet.</p></div>'}
    </div>

    <!-- Training Tab -->
    <div id="tab-training" style="display:none">
      ${(emp.training_enrollments || []).map(en => `
      <div class="hr-card" style="margin-bottom:12px;display:flex;align-items:center;gap:16px">
        <div style="flex:1">
          <div style="font-weight:500">${en.training_courses?.title || 'Course'}</div>
          ${en.completed_at ? `<div style="font-size:12px;color:var(--hr-success);margin-top:3px">Completed ${new Date(en.completed_at).toLocaleDateString()}</div>` : ''}
        </div>
        <span class="hr-badge ${en.status==='completed'?'hr-badge-active':en.status==='in_progress'?'hr-badge-info':'hr-badge-pending'}">${en.status}</span>
      </div>`).join('') || '<div class="hr-empty"><p>No training enrollments.</p></div>'}
    </div>
    `;
  }
}

// ── Tab switching ──
window.showTab = function(name) {
  ['overview','documents','performance','training'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.style.display = t === name ? 'block' : 'none';
  });
  document.querySelectorAll('#profile-tabs .hr-tab').forEach((btn, i) => {
    btn.classList.toggle('active', ['overview','documents','performance','training'][i] === name);
  });
};

// ── AI Insight via Cloudflare AI ──
window.openAiInsight = async function(empId) {
  showToast('Generating AI insight…', 'info');
  try {
    const res = await fetch(`${EMP_CONFIG.workerUrl}/ai/employee-insight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ employee_id: empId }),
    });
    const { insight } = await res.json();
    alert(insight || 'No insight available.');
  } catch {
    showToast('AI insight unavailable', 'error');
  }
};

// ── Document upload to Cloudflare R2 ──
window.uploadDocument = async function(empId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.doc,.docx,.png,.jpg';
  input.onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    showToast('Uploading document…', 'info');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('employee_id', empId);
    formData.append('name', file.name);

    try {
      const res = await fetch(`${EMP_CONFIG.workerUrl}/employees/${empId}/documents`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      showToast('Document uploaded', 'success');
      renderProfilePage(empId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
  input.click();
};

// ── Photo upload to R2 ──
window.uploadPhoto = async function(e) {
  const file = e.target.files[0]; if (!file) return;
  const empId = new URLSearchParams(location.search).get('id');
  if (!empId) return;
  showToast('Uploading photo…', 'info');
  const formData = new FormData();
  formData.append('file', file);
  formData.append('employee_id', empId);
  try {
    const res = await fetch(`${EMP_CONFIG.workerUrl}/employees/${empId}/avatar`, {
      method: 'POST', headers: authHeaders(), body: formData,
    });
    if (!res.ok) throw new Error('Upload failed');
    showToast('Photo updated', 'success');
    renderProfilePage(empId);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.downloadDoc = async function(key) {
  try {
    const res = await fetch(`${EMP_CONFIG.workerUrl}/r2/signed-url?key=${encodeURIComponent(key)}`, {
      headers: authHeaders(),
    });
    const { url } = await res.json();
    window.open(url, '_blank');
  } catch { showToast('Failed to get download link', 'error'); }
};

// ── Export ──
window.exportEmployees = function() {
  const headers = ['First Name','Last Name','Email','Department','Title','Location','Status','Start Date'];
  const rows = allEmployees.map(e => [
    e.first_name, e.last_name, e.email,
    e.departments?.name || '',
    e.job_title || '', e.location || '', e.status,
    e.start_date || ''
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `employees-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('Export downloaded', 'success');
};

// ── Populate manager select ──
function populateManagerSelect() {
  const sel = document.getElementById('emp-manager'); if (!sel) return;
  allEmployees.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = `${e.first_name} ${e.last_name}`;
    sel.appendChild(opt);
  });
}

// ── Helpers ──
function authHeaders() {
  const token = sb()?.auth?.session()?.access_token || localStorage.getItem('sb-token') || '';
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}
function statusBadge(s) {
  const map = { active:'hr-badge-active', on_leave:'hr-badge-pending', terminated:'hr-badge-inactive' };
  return `<span class="hr-badge ${map[s]||'hr-badge-inactive'}">${s?.replace('_',' ')}</span>`;
}
function formatEnum(s) { return (s||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); }
function avatarColor(id) {
  const colors = ['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#f97316','#ec4899'];
  let h = 0; for (const c of (id||'')) h = (h*31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}
function showTableLoading(v) {
  const l = document.getElementById('table-loading');
  const t = document.getElementById('employees-table');
  if (l) l.style.display = v ? 'block' : 'none';
  if (t && v) t.style.display = 'none';
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

window.openModal  = function(id) { document.getElementById(id)?.classList.add('open'); };
window.closeModal = function(id) { document.getElementById(id)?.classList.remove('open'); };
document.querySelectorAll('.hr-modal-overlay').forEach(m =>
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); })
);

window.showToast = function(msg, type='info') {
  const c = document.getElementById('toasts'); if (!c) return;
  const t = document.createElement('div');
  t.className = `hr-toast ${type}`;
  const icons = { success:'✓', error:'✕', info:'ℹ' };
  t.innerHTML = `<span style="font-size:15px">${icons[type]||'ℹ'}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3800);
};
