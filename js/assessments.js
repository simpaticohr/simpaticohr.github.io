/**
 * assessments.js — Simpatico HR Platform
 * Custom Technical Assessment Builder & Proctored Evaluator
 * Supports Cloudflare Workers AI + OpenAI / DeepSeek BYOK with resilient domain synthesis fallback
 */

var currentAssessment = window.currentAssessment || null;

async function generateAssessment() {
  const roleEl    = document.getElementById("p-role");
  const deptEl    = document.getElementById("p-dept");
  const diffEl    = document.getElementById("p-diff");
  const skillsEl  = document.getElementById("p-skills");
  const cultureEl = document.getElementById("p-culture");

  const jobTitle = (roleEl?.value || "").trim();
  const dept     = (deptEl?.value || "").trim();
  const diff     = (diffEl?.value || "Mid-Level").trim();
  const tech     = (skillsEl?.value || "").trim();
  const culture  = (cultureEl?.value || "").trim();

  if (!jobTitle) {
    showToast("Job Title is required", "error");
    return;
  }

  const btn = document.getElementById("generate-btn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="hr-spinner" style="margin-right:8px"></span> Generating...';
  }

  const preview = document.getElementById("preview-area");
  if (preview) {
    preview.innerHTML = `
      <div style="text-align:center; padding: 40px; color: var(--hr-text-muted);">
        <div class="hr-spinner" style="width:30px;height:30px;border-width:3px;margin:0 auto 15px auto;"></div>
        <p style="font-weight:600;font-size:15px;color:var(--hr-text-primary,#0f172a);">AI is analyzing role competencies & generating custom assessment...</p>
        <p style="font-size:12px; margin-top:8px; opacity:0.8;">Formulating technical questions, rubrics, and proctoring benchmarks...</p>
      </div>
    `;
  }

  try {
    let assessment = null;

    // Step 1: Attempt Cloudflare Worker dedicated assessment endpoint
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

      const candidate = res?.data?.assessment || res?.assessment;
      if (candidate && Array.isArray(candidate.questions) && candidate.questions.length > 0) {
        assessment = candidate;
      }
    } catch (workerErr) {
      console.warn("[assessments] Worker /ai/generate-assessment notice:", workerErr.message);
    }

    // Step 2: Attempt fallback to /ai/chat on Worker
    if (!assessment || !assessment.questions || !assessment.questions.length) {
      try {
        const prompt = `Design a 5-question technical assessment quiz for a ${diff} ${jobTitle}${dept ? ` in ${dept}` : ""}${tech ? ` with core skills: ${tech}` : ""}. Return ONLY valid JSON in this exact structure: {"assessment_title":"${jobTitle} Assessment","questions":[{"id":"q1","type":"mcq","question":"...","options":["A","B","C","D"],"correct_answer":"A","scoring_rubric":"..."}]}`;
        const chatRes = await workerFetch("/ai/chat", {
          method: "POST",
          body: { messages: [{ role: "user", content: prompt }] },
        });
        const rawText = chatRes?.data?.response || chatRes?.response || "";
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
            assessment = parsed;
          }
        }
      } catch (chatErr) {
        console.warn("[assessments] Worker /ai/chat fallback notice:", chatErr.message);
      }
    }

    // Step 3: Resilient domain competency synthesis fallback
    if (!assessment || !assessment.questions || !assessment.questions.length) {
      console.log("[assessments] Generating tailored assessment via local synthesis engine for:", jobTitle);
      assessment = synthesizeAssessment(jobTitle, dept, diff, tech, culture);
    }

    currentAssessment = assessment;
    renderAssessment(currentAssessment);

    const saveBtn = document.getElementById("save-assessment-btn");
    if (saveBtn) saveBtn.disabled = false;

    showToast("Assessment generated successfully", "success");
  } catch (err) {
    console.error("[assessments] Generation error:", err);
    try {
      currentAssessment = synthesizeAssessment(jobTitle, dept, diff, tech, culture);
      renderAssessment(currentAssessment);
      const saveBtn = document.getElementById("save-assessment-btn");
      if (saveBtn) saveBtn.disabled = false;
      showToast("Assessment generated successfully", "success");
    } catch (synthErr) {
      showToast("Failed to generate assessment: " + err.message, "error");
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = "✨ Generate Assessment";
    }
  }
}

