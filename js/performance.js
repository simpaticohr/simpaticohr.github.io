/**
 * performance.js — Simpatico HR Platform
 * Performance reviews, goals, 9-box grid, AI-assisted feedback
 *
 * Architecture: Worker-first data loading.
 * Direct Supabase queries are bypassed because RLS policies and schema
 * mismatches cause persistent 400/403 errors.  The Cloudflare Worker
 * handles auth + DB access on the server side reliably.
 */

const PERF_CONFIG = {
  supabaseUrl: window.SIMPATICO_CONFIG?.supabaseUrl    || '',
  supabaseKey: window.SIMPATICO_CONFIG?.supabaseAnonKey || '',
  workerUrl:   window.SIMPATICO_CONFIG?.workerUrl       || 'https://simpatico-hr-ats.simpaticohrconsultancy.workers.dev',
};

function sb() {
  if (typeof getSupabaseClient === 'function') return getSupabaseClient();
  if (window._supabaseClient) return window._supabaseClient;
  if (window.SimpaticoDB) return window.SimpaticoDB;
  return null;
}

let allReviews = [];
let allGoals   = [];
let allCycles  = [];

(function() {
  async function boot() {
    // Refresh the live token before any API calls
    await refreshToken();
    await Promise.all([loadUser(), loadCycles(), loadReviews(), loadGoals(), loadPerfEmployees(), loadCheckinsAndKudos()]);
    renderNineBox();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 100);
  }
})();

let allCheckins = [];
let allKudos = [];
let allPerfEmployees = [];

async function loadPerfEmployees() {
  const client = sb(); if(!client) return;
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  let q = client.from('employees').select('id, first_name, last_name, avatar_url').eq('status','active');
  if(cid) q = q.eq('tenant_id', cid);
  const { data } = await q;
  allPerfEmployees = data || [];
  
  // Populate dropdowns
  ['checkin-employee', 'kudos-employee'].forEach(id => {
    const sel = document.getElementById(id);
    if(sel) {
      sel.innerHTML = '<option value="">Select Employee</option>';
      allPerfEmployees.forEach(e => {
        sel.innerHTML += `<option value="${e.id}">${e.first_name} ${e.last_name}</option>`;
      });
    }
  });
}

async function loadCheckinsAndKudos() {
  const client = sb();
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;

  try {
    if(!client) throw new Error("No DB");
    // Fetch Checkins
    let qCheck = client.from('performance_checkins').select('*').order('date', {ascending: false});
    if(cid) qCheck = qCheck.eq('tenant_id', cid);
    const { data: cData, error: cErr } = await qCheck;
    if(cErr) {
      // Table doesn't exist — silently use localStorage (not a real error)
      if (cErr.code === '42P01' || cErr.message?.includes('does not exist') || cErr.message?.includes('schema cache')) {
        throw { silent: true, message: 'performance_checkins table not found' };
      }
      throw cErr;
    }
    allCheckins = cData || [];

    // Fetch Kudos
    let qKudos = client.from('performance_kudos').select('*').order('date', {ascending: false});
    if(cid) qKudos = qKudos.eq('tenant_id', cid);
    const { data: kData, error: kErr } = await qKudos;
    if(kErr) {
      if (kErr.code === '42P01' || kErr.message?.includes('does not exist') || kErr.message?.includes('schema cache')) {
        throw { silent: true, message: 'performance_kudos table not found' };
      }
      throw kErr;
    }
    allKudos = kData || [];
    
    // Save to local sync
    localStorage.setItem('hr_perf_checkins', JSON.stringify(allCheckins));
    localStorage.setItem('hr_perf_kudos', JSON.stringify(allKudos));
  } catch(e) {
    if (!e.silent) {
      console.warn('[performance] DB fetch for checkins/kudos failed, falling back to localStorage.', e.message);
    }
    allCheckins = JSON.parse(localStorage.getItem('hr_perf_checkins') || '[]');
    allKudos    = JSON.parse(localStorage.getItem('hr_perf_kudos') || '[]');
  }

  renderCheckins();
  renderKudos();
}

