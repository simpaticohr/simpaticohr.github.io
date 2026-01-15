export function createInterview(profile = {}) {
  return {
    topics: ["experience", "skills", "project", "impact"],
    topicIndex: 0,
    depth: 0,
    maxDepth: 2,
    coveredIntents: new Set(),
    completed: false,
  };
}

export function analyzeAnswer(answer = "") {
  const t = answer.toLowerCase();
  const words = answer.split(" ").length;

  return {
    lengthOK: words > 25,
    ownership: /\b(i|my|me)\b/.test(t),
    example: /(example|when|project|situation)/.test(t),
    impact: /(result|impact|improved|increased|learned)/.test(t),
  };
}

export function decideNextQuestion(answer, state, profile = {}) {
  const s = analyzeAnswer(answer);

  if (!s.lengthOK && !state.coveredIntents.has("detail")) {
    state.coveredIntents.add("detail");
    return "Can you explain that in more detail?";
  }

  if (!s.ownership && !state.coveredIntents.has("ownership")) {
    state.coveredIntents.add("ownership");
    return "What was your personal responsibility there?";
  }

  if (!s.example && !state.coveredIntents.has("example")) {
    state.coveredIntents.add("example");
    return "Can you give me a real example?";
  }

  if (!s.impact && !state.coveredIntents.has("impact")) {
    state.coveredIntents.add("impact");
    return "What was the outcome or impact?";
  }

  if (state.depth < state.maxDepth) {
    state.depth++;
    return "What challenges did you face during this?";
  }

  // Move to next topic
  state.coveredIntents.clear();
  state.depth = 0;
  state.topicIndex++;

  if (state.topicIndex >= state.topics.length) {
    state.completed = true;
    return "Thank you. The interview is complete.";
  }

  return nextTopicQuestion(state.topics[state.topicIndex], profile);
}

function nextTopicQuestion(topic, profile) {
  if (topic === "experience")
    return "Tell me about your professional background.";

  if (topic === "skills")
    return `Which technical skills do you use most in your work?`;

  if (topic === "project")
    return "Tell me about a challenging project you worked on.";

  if (topic === "impact")
    return "What measurable impact did your work create?";

  return "Please continue.";
}
