/**
* training.js â€” Simpatico HR Platform
* Training & LMS: Supabase + Cloudflare AI + R2 + Vectorize for semantic course search
*/

const TR_CONFIG = {
  supabaseUrl: window.SIMPATICO_CONFIG?.supabaseUrl || '',
  supabaseKey: window.SIMPATICO_CONFIG?.supabaseAnonKey || '',
  workerUrl: window.SIMPATICO_CONFIG?.workerUrl || 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev',
  r2PublicUrl: window.SIMPATICO_CONFIG?.r2PublicUrl || 'https://files.simpaticohr.in',
};

function sb() {
  if (typeof getSupabaseClient === 'function') return getSupabaseClient();
  if (window._supabaseClient) return window._supabaseClient;
  if (window.SimpaticoDB) return window.SimpaticoDB;
  return null;
}

let allCourses = [];
let allEnrollments = [];
let currentTabId = 'tab-courses';

const THUMB_PALETTES = {
  compliance: ['#ef4444', '#b91c1c'],
  technical: ['#0ea5e9', '#0369a1'],
  leadership: ['#f59e0b', '#b45309'],
  soft_skills: ['#10b981', '#047857'],
  onboarding: ['#8b5cf6', '#6d28d9'],
};
const THUMB_ICONS = { compliance: 'ðŸ›¡ï¸', technical: 'ðŸ’»', leadership: 'ðŸŽ¯', soft_skills: 'ðŸ¤', onboarding: 'ðŸš€' };