function renderCheckins() {
  const list = document.getElementById('checkins-list'); if(!list) return;
  if(allCheckins.length === 0) {
    list.innerHTML = '<div class="hr-empty"><p>No check-ins recorded yet.</p></div>';
    return;
  }
  const _e = typeof escapeHtml === 'function' ? escapeHtml : function(s) { return s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):''; };
  list.innerHTML = allCheckins.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(c => {
    const emp = allPerfEmployees.find(e => e.id === c.employee_id);
    const name = emp ? `${emp.first_name} ${emp.last_name}` : 'Unknown Employee';
    const init = emp ? `${emp.first_name[0]}${emp.last_name[0]}` : '?';
    const color = avatarColor(c.employee_id);
    return `
    <div class="hr-card" style="display:flex;gap:16px;">
      <div class="hr-emp-avatar" style="background:${color};color:#fff;width:40px;height:40px;flex-shrink:0">${init}</div>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <div style="font-weight:600">${name} <span style="color:var(--hr-text-muted);font-weight:400;font-size:12px;margin-left:8px">${new Date(c.date).toLocaleDateString()}</span></div>
          <span class="hr-badge hr-badge-active">Weekly Check-in</span>
        </div>
        <div style="margin-bottom:8px;"><strong>Went well:</strong><br><span style="color:var(--hr-text-secondary);font-size:13px">${_e(c.went_well)}</span></div>
        <div><strong>Blockers:</strong><br><span style="color:var(--hr-text-secondary);font-size:13px">${c.blockers ? _e(c.blockers) : 'None'}</span></div>
      </div>
    </div>`;
  }).join('');
}

function renderKudos() {
  const list = document.getElementById('kudos-list'); if(!list) return;
  if(allKudos.length === 0) {
    list.innerHTML = '<div class="hr-empty" style="grid-column:1/-1"><p>No Kudos given yet.</p></div>';
    return;
  }
  const _e = typeof escapeHtml === 'function' ? escapeHtml : function(s) { return s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):''; };
  list.innerHTML = allKudos.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(k => {
    const emp = allPerfEmployees.find(e => e.id === k.employee_id);
    const name = emp ? `${emp.first_name} ${emp.last_name}` : 'Unknown';
    const init = emp ? `${emp.first_name[0]}${emp.last_name[0]}` : '?';
    const color = avatarColor(k.employee_id);
    return `
    <div class="hr-card">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div class="hr-emp-avatar" style="background:${color};color:#fff;width:32px;height:32px;font-size:11px">${init}</div>
        <div>
          <div style="font-weight:600;font-size:13px">${name}</div>
          <div style="font-size:11px;color:var(--hr-text-muted)">${new Date(k.date).toLocaleDateString()}</div>
        </div>
      </div>
      <span class="hr-badge hr-badge-info" style="margin-bottom:8px;display:inline-block">🏆 ${k.category}</span>
      <p style="font-size:13px;color:var(--hr-text-secondary);line-height:1.4">"${_e(k.message)}"</p>
    </div>`;
  }).join('');
}

window.openCheckinModal = () => openModal('checkin-modal');
window.openKudosModal = () => openModal('kudos-modal');

window.saveCheckin = async function() {
  const empId = document.getElementById('checkin-employee')?.value;
  const well = document.getElementById('checkin-well')?.value.trim();
  const blockers = document.getElementById('checkin-blockers')?.value.trim();
  if(!empId || !well) { showToast('Employee and "Went well" are required','error'); return; }
  
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  const newRecord = {
    employee_id: empId,
    went_well: well,
    blockers: blockers,
    date: new Date().toISOString(),
    tenant_id: cid
  };
  
  try {
    const client = sb();
    if(!client) throw new Error("No DB");
    const { data, error } = await client.from('performance_checkins').insert([newRecord]).select();
    if(error) throw error;
    allCheckins.unshift(data[0]);
  } catch(e) {
    console.warn('[performance] DB insert for checkin failed, using local storage.', e.message);
    newRecord.id = Date.now().toString();
    allCheckins.unshift(newRecord);
  }

  localStorage.setItem('hr_perf_checkins', JSON.stringify(allCheckins));
  
  showToast('Check-in recorded','success');
  closeModal('checkin-modal');
  document.getElementById('checkin-well').value = '';
  document.getElementById('checkin-blockers').value = '';
  renderCheckins();
};

