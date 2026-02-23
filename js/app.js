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

    // Applications Count
    const { count: appsCount } = await SimpaticoDB.from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId);
    document.getElementById('statApplications').textContent = appsCount || 0;

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
          <div style="font-size:0.75rem;color:var(--gray-500);">$${job.location || 'Not specified'} • $${job.employment_type || 'Full Time'}</div>
        </td>
        <td>${job.department || '-'}</td>
        <td><span style="font-weight:600;color:var(--primary);">${job.applications_count || 0}</span></td>
        <td><span class="badge badge-$${job.status === 'active' ? 'success' : job.status === 'draft' ? 'gray' : job.status === 'paused' ? 'warning' : 'danger'}">$${job.status}</span></td>
        <td style="font-size:0.85rem;color:var(--gray-500);">${job.published_at ? formatDate(job.published_at) : 'Not published'}</td>
        <td>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-ghost btn-sm" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="btn btn-ghost btn-sm" title="View Pipeline" onclick="showPage('pipeline');loadPipeline('${job.id}')"><i class="fas fa-columns"></i></button>
            $${job.status === 'draft' ? `<button class="btn btn-success btn-sm" onclick="updateJobStatus('$${job.id}','active')"><i class="fas fa-rocket"></i></button>` : ''}
            $${job.status === 'active' ? `<button class="btn btn-warning btn-sm" onclick="updateJobStatus('$${job.id}','paused')"><i class="fas fa-pause"></i></button>` : ''}
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
      created_by: authManager.userProfile.id,
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
      created_by: authManager.userProfile.id,
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

    // Trigger automation
    triggerAutomation('application