(function () {
  async function boot() {
    await Promise.all([
      loadUser(),
      loadCourses(),
      loadEnrollments(),
      loadComplianceReport(),
    ]);
    loadEnrollSelects();
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
    if (el) el.textContent = user.email?.slice(0, 2).toUpperCase() || 'U';
  }
}

async function loadCourses() {
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  let query = client.from('training_courses')
    .select('*')
    .order('created_at', { ascending: false });
  // Removed tenant_id filter because training_courses is a global catalog in the schema.
  let { data, error } = await query;


  if (error) { console.error(error); return; }
  allCourses = data || [];

  setText('stat-courses', allCourses.length);
  setText('stat-courses-sub', `${allCourses.filter(c => c.is_required).length} compliance required`);

  renderCourses(allCourses);
}

function renderCourses(list) {
  const grid = document.getElementById('courses-grid'); if (!grid) return;
  if (list.length === 0) {
    grid.innerHTML = '<div class="hr-empty" style="grid-column:1/-1"><p>No courses found. Create your first course.</p></div>';
    return;
  }
  grid.innerHTML = list.map(c => {
    const pal = THUMB_PALETTES[c.category] || ['#6366f1', '#4338ca'];
    const ico = THUMB_ICONS[c.category] || 'ðŸ“š';
    return `
    <div class="course-card" onclick="openCourse('${c.id}')">
      <div class="course-thumb" style="--thumb-a:${pal[0]};--thumb-b:${pal[1]}">
        ${c.thumbnail_key
        ? `<img src="${TR_CONFIG.r2PublicUrl}/${c.thumbnail_key}" style="width:100%;height:100%;object-fit:cover">`
        : `<span class="thumb-icon">${ico}</span>`
      }
        <span class="thumb-badge">${formatEnum(c.category)}</span>
      </div>
      <div class="course-body">
        <div class="course-title">${c.title}</div>
        <div class="course-meta">${c.description ? c.description.slice(0, 90) + 'â€¦' : 'No description'}</div>
        ${c.is_required ? '<span class="hr-badge hr-badge-danger">Compliance Required</span>' : ''}
      </div>
      <div class="course-footer">
        <div class="course-stat">â± <strong>${c.duration_hours || 'â€”'}h</strong></div>
        <div style="display:flex;gap:6px">
          <button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="event.stopPropagation();enrollCourseModal('${c.id}')">Enroll</button>
          <button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="event.stopPropagation();editCourse('${c.id}')">Edit</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function loadEnrollments() {
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { allEnrollments = []; renderEnrollmentsTable([]); return; }
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let { data, error } = await client
    .from('training_enrollments')
    .select(`
      *,
      employees!inner(first_name, last_name, company_id),
      training_courses(*)
    `)
    .eq('employees.company_id', cid)
    .order('enrolled_at', { ascending: false });

  if (error) { console.error(error); return; }
  allEnrollments = data || [];

  const completions = allEnrollments.filter(e => e.status === 'completed' && new Date(e.completed_at) >= new Date(thirtyDaysAgo)).length;
  const learners = new Set(allEnrollments.map(e => e.employees ? `${e.employees.first_name}_${e.employees.last_name}` : null).filter(Boolean)).size;
  setText('stat-completions', completions);
  setText('stat-learners', learners);

  renderEnrollmentsTable(allEnrollments);
}

function renderEnrollmentsTable(list) {
  const tbody = document.getElementById('enrollments-tbody'); if (!tbody) return;
  tbody.innerHTML = list.slice(0, 50).map(e => {
    const emp = e.employees;
    const course = e.training_courses;
    const name = emp ? `${emp.first_name} ${emp.last_name}` : 'â€”';
    const pct = e.progress || (e.status === 'completed' ? 100 : 0);
    const badge = e.status === 'completed'
      ? '<span class="hr-badge hr-badge-active">Completed</span>'
      : e.status === 'in_progress'
        ? '<span class="hr-badge hr-badge-info">In Progress</span>'
        : '<span class="hr-badge hr-badge-pending">Enrolled</span>';
    return `<tr>
      <td><span class="primary-text">${name}</span></td>
      <td>${course?.title || 'â€”'}</td>
      <td>${e.enrolled_at ? new Date(e.enrolled_at).toLocaleDateString() : 'â€”'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="hr-progress-bar" style="width:80px"><div class="hr-progress-fill" style="width:${pct}%"></div></div>
          <span style="font-size:12px;color:var(--hr-text-muted)">${pct}%</span>
        </div>
      </td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
}

async function loadComplianceReport() {
  const client = sb(); if (!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) return;
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let { data, error } = await client
    .from('training_enrollments')
    .select(`
      *,
      employees!inner(first_name, last_name, company_id),
      training_courses(*)
    `)
    .eq('employees.company_id', cid)
    .eq('training_courses.is_required', true)
    .or(`due_date.lte.${soon},status.eq.overdue`)
    .order('due_date');

  if (error) { console.error(error); return; }
  const compliance = (data || []).filter(e => e.training_courses?.is_required);
  setText('stat-compliance', compliance.filter(e => e.status !== 'completed').length);

  const tbody = document.getElementById('compliance-tbody'); if (!tbody) return;
  if (compliance.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--hr-text-muted);padding:40px">No compliance issues</td></tr>';
    return;
  }
  tbody.innerHTML = compliance.map(e => {
    const emp = e.employees;
    const name = emp ? `${emp.first_name} ${emp.last_name}` : 'â€”';
    const due = e.due_date ? new Date(e.due_date) : null;
    const isOverdue = due && due < new Date() && e.status !== 'completed';
    const badge = e.status === 'completed'
      ? '<span class="hr-badge hr-badge-active">Done</span>'
      : isOverdue
        ? '<span class="hr-badge hr-badge-danger">Overdue</span>'
        : '<span class="hr-badge hr-badge-pending">Pending</span>';
    return `<tr>
      <td><span class="primary-text">${name}</span></td>
      <td>${e.training_courses?.title || 'â€”'}</td>
      <td style="${isOverdue ? 'color:var(--hr-danger)' : ''}">${due ? due.toLocaleDateString() : 'â€”'}</td>
      <td>${badge}</td>
      <td><button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="sendReminder('${e.id}')">Send Reminder</button></td>
    </tr>`;
  }).join('');
}

function filterCourses() {
  const q = (document.getElementById('course-search')?.value || '').toLowerCase();
  const cat = document.getElementById('category-filter')?.value || '';
  const list = allCourses.filter(c =>
    (!q || c.title.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)) &&
    (!cat || c.category === cat)
  );
  renderCourses(list);
}
window.filterCourses = filterCourses;

// â”€â”€ Create Course â”€â”€
window.openCreateCourseModal = () => openModal('create-course-modal');

/**
 * Ensures the Supabase session is fresh and returns valid auth headers.
 * This prevents 401s caused by expired tokens.
 */
async function getFreshAuthHeaders() {
  const client = sb();
  if (client) {
    try {
      const { data } = await client.auth.getSession();
      if (data?.session?.access_token) {
        window._simpatico_liveToken = data.session.access_token;
      }
    } catch (e) {
      console.warn('[training] Failed to refresh session:', e.message);
    }
  }
  return typeof window.authHeaders === 'function' ? window.authHeaders() : {};
}

window.saveCourse = async function () {
  console.log('[training.js saveCourse] Starting course creation...');
  const title = document.getElementById('course-title')?.value.trim();
  if (!title) { showToast('Course title required', 'error'); return; }

  const payload = {
    title,
    description: document.getElementById('course-desc')?.value.trim() || null,
    category: document.getElementById('course-category')?.value,
    duration_hours: parseFloat(document.getElementById('course-duration')?.value) || null,
    content_url: document.getElementById('course-url')?.value.trim() || null,
    is_required: document.getElementById('course-required')?.checked || false,
  };

  try {
    const client = sb();
    if (!client) throw new Error('Database not connected');
    const { error } = await client.from('training_courses').insert([payload]);
    if (error) throw new Error(error.message);

    showToast('Course created!', 'success');
    closeModal('create-course-modal');
    await loadCourses();
  } catch (err) { showToast(err.message, 'error'); }
};

// â”€â”€ AI Course Generation via Cloudflare AI â”€â”€
window.generateCourseWithAI = async function () {
  const title = document.getElementById('course-title')?.value.trim();
  if (!title) { showToast('Enter a course title first', 'error'); return; }
  showToast('Generating course with AI…', 'info');

  try {
    const headers = await getFreshAuthHeaders();
    const res = await fetch(`${TR_CONFIG.workerUrl}/ai/generate-course`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const json = await res.json();
    if (!res.ok) {
      const errMsg = json.error?.message || json.error || json.message || 'AI generation failed';
      throw new Error(errMsg);
    }
    // Backend wraps response in apiResponse: { success, data: { description, duration_hours } }
    const aiData = json.data || json;
    const descEl = document.getElementById('course-desc');
    const durEl = document.getElementById('course-duration');
    if (descEl && aiData.description) descEl.value = aiData.description;
    if (durEl && aiData.duration_hours) durEl.value = aiData.duration_hours;
    showToast('AI generated course details', 'success');
  } catch (err) {
    console.error('[training] AI generation error:', err);
    showToast(err.message || 'AI generation failed', 'error');
  }
};

// â”€â”€ Semantic course search via Cloudflare Vectorize â”€â”€
window.semanticSearch = async function (query) {
  try {
    const headers = await getFreshAuthHeaders();
    const res = await fetch(`${TR_CONFIG.workerUrl}/training/semantic-search`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const { courses } = await res.json();
    renderCourses(courses || []);
  } catch { filterCourses(); }
};

// â”€â”€ Enroll â”€â”€
function loadEnrollSelects() {
  const coursesSel = document.getElementById('enroll-course');
  if (coursesSel) {
    allCourses.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.title;
      coursesSel.appendChild(opt);
    });
  }
  // Employees â€” filtered by company_id
  const empSel = document.getElementById('enroll-employees');
  if (empSel && sb()) {
    let query = sb().from('employees').select('id,first_name,last_name').eq('status', 'active').order('first_name');
    const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
    if (cid) query = query.eq('tenant_id', cid);
    query.then(({ data }) => {
      (data || []).forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id; opt.textContent = `${e.first_name} ${e.last_name}`;
        empSel.appendChild(opt);
      });
    });
  }
}

