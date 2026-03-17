// js/app.js
// SimpaticoHR Main Application Logic

let currentCompanyId = null;

// ==========================================
// PAGE NAVIGATION
// ==========================================
function showPage(pageId) {
  document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
  const page = document.getElementById(`page-${pageId}`);
  if (page) page.classList.remove('hidden');

  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  const menuItem = document.querySelector(`.menu-item[data-page="${pageId}"]`);
  if (menuItem) menuItem.classList.add('active');

  document.getElementById('breadcrumbCurrent').textContent = pageId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  // Load page-specific data
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

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function openCreateJobModal() { openModal('createJobModal'); }
function toggleNotifications() { openModal('notificationPanel'); loadNotifications(); }

// ==========================================
// DASHBOARD DATA LOADING
// ==========================================
async function loadDashboardData(companyId) {
  currentCompanyId = companyId;

  try {
    // Active Jobs Count
    const { count: jobsCount } = await SimpaticoDB.from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'active');
    document.getElementById('statActiveJobs').textContent = jobsCount || 0;
    if(document.getElementById('badgeJobs')) document.getElementById('badgeJobs').textContent = jobsCount || 0;

    // Applications Count
    const { count: appsCount } = await SimpaticoDB.from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId);
    document.getElementById('statApplications').textContent = appsCount || 0;
    if(document.getElementById('badgeApplications')) document.getElementById('badgeApplications').textContent = appsCount || 0;

    // Today's Interviews
    const today = new Date().toISOString().split('T')[0];
    const { count: intCount } = await SimpaticoDB.from('interviews')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('scheduled_at', today + 'T00:00:00')
      .lte('scheduled_at', today + 'T23:59:59');
    document.getElementById('statInterviews').textContent = intCount || 0;

    // Hired this month
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { count: hiredCount } = await SimpaticoDB.from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'hired')
      .gte('updated_at', monthStart);
    document.getElementById('statHired').textContent = hiredCount || 0;

    // Recent Applications
    const { data: recentApps } = await SimpaticoDB.from('applications')
      .select('*, candidate:users!applications_candidate_id_fkey(full_name, email), job:jobs!applications_job_id_fkey(title)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(10);

    renderRecentApplications(recentApps || []);

    // Upcoming Interviews
    const { data: upcomingInt } = await SimpaticoDB.from('interviews')
      .select('*, candidate:users!interviews_candidate_id_fkey(full_name), job:jobs!interviews_job_id_fkey(title)')
      .eq('company_id', companyId)
      .in('status', ['scheduled', 'in_progress'])
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5);

    renderUpcomingInterviews(upcomingInt || []);

    // Setup real-time subscriptions
    setupRealtimeSubscriptions(companyId);

  } catch (error) {
    console.error('Error loading dashboard:', error);
    showToast('Error loading dashboard data', 'error');
  }
}

function renderRecentApplications(apps) {
  const tbody = document.getElementById('recentApplicationsTable');
  if (!apps.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray" style="padding: 2rem;">No applications yet</td></tr>';
    return;
  }
  tbody.innerHTML = apps.map(app => `
    <tr>
      <td>
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--primary-100);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:0.75rem;color:var(--primary);">
            ${app.candidate?.full_name?.split(' ').map(n => n[0]).join('') || '?'}
          </div>
          <div>
            <div style="font-weight:600;font-size:0.85rem;">${app.candidate?.full_name || 'Unknown'}</div>
            <div style="font-size:0.75rem;color:var(--gray-500);">${app.candidate?.email || ''}</div>
          </div>
        </div>
      </td>
      <td style="font-size:0.85rem;">${app.job?.title || 'N/A'}</td>
      <td>
        <span class="match-score ${(app.ai_match_score || 0) >= 80 ? 'high' : (app.ai_match_score || 0) >= 50 ? 'medium' : 'low'}">
          ${app.ai_match_score || '--'}%
        </span>
      </td>
      <td><span class="badge badge-$${getStatusBadgeClass(app.status)}">$${formatStatus(app.status)}</span></td>
      <td style="font-size:0.8rem;color:var(--gray-500);">${timeAgo(app.created_at)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-sm" onclick="viewApplication('${app.id}')"><i class="fas fa-eye"></i></button>
          <button class="btn btn-ghost btn-sm" onclick="moveApplication('${app.id}', 'shortlisted')"><i class="fas fa-star"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderUpcomingInterviews(interviews) {
  const container = document.getElementById('upcomingInterviews');
  if (!interviews.length) {
    container.innerHTML = '<p class="text-gray text-center" style="padding: 1rem;">No upcoming interviews</p>';
    return;
  }
  container.innerHTML = interviews.map(int => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);margin-bottom:8px;">
      <div style="width:40px;height:40px;border-radius:50%;background:${int.status === 'in_progress' ? 'var(--success-light)' : 'var(--info-light)'};display:flex;align-items:center;justify-content:center;">
        <i class="fas fa-$${int.interview_type === 'ai_proctored' ? 'eye' : 'video'}" style="color:$${int.status === 'in_progress' ? 'var(--success)' : 'var(--info)'};"></i>
      </div>
      <div style="flex:1;">
        <div style="font-weight:600;font-size:0.85rem;">${int.candidate?.full_name || 'Candidate'}</div>
        <div style="font-size:0.75rem;color:var(--gray-500);">$${int.job?.title || ''} • $${formatDateTime(int.scheduled_at)}</div>
      </div>
      <div>
        <span class="badge badge-$${int.status === 'in_progress' ? 'success' : 'info'}">$${int.status === 'in_progress' ? '🔴 Live' : int.interview_type}</span>
      </div>
      ${int.proctoring_enabled ? `
        <a href="../interview/proctored-room.html?id=${int.id}" class="btn btn-primary btn-sm" target="_blank">
          <i class="fas fa-video"></i>
        </a>
      ` : ''}
    </div>
  `).join('');
}