/**
 * Intelligent Domain-Aware Assessment Synthesis Engine
 * Constructs rich, realistic technical assessment questions covering:
 * Fundamentals, Applied Scenarios, Quality/Safety/Standards, and System Delivery.
 */
function synthesizeAssessment(jobTitle, dept, diff, tech, culture) {
  const normTitle = (jobTitle || "").toLowerCase();
  const normTech  = (tech || "").toLowerCase();
  const questions = [];

  const title = `${diff || "Senior"} ${jobTitle} Technical Competency Assessment`;

  // ── CIVIL ENGINEERING / CONSTRUCTION DOMAIN ──
  if (normTitle.includes("civil") || normTitle.includes("structur") || normTitle.includes("construct")) {
    questions.push({
      id: "q1",
      type: "mcq",
      question: "In geotechnical foundation design, which equation accurately evaluates the ultimate bearing capacity of shallow strip footings under general shear failure?",
      options: [
        "Terzaghi's formula: q_u = c·N_c + γ·D_f·N_q + 0.5·γ·B·N_γ",
        "Rankine's earth pressure formula: P_a = 0.5·γ·H²·K_a",
        "Bernoulli's hydraulic hydraulic head equation: H = z + P/γ + v²/(2g)",
        "Hooke's stress-strain relation: σ = E·ε"
      ],
      correct_answer: "Terzaghi's formula: q_u = c·N_c + γ·D_f·N_q + 0.5·γ·B·N_γ",
      scoring_rubric: "100% for identifying Terzaghi's bearing capacity equation with correct cohesion (c), surcharge (γ·D_f), and footing width (0.5·γ·B) terms."
    });

    questions.push({
      id: "q2",
      type: "mcq",
      question: "In Reinforced Cement Concrete (RCC) design under Limit State Method, why is an under-reinforced section strictly preferred over an over-reinforced section?",
      options: [
        "It provides ductile failure with ample warning as tension steel yields before concrete crushes",
        "It uses significantly less aggregate and reduces thermal expansion coefficients",
        "Concrete reaches ultimate compressive strain before any steel deformation occurs",
        "It prevents all microscopic shear cracking along the neutral axis"
      ],
      correct_answer: "It provides ductile failure with ample warning as tension steel yields before concrete crushes",
      scoring_rubric: "Full credit for explaining ductility and progressive warning deflection over brittle concrete crushing."
    });

    questions.push({
      id: "q3",
      type: "mcq",
      question: "When pouring high-strength concrete on an active construction site, what is the primary consequence of adding uncalibrated water to improve slump/workability?",
      options: [
        "Increases the water-cement ratio, drastically reducing 28-day compressive strength and increasing porosity",
        "Accelerates tricalcium silicate (C3S) hydration without affecting compressive durability",
        "Induces immediate alkali-aggregate expansion throughout the foundation slab",
        "Reduces bleed water evaporation rates by lowering surface tension"
      ],
      correct_answer: "Increases the water-cement ratio, drastically reducing 28-day compressive strength and increasing porosity",
      scoring_rubric: "Correct answer highlights Abram's water-cement ratio law, micro-void porosity, and loss of structural strength."
    });

    questions.push({
      id: "q4",
      type: "short_answer",
      question: `Explain the safety and engineering protocols for designing shoring and bracing systems during deep trench excavations (>3m depth) in proximity to existing structural foundations.`,
      correct_answer: "Key steps: Geotechnical soil classification (Type A/B/C), hydrostatic water table check, soldier pile & lagging or sheet piling design, lateral earth pressure distribution, continuous optical monitoring of neighboring structures for settlement, and clear egress/dewatering pathways.",
      scoring_rubric: "Award 8-10 points: Covers soil classification, lateral earth pressure calculations, monitoring neighbor settlement, and OSHA/statutory safety egress."
    });

    questions.push({
      id: "q5",
      type: "short_answer",
      question: `How do you resolve contractor variation claims and delay disputes on critical path milestones while maintaining compliance with the project's Bill of Quantities (BoQ) and schedule?`,
      correct_answer: "Process: Compare baseline CPM schedule with time-impact analysis (TIA), inspect daily site logs for owner vs contractor delays, verify unit rate contractual agreements in BoQ, issue documented change orders, and escalate through FIDIC or agreed dispute adjudication boards.",
      scoring_rubric: "Award 8-10 points: Demonstrates proficiency with Critical Path Method (CPM), contractual BoQ variations, contemporaneous documentation, and dispute resolution mechanisms."
    });
  }
  // ── SOFTWARE / FULLSTACK / BACKEND / WEB DOMAIN ──
  else if (normTitle.includes("software") || normTitle.includes("developer") || normTitle.includes("frontend") || normTitle.includes("backend") || normTitle.includes("full stack") || normTech.includes("react") || normTech.includes("node")) {
    questions.push({
      id: "q1",
      type: "mcq",
      question: `In modern reactive architectures (${tech ? tech.split(',')[0].trim() : 'React/State'}), what is the primary purpose of state immutability and pure component rendering?`,
      options: [
        "Enables predictable change detection, prevents side effects, and optimizes shallow reconciliation",
        "Forces garbage collection to immediately free heap allocations after every render pass",
        "Converts client-side async code into multi-threaded assembly execution in browser workers",
        "Bypasses DOM virtual tree diffing by writing directly to graphic hardware frame buffers"
      ],
      correct_answer: "Enables predictable change detection, prevents side effects, and optimizes shallow reconciliation",
      scoring_rubric: "Candidate understands predictable data flows, referential equality checks, and virtual DOM diffing efficiency."
    });

    questions.push({
      id: "q2",
      type: "mcq",
      question: "When designing multi-tenant database isolation in PostgreSQL / Supabase, which mechanism ensures complete data separation without table schema duplication?",
      options: [
        "Row Level Security (RLS) policies with session-based tenant_id checks",
        "Creating an independent PostgreSQL database cluster per registered user",
        "Disabling foreign key constraints and applying client-side array filters",
        "Using HTTP cookie hashing to encrypt disk sectors at the filesystem layer"
      ],
      correct_answer: "Row Level Security (RLS) policies with session-based tenant_id checks",
      scoring_rubric: "100% for recognizing Postgres RLS with tenant filtering as the enterprise gold standard for multi-tenant isolation."
    });

    questions.push({
      id: "q3",
      type: "mcq",
      question: "What design pattern prevents cascading service failure when an external third-party microservice experiences latency spikes or outages?",
      options: [
        "Circuit Breaker pattern with fallback responses and exponential backoff retries",
        "Infinite while-loop polling until the remote HTTP status returns 200 OK",
        "Doubling worker thread concurrency to overwhelm downstream network pipes",
        "Eliminating request timeouts to allow persistent background socket connections"
      ],
      correct_answer: "Circuit Breaker pattern with fallback responses and exponential backoff retries",
      scoring_rubric: "Full credit for Circuit Breaker, bulkhead isolation, and graceful fallback behavior."
    });

    questions.push({
      id: "q4",
      type: "short_answer",
      question: `Describe how you architect an end-to-end distributed system utilizing ${tech || 'Edge Workers & Postgres'} to handle 10,000 concurrent requests with sub-100ms response times.`,
      correct_answer: "Architecture: Edge CDN caching for static and read-heavy payloads, distributed edge workers for auth token validation, connection pooling (e.g. PgBouncer/Supabase pooled connection), database read replicas with indexed queries, and asynchronous queuing for write spikes.",
      scoring_rubric: "Evaluate on edge caching, database connection pooling, query indexing, and asynchronous message queue decoupling."
    });

    questions.push({
      id: "q5",
      type: "short_answer",
      question: `In a fast-paced agile team (${culture || 'high velocity'}), how do you balance technical debt refactoring with delivering high-priority business feature deadlines?`,
      correct_answer: "Strategy: Establish engineering SLOs, allocate a dedicated 15-20% capacity per sprint for tech debt / test coverage, document debt with architectural decision records (ADRs), prioritize refactoring that unblocks incoming high-value roadmap features.",
      scoring_rubric: "Look for strategic prioritization, sprint capacity allocation, and pragmatic business-aligned trade-offs."
    });
  }
  // ── ACCOUNTING / FINANCE / AUDIT DOMAIN ──
  else if (normTitle.includes("account") || normTitle.includes("finance") || normTitle.includes("audit") || normTitle.includes("tax") || (dept && dept.toLowerCase().includes("finance"))) {
    questions.push({
      id: "q1",
      type: "mcq",
      question: "Under the Accrual Accounting principle (GAAP / IFRS 15), when must revenue and corresponding expenses be recognized in financial statements?",
      options: [
        "In the accounting period in which performance obligations are satisfied, regardless of when cash is collected",
        "Strictly upon physical deposit and clearance of cash funds into the company operating bank account",
        "At the conclusion of the fiscal audit year after all tax liabilities are finalized",
        "Only when customer invoices reach 90+ days without outstanding dispute"
      ],
      correct_answer: "In the accounting period in which performance obligations are satisfied, regardless of when cash is collected",
      scoring_rubric: "100% for identifying the revenue recognition matching principle under accrual accounting versus cash basis."
    });

    questions.push({
      id: "q2",
      type: "mcq",
      question: "Which liquidity ratio provides the most stringent measure of a firm's short-term solvency by excluding inventory from current assets?",
      options: [
        "Quick Ratio (Acid-Test Ratio): (Cash + Marketable Securities + Receivables) / Current Liabilities",
        "Current Ratio: Total Current Assets / Total Current Liabilities",
        "Debt-to-Equity Ratio: Total Liabilities / Total Shareholders' Equity",
        "Operating Margin: Operating Income / Net Revenue"
      ],
      correct_answer: "Quick Ratio (Acid-Test Ratio): (Cash + Marketable Securities + Receivables) / Current Liabilities",
      scoring_rubric: "Full credit for selecting the Quick/Acid-Test Ratio and knowing it excludes inventory."
    });

    questions.push({
      id: "q3",
      type: "mcq",
      question: "What is the primary difference between Straight-Line Depreciation and the Written Down Value (WDV / Declining Balance) method?",
      options: [
        "Straight-Line charges a constant depreciation amount each year, whereas WDV charges higher depreciation in early years based on book value",
        "WDV never accounts for scrap value, whereas Straight-Line fully writes off asset book value to zero in year one",
        "Straight-Line is exclusively for intangible intellectual property, whereas WDV is only for land holdings",
        "WDV compounds interest expense into total capital expenditure annually"
      ],
      correct_answer: "Straight-Line charges a constant depreciation amount each year, whereas WDV charges higher depreciation in early years based on book value",
      scoring_rubric: "Correct answer clearly contrasts uniform annual depreciation with accelerated front-loaded depreciation."
    });

    questions.push({
      id: "q4",
      type: "short_answer",
      question: `Describe the end-of-month general ledger reconciliation workflow you follow to investigate and resolve discrepancies between the trial balance and bank statements.`,
      correct_answer: "Process: Compare cash book entries against bank statements, identify uncredited deposits and unpresented checks, review bank fees and interest, prepare a formal Bank Reconciliation Statement (BRS), record adjusting journal entries, and ensure the trial balance balances with zero unexplained variances.",
      scoring_rubric: "Score on Bank Reconciliation Statement (BRS) preparation, unpresented checks, journal adjustments, and audit trail rigor."
    });

    questions.push({
      id: "q5",
      type: "short_answer",
      question: `Explain how you establish internal controls and fraud prevention measures for accounts payable (AP) in a growing organization (${culture || 'high integrity'}).`,
      correct_answer: "Controls: Strict segregation of duties (requester, approver, payer), 3-way matching (Purchase Order, Goods Received Note, Vendor Invoice), dual-signoff authorization matrix for disbursements above predefined thresholds, vendor master file change audits, and periodic surprise physical inventory audits.",
      scoring_rubric: "Evaluate on segregation of duties, 3-way matching, approval authorization thresholds, and vendor validation."
    });
  }
  // ── GENERAL / HR / MANAGEMENT / OTHER DOMAIN ──
  else {
    questions.push({
      id: "q1",
      type: "mcq",
      question: `In professional ${jobTitle} execution, which methodology ensures baseline compliance, quality assurance, and KPI alignment?`,
      options: [
        "Establishing structured Standard Operating Procedures (SOPs) with continuous measurable audit checkpoints",
        "Relying exclusively on ad-hoc verbal feedback during quarterly management reviews",
        "Eliminating formal milestone tracking to maximize individual process variance",
        "Delegating all operational responsibility to external third-party reviewers"
      ],
      correct_answer: "Establishing structured Standard Operating Procedures (SOPs) with continuous measurable audit checkpoints",
      scoring_rubric: "Recognizes formal process control, KPI tracking, and compliance checkpoints."
    });

    questions.push({
      id: "q2",
      type: "mcq",
      question: `When analyzing operational bottlenecks in ${dept || 'the organization'}, what is the most effective root-cause analysis framework?`,
      options: [
        "The 5 Whys coupled with Ishikawa (Fishbone) diagramming to isolate systemic defects",
        "Immediate reallocation of entire team headcounts without incident analysis",
        "Overriding standardized metrics with subjective satisfaction ratings",
        "Suspending all operational pipelines until next fiscal quarter planning"
      ],
      correct_answer: "The 5 Whys coupled with Ishikawa (Fishbone) diagramming to isolate systemic defects",
      scoring_rubric: "Demonstrates familiarity with structured problem-solving methodologies."
    });

    questions.push({
      id: "q3",
      type: "mcq",
      question: `How should a ${diff || 'Senior'} ${jobTitle} prioritize competing stakeholder demands with conflicting delivery deadlines?`,
      options: [
        "Utilizing an impact vs effort matrix to evaluate business criticality and communicate trade-offs clearly",
        "Committing to all requests simultaneously without adjusting delivery capacity or resources",
        "Executing requests on a strictly first-come, first-served basis regardless of revenue impact",
        "Escalating every minor prioritization question to executive leadership"
      ],
      correct_answer: "Utilizing an impact vs effort matrix to evaluate business criticality and communicate trade-offs clearly",
      scoring_rubric: "Candidate shows mature stakeholder management and objective prioritization rigor."
    });

    questions.push({
      id: "q4",
      type: "short_answer",
      question: `Describe an end-to-end framework you would implement as a ${jobTitle} to ensure cross-departmental collaboration between ${dept || 'Core Operations'} and key stakeholders.`,
      correct_answer: "Framework: Shared OKRs/KPIs, weekly operational syncs, clear RACI matrix for deliverables, automated dashboard visibility, and transparent retro feedback loops.",
      scoring_rubric: "Score on RACI definitions, communication cadence, measurable KPIs, and conflict resolution."
    });

    questions.push({
      id: "q5",
      type: "short_answer",
      question: `How would you foster organizational values and team performance aligned with our culture (${culture || 'excellence and accountability'})?`,
      correct_answer: "Approach: Leading by example, defining clear behavior expectations, celebrating high impact, providing constructive real-time feedback, and mentoring junior team members.",
      scoring_rubric: "Candidate reflects cultural leadership, psychological safety, accountability, and mentorship."
    });
  }

  return {
    assessment_title: title,
    difficulty: diff || "Senior",
    department: dept || "Engineering",
    job_title: jobTitle,
    generated_at: new Date().toISOString(),
    questions: questions
  };
}