window.openEnrollModal = () => openModal('enroll-modal');
window.enrollCourseModal = (courseId) => {
  const sel = document.getElementById('enroll-course');
  if (sel) sel.value = courseId;
  openModal('enroll-modal');
};

window.enrollEmployees = async function () {
  const courseId = document.getElementById('enroll-course')?.value;
  const sel = document.getElementById('enroll-employees');
  const empIds = sel ? Array.from(sel.selectedOptions).map(o => o.value) : [];
  const due = document.getElementById('enroll-due')?.value || null;

  if (!courseId) { showToast('Select a course', 'error'); return; }
  if (empIds.length === 0) { showToast('Select at least one employee', 'error'); return; }

  try {
    const headers = await getFreshAuthHeaders();
    const res = await fetch(`${TR_CONFIG.workerUrl}/training/enroll`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ course_id: courseId, employee_ids: empIds, due_date: due }),
    });
    if (!res.ok) throw new Error('Enrollment failed');
    showToast(`${empIds.length} employee(s) enrolled`, 'success');
    closeModal('enroll-modal');
    await loadEnrollments();
  } catch (err) { showToast(err.message, 'error'); }
};

window.sendReminder = async function (enrollmentId) {
  try {
    const headers = await getFreshAuthHeaders();
    await fetch(`${TR_CONFIG.workerUrl}/training/remind/${enrollmentId}`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    });
    showToast('Reminder sent', 'success');
  } catch { showToast('Failed to send reminder', 'error'); }
};