// ==========================================
// JOBS MANAGEMENT
// ==========================================
async function loadJobs() {
  try {
    const { data: jobs } = await SimpaticoDB.from('jobs')
      .select('*')
      .eq('company_id', currentCompanyId)
      .order('created_at', { ascending: false });

    const tbody = document.getElementById('jobsTable');
    if (!jobs?.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray" style="padding: 2rem;">No jobs created yet. Click "Create Job" to get started!</td></tr>';
      return;
    }

    tbody.innerHTML = jobs.map(job => `
      <tr>
        <td>
          <div style="font-weight:600;">${job.title}</div>
          <div style="font-size:0.75rem;color:var(--gray-500);">${job.location || 'Not specified'} • ${job.employment_type || 'Full Time'}</div>
        </td>
        <td>${job.department || '-'}</td>
        <td><span style="font-weight:600;color:var(--primary);">${job.applications_count || 0}</span></td>
        <td><span class="badge badge-${job.status === 'active' ? 'success' : job.status === 'draft' ? 'gray' : job.status === 'paused' ? 'warning' : 'danger'}">${job.status}</span></td>
        <td style="font-size:0.85rem;color:var(--gray-500);">${job.published_at ? formatDate(job.published_at) : 'Not published'}</td>
        <td>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-ghost btn-sm" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="btn btn-ghost btn-sm" title="View Pipeline" onclick="showPage('pipeline');loadPipeline('${job.id}')"><i class="fas fa-columns"></i></button>
            ${job.status === 'draft' ? `<button class="btn btn-success btn-sm" onclick="updateJobStatus('${job.id}','active')"><i class="fas fa-rocket"></i></button>` : ''}
            ${job.status === 'active' ? `<button class="btn btn-warning btn-sm" onclick="updateJobStatus('${job.id}','paused')"><i class="fas fa-pause"></i></button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading jobs:', error);
  }
}

async function publishJob() {
  const title = document.getElementById('newJobTitle').value;
  if (!title) { showToast('Job title is required', 'error'); return; }

  try {
    const skills = document.getElementById('newJobSkills').value.split(',').map(s => s.trim()).filter(Boolean);
    
    const { error } = await SimpaticoDB.from('jobs').insert({
      company_id: currentCompanyId,
      created_by: authManager.userProfile?.id || null,
      title,
      department: document.getElementById('newJobDept').value,
      location: document.getElementById('newJobLocation').value,
      experience_min: parseFloat(document.getElementById('newJobExpMin').value) || null,
      experience_max: parseFloat(document.getElementById('newJobExpMax').value) || null,
      salary_min: parseFloat(document.getElementById('newJobSalaryMin').value) || null,
      salary_max: parseFloat(document.getElementById('newJobSalaryMax').value) || null,
      skills_required: skills,
      description: document.getElementById('newJobDesc').value,
      employment_type: document.getElementById('newJobType').value,
      positions: parseInt(document.getElementById('newJobPositions').value) || 1,
      auto_screen: document.getElementById('newJobAutoScreen').checked,
      status: 'active',
      published_at: new Date().toISOString()
    });

    if (error) throw error;
    
    closeModal('createJobModal');
    showToast('Job published successfully!', 'success');
    loadDashboardData(currentCompanyId);
    loadJobs();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function saveJobDraft() {
  const title = document.getElementById('newJobTitle').value;
  if (!title) { showToast('Job title is required', 'error'); return; }

  try {
    const { error } = await SimpaticoDB.from('jobs').insert({
      company_id: currentCompanyId,
      created_by: authManager.userProfile?.id || null,
      title,
      department: document.getElementById('newJobDept').value,
      description: document.getElementById('newJobDesc').value,
      status: 'draft'
    });

    if (error) throw error;
    closeModal('createJobModal');
    showToast('Job saved as draft', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function updateJobStatus(jobId, status) {
  try {
    const updates = { status };
    if (status === 'active') updates.published_at = new Date().toISOString();
    if (status === 'closed') updates.closed_at = new Date().toISOString();

    const { error } = await SimpaticoDB.from('jobs').update(updates).eq('id', jobId);
    if (error) throw error;
    showToast(`Job ${status}!`, 'success');
    loadJobs();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ==========================================
// PIPELINE (KANBAN)
// ==========================================
const PIPELINE_STAGES = [
  { key: 'applied', label: 'Applied', color: 'var(--gray-500)' },
  { key: 'screened', label: 'Screened', color: 'var(--info)' },
  { key: 'shortlisted', label: 'Shortlisted', color: 'var(--primary)' },
  { key: 'interview_scheduled', label: 'Interview', color: 'var(--warning)' },
  { key: 'selected', label: 'Selected', color: 'var(--success)' },
  { key: 'offer_sent', label: 'Offer Sent', color: '#8b5cf6' },
  { key: 'hired', label: 'Hired', color: '#059669' }
];

async function loadPipelineJobs() {
  const { data: jobs } = await SimpaticoDB.from('jobs')
    .select('id, title')
    .eq('company_id', currentCompanyId)
    .in('status', ['active', 'paused']);

  const select = document.getElementById('pipelineJobFilter');
  select.innerHTML = '<option value="">Select Job</option>' + 
    (jobs || []).map(j => `<option value="$${j.id}">$${j.title}</option>`).join('');
}

async function loadPipeline(jobId) {
  if (!jobId) return;
  
  const { data: applications } = await SimpaticoDB.from('applications')
    .select('*, candidate:users!applications_candidate_id_fkey(full_name, email)')
    .eq('job_id', jobId)
    .order('ai_match_score', { ascending: false });

  const board = document.getElementById('pipelineBoard');
  board.innerHTML = PIPELINE_STAGES.map(stage => {
    const stageApps = (applications || []).filter(a => a.status === stage.key);
    return `
      <div class="pipeline-stage" data-stage="${stage.key}">
        <div class="pipeline-stage-header">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:10px;height:10px;border-radius:50%;background:${stage.color};"></div>
            <h4>${stage.label}</h4>
          </div>
          <span class="count">${stageApps.length}</span>
        </div>
        <div class="pipeline-cards" 
             ondragover="event.preventDefault();this.style.background='var(--primary-50)'"
             ondragleave="this.style.background=''"
             ondrop="handleDrop(event, '${stage.key}')">
          ${stageApps.map(app => `
            <div class="pipeline-card" draggable="true" 
                 ondragstart="event.dataTransfer.setData('text','${app.id}')"
                 data-id="${app.id}">
              <div class="candidate-info">
                <div class="candidate-avatar">${app.candidate?.full_name?.split(' ').map(n => n[0]).join('') || '?'}</div>
                <div>
                  <div class="candidate-name">${app.candidate?.full_name || 'Unknown'}</div>
                  <div class="candidate-role">${app.candidate?.email || ''}</div>
                </div>
                <span class="match-score ${(app.ai_match_score || 0) >= 80 ? 'high' : (app.ai_match_score || 0) >= 50 ? 'medium' : 'low'}" style="margin-left:auto;">
                  ${app.ai_match_score || '--'}%
                </span>
              </div>
              <div style="display:flex;gap:4px;font-size:0.75rem;">
                <button class="btn btn-ghost btn-sm" style="padding:4px 8px;" onclick="viewApplication('${app.id}')">
                  <i class="fas fa-eye"></i>
                </button>
                ${stage.key === 'shortlisted' ? `
                  <button class="btn btn-ghost btn-sm" style="padding:4px 8px;" onclick="scheduleInterview('${app.id}')">
                    <i class="fas fa-calendar-plus"></i>
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

async function handleDrop(event, newStage) {
  event.preventDefault();
  event.target.closest('.pipeline-cards').style.background = '';
  const appId = event.dataTransfer.getData('text');
  
  try {
    const { error } = await SimpaticoDB.from('applications')
      .update({ status: newStage, current_stage: newStage })
      .eq('id', appId);
    if (error) throw error;
    
    showToast(`Candidate moved to ${newStage}`, 'success');
    const jobId = document.getElementById('pipelineJobFilter').value;
    if (jobId) loadPipeline(jobId);

    triggerAutomation('application_status_changed', appId, { stage: newStage });
    triggerAutomation('application_status_changed', appId, { stage: newStage });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// INTERVIEWS
// ==========================================
async function loadInterviews() {
  const tbody = document.getElementById('interviewsTable');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:2rem;color:#6B7280">Loading interviews...</td></tr>';
  try {
    const { data, error } = await SimpaticoDB
      .from('interviews')
      .select('*, candidate:users!interviews_candidate_id_fkey(full_name, email), job:jobs(title)')
      .eq('company_id', currentCompanyId)
      .order('scheduled_at', { ascending: false });
    if (error) throw error;
    const interviews = data || [];
    const scheduled = interviews.filter(i => i.status === 'scheduled').length;
    const completed = interviews.filter(i => i.status === 'completed').length;
    const today = interviews.filter(i => {
      if (!i.scheduled_at) return false;
      return new Date(i.scheduled_at).toDateString() === new Date().toDateString();
    }).length;
    if (document.getElementById('intScheduled'))   document.getElementById('intScheduled').textContent  = scheduled;
    if (document.getElementById('intCompleted'))   document.getElementById('intCompleted').textContent  = completed;
    if (document.getElementById('statInterviews')) document.getElementById('statInterviews').textContent = today;
    if (!interviews.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:2rem;color:#9CA3AF">No interviews scheduled yet</td></tr>';
      return;
    }
    tbody.innerHTML = interviews.map(i => {
      const name     = i.candidate?.full_name || 'Unknown';
      const email    = i.candidate?.email || '';
      const job      = i.job?.title || '-';
      const date     = i.scheduled_at ? new Date(i.scheduled_at).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-';
      const status   = i.status || 'scheduled';
      const initials = name.split(' ').map(n => n[0]).join('').toUpperCase();
      const badgeColor = status === 'completed' ? '#059669' : status === 'cancelled' ? '#DC2626' : '#D97706';
      const roomLink = `https://simpaticohr.in/interview/proctored-room.html?interview_id=${i.id}&token=${i.access_token || ''}`;
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700">${initials}</div>
          <div><div style="font-weight:600;font-size:14px">${name}</div><div style="font-size:12px;color:#6B7280">${email}</div></div>
        </div></td>
        <td style="font-size:13px">${job}</td>
        <td style="font-size:13px">${date}</td>
        <td><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${badgeColor}22;color:${badgeColor};border:1px solid ${badgeColor}44">${status}</span></td>
        <td style="font-size:13px">${i.interview_type || 'AI Interview'}</td>
        <td><button onclick="copyInterviewLink('${roomLink}')" style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;background:#EFF6FF;color:#2563EB;border:none;cursor:pointer"><i class="fas fa-link"></i> Copy Link</button></td>
        <td>${status === 'completed'
          ? `<button onclick="viewInterviewReport('${i.id}')" style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;background:#F0FDF4;color:#059669;border:none;cursor:pointer"><i class="fas fa-chart-bar"></i> Report</button>`
          : `<button onclick="cancelInterview('${i.id}')" style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;background:#FEF2F2;color:#DC2626;border:none;cursor:pointer"><i class="fas fa-times"></i> Cancel</button>`
        }</td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:2rem;color:#EF4444">${err.message}</td></tr>`;
  }
}

function openScheduleInterviewModal() {
  let modal = document.getElementById('scheduleInterviewModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'scheduleInterviewModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:560px">
        <div class="modal-header">
          <h3><i class="fas fa-calendar-plus" style="color:#6366f1;margin-right:8px"></i>Schedule Interview</h3>
          <button class="btn btn-ghost btn-icon" onclick="closeModal('scheduleInterviewModal')">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Select Job *</label>
            <select class="form-control" id="siJob"></select>
          </div>
          <div class="form-group">
            <label class="form-label">Candidate Email *</label>
            <input type="email" class="form-control" id="siEmail" placeholder="candidate@email.com">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Date & Time *</label>
              <input type="datetime-local" class="form-control" id="siDateTime">
            </div>
            <div class="form-group">
              <label class="form-label">Interview Type</label>
              <select class="form-control" id="siType">
                <option value="ai_interview">AI Interview</option>
                <option value="technical">Technical</option>
                <option value="hr_round">HR Round</option>
                <option value="final">Final Round</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Duration (minutes)</label>
            <select class="form-control" id="siDuration">
              <option value="30">30 minutes</option>
              <option value="45" selected>45 minutes</option>
              <option value="60">60 minutes</option>
              <option value="90">90 minutes</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Notes (optional)</label>
            <textarea class="form-control" id="siNotes" rows="2" placeholder="Any special instructions..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('scheduleInterviewModal')">Cancel</button>
          <button class="btn btn-primary" onclick="submitScheduleInterview()"><i class="fas fa-paper-plane"></i> Schedule and Send Link</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  SimpaticoDB.from('jobs').select('id, title').eq('company_id', currentCompanyId).in('status', ['active','paused']).then(({ data }) => {
    const sel = document.getElementById('siJob');
    sel.innerHTML = '<option value="">Select a job...</option>' + (data || []).map(j => `<option value="${j.id}">${j.title}</option>`).join('');
  });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  document.getElementById('siDateTime').value = tomorrow.toISOString().slice(0, 16);
  openModal('scheduleInterviewModal');
}

async function submitScheduleInterview() {
  const jobId  = document.getElementById('siJob').value;
  const email  = document.getElementById('siEmail').value.trim();
  const dt     = document.getElementById('siDateTime').value;
  const type   = document.getElementById('siType').value;
  const dur    = document.getElementById('siDuration').value;
  const notes  = document.getElementById('siNotes').value.trim();
  if (!jobId || !email || !dt) { showToast('Please fill in all required fields', 'error'); return; }
  try {
    const { data: candidates } = await SimpaticoDB.from('users').select('id').eq('email', email).limit(1);
    const candidateId = candidates?.[0]?.id || null;
    const accessToken = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const { data: interview, error } = await SimpaticoDB.from('interviews').insert({
      company_id: currentCompanyId, candidate_id: candidateId, candidate_email: email,
      job_id: jobId, scheduled_at: new Date(dt).toISOString(), interview_type: type,
      duration_mins: parseInt(dur), notes, status: 'scheduled', access_token: accessToken
    }).select().single();
    if (error) throw error;
    const roomLink = `https://simpaticohr.in/interview/proctored-room.html?interview_id=${interview.id}&token=${accessToken}`;
    try { await window.SimpaticoAPI.sendWhatsApp({ to: email, message: `Your interview is scheduled for ${new Date(dt).toLocaleString('en-IN')}. Join: ${roomLink}` }); } catch(e) {}
    closeModal('scheduleInterviewModal');
    showToast('Interview scheduled! Link copied to clipboard.', 'success');
    navigator.clipboard?.writeText(roomLink).catch(() => {});
    loadInterviews();
  } catch (err) {
    showToast(err.message || 'Failed to schedule interview', 'error');
  }
}

function copyInterviewLink(link) {
  navigator.clipboard.writeText(link)
    .then(() => showToast('Interview link copied!', 'success'))
    .catch(() => showToast('Copy failed: ' + link, 'error'));
}

async function cancelInterview(id) {
  if (!confirm('Cancel this interview?')) return;
  try {
    const { error } = await SimpaticoDB.from('interviews').update({ status: 'cancelled' }).eq('id', id);
    if (error) throw error;
    showToast('Interview cancelled', 'success');
    loadInterviews();
  } catch (err) { showToast(err.message, 'error'); }
}

function viewInterviewReport(id) {
  window.open(`/interview/results.html?interview_id=${id}`, '_blank');
}

function scheduleInterview(applicationId) {
  openScheduleInterviewModal();
  SimpaticoDB.from('applications')
    .select('candidate:users!applications_candidate_id_fkey(email), job_id')
    .eq('id', applicationId).single()
    .then(({ data }) => {
      if (data?.candidate?.email) document.getElementById('siEmail').value = data.candidate.email;
      if (data?.job_id) { const s = document.getElementById('siJob'); if (s) s.value = data.job_id; }
    }).catch(() => {});
}

function triggerAutomation(event, id, data) {
  console.log('Automation:', event, id, data);
}

function setupRealtimeSubscriptions(companyId) {
  // Realtime subscriptions - placeholder for future implementation
  console.log('Realtime subscriptions not yet implemented');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'});
}
function loadAutomationRules() { console.log('Automation not yet implemented'); }
function loadProctoringReports() { console.log('Proctoring not yet implemented'); }
function loadAllApplications() { console.log('Loading all applications...'); }
function loadOnboarding() { console.log('Onboarding not yet implemented'); }

function api(endpoint, options = {}) { const token = localStorage.getItem('simpatico_token') || localStorage.getItem('sb_token') || ''; return fetch(window.WORKER_URL + endpoint, { ...options, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, ...(options.headers||{}) } }).then(r => r.json()); }



