let currentAssessment = null;

async function generateAssessment() {
  const jobTitle = document.getElementById("p-role").value;
  const dept = document.getElementById("p-dept").value;
  const diff = document.getElementById("p-diff").value;
  const tech = document.getElementById("p-skills").value;
  const culture = document.getElementById("p-culture").value;

  if (!jobTitle) {
    showToast("Job Title is required", "error");
    return;
  }

  const btn = document.getElementById("generate-btn");
  btn.disabled = true;
  btn.innerHTML =
    '<span class="hr-spinner" style="margin-right:8px"></span> Generating...';

  const preview = document.getElementById("preview-area");
  preview.innerHTML = `
    <div style="text-align:center; padding: 40px; color: var(--hr-text-muted);">
      <div class="hr-spinner" style="width:30px;height:30px;border-width:3px;margin:0 auto 15px auto;"></div>
      <p>AI is analyzing requirements and generating a custom assessment...</p>
      <p style="font-size:12px; margin-top:8px; opacity:0.7;">This may take 10-20 seconds</p>
    </div>
  `;

  // Retry logic: AI can sometimes return malformed JSON on first attempt
  const MAX_RETRIES = 2;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await workerFetch("/ai/generate-assessment", {
        method: "POST",
        body: {
          job_title: jobTitle,
          department: dept,
          difficulty: diff,
          tech_stack: tech,
          culture: culture,
          question_count: 5,
        },
      });

      // workerFetch wraps response in {success, data, meta}
      const assessment = res.data?.assessment || res.assessment;
      if (!assessment) throw new Error("No assessment data in response");

      currentAssessment = assessment;
      renderAssessment(currentAssessment);
      document.getElementById("save-assessment-btn").disabled = false;
      showToast("Assessment generated successfully", "success");
      lastError = null;
      break; // Success — exit retry loop
    } catch (e) {
      lastError = e;
      console.warn(`[assessments] Attempt ${attempt + 1} failed:`, e.message);

      // Only retry on AI-related errors, not auth/validation
      if (e.message.includes("401") || e.message.includes("403") || e.message.includes("required")) {
        break; // Don't retry auth or validation errors
      }

      if (attempt < MAX_RETRIES - 1) {
        preview.innerHTML = `
          <div style="text-align:center; padding: 40px; color: var(--hr-text-muted);">
            <div class="hr-spinner" style="width:30px;height:30px;border-width:3px;margin:0 auto 15px auto;"></div>
            <p>Retrying generation (attempt ${attempt + 2}/${MAX_RETRIES})...</p>
          </div>
        `;
        await new Promise((r) => setTimeout(r, 1000)); // Brief pause before retry
      }
    }
  }

  if (lastError) {
    preview.innerHTML = `<div class="empty-state"><p style="color:var(--hr-danger)">Error: ${escapeHtml(lastError.message)}</p><p style="margin-top:10px;font-size:13px;color:var(--hr-text-muted)">Try adjusting your parameters or click Generate again.</p></div>`;
    showToast(lastError.message, "error");
  }

  btn.disabled = false;
  btn.innerHTML = "✨ Generate Assessment";
}


function renderAssessment(data) {
  const container = document.getElementById("preview-area");
  let html = `<h2 style="font-size:18px; margin-bottom:10px;">${escapeHtml(data.assessment_title || "Custom Assessment")}</h2>`;

  if (!data.questions || !data.questions.length) {
    container.innerHTML = html + `<p>No questions generated.</p>`;
    return;
  }

  data.questions.forEach((q, idx) => {
    let optionsHtml = "";
    if (q.type === "mcq" && q.options) {
      optionsHtml = `<ul class="q-options">
        ${q.options.map((opt) => `<li>${escapeHtml(opt)}</li>`).join("")}
      </ul>`;
    }

    html += `
      <div class="question-card">
        <span class="q-type">${q.type === "mcq" ? "Multiple Choice" : "Short Answer"}</span>
        <div class="q-text">${idx + 1}. ${escapeHtml(q.question)}</div>
        ${optionsHtml}
        ${q.correct_answer ? `<div style="margin-top:10px; font-size:13px; font-weight:600; color:var(--hr-success)">✓ Answer: ${escapeHtml(q.correct_answer)}</div>` : ""}
        ${q.scoring_rubric ? `<div class="q-rubric"><strong>AI Grading Rubric:</strong><br>${escapeHtml(q.scoring_rubric)}</div>` : ""}
      </div>
    `;
  });

  container.innerHTML = html;
}

async function saveAssessment() {
  if (!currentAssessment) return;
  const btn = document.getElementById("save-assessment-btn");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const res = await workerFetch("/ai/assessments", {
      method: "POST",
      body: {
        assessment_title:
          currentAssessment.assessment_title || "New Assessment",
        questions: currentAssessment.questions || [],
        difficulty: currentAssessment.difficulty || null,
      },
    });

    if (res.error) throw new Error(res.error.message || "Save failed");

    showToast("Assessment saved successfully", "success");
    console.log("[assessments] Assessment saved:", res.data);
  } catch (e) {
    showToast("Failed to save: " + e.message, "error");
    console.error("[assessments] Save error:", e);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Database";
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, function (m) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[m];
  });
}

window.generateAssessment = generateAssessment;
window.saveAssessment = saveAssessment;
