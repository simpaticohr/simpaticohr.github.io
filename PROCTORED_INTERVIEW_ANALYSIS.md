# Proctored Interview — Root Cause Analysis
## Issues: (1) Questions unrelated to the job position, (2) No follow-up questions

**Scope:** `interview/proctored-room.html` (candidate room, ~6,130 lines) + `backend/simpatico-ats.js` (`/ai/interview-question`).
**Verdict:** The backend is healthy — it passes the frontend's `messages` (system prompt + history) straight to the LLM (`runLLM`, handler at line 5122). **All root causes are in the frontend engine.**

---

## Data flow (how a question is produced)

1. `init()` fetches the interview row by token (line 3248), then *optionally* fetches the job row (line 3308) and resume (line 3324).
2. Engine context (`engine.jobTitle`, `skillsToProbe`, `jobContext`, `interviewRound`, `level`, `maxQuestions`) is populated **only** inside `if (state.meta.job)` (lines 3336–3381).
3. Each turn: `submitVoiceAnswer()` → `analyzeAnswer()` → `engine.generateNextQuestion()` (line 2914) → builds `buildSystemPrompt()` + mapped history → POST `/ai/interview-question` → LLM text → cleanup regexes → spoken via TTS.
4. On **any** LLM/API failure → `getFallbackQuestion()` (line 3096).
5. Duplex (Gemini Live) path: `submitVoiceAnswerDuplex()` (line 6057) sends control directives over the WebSocket.

---

## Issue 1 — Questions unrelated to the job position

### R1. Engine context is never set when the job fetch fails or `job_id` is NULL (PRIMARY)
`interview/proctored-room.html:3308–3321, 3336–3384`

- The job fetch only runs `if (state.meta.interview?.job_id)`. If the interview was scheduled without a linked job, or the `jobs`/`job_listings` query fails/returns empty, execution drops to:
  ```js
  } else if (state.meta.interview) {
      document.getElementById('sjcTitle').textContent = state.meta.interview.job_title || 'Interview';
  }
  ```
  This branch updates the **UI only**. It never copies `state.meta.interview.job_title` (which the interview row *does* have) into `engine.jobTitle`, and never sets `skillsToProbe`, `jobContext`, `interviewRound`, `level`, or `maxQuestions`.
- Result: the system prompt is built with `Role: ""`, `## JOB DESCRIPTION → "Assess competencies relevant to this role."`, and the generic skills fallback. The LLM has **nothing to anchor to**, so it invents generic questions.
- The failure is **silent** — only `console.warn('Job fetch error')` (line 3320). No retry, no fallback, no telemetry.

### R2. Empty job title ⇒ round style defaults to "technical" (engineering persona for non-tech roles)
`proctored-room.html:2711–2739`

`getRoundStyle()`: with `interviewRound = ''` and `jobTitle = ''`, every keyword check fails and it falls through to `return 'technical'`. The system prompt then uses the technical persona/rules and `skillsFallback: 'General technical and problem-solving skills'` — so a receptionist/sales/HR candidate gets engineering-flavored questions.

### R3. Hard-coded engineering fallback pool fires for ANY role on ANY API error
`proctored-room.html:3096–3114`

`getFallbackQuestion()` contains only software questions ("ensure code quality… in production", "structure your solution to handle edge cases", "architectural choices", "design principle or pattern"). There is no non-tech pool despite `isNonTech` logic existing elsewhere. Any rate-limit/BYOK failure/timeout (the backend has per-token caps of 60/hr and per-IP caps of 20/hr — `simpatico-ats.js:5137–5139`) instantly produces totally unrelated questions for non-technical roles.

### R4. Contributing: resume context also silently missing
`proctored-room.html:3324–3333` — resume lookup depends on `candidate_email` matching a `job_applications` row; failure ⇒ `## CANDIDATE BACKGROUND → "Discover their background through conversation."`, further genericizing questions.

---

## Issue 2 — No follow-up questions

### F1. `getPhaseInstructions()` is computed and then thrown away (PRIMARY — dead code)
`proctored-room.html:2926`

```js
const phaseInstructions = this.getPhaseInstructions();   // ← computed
...
const messages = [
    { role: 'system', content: this.buildSystemPrompt() },
    ...historyMapped                                     // ← never inserted
];
```

`getPhaseInstructions()` (lines 3039–3094) contains the **entire adaptive follow-up brain**: weak-skill ⇒ simpler question, strong-skill ⇒ go deeper, "transition naturally from their last answer and probe \<nextSkill\>", scenario/behavioral framing. **None of it ever reaches the LLM.** The only per-turn guidance is the generic trailer appended to the last user message (line 2938): *"…ask ONE relevant follow-up question."* — with no information about *what* to follow up on.