window.openCourse = function (id) {
  location.href = `course-viewer.html?id=${id}`;
};
window.editCourse = function (id) {
  // Pre-fill the course modal with existing data for editing
  const course = allCourses.find(c => c.id === id);
  if (!course) { showToast('Course not found', 'error'); return; }
  const titleEl = document.getElementById('course-title');
  const descEl = document.getElementById('course-desc');
  const catEl = document.getElementById('course-category');
  const durEl = document.getElementById('course-duration');
  const urlEl = document.getElementById('course-url');
  const reqEl = document.getElementById('course-required');
  if (titleEl) titleEl.value = course.title || '';
  if (descEl) descEl.value = course.description || '';
  if (catEl) catEl.value = course.category || '';
  if (durEl) durEl.value = course.duration_hours || '';
  if (urlEl) urlEl.value = course.content_url || '';
  if (reqEl) reqEl.checked = course.is_required || false;
  openModal('create-course-modal');
};

// â”€â”€ Tab switching â”€â”€
window.switchTab = function (btn, tabId) {
  document.querySelectorAll('.hr-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['tab-courses', 'tab-paths', 'tab-compliance', 'tab-enrollments'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === tabId ? 'block' : 'none';
  });
  currentTabId = tabId;
};

// â”€â”€ Utility functions: use shared-utils.js if loaded, else define locally â”€â”€
if (typeof window.authHeaders === 'undefined') {
  window.authHeaders = function () {
    let token = window._simpatico_liveToken || ''; if (!token) { token = localStorage.getItem('sh_token') || localStorage.getItem('simpatico_token') || localStorage.getItem('sb-token') || ''; }
    if (!token) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          try { token = JSON.parse(localStorage.getItem(k)).access_token; } catch (e) { }
        }
      }
    }
    const tenantId = typeof getCompanyId === 'function' ? getCompanyId() : 'default';
    return {
      ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      'X-Tenant-ID': tenantId,
      'apikey': window.SIMPATICO_CONFIG?.supabaseAnonKey || ''
    };
  };
}
if (typeof window.formatEnum === 'undefined') {
  window.formatEnum = function (s) { return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); };
}
if (typeof window.setText === 'undefined') {
  window.setText = function (id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
}
if (typeof window.openModal === 'undefined') {
  window.openModal = id => { const el = document.getElementById(id); if (el) { el.classList.add('open'); el.classList.add('active'); } };
}
if (typeof window.closeModal === 'undefined') {
  window.closeModal = id => { const el = document.getElementById(id); if (el) { el.classList.remove('open'); el.classList.remove('active'); } };
}
if (typeof window.showToast === 'undefined') {
  window.showToast = (msg, type = 'info') => {
    const c = document.getElementById('toasts'); if (!c) return;
    const t = document.createElement('div'); t.className = `hr-toast ${type}`; t.textContent = msg;
    c.appendChild(t); setTimeout(() => t.remove(), 3800);
  };
}
