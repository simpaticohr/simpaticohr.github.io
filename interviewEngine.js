// interviewEngine.js

export function createInterview(resume) {
  return {
    profile: resume,
    topics: buildTopics(resume),
    topicIndex: 0,
    depth: 0,
    maxDepth: 2,
    coveredIntents: new Set(),
    completed: false
  };
}

function buildTopics(resume) {
  const topics = [];

  if (resume.role) topics.push({ type: "role" });
  if (resume.skills?.length) topics.push({ type: "skill", value: resume.skills[0] });
  if (resume.projects?.length) topics.push({ type: "project", value: resume.projects[0] });
  topics.push({ type: "impact" });

  return topics;
}

export function decideNextQuestion(answer, state) {
  if (state.completed) {
    return { question: "The interview is complete. Thank you.", done: true };
  }

  const signals = analyze(answer);

  if (!signals.detail && !state.coveredIntents.has("detail")) {
    state.coveredIntents.add("detail");
    return ask("Can you explain that in more detail?");
  }

  if (!signals.ownership && !state.coveredIntents.has("ownership")) {
    state.coveredIntents.add("ownership");
    return ask("What was your personal responsibility there?");
  }

  if (!signals.example && !state.coveredIntents.has("example")) {
    state.coveredIntents.add("example");
    return ask("Can you give a real example?");
  }

  if (!signals.impact && !state.coveredIntents.has("impact")) {
    state.coveredIntents.add("impact");
    return ask("What was the outcome or impact?");
  }

  if (state.depth < state.maxDepth) {
    state.depth++;
    return ask("What challenges did you face?");
  }

  // move to next topic
  state.coveredIntents.clear();
  state.depth = 0;
  state.topicIndex++;

  if (state.topicIndex >= state.topics.length) {
    state.completed = true;
    return { question: "Thank you. The interview is complete.", done: true };
  }

  return ask(generateTopicQuestion(state.topics[state.topicIndex], state.profile));
}

function analyze(text = "") {
  const t = text.toLowerCase();
  return {
    detail: text.split(" ").length > 25,
    ownership: /\b(i|my|me)\b/.test(t),
    example: /(example|when|project|situation)/.test(t),
    impact: /(impact|result|improve|increase|reduce|learned)/.test(t)
  };
}

function generateTopicQuestion(topic, profile) {
  switch (topic.type) {
    case "role":
      return `You are currently working as a ${profile.role}. What are your core responsibilities?`;

    case "skill":
      return `Your resume mentions ${topic.value}. How have you used it in real work?`;

    case "project":
      return `Tell me about the project ${topic.value}. What was your role?`;

    case "impact":
      return "What measurable impact did your work create?";

    default:
      return "Please tell me more.";
  }
}

function ask(q) {
  return { question: q, done: false };
}
