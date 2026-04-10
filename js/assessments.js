let currentAssessment = null;

async function generateAssessment() {
  const jobTitle = document.getElementById('p-role').value;
  const dept = document.getElementById('p-dept').value;
  const diff = document.getElementById('p-diff').value;
  const tech = document.getElementById('p-skills').value;
  const culture = document.getElementById('p-culture').value;

  if (!jobTitle) {
    showToast('Job Title is required', 'error');
    return;
  }

  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="hr-spinner" style="margin-right:8px"></span> Generating...';
  
  const preview = document.getElementById('preview-area');
  preview.innerHTML = `
    <div style="text-align:center; padding: 40px; color: var(--hr-text-muted);">
      <div class="hr-spinner" style="width:30px;height:30px;border-width:3px;margin:0 auto 15px auto;"></div>
      <p>AI is analyzing requirements and generating a custom assessment...</p>
    </div>
  `;

  try {
    const res = await workerFetch('/ai/generate-assessment', {
      method: 'POST',
      body: JSON.stringify({
        job_title: jobTitle,
        department: dept,
        difficulty: diff,
        tech_stack: tech,
        culture: culture,
        question_count: 5
      })
    });

    if (res.error) throw new Error(res.error.message || 'Generation failed');
    
    currentAssessment = res.data.assessment;
    renderAssessment(currentAssessment);
    document.getElementById('save-assessment-btn').disabled = false;
    showToast('Assessment generated securely for your tenant', 'success');
  } catch (e) {
    preview.innerHTML = `<div class="empty-state"><p style="color:var(--hr-danger)">Error: ${e.message}</p></div>`;
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✨ Generate Assessment';
  }
}

function renderAssessment(data) {
  const container = document.getElementById('preview-area');
  let html = `<h2 style="font-size:18px; margin-bottom:10px;">${escapeHtml(data.assessment_title || 'Custom Assessment')}</h2>`;
  
  if (!data.questions || !data.questions.length) {
    container.innerHTML = html + `<p>No questions generated.</p>`;
    return;
  }

  data.questions.forEach((q, idx) => {
    let optionsHtml = '';
    if (q.type === 'mcq' && q.options) {
      optionsHtml = `<ul class="q-options">
        ${q.options.map(opt => `<li>${escapeHtml(opt)}</li>`).join('')}
      </ul>`;
    }

    html += `
      <div class="question-card">
        <span class="q-type">${q.type === 'mcq' ? 'Multiple Choice' : 'Short Answer'}</span>
        <div class="q-text">${idx + 1}. ${escapeHtml(q.question)}</div>
        ${optionsHtml}
        ${q.correct_answer ? `<div style="margin-top:10px; font-size:13px; font-weight:600; color:var(--hr-success)">✓ Answer: ${escapeHtml(q.correct_answer)}</div>` : ''}
        ${q.scoring_rubric ? `<div class="q-rubric"><strong>AI Grading Rubric:</strong><br>${escapeHtml(q.scoring_rubric)}</div>` : ''}
      </div>
    `;
  });

  container.innerHTML = html;
}

async function saveAssessment() {
  if (!currentAssessment) return;
  const btn = document.getElementById('save-assessment-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    // Save to the hr_policies table as a JSON document since it enforces tenant isolation
    const payload = {
      name: currentAssessment.assessment_title || 'New Assessment',
      category: 'Assessment',
      version: '1.0',
      url: JSON.stringify(currentAssessment) // Store JSON in URL field temporarily for ATS prototype
    };

    const res = await workerFetch('/rest/v1/hr_policies', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res.error && !res.success) throw new Error(res.error.message || 'Failed to save');
    
    showToast('Assessment saved to Tenant Library', 'success');
  } catch(e) {
    showToast('Failed to save: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Database';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(m) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[m];
  });
}
