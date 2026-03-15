const fs = require('fs');
let html = fs.readFileSync('evalis-platform.html', 'utf8');
const broken = `async function submitApplication() {`;
const idx = html.indexOf(broken);
const endIdx = html.indexOf('\nasync function runATS', idx);
const fixed = `async function submitApplication() {
  const name  = document.getElementById('applyName').value.trim();
  const email = document.getElementById('applyEmail').value.trim();
  if (!name || !email) { toast('Name & Email required'); return; }
  if (!cv) { toast('Upload your resume first'); return; }
  const btn = document.getElementById('applyBtn');
  btn.disabled = true; btn.textContent = 'Submitting...';
  const st = document.getElementById('applyStatus');
  st.textContent = '';
  try {
    let resume_url = '';
    if (_resumeFile) {
      st.textContent = 'Uploading resume...';
      const fn = Date.now() + '_' + _resumeFile.name;
      const up = await uploadFile(_resumeFile, fn);
      resume_url = up.url || '';
    }
    st.textContent = 'Saving application...';
    const result = await db('insert', 'applications', {
      job_id: curJobId || null, name, email,
      phone: document.getElementById('applyPhone').value.trim(),
      resume_url, resume_text: cv.substring(0, 5000),
      status: 'applied', created_at: new Date().toISOString(),
    });
    const app = result; curAppId = app?.id;
    if (app?.id) await runATS(app);
    st.innerHTML = '<span style="color:var(--green)">Application submitted!</span>';
    toast('Application submitted!');
    document.getElementById('applyName').value = '';
    document.getElementById('applyEmail').value = '';
    document.getElementById('applyFileName').textContent = 'No file selected';
    document.getElementById('applyUpload').classList.remove('ok');
    cv = ''; _resumeFile = null;
  } catch (err) {
    st.innerHTML = '<span style="color:var(--red)">' + err.message + '</span>';
  }
  btn.disabled = false; btn.textContent = 'Submit Application';
}

`;
html = html.slice(0, idx) + fixed + html.slice(endIdx + 1);
fs.writeFileSync('evalis-platform.html', html);
console.log('Done!');