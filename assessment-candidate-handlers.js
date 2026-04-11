// ============================================================
// CANDIDATE ASSESSMENT WORKFLOW API HANDLERS
// Add these routes to simpatico-ats.js
// ============================================================

// ROUTES to add to router configuration:
// route('POST',   '/candidates/:id/assessments/:assessmentId/assign',  handleAssignAssessment);
// route('POST',   '/candidates/:id/assessments/:assessmentId/submit',  handleSubmitAssessment);
// route('GET',    '/candidates/:id/assessments',                       handleGetCandidateAssessments);
// route('POST',   '/assessments/:assessmentId/score',                  handleScoreAssessment);

// ───────────────────────────────────────────────────────────
// Assign assessment to candidate
// ───────────────────────────────────────────────────────────
async function handleAssignAssessment(request, env, ctx) {
  requireRole(ctx, 'hr', 'hr_manager', 'company_admin', 'admin', 'superadmin');
  
  const { id: candidateId, assessmentId } = ctx.params;
  const body = await request.json().catch(() => ({}));
  
  if (!candidateId || !assessmentId) {
    return apiResponse({ error: 'candidateId and assessmentId required' }, HTTP.BAD_REQUEST);
  }

  try {
    const res = await sbFetch(env, 'POST', '/rest/v1/candidate_assessments', {
      assessment_id: assessmentId,
      candidate_id: candidateId,
      status: 'assigned',
      company_id: ctx.tenantId,
      responses: {}
    }, false, ctx.tenantId);

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to assign assessment');

    return apiResponse({ assignment: data[0] });
  } catch (error) {
    console.error('[assessment] Assign error:', error.message);
    return apiResponse({ error: error.message }, HTTP.SERVER_ERROR);
  }
}

// ───────────────────────────────────────────────────────────
// Submit candidate responses to assessment
// ───────────────────────────────────────────────────────────
async function handleSubmitAssessment(request, env, ctx) {
  // Candidates can submit their own assessments
  const { id: candidateId, assessmentId } = ctx.params;
  const body = await request.json().catch(() => ({}));
  const { responses } = body;

  if (!candidateId || !assessmentId || !responses) {
    return apiResponse({ error: 'candidateId, assessmentId, and responses required' }, HTTP.BAD_REQUEST);
  }

  try {
    // Fetch the candidate_assessments record
    const getRes = await sbFetch(
      env,
      'GET',
      `/rest/v1/candidate_assessments?assessment_id=eq.${assessmentId}&candidate_id=eq.${candidateId}&select=*`,
      null,
      false,
      ctx.tenantId
    );
    const getDataList = await getRes.json();
    if (!getRes.ok || !getDataList[0]) {
      return apiResponse({ error: 'Assessment assignment not found' }, HTTP.NOT_FOUND);
    }

    const assignment = getDataList[0];

    // Update with responses and mark as completed
    const updateRes = await sbFetch(
      env,
      'PATCH',
      `/rest/v1/candidate_assessments?id=eq.${assignment.id}`,
      {
        responses: responses,
        status: 'completed',
        completed_at: new Date().toISOString()
      },
      false,
      ctx.tenantId
    );

    if (!updateRes.ok) throw new Error('Failed to save responses');

    return apiResponse({
      message: 'Assessment submitted successfully',
      id: assignment.id
    });
  } catch (error) {
    console.error('[assessment] Submit error:', error.message);
    return apiResponse({ error: error.message }, HTTP.SERVER_ERROR);
  }
}

// ───────────────────────────────────────────────────────────
// Get candidate's assessments
// ───────────────────────────────────────────────────────────
async function handleGetCandidateAssessments(request, env, ctx) {
  const { id: candidateId } = ctx.params;
  
  if (!candidateId) {
    return apiResponse({ error: 'candidateId required' }, HTTP.BAD_REQUEST);
  }

  try {
    const res = await sbFetch(
      env,
      'GET',
      `/rest/v1/candidate_assessments?candidate_id=eq.${candidateId}&select=*,assessments(id,assessment_title,difficulty)&order=assigned_at.desc`,
      null,
      false,
      ctx.tenantId
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch assessments');

    return apiResponse({ assessments: data });
  } catch (error) {
    console.error('[assessment] Get assessments error:', error.message);
    return apiResponse({ error: error.message }, HTTP.SERVER_ERROR);
  }
}

// ───────────────────────────────────────────────────────────
// Score candidate's assessment using AI
// ───────────────────────────────────────────────────────────
async function handleScoreAssessment(request, env, ctx) {
  requireRole(ctx, 'hr', 'hr_manager', 'company_admin', 'admin', 'superadmin');
  
  const { assessmentId } = ctx.params;
  const body = await request.json().catch(() => ({}));
  const { candidateId, responses } = body;

  if (!assessmentId || !candidateId || !responses) {
    return apiResponse({ error: 'assessmentId, candidateId, and responses required' }, HTTP.BAD_REQUEST);
  }

  try {
    // Fetch the assessment to get questions and rubrics
    const assessRes = await sbFetch(
      env,
      'GET',
      `/rest/v1/assessments?id=eq.${assessmentId}&select=*`,
      null,
      false,
      ctx.tenantId
    );
    const assessmentData = await assessRes.json();
    if (!assessRes.ok || !assessmentData[0]) {
      return apiResponse({ error: 'Assessment not found' }, HTTP.NOT_FOUND);
    }

    const assessment = assessmentData[0];
    const questions = assessment.questions || [];

    // Build AI scoring prompt
    const scoringPrompt = `Score the following assessment responses.

Assessment: ${assessment.assessment_title}

Questions and Rubrics:
${questions.map((q, idx) => `
Q${idx + 1}: ${q.question}
Type: ${q.type}
Correct Answer: ${q.correct_answer}
Scoring Rubric: ${q.scoring_rubric}
Candidate Answer: ${responses[q.id] || 'Not answered'}
`).join('\n')}

For each question, provide:
1. Is the answer correct? (yes/no)
2. Score (0-100)
3. Brief feedback

Then provide a total score (0-100) for the entire assessment.

Return as JSON:
{
  "question_scores": [
    { "question_id": "q1", "correct": true, "score": 100, "feedback": "..." }
  ],
  "total_score": 85,
  "summary": "Overall assessment summary"
}`;

    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: scoringPrompt }],
      max_tokens: 1500
    });

    if (!aiResponse?.response) {
      throw new Error('AI scoring failed');
    }

    // Parse AI scoring response
    let scoreResponse = aiResponse.response.trim()
      .replace(/^```json\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    let scores;
    try {
      scores = JSON.parse(scoreResponse);
    } catch (e) {
      console.error('[assessment] Score parsing failed:', e.message);
      throw new Error('Failed to parse AI scoring: ' + e.message);
    }

    // Update candidate_assessments with score
    const updateRes = await sbFetch(
      env,
      'PATCH',
      `/rest/v1/candidate_assessments?assessment_id=eq.${assessmentId}&candidate_id=eq.${candidateId}`,
      {
        score: scores.total_score,
        status: 'scored'
      },
      false,
      ctx.tenantId
    );

    if (!updateRes.ok) throw new Error('Failed to save score');

    return apiResponse({
      score: scores.total_score,
      feedback: scores.summary,
      details: scores.question_scores
    });
  } catch (error) {
    console.error('[assessment] Scoring error:', error.message);
    return apiResponse({ error: error.message }, HTTP.SERVER_ERROR);
  }
}