window.saveKudos = async function() {
  const empId = document.getElementById('kudos-employee')?.value;
  const cat = document.getElementById('kudos-category')?.value;
  const msg = document.getElementById('kudos-message')?.value.trim();
  if(!empId || !msg) { showToast('Employee and message required','error'); return; }
  
  const cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  const newKudos = {
    employee_id: empId,
    category: cat,
    message: msg,
    date: new Date().toISOString(),
    tenant_id: cid
  };
  
  try {
    const client = sb();
    if(!client) throw new Error("No DB");
    const { data, error } = await client.from('performance_kudos').insert([newKudos]).select();
    if(error) throw error;
    allKudos.unshift(data[0]);
  } catch(e) {
    console.warn('[performance] DB insert for kudos failed, using local storage.', e.message);
    newKudos.id = Date.now().toString();
    allKudos.unshift(newKudos);
  }

  localStorage.setItem('hr_perf_kudos', JSON.stringify(allKudos));
  
  showToast('Kudos sent ✋','success');
  closeModal('kudos-modal');
  document.getElementById('kudos-message').value = '';
  renderKudos();
};

/**
 * Ensures we have a fresh Supabase session token for worker calls.
 */
async function refreshToken() {
  const client = sb();
  if (!client) return;
  try {
    const { data: sessionData } = await client.auth.getSession();
    if (sessionData?.session?.access_token) {
      window._simpatico_liveToken = sessionData.session.access_token;
    }
  } catch (e) {
    console.warn('[performance] Token refresh failed:', e.message);
  }
}

/**
 * Build proper auth headers for worker API calls.
 * Uses shared-utils authHeaders if available, otherwise constructs manually.
 */
function perfAuthHeaders() {
  if (typeof window.authHeaders === 'function') {
    return window.authHeaders();
  }
  const token = window._simpatico_liveToken || '';
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (PERF_CONFIG.supabaseKey) headers['apikey'] = PERF_CONFIG.supabaseKey;
  const tid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (tid) headers['X-Tenant-ID'] = tid;
  return headers;
}

/**
 * Generic worker API call helper — mirrors the pattern in
 * dashboard/performance/performance.html's apiCall().
 */
async function perfApiCall(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: perfAuthHeaders(),
    cache: 'no-store',
  };
  if (body) opts.body = JSON.stringify(body);

  const url = PERF_CONFIG.workerUrl + path;
  console.log(`[performance] ${method} ${path}`);
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok) {
    console.warn(`[performance] Worker ${method} ${path} failed:`, json);
    throw new Error(json.error?.message || json.error || json.message || res.statusText);
  }
  // Worker wraps responses in { success, data: {...}, meta: {...} }
  // Unwrap the envelope so callers get the inner payload directly
  const data = (json && json.success && json.data) ? json.data : json;
  return data;
}

// ══════════════════════════════════════════════════════════
// DATA LOADING — Worker-first approach
// ══════════════════════════════════════════════════════════

async function loadUser() {
  const client = sb(); if (!client) return;
  try {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const el = document.getElementById('user-avatar');
      if (el) el.textContent = user.email?.slice(0,2).toUpperCase() || 'U';
    }
  } catch(e) { /* non-critical */ }
}

async function loadCycles() {
  // Pre-check: skip Worker call if no auth token available yet
  const hasToken = typeof getAuthToken === 'function' && getAuthToken();
  try {
    if (!hasToken) throw new Error('No auth token — skipping Worker');
    const result = await perfApiCall('/performance/cycles');
    // Worker may return { cycles: [...] }, { data: [...] }, or an array directly
    // Defensively extract an array from any shape of response
    var parsed = null;
    if (Array.isArray(result)) {
      parsed = result;
    } else if (result && typeof result === 'object') {
      if (Array.isArray(result.cycles)) parsed = result.cycles;
      else if (Array.isArray(result.data)) parsed = result.data;
      else if (Array.isArray(result.rows)) parsed = result.rows;
    }
    allCycles = parsed || [];
    console.log('[performance] Loaded ' + allCycles.length + ' cycles from worker');
  } catch (workerErr) {
    if (hasToken) console.warn('[performance] Worker loadCycles failed, trying Supabase fallback:', workerErr.message);
    allCycles = await loadCyclesFromDB();
  }

  // Safety: ensure allCycles is always an array
  if (!Array.isArray(allCycles)) allCycles = [];

  // Populate the cycle-filter dropdown
  const sel = document.getElementById('cycle-filter'); if (!sel) return;
  sel.innerHTML = '<option value="">All Cycles</option>';
  for (var ci = 0; ci < allCycles.length; ci++) {
    var c = allCycles[ci];
    var opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.name;
    sel.appendChild(opt);
  }

  var active = allCycles.filter(function(c) { return c.status === 'active'; }).length;
  setText('stat-cycles', active || allCycles.length || '0');
}

