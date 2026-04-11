// ============================================================
// IMPROVED ASSESSMENT GENERATION ERROR HANDLING
// Replace the handleGenerateAssessment function in simpatico-ats.js
// with this version that has better JSON parsing & validation
// ============================================================

async function handleGenerateAssessment(request, env, ctx) {
  requireRole(ctx, 'hr', 'admin', 'superadmin');
  
  const body = await request.json().catch(() => ({}));
  const { job_title, department, tech_stack, culture, difficulty, question_count = 5 } = body;
  
  if (!job_title) {
    return apiResponse(
      { error: 'job_title is required' },
      HTTP.UNPROCESSABLE,
      { code: 'VALIDATION_ERROR' }
    );
  }

  try {
    // Build detailed prompt for AI
    const prompt = `Design a highly specific, proctored assessment quiz for a ${difficulty || 'mid-level'} ${job_title}${department ? ` in ${department}` : ''}${tech_stack ? ` specializing in ${tech_stack}` : ''}.

Generate ${question_count} technical questions that:
1. Accurately assess core competencies for this role
2. Include both multiple-choice (MCQ) and short-answer types
3. Have clear correct answers and grading rubrics for AI evaluation
4. Test real-world problem-solving, not just theory

${culture ? `Company culture: ${culture}. Incorporate questions that assess alignment with our values.` : ''}

CRITICAL: Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "assessment_title": "string",
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correct_answer": "A",
      "scoring_rubric": "How to grade this question"
    }
  ]
}`;

    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000
    });

    if (!aiResponse?.response) {
      throw new Error('AI returned empty response');
    }

    // Parse AI response - remove markdown code blocks if present
    let responseText = aiResponse.response.trim();
    responseText = responseText
      .replace(/^```json\n?/, '')
      .replace(/\n?```$/, '')
      .replace(/^```\n?/, '')
      .trim();

    // Attempt to parse JSON
    let assessment;
    try {
      assessment = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[assessment] JSON parse failed:', {
        error: parseError.message,
        rawResponse: responseText.substring(0, 200)
      });
      throw new Error(`AI returned invalid JSON: ${parseError.message}. Please try again.`);
    }

    // Validate assessment structure
    if (!assessment.assessment_title || typeof assessment.assessment_title !== 'string') {
      throw new Error('Assessment missing or invalid title field');
    }

    if (!Array.isArray(assessment.questions) || assessment.questions.length === 0) {
      throw new Error(`Assessment has no questions (got ${assessment.questions?.length || 0}). AI may not have generated properly.`);
    }

    // Validate each question
    assessment.questions.forEach((q, idx) => {
      if (!q.question || !q.type) {
        throw new Error(`Question ${idx + 1} missing required fields (question, type)`);
      }
      if (q.type === 'mcq' && (!Array.isArray(q.options) || q.options.length === 0)) {
        throw new Error(`MCQ question ${idx + 1} has no options`);
      }
      if (!q.correct_answer) {
        throw new Error(`Question ${idx + 1} missing correct_answer`);
      }
    });

    return apiResponse({
      assessment,
      generated_at: new Date().toISOString(),
      question_count: assessment.questions.length
    });

  } catch (error) {
    console.error('[assessment] Generation error:', {
      job_title,
      error: error.message,
      timestamp: new Date().toISOString()
    });

    // Distinguish between validation, AI, and system errors
    if (error.message.includes('JSON')) {
      return apiResponse(
        { error: `Assessment generation failed: ${error.message}` },
        HTTP.SERVER_ERROR,
        { code: 'AI_PARSE_ERROR', retryable: true }
      );
    }

    if (error.message.includes('missing') || error.message.includes('invalid')) {
      return apiResponse(
        { error: `Invalid assessment structure: ${error.message}` },
        HTTP.SERVER_ERROR,
        { code: 'ASSESSMENT_VALIDATION_ERROR', retryable: true }
      );
    }

    return apiResponse(
      { error: error.message || 'Assessment generation failed' },
      HTTP.SERVER_ERROR,
      { code: 'AI_SERVICE_ERROR' }
    );
  }
}