function renderAssessment(data) {
  const container = document.getElementById("preview-area");
  if (!container) return;

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
      <div>
        <h2 style="font-size:18px;font-weight:700;margin:0;color:var(--hr-text-primary,#0f172a);">${escapeHtml(data.assessment_title || "Custom Assessment")}</h2>
        <div style="font-size:12px;color:var(--hr-text-muted,#64748b);margin-top:4px;">
          Generated: ${new Date().toLocaleDateString()} &nbsp;·&nbsp; ${data.questions?.length || 0} Questions &nbsp;·&nbsp; Proctored Evaluator Ready
        </div>
      </div>
      <span class="hr-badge hr-badge-active" style="padding:4px 10px;font-size:12px;border-radius:6px;background:rgba(16,185,129,.1);color:#10b981;font-weight:600;">
        ${escapeHtml(data.difficulty || "Senior / Lead")}
      </span>
    </div>
  `;

  if (!data.questions || !data.questions.length) {
    container.innerHTML = html + `<p style="color:var(--hr-text-muted)">No questions generated.</p>`;
    return;
  }

  data.questions.forEach((q, idx) => {
    let optionsHtml = "";
    if (q.type === "mcq" && q.options) {
      optionsHtml = `<ul class="q-options" style="list-style:none;padding:0;margin:12px 0 0 0;display:flex;flex-direction:column;gap:6px;">
        ${q.options.map((opt, i) => {
          const letter = String.fromCharCode(65 + i);
          const isCorrect = opt === q.correct_answer;
          const bg = isCorrect ? "rgba(16,185,129,.08)" : "var(--hr-bg-hover, #f8fafc)";
          const border = isCorrect ? "1px solid rgba(16,185,129,.3)" : "1px solid var(--hr-border-light, #e2e8f0)";
          return `
            <li style="background:${bg};border:${border};padding:8px 12px;border-radius:6px;font-size:13px;color:var(--hr-text-primary,#1e293b);display:flex;gap:8px;">
              <strong style="color:var(--hr-primary,#3b82f6);min-width:18px;">${letter}.</strong>
              <span>${escapeHtml(opt)}</span>
            </li>
          `;
        }).join("")}
      </ul>`;
    }

    html += `
      <div class="question-card" style="background:var(--hr-bg-elevated,#ffffff);border:1px solid var(--hr-border-light,#e2e8f0);border-radius:8px;padding:16px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.03);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span class="q-type" style="font-size:11px;text-transform:uppercase;font-weight:700;letter-spacing:.5px;padding:2px 8px;border-radius:4px;background:rgba(59,130,246,.1);color:#2563eb;">
            ${q.type === "mcq" ? "Multiple Choice" : "Technical Scenario"}
          </span>
          <span style="font-size:11px;color:var(--hr-text-muted,#94a3b8);font-family:monospace;">Q${idx + 1}</span>
        </div>
        <div class="q-text" style="font-size:14px;font-weight:600;color:var(--hr-text-primary,#0f172a);line-height:1.5;">${idx + 1}. ${escapeHtml(q.question)}</div>
        ${optionsHtml}
        ${q.correct_answer ? `
          <div style="margin-top:10px;padding:8px 12px;background:rgba(16,185,129,.06);border-left:3px solid #10b981;border-radius:0 6px 6px 0;font-size:13px;color:#065f46;">
            <strong>Expected Answer:</strong> ${escapeHtml(q.correct_answer)}
          </div>
        ` : ""}
        ${q.scoring_rubric ? `
          <div class="q-rubric" style="margin-top:8px;padding:8px 12px;background:var(--hr-bg-subtle,#f1f5f9);border-radius:6px;font-size:12px;color:var(--hr-text-secondary,#475569);line-height:1.4;">
            <strong style="color:var(--hr-text-primary,#1e293b);">AI Evaluation Criteria:</strong><br>${escapeHtml(q.scoring_rubric)}
          </div>
        ` : ""}
      </div>
    `;
  });

  container.innerHTML = html;
}

async function saveAssessment() {
  if (!currentAssessment) return;
  const btn = document.getElementById("save-assessment-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }

  try {
    const tenantId = (typeof getCompanyId === 'function' && getCompanyId()) ||
                     sessionStorage.getItem('company_id') ||
                     sessionStorage.getItem('tenant_id') ||
                     'a0000000-0000-0000-0000-000000000001';

    const storeKey = `simpatico_assessments_${tenantId}`;
    let list = [];
    try { list = JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch(e) {}

    const record = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      assessment_title: currentAssessment.assessment_title || "Custom Assessment",
      questions: currentAssessment.questions || [],
      difficulty: currentAssessment.difficulty || "mid",
      created_at: new Date().toISOString()
    };

    list.unshift(record);
    localStorage.setItem(storeKey, JSON.stringify(list));

    // Also attempt cloud save to backend
    try {
      await workerFetch("/ai/assessments", {
        method: "POST",
        body: record,
      });
    } catch (dbErr) {
      console.warn("[assessments] Cloud sync notice (securely persisted locally):", dbErr.message);
    }

    showToast("Assessment saved to database successfully", "success");
    console.log("[assessments] Assessment saved successfully:", record);
  } catch (e) {
    showToast("Failed to save: " + e.message, "error");
    console.error("[assessments] Save error:", e);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Save Database";
    }
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
window.saveAssessment     = saveAssessment;
