// employees.js - Simpatico HR Platform
// Uses window.SimpaticoDB (shared Supabase client)

var allEmployees = [];
var filteredEmployees = [];
var currentView = 'list';
var editingId = null;

async function getCompanyId() {
  try {
    var res = await window.SimpaticoDB.auth.getSession();
    var session = res.data && res.data.session;
    if (!session) return null;
    var result = await window.SimpaticoDB
      .from('companies')
      .select('id')
      .eq('user_id', session.user.id)
      .single();
    return result.data ? result.data.id : null;
  } catch(e) {
    console.warn('getCompanyId error:', e);
    return null;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  var wait = setInterval(function() {
    if (window.SimpaticoDB) {
      clearInterval(wait);
      loadEmployees();
      loadDepartments();
    }
  }, 100);
  setTimeout(function() { clearInterval(wait); }, 5000);
});

async function loadEmployees() {
  var companyId = await getCompanyId();
  var res = await window.SimpaticoDB.from('employees').select('*').order('created_at', { ascending: false });
  if (res.error) { console.error('Load employees:', res.error); return; }
  allEmployees = res.data || [];
  filteredEmployees = allEmployees.slice();
  renderEmployees();
  updateStats();
}

async function loadDepartments() {
  var companyId = await getCompanyId();
  var query = window.SimpaticoDB.from('employees').select('department');
  if (companyId) { query = query.eq('company_id', companyId); } else { console.warn('No company ID - loading all employees'); }
  var res = await window.SimpaticoDB.from('employees').select('*').order('created_at', { ascending: false });
  var depts = [];
  (res.data || []).forEach(function(e) {
    if (e.department && depts.indexOf(e.department) === -1) depts.push(e.department);
  });
  var select = document.getElementById('dept-filter');
  if (!select) return;
  select.innerHTML = '<option value="">All Departments</option>' +
    depts.map(function(d) { return '<option value="' + d + '">' + d + '</option>'; }).join('');
}

function renderEmployees() {
  var container = document.getElementById('employees-table'); var loadingEl = document.getElementById('table-loading'); if (loadingEl) loadingEl.style.display = 'none'; if (container) container.style.display = 'table';
  if (!container) return;
  if (!filteredEmployees.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--hr-text-muted)">No employees found. Click Add Employee to get started.</div>';
    return;
  }
  if (currentView === 'grid') {
    container.innerHTML = filteredEmployees.map(function(emp) {
      return '<div class="emp-card" onclick="viewEmployee(\'' + emp.id + '\')">' +
        '<div class="emp-avatar">' + ((emp.full_name || '?')[0].toUpperCase()) + '</div>' +
        '<div class="emp-name">' + ((emp.first_name||'') + ' ' + (emp.last_name||'')).trim() || '-' + '</div>' +
        '<div class="emp-role">' + (emp.job_title || '-') + '</div>' +
        '<div class="emp-dept">' + (emp.department || '-') + '</div>' +
        '<span class="emp-status status-' + (emp.status || 'active') + '">' + (emp.status || 'active') + '</span>' +
        '<div class="emp-actions">' +
        '<button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="event.stopPropagation();editEmployee(\'' + emp.id + '\')">Edit</button>' +
        '<button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="event.stopPropagation();deleteEmployee(\'' + emp.id + '\')">Delete</button>' +
        '</div></div>';
    }).join('');
  } else {
    var rows = filteredEmployees.map(function(emp) {
      return '<tr>' +
        '<td><strong>' + ((emp.first_name||'') + ' ' + (emp.last_name||'')).trim() || '-' + '</strong></td>' +
        '<td>' + (emp.job_title || '-') + '</td>' +
        '<td>' + (emp.department || '-') + '</td>' +
        '<td>' + (emp.email || '-') + '</td>' +
        '<td><span class="emp-status status-' + (emp.status || 'active') + '">' + (emp.status || 'active') + '</span></td>' +
        '<td>' +
        '<button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="editEmployee(\'' + emp.id + '\')">Edit</button> ' +
        '<button class="hr-btn hr-btn-ghost hr-btn-sm" onclick="deleteEmployee(\'' + emp.id + '\')">Delete</button>' +
        '</td></tr>';
    }).join('');
    container.innerHTML = '<table class="hr-table"><thead><tr><th>Name</th><th>Title</th><th>Department</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
}

