<script>
/* ================= PDF CONFIG ================= */
const pdfjsLib = window["pdfjs-dist/build/pdf"];
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* ================= RESUME PARSER (RAW TEXT) ================= */
async function parseResume(file) {
  let text = "";

  if (file.type.includes("pdf")) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(buffer).promise;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(" ") + " ";
    }
  } else {
    text = await file.text();
  }

  return text.replace(/\s+/g, " ").trim();
}

/* ================= INTERVIEW ENGINE (CORE BRAIN) ================= */
function createInterview(resumeText) {
  return {
    resumeText,
    step: 0,
    depth: 0,
    score: {
      clarity: 0,
      detail: 0,
      ownership: 0,
      impact: 0
    },
    questions: [
      "Tell me about yourself based on your resume.",
      "Describe your most recent role and responsibilities.",
      "Which skills from your resume did you use most frequently?",
      "Explain a challenging task or project you worked on.",
      "What measurable impact or results did your work create?"
    ],
    completed: false
  };
}

/* ================= ANSWER ANALYSIS ================= */
function analyzeAnswer(answer) {
  const text = answer.toLowerCase();
  const words = answer.trim().split(/\s+/).length;

  return {
    clarity: words >= 20,
    detail: words >= 35,
    ownership: /\b(i|my|me|we)\b/.test(text),
    impact: /(impact|result|improve|increase|reduce|achieve|learn)/.test(text)
  };
}

/* ================= DECISION ENGINE ================= */
function decideNext(answer, interview) {
  const a = analyzeAnswer(answer);

  if (a.clarity) interview.score.clarity++;
  if (a.detail) interview.score.detail++;
  if (a.ownership) interview.score.ownership++;
  if (a.impact) interview.score.impact++;

  // 🔁 Follow-up if answer is weak
  if (!a.detail && interview.depth === 0) {
    interview.depth++;
    return "Can you explain that in more detail with a real example?";
  }

  if (!a.impact && interview.depth === 0) {
    interview.depth++;
    return "What was the outcome or impact of this work?";
  }

  interview.depth = 0;
  interview.step++;

  if (interview.step >= interview.questions.length) {
    interview.completed = true;
    return null;
  }

  return interview.questions[interview.step];
}

/* ================= UI FLOW ================= */
const resumeInput = document.getElementById("resumeInput");
const statusEl = document.getElementById("status");
const questionEl = document.getElementById("question");
const answerEl = document.getElementById("answer");
const submitBtn = document.getElementById("submitBtn");

let interview = null;

resumeInput.addEventListener("change", async () => {
  if (!resumeInput.files.length) return;

  statusEl.innerText = "Parsing resume...";
  questionEl.innerText = "";
  answerEl.value = "";
  answerEl.disabled = true;
  submitBtn.disabled = true;

  const resumeText = await parseResume(resumeInput.files[0]);
  interview = createInterview(resumeText);

  questionEl.innerText = interview.questions[0];
  statusEl.innerText = "Interview started";
  answerEl.disabled = false;
  submitBtn.disabled = false;
});

submitBtn.onclick = () => {
  if (!interview) return;

  const answer = answerEl.value.trim();
  if (!answer) return;

  answerEl.value = "";

  const next = decideNext(answer, interview);

  if (!next) {
    finishInterview();
    return;
  }

  questionEl.innerText = next;
};

/* ================= FINAL RESULT ================= */
function finishInterview() {
  answerEl.disabled = true;
  submitBtn.disabled = true;

  const total =
    interview.score.clarity +
    interview.score.detail +
    interview.score.ownership +
    interview.score.impact;

  const percent = Math.min(100, Math.round((total / 12) * 100));

  questionEl.innerHTML = `
    <strong>Interview completed</strong><br><br>
    Score: <strong>${percent}%</strong><br>
    ${percent >= 70 ? "Strong candidate" : "Needs improvement"}
  `;

  statusEl.innerText = "Evaluation completed";
}
</script>
