// server/ai-interview-pipeline.js
// Production STT -> LLM -> TTS -> Avatar Pipeline Broker
// Standardized multi-provider pipeline for AI Technical Interviews.

'use strict';

const express = require('express');
const crypto  = require('crypto');

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '512kb' }));

const C = {
  port: parseInt(process.env.PIPELINE_PORT || '8791', 10),
  geminiKey: process.env.GEMINI_API_KEY || '',
  openaiKey: process.env.OPENAI_API_KEY || '',
  elevenLabsKey: process.env.ELEVENLABS_API_KEY || '',
  deepgramKey: process.env.DEEPGRAM_API_KEY || '',
};

// CORS
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o) res.set('Access-Control-Allow-Origin', o);
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-AI-Provider, X-AI-Key, X-ElevenLabs-Key');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Helper for HTTP requests
async function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ac.signal });
    clearTimeout(timer);
    return r;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. LLM BRAIN (Gemini / OpenAI / Fallback Rubric Generator)
// ─────────────────────────────────────────────────────────────────────────────
async function runLlmBrain({ role, level, questionIndex, candidateAnswer, history, apiKey, provider }) {
  const activeKey = apiKey || C.geminiKey || C.openaiKey;

  const systemPrompt = `You are a Senior Technical AI Interviewer conducting a technical evaluation for the role of ${role || 'Software Engineer'} (${level || 'Mid-Level'}).
Your goal:
1. Evaluate candidate's answer for technical depth, trade-offs, edge cases, and correctness.
2. Formulate the next concise technical follow-up or next question.
3. Keep responses professional, warm, engaging, and directly conversational (under 4 sentences).
4. Include semantic emotion/gesture tags like [[gesture:nod]] or [[emotion:attentive]] at natural points.`;

  const userPrompt = `Question #${(questionIndex || 0) + 1} Candidate Answer: "${candidateAnswer || 'Hello, I am ready for the interview.'}"
Conversation History: ${JSON.stringify(history || [])}
Provide your direct verbal response as the interviewer.`;

  // Call Gemini if key available or provider is gemini
  if (activeKey && (provider === 'gemini' || activeKey.startsWith('AIza'))) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${activeKey}`;
      const r = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
          ]
        })
      });
      if (r.ok) {
        const resData = await r.json();
        const text = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      }
    } catch (e) {
      console.warn('[Pipeline LLM] Gemini call failed:', e.message);
    }
  }

  // Fallback Rule Engine if API key is not available
  const defaultQuestions = [
    "Thank you for introducing yourself! [[gesture:nod]] Let's start with system architecture. How do you approach designing a high-throughput, fault-tolerant REST API?",
    "That makes sense. [[emotion:curious]] How do you handle database connection pooling and query optimization under heavy load?",
    "Great explanation. [[gesture:explain]] When dealing with distributed state, how do you enforce eventual consistency vs strong consistency?",
    "Excellent points. [[emotion:attentive]] What approach do you take for automated testing and CI/CD deployment safety?",
    "Awesome job completing the technical loop! [[gesture:nod]] Do you have any questions about the team or role engineering standards?"
  ];

  return defaultQuestions[questionIndex % defaultQuestions.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. TTS GENERATOR (ElevenLabs / Edge-TTS / Free Timings Generator)
// ─────────────────────────────────────────────────────────────────────────────
async function runTtsGenerator(text, elevenLabsKey) {
  const activeKey = elevenLabsKey || C.elevenLabsKey;

  // ElevenLabs TTS if key provided
  if (activeKey) {
    try {
      const voiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel / Standard voice
      const r = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
        method: 'POST',
        headers: {
          'xi-api-key': activeKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text.replace(/\[\[.*?\]\]/g, ''),
          model_id: 'eleven_turbo_v2_5'
        })
      });
      if (r.ok) {
        const data = await r.json();
        return {
          audioB64: data.audio_base64,
          words: data.alignment ? data.alignment.characters : null
        };
      }
    } catch (e) {
      console.warn('[Pipeline TTS] ElevenLabs call note:', e.message);
    }
  }

  // Fallback: Proportional Word Timings (proportional alignment)
  const cleanText = text.replace(/\[\[.*?\]\]/g, '').trim();
  const words = cleanText.split(/\s+/).filter(Boolean);
  const durEst = Math.max(0.4, words.length * 0.32);
  let t = 0;
  const wordTimings = words.map(w => {
    const d = (w.length / Math.max(1, cleanText.length)) * durEst * 1000;
    const item = { w, start: Math.round(t * 1000), dur: Math.round(d) };
    t += (d / 1000) + 0.05;
    return item;
  });

  return {
    text: cleanText,
    words: wordTimings
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE API ROUTE: /api/pipeline/turn
// STT -> LLM Brain -> TTS -> Word Timings -> Avatar Cues
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/pipeline/turn', async (req, res) => {
  const { role, level, questionIndex, candidateAnswer, history } = req.body || {};
  const aiKey = req.headers['x-ai-key'] || req.body?.apiKey || C.geminiKey;
  const aiProvider = req.headers['x-ai-provider'] || 'gemini';
  const elevenKey = req.headers['x-elevenlabs-key'] || C.elevenLabsKey;

  try {
    // 1. LLM Brain Execution
    const llmResponse = await runLlmBrain({
      role, level, questionIndex, candidateAnswer, history,
      apiKey: aiKey, provider: aiProvider
    });

    // 2. TTS & Word Alignment Generation
    const ttsResult = await runTtsGenerator(llmResponse, elevenKey);

    res.json({
      ok: true,
      text: llmResponse,
      cleanText: ttsResult.text || llmResponse.replace(/\[\[.*?\]\]/g, ''),
      words: ttsResult.words || [],
      audioB64: ttsResult.audioB64 || null,
      questionIndex: (questionIndex || 0) + 1
    });
  } catch (e) {
    console.error('[Pipeline Engine Error]:', e);
    res.status(500).json({ error: 'Pipeline turn execution error', detail: e.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok', engine: 'AI Technical Interview Production Pipeline' }));

const server = app.listen(C.port, () => {
  console.log(`[AI Pipeline Engine] Running on port ${C.port}`);
});

module.exports = app;