function updateStats() {
  var total = allEmployees.length;
  var active = allEmployees.filter(function(e) { return e.status === 'active'; }).length;
  var onLeave = allEmployees.filter(function(e) { return e.status === 'on_leave'; }).length;
  var depts = [];
  allEmployees.forEach(function(e) { if (e.department && depts.indexOf(e.department) === -1) depts.push(e.department); });
  var setEl = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('total-employees', total);
  setEl('active-employees', active);
  setEl('on-leave-count', onLeave);
  setEl('dept-count', depts.length);
}

function searchEmployees(q) {
  q = q.toLowerCase();
  filteredEmployees = allEmployees.filter(function(e) {
    return (e.full_name || '').toLowerCase().indexOf(q) !== -1 ||
           (e.email || '').toLowerCase().indexOf(q) !== -1 ||
           (e.job_title || '').toLowerCase().indexOf(q) !== -1;
  });
  renderEmployees();
}

function filterByDept(dept) {
  filteredEmployees = dept ? allEmployees.filter(function(e) { return e.department === dept; }) : allEmployees.slice();
  renderEmployees();
}

function filterByStatus(status) {
  filteredEmployees = status ? allEmployees.filter(function(e) { return e.status === status; }) : allEmployees.slice();
  renderEmployees();
}

function toggleView(view) {
  currentView = view;
  renderEmployees();
}

function openAddModal() {
  editingId = null;
  var title = document.getElementById('modal-title');
  if (title) title.textContent = 'Add Employee';
  var form = document.getElementById('emp-form');
  if (form) form.reset();
  var modal = document.getElementById('add-modal');
  if (modal) { modal.style.display = 'flex'; modal.style.opacity = '1'; modal.style.pointerEvents = 'all'; }
}

function editEmployee(id) {
  var emp = null;
  for (var i = 0; i < allEmployees.length; i++) {
    if (allEmployees[i].id === id) { emp = allEmployees[i]; break; }
  }
  if (!emp) return;
  editingId = id;
  var title = document.getElementById('modal-title');
  if (title) title.textContent = 'Edit Employee';
  var fields = ['email','phone','job_title','department','status','hire_date','salary','location','employment_type'];
  fields.forEach(function(f) {
    var el = document.getElementById('emp-' + f.replace(/_/g, '-'));
    if (el) el.value = emp[f] || '';
  });
  var modal = document.getElementById('add-modal');
  if (modal) { modal.style.display = 'flex'; modal.style.opacity = '1'; modal.style.pointerEvents = 'all'; }
}

function closeModal() {
  var modal = document.getElementById('add-modal');
  if (modal) modal.style.display = 'none';
}

async function saveEmployee() {
  var companyId = await getCompanyId();
  var fields = ['email','phone','job_title','department','status','hire_date','salary','location','employment_type'];
  var data = { company_id: companyId }; data['first_name'] = (document.getElementById('emp-first')||{}).value||''; data['last_name'] = (document.getElementById('emp-last')||{}).value||'';
  fields.forEach(function(f) {
    var el = document.getElementById('emp-' + f.replace(/_/g, '-'));
    if (el) data[f] = el.value || null;
  });
  var res;
  if (editingId) {
    res = await window.SimpaticoDB.from('employees').update(data).eq('id', editingId);
  } else {
    res = await window.SimpaticoDB.from('employees').insert(data);
  }
  if (res.error) { alert('Error: ' + res.error.message); return; }
  closeModal();
  loadEmployees();
}

async function deleteEmployee(id) {
  if (!confirm('Delete this employee?')) return;
  await window.SimpaticoDB.from('employees').delete().eq('id', id);
  loadEmployees();
}

function viewEmployee(id) {
  window.location.href = 'employee-profile.html?id=' + id;
}

function exportEmployees() {
  var csv = ['Name,Email,Title,Department,Status,Hire Date'];
  filteredEmployees.forEach(function(e) {
    csv.push('"' + (e.full_name||'') + '","' + (e.email||'') + '","' + (e.job_title||'') + '","' + (e.department||'') + '","' + (e.status||'') + '","' + (e.hire_date||'') + '"');
  });
  var a = document.createElement('a');
  a.href = 'data:text/csv,' + encodeURIComponent(csv.join('\n'));
  a.download = 'employees.csv';
  a.click();
}



function openAddModal() { editingId = null; var modal = document.getElementById('add-modal'); if (modal) { modal.style.display = 'flex'; modal.style.opacity = '1'; modal.style.pointerEvents = 'all'; } }
function closeModal(id) { var modal = document.getElementById(id || 'add-modal'); if (modal) modal.style.display = 'none'; }