/** Supabase direct-query fallback for cycles */
async function loadCyclesFromDB() {
  const client = sb(); if (!client) return [];
  try {
    let { data, error } = await client
      .from('review_cycles')
      .select('id, name, type, start_date, end_date, status')
      .order('id', { ascending: false });
    if (error) {
      console.warn('[performance] Supabase cycles query error:', error.message);
      return [];
    }
    return data || [];
  } catch(e) {
    console.warn('[performance] Supabase cycles exception:', e.message);
    return [];
  }
}

async function loadReviews() {
  var cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { allReviews = []; renderReviews([]); return; }

  // Worker-first: use the /performance/reviews endpoint with tenant isolation
  const hasToken = typeof getAuthToken === 'function' && getAuthToken();
  try {
    if (!hasToken) throw new Error('No auth token — skipping Worker');
    await refreshToken();
    const result = await perfApiCall('/performance/reviews');
    // Worker may return { reviews: [...] }, { data: [...] }, or array
    if (Array.isArray(result)) {
      allReviews = result;
    } else if (result && typeof result === 'object') {
      allReviews = result.reviews || result.data || [];
    } else {
      allReviews = [];
    }
    console.log('[performance] Loaded ' + allReviews.length + ' reviews from worker');
  } catch (workerErr) {
    if (hasToken) console.warn('[performance] Worker loadReviews failed, trying Supabase fallback:', workerErr.message);
    allReviews = await loadReviewsFromDB(cid);
  }

  // Safety: ensure allReviews is always an array
  if (!Array.isArray(allReviews)) allReviews = [];

  var pending  = allReviews.filter(function(r) { return r.status === 'draft' || r.status === 'in_progress'; }).length;
  var scores   = allReviews.filter(function(r) { return r.score; }).map(function(r) { return r.score; });
  var avgScore = scores.length ? Math.round(scores.reduce(function(a,b){return a+b;},0)/scores.length) : 0;

  setText('stat-pending', pending);
  setText('stat-avg-score', avgScore || '—');
  if (avgScore) setText('stat-avg-sub', avgScore + '/100 average');

  renderReviews(allReviews);
}