### F2. The system prompt actively discourages follow-ups (contradictory mandates)
`proctored-room.html:2890–2905`

```
## PREVIOUSLY ASKED QUESTIONS (STRICT DO NOT REPEAT LIST)
## CRITICAL ANTI-REPETITION MANDATE
- Every question MUST explore a NEW topic, technical concept, or scenario.
- Build directly on the candidate's LAST response with a specific follow-up.
```

"Every question MUST explore a NEW topic" directly contradicts "build on the last response with a follow-up". LLMs resolve this by hopping to a new topic each turn — perceived as scattered, unrelated questions with zero drill-down. (Rules like "Strong answer: go DEEPER" exist in the round config, but the anti-repetition mandate is emphasized more strongly.)

### F3. Skill tracking is mechanical, so "covered/uncovered" state is noise
`proctored-room.html:3193–3203, 4522–4524`

- `analyzeAnswer()` only detects a skill if the candidate literally utters its name (`lower.includes(variant)`).
- Otherwise the turn is booked against a **positional** skill (`skillsToProbe[questionCount-1]`), regardless of what was actually discussed.
- `recordSkillAssessment()` sets `depth ≥ 1` after a single turn, so `updatePhase()` considers the skill "covered" and marches down the list — the engine can never genuinely re-probe a weak area.

### F4. Duplex (Gemini Live) path is broken three ways
`proctored-room.html:6094–6103, 6096/6102`

1. **Duplicated dispatch block** — the identical `if (…) { sendDuplexControlMessage(…) }` appears twice (copy-paste), so every candidate answer is injected into Gemini **twice per turn**, confusing the model and derailing the dialogue.
2. **`this.jobTitle` inside a standalone function** — `submitVoiceAnswerDuplex` is a plain function in a sloppy-mode `<script>` (line 2558), so `this` = `window` and `this.jobTitle` = `undefined` → every directive says "related to **the role**" — job context never included even when loaded.
3. With empty `skillsToProbe`, `nextSkill` degrades to `'your background'`.

### F5. Minor: cleanup regexes strip the conversational glue
`proctored-room.html:2981–2987` — acknowledgements the LLM generates to react to the answer ("That's a great point about X…") are regex-stripped, so transitions feel abrupt and disconnected even when the model did react.

---

## Recommended fixes (priority order)

| # | Fix | Where |
|---|-----|-------|
| 1 | **Insert `phaseInstructions` into the request** — append it to the interviewer directive (or as a system message) in `generateNextQuestion()`. Single-line fix restoring the whole follow-up brain. | line 2926–2955 |
| 2 | **Populate the engine from the interview row when the job fetch fails**: `engine.jobTitle = state.meta.interview.job_title`, parse `state.meta.interview.skills`/round/`question_count` if present; also fall back to these when `job_id` is NULL. Surface a console + telemetry warning. | lines 3382–3384 |
| 3 | **Resolve the prompt contradiction** — replace "Every question MUST explore a NEW topic" with explicit follow-up policy, e.g. "Prefer 1–2 follow-ups on the current topic before moving on; only switch topics when the current one is exhausted." | lines 2902–2905 |
| 4 | **Delete the duplicated duplex dispatch block** and change `this.jobTitle` → `engine.jobTitle`. | lines 6099–6103, 6096 |
| 5 | **Role-aware fallback pools** — add a non-technical fallback set (behavioral/situational, keyed off `getRoundStyle()`/`isNonTech`) and pick pool accordingly. | lines 3096–3114 |
| 6 | **Default round style from the interview row** — use `interview.interview_level` even without a job row; if both empty, default to `'hr_behavioral'` (safe generic) instead of `'technical'`. | lines 2711–2739 |
| 7 | **Honest skill coverage** — don't record a positional skill when nothing was detected; keep a per-skill turn counter and allow re-probing weak skills (`score < 40`) instead of marking covered after one turn. | lines 4522–4524, 3116–3127 |
| 8 | **Soften cleanup regexes** — only strip openers when they are the *entire* first clause and contain no answer-specific content, so acknowledgements that reference the candidate's points survive. | lines 2985–2986 |

**Expected impact:** Fix #1 alone restores contextual follow-ups; #2 + #3 eliminate unrelated questions whenever job data is missing; #4 repairs the live-voice path; #5–#6 remove the hard-coded engineering bias.