/** Supabase direct-query fallback for reviews */
async function loadReviewsFromDB(cid) {
  const client = sb(); if (!client) return [];
  try {
    // Attempt with tenant_id filter
    let { data, error } = await client
      .from('performance_reviews')
      .select(`
        id, period, score, status, cycle_id,
        employees:employees!employee_id(id, first_name, last_name, job_title, departments(name)),
        reviewer:employees!reviewer_id(first_name, last_name)
      `)
      .eq('tenant_id', cid)
      .order('id', { ascending: false });

    // If tenant_id column doesn't exist, retry without filter
    if (error) {
      console.warn('[performance] Reviews query with tenant_id failed, retrying without filter');
      const fallback = await client
        .from('performance_reviews')
        .select(`
          id, period, score, status, cycle_id,
          employees:employees!employee_id(id, first_name, last_name, job_title, departments(name)),
          reviewer:employees!reviewer_id(first_name, last_name)
        `)
        .order('id', { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.warn('[performance] Supabase reviews error:', error.message);
      return [];
    }
    return data || [];
  } catch(e) {
    console.warn('[performance] Supabase reviews exception:', e.message);
    return [];
  }
}

async function loadGoals() {
  var cid = typeof getCompanyId === 'function' ? getCompanyId() : null;
  if (!cid) { allGoals = []; renderGoals([]); return; }

  // Worker-first: use the /goals endpoint with tenant isolation
  const hasToken = typeof getAuthToken === 'function' && getAuthToken();
  try {
    if (!hasToken) throw new Error('No auth token — skipping Worker');
    await refreshToken();
    const result = await perfApiCall('/goals');
    if (Array.isArray(result)) {
      allGoals = result;
    } else if (result && typeof result === 'object') {
      allGoals = result.goals || result.data || [];
    } else {
      allGoals = [];
    }
    console.log('[performance] Loaded ' + allGoals.length + ' goals from worker');
  } catch (workerErr) {
    if (hasToken) console.warn('[performance] Worker loadGoals failed, trying Supabase fallback:', workerErr.message);
    allGoals = await loadGoalsFromDB(cid);
  }

  // Safety: ensure allGoals is always an array
  if (!Array.isArray(allGoals)) allGoals = [];

  var achieved = allGoals.filter(function(g) { return g.status === 'achieved' || g.status === 'completed'; }).length;
  var pct = allGoals.length ? Math.round(achieved / allGoals.length * 100) : 0;
  var goalsEl = document.getElementById('stat-goals');
  if (goalsEl) goalsEl.innerHTML = pct + '<span style="font-size:18px">%</span>';

  renderGoals(allGoals);
}

/** Supabase direct-query fallback for goals */
async function loadGoalsFromDB(cid) {
  const client = sb(); if (!client) return [];
  try {
    let { data, error } = await client
      .from('performance_goals')
      .select(`
        id, title, description, period, progress, status, due_date,
        employees(first_name, last_name)
      `)
      .eq('tenant_id', cid)
      .order('due_date');

    if (error) {
      console.warn('[performance] Goals query with tenant_id failed, retrying without filter');
      const fallback = await client
        .from('performance_goals')
        .select(`
          id, title, description, period, progress, status, due_date,
          employees(first_name, last_name)
        `)
        .order('due_date');
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.warn('[performance] Supabase goals error:', error.message);
      return [];
    }
    return data || [];
  } catch(e) {
    console.warn('[performance] Supabase goals exception:', e.message);
    return [];
  }
}

// ══════════════════════════════════════════════════════════
// RENDER REVIEWS
// ══════════════════════════════════════════════════════════

function renderReviews(list) {
  const container = document.getElementById('reviews-list'); if (!container) return;
  if (list.length === 0) {
    container.innerHTML = '<div class="hr-empty" style="grid-column:1/-1"><p>No reviews found.</p><button class="hr-btn hr-btn-primary" style="margin-top:16px" onclick="openReviewCycleModal()">Start a Review Cycle</button></div>';
    return;
  }
  container.innerHTML = list.map(r => {
    const emp      = r.employees;
    const name     = emp ? `${emp.first_name} ${emp.last_name}` : (r.employee_id ? `Employee ${String(r.employee_id).slice(-6)}` : 'Unknown');
    const dept     = emp?.departments?.name || '';
    const role     = emp?.job_title || '';
    const color    = avatarColor(emp?.id || r.id);
    const initials = emp ? `${emp.first_name[0]}${emp.last_name[0]}` : '?';
    const badgeClass = { draft:'hr-badge-pending', in_progress:'hr-badge-info', submitted:'hr-badge-info', completed:'hr-badge-active' }[r.status] || 'hr-badge-inactive';

    return `
    <div class="review-card" onclick="openReview('${r.id}')">
      <div class="rc-head">
        <div class="emp-row">
          <div class="hr-emp-avatar" style="background:${color};color:#fff;width:38px;height:38px;font-size:13px">${initials}</div>
          <div>
            <div style="font-weight:600;font-size:14px">${name}</div>
            <div style="font-size:12px;color:var(--hr-text-muted)">${role}${dept?' · '+dept:''}</div>
          </div>
        </div>
        ${r.score ? `<div class="score-display">${r.score}<small>/100</small></div>` : '<div style="color:var(--hr-text-muted);font-size:13px">No score yet</div>'}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:13px;color:var(--hr-text-secondary)">${r.period || ''}</div>
        <span class="hr-badge ${badgeClass}">${r.status?.replace('_',' ') || ''}</span>
      </div>
      <div style="display:flex;gap:6px;margin-top:12px">
        <button class="hr-btn hr-btn-ghost hr-btn-sm hr-w-full" onclick="event.stopPropagation();openReview('${r.id}')">
          ${r.status === 'completed' ? 'View' : 'Continue'}
        </button>
        <button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="event.stopPropagation();generateAIFeedback('${r.id}')">✨ AI</button>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════
// RENDER GOALS
// ══════════════════════════════════════════════════════════

function renderGoals(list) {
  const tbody = document.getElementById('goals-tbody'); if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--hr-text-muted);padding:40px">No goals set yet.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(g => {
    const emp  = g.employees;
    const name = emp ? `${emp.first_name} ${emp.last_name}` : '—';
    const pct  = g.progress || (g.status === 'achieved' || g.status === 'completed' ? 100 : 0);
    const badgeClass = { achieved:'hr-badge-active', completed:'hr-badge-active', in_progress:'hr-badge-info', on_track:'hr-badge-info', not_started:'hr-badge-inactive', cancelled:'hr-badge-danger', behind:'hr-badge-danger', at_risk:'hr-badge-pending' }[g.status] || 'hr-badge-pending';
    return `<tr>
      <td><span class="primary-text">${name}</span></td>
      <td><div style="font-weight:500">${g.title}</div><div style="font-size:12px;color:var(--hr-text-muted)">${g.description?.slice(0,60) || ''}</div></td>
      <td>${g.period || '—'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="hr-progress-bar" style="width:80px"><div class="hr-progress-fill" style="width:${pct}%"></div></div>
          <span style="font-size:12px;color:var(--hr-text-muted)">${pct}%</span>
        </div>
      </td>
      <td><span class="hr-badge ${badgeClass}">${g.status?.replace('_',' ') || ''}</span></td>
      <td>
        <button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="updateGoalProgress('${g.id}')">Update</button>
      </td>
    </tr>`;
  }).join('');
}

// ── 9-Box Grid ──
function renderNineBox() {
  const grid = document.getElementById('nine-box-grid'); if (!grid) return;
  const boxes = [
    { label:'Low Performer\nLow Potential',   bg:'rgba(239,68,68,.08)',  borderColor:'rgba(239,68,68,.2)'  },
    { label:'Core Employee\nLow Potential',   bg:'rgba(245,158,11,.08)', borderColor:'rgba(245,158,11,.2)' },
    { label:'High Performer\nLow Potential',  bg:'rgba(16,185,129,.08)', borderColor:'rgba(16,185,129,.2)' },
    { label:'Low Performer\nMedium Potential',bg:'rgba(245,158,11,.08)', borderColor:'rgba(245,158,11,.2)' },
    { label:'Core Employee\nMedium Potential',bg:'rgba(99,102,241,.08)', borderColor:'rgba(99,102,241,.2)' },
    { label:'High Performer\nMedium Potential',bg:'rgba(16,185,129,.08)',borderColor:'rgba(16,185,129,.2)' },
    { label:'Low Performer\nHigh Potential',  bg:'rgba(99,102,241,.08)', borderColor:'rgba(99,102,241,.2)' },
    { label:'Rising Star\nHigh Potential',    bg:'rgba(0,196,255,.08)',   borderColor:'rgba(0,196,255,.2)'  },
    { label:'Star Performer\nHigh Potential', bg:'rgba(0,196,255,.12)',   borderColor:'rgba(0,196,255,.35)' },
  ];
  grid.style.position = 'relative';
  grid.innerHTML = boxes.map((b, i) => `
    <div style="background:${b.bg};border:1px solid ${b.borderColor};border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:6px">
      <div style="font-size:11px;font-weight:600;color:var(--hr-text-secondary);white-space:pre-line;line-height:1.3">${b.label}</div>
      <div id="nine-box-${i}" style="display:flex;flex-wrap:wrap;gap:4px;flex:1;align-content:flex-start"></div>
    </div>`).join('');

  // Place employees based on score
  allReviews.filter(r => r.score && r.employees).forEach(r => {
    const perf = r.score >= 80 ? 2 : r.score >= 60 ? 1 : 0;
    const potential = 1; // Middle row default
    const idx = potential * 3 + perf;
    const cell = document.getElementById(`nine-box-${idx}`);
    if (cell) {
      const emp = r.employees;
      const initials = `${emp.first_name[0]}${emp.last_name[0]}`;
      const color = avatarColor(emp.id);
      cell.innerHTML += `<div title="${emp.first_name} ${emp.last_name}" class="hr-emp-avatar" style="background:${color};color:#fff;width:26px;height:26px;font-size:9px;cursor:pointer" onclick="location.href='../employees/employee-profile.html?id=${emp.id}'">${initials}</div>`;
    }
  });
}

// ══════════════════════════════════════════════════════════
// CREATE REVIEW CYCLE — Worker-first
// ══════════════════════════════════════════════════════════

window.openReviewCycleModal = () => {
  const d = new Date();
  const defName = `Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()} Performance Review`;
  const nameInput = document.getElementById('cycle-name');
  if (nameInput && !nameInput.value) nameInput.value = defName;
  openModal('review-cycle-modal');
};

window.createReviewCycle = async function() {
  let name = document.getElementById('cycle-name')?.value.trim();
  if (!name) { 
     const d = new Date();
     name = `Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()} Performance Review`;
  }
  const start = document.getElementById('cycle-start')?.value || new Date().toISOString().split('T')[0];
  const end   = document.getElementById('cycle-end')?.value || new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];
  const type  = document.getElementById('cycle-type')?.value || 'annual';
  const scope = document.getElementById('cycle-scope')?.value || 'all';
  const cid   = typeof getCompanyId === 'function' ? getCompanyId() : null;

  try {
    await refreshToken();

    // Worker is the primary creation path
    const payload = {
      name, start_date: start, end_date: end, type, scope,
      status: 'active',
      tenant_id: cid || undefined,
      company_id: cid || undefined,
    };

    try {
      await perfApiCall('/performance/cycles', 'POST', payload);
    } catch (workerErr) {
      console.warn('[performance] Worker create cycle failed, trying Supabase:', workerErr.message);
      // Supabase fallback
      const client = sb();
      if (!client) throw new Error('Database not connected');
      // Create a payload that strictly matches the schema,
      // avoiding tenant_id and company_id as they do not exist.
      const dbPayload = {
        name, start_date: start, end_date: end, type, scope,
        status: 'active'
      };
      const { error } = await client
        .from('review_cycles')
        .insert([dbPayload]);
      if (error) throw new Error(error.message);
    }
    
    showToast('Review cycle launched!', 'success');
    closeModal('review-cycle-modal');
    await Promise.all([loadCycles(), loadReviews()]);
  } catch (err) { showToast(err.message, 'error'); }
};

// ── AI Feedback via Cloudflare AI ──
window.generateAIFeedback = async function(reviewId) {
  showToast('Generating AI feedback suggestions…', 'info');
  try {
    await refreshToken();
    const result = await perfApiCall('/ai/performance-feedback', 'POST', { review_id: reviewId });
    const feedback = result.feedback || result.data?.feedback;
    if (feedback) {
      const el = document.getElementById('ai-feedback-content');
      if (el) {
        el.textContent = feedback;
        openModal('ai-feedback-modal');
      } else {
        showToast('AI Feedback ready — check the review form', 'success');
        console.log('[AI Feedback]', feedback);
      }
    }
  } catch { showToast('AI feedback unavailable', 'error'); }
};

window.openReview = function(id) {
  location.href = `review-form.html?id=${id}`;
};
window.openGoalsModal   = () => showToast('Manage broad goals view', 'info');
window.openAddGoalModal = () => openModal('add-goal-modal');
window.updateGoalProgress = (id) => {
  // Store the goal ID for the update modal
  const hiddenInput = document.getElementById('update-goal-id');
  if (hiddenInput) hiddenInput.value = id;
  openModal('update-goal-modal');
};

window.saveGoal = async function() {
  const title = document.getElementById('goal-title')?.value?.trim();
  const employeeId = document.getElementById('goal-employee')?.value;
  const description = document.getElementById('goal-description')?.value?.trim() || '';
  const dueDate = document.getElementById('goal-due-date')?.value || null;
  const period = document.getElementById('goal-period')?.value || '';

  if (!title) { showToast('Goal title is required', 'error'); return; }
  if (!employeeId) { showToast('Select an employee', 'error'); return; }

  try {
    await refreshToken();
    await perfApiCall('/goals', 'POST', {
      title, employee_id: employeeId, description, due_date: dueDate, period,
    });
    showToast('Goal created successfully', 'success');
    closeModal('add-goal-modal');
    await loadGoals();
  } catch (err) {
    console.error('[performance] saveGoal failed:', err.message);
    showToast(err.message || 'Failed to save goal', 'error');
  }
};

window.saveGoalProgress = async function() {
  const goalId = document.getElementById('update-goal-id')?.value;
  const progress = parseInt(document.getElementById('goal-progress-slider')?.value || '0');
  const status = document.getElementById('goal-status-select')?.value || 'on_track';

  if (!goalId) { showToast('No goal selected', 'error'); return; }

  try {
    await refreshToken();
    await perfApiCall(`/goals/${goalId}`, 'PATCH', { progress, status });
    showToast('Goal progress updated', 'success');
    closeModal('update-goal-modal');
    await loadGoals();
  } catch (err) {
    console.error('[performance] saveGoalProgress failed:', err.message);
    showToast(err.message || 'Failed to update progress', 'error');
  }
};
window.filterReviews = () => {
  const q  = (document.getElementById('review-search')?.value || '').toLowerCase();
  const cy = document.getElementById('cycle-filter')?.value || '';
  const st = document.getElementById('review-status-filter')?.value || '';
  const filtered = allReviews.filter(r => {
    const name = `${r.employees?.first_name||''} ${r.employees?.last_name||''}`.toLowerCase();
    return (!q || name.includes(q)) && (!cy || r.cycle_id === cy) && (!st || r.status === st);
  });
  renderReviews(filtered);
};

window.switchPerfTab = function(btn, tabId) {
  document.querySelectorAll('#perf-tabs .hr-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['tab-reviews','tab-goals','tab-nine-box','tab-checkins','tab-kudos','tab-trends'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === tabId ? 'block' : 'none';
  });
  if (tabId === 'tab-nine-box') renderNineBox();
  if (tabId === 'tab-trends') renderTrendsChart();
};

let trendChartInstance = null;
window.renderTrendsChart = function() {
  const ctx = document.getElementById('score-trend-chart');
  if(!ctx || typeof Chart === 'undefined') return;
  
  // Aggregate real scores if available, else static example
  let labels = ['Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026'];
  let scores = [72, 75, 78, 83];

  if (allReviews && allReviews.length > 0) {
     // A more dynamic aggregation could go here in the future
     const avgScore = Math.round(allReviews.reduce((sum, r) => sum + (r.score||0), 0) / allReviews.filter(r => r.score).length) || 0;
     if (avgScore > 0) scores[3] = avgScore;
  }

  if(trendChartInstance) trendChartInstance.destroy();
  
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.borderColor = 'rgba(30,45,69,.5)';
  Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";
  Chart.defaults.font.size = 13;
  
  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Average Performance Score',
        data: scores,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 6,
        pointBorderWidth: 2,
        pointBackgroundColor: '#1e2d45',
        pointBorderColor: '#10b981'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: { boxPadding: 6 }
      },
      scales: {
        y: { 
           min: 50, 
           max: 100, 
           grid: { color: 'rgba(30,45,69,.5)' }
        },
        x: {
           grid: { color: 'rgba(30,45,69,.5)' }
        }
      }
    }
  });
};

// ── Utility functions: defer to shared-utils.js if loaded ──
if (typeof window.authHeaders === 'undefined') {
  window.authHeaders = function() {
    let token = window._simpatico_liveToken || '';
    if (!token) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          try { token = JSON.parse(localStorage.getItem(k)).access_token || ''; } catch(e){}
          if (token) break;
        }
      }
    }
    if (!token) {
      token = localStorage.getItem('sh_token') || localStorage.getItem('simpatico_token') || localStorage.getItem('sb-token') || '';
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
if (typeof window.avatarColor === 'undefined') {
  window.avatarColor = function(id) {
    const c = ['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4'];
    let h=0; for(const ch of (id||'')) h=(h*31+ch.charCodeAt(0))&0xffffffff;
    return c[Math.abs(h)%c.length];
  };
}
if (typeof window.setText === 'undefined') {
  window.setText = function(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
}
if (typeof window.openModal === 'undefined') {
  window.openModal  = id => { const el = document.getElementById(id); if(el) { el.classList.add('open'); el.classList.add('active'); } };
}
if (typeof window.closeModal === 'undefined') {
  window.closeModal = id => { const el = document.getElementById(id); if(el) { el.classList.remove('open'); el.classList.remove('active'); } };
}
if (typeof window.showToast === 'undefined') {
  window.showToast  = (msg, type='info') => {
    const c = document.getElementById('toasts'); if (!c) return;
    const t = document.createElement('div'); t.className = `hr-toast ${type}`; t.textContent = msg;
    c.appendChild(t); setTimeout(() => t.remove(), 3800);
  };
}
