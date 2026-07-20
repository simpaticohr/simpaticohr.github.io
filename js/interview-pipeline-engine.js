/**
 * InterviewPipelineEngine v1.0 — Production STT -> LLM -> TTS -> Avatar Controller
 *
 * Coordinates turn execution:
 *   1. Candidate Audio / Speech Input (Web Speech API / Deepgram STT)
 *   2. Technical LLM Engine (Gemini / GPT-4o / Claude)
 *   3. Audio TTS & Word Alignment (ElevenLabs / Edge-TTS)
 *   4. Photoreal Avatar WebRTC & Lip-Sync (HyperRealRenderer / DuixRenderer)
 *   5. Real-Time Low Latency WebRTC Delivery to Browser
 */
const InterviewPipelineEngine = (function () {
  'use strict';

  let currentQuestionIndex = 0;
  let conversationHistory = [];
  let currentRole = 'Software Engineer';
  let currentLevel = 'Senior';
  let isTurnActive = false;
  let recognition = null;

  const PIPELINE_ENDPOINTS = [
    '/api/pipeline/turn',
    'http://localhost:8791/api/pipeline/turn',
    'http://127.0.0.1:8791/api/pipeline/turn'
  ];

  // Helper for fetch with endpoint fallback
  async function postPipelineTurn(payload) {
    const aiKey = localStorage.getItem('byok_key') || localStorage.getItem('evalis_byok_gemini_key') || '';
    const elevenKey = localStorage.getItem('evalis_elevenlabs_key') || '';

    let lastErr;
    for (const ep of PIPELINE_ENDPOINTS) {
      try {
        const r = await fetch(ep, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-AI-Provider': 'gemini',
            'X-AI-Key': aiKey,
            'X-ElevenLabs-Key': elevenKey
          },
          body: JSON.stringify(payload)
        });
        if (r.ok) return await r.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error('Pipeline endpoint error: ' + (lastErr ? lastErr.message : 'unreachable'));
  }

  return {
    init(config = {}) {
      currentRole = config.role || 'Software Engineer';
      currentLevel = config.level || 'Senior';
      currentQuestionIndex = 0;
      conversationHistory = [];
      isTurnActive = false;
      console.log('[PipelineEngine] Initialized for role:', currentRole, 'level:', currentLevel);
    },

    /**
     * Execute a turn: sends candidate input, runs LLM & TTS, drives avatar speech & captions
     */
    async executeTurn(candidateSpeechText, rendererInstance) {
      if (isTurnActive) return;
      isTurnActive = true;

      const renderer = rendererInstance || (typeof HyperRealRenderer !== 'undefined' ? HyperRealRenderer : window.aiAvatar);

      try {
        // Set avatar state to thinking while LLM processes
        if (renderer && typeof renderer.onState === 'function') {
          renderer.onState('thinking');
        }

        const payload = {
          role: currentRole,
          level: currentLevel,
          questionIndex: currentQuestionIndex,
          candidateAnswer: candidateSpeechText || '',
          history: conversationHistory
        };

        const result = await postPipelineTurn(payload);

        if (result && result.text) {
          // Update history
          if (candidateSpeechText) {
            conversationHistory.push({ role: 'user', content: candidateSpeechText });
          }
          conversationHistory.push({ role: 'assistant', content: result.text });
          currentQuestionIndex = result.questionIndex || (currentQuestionIndex + 1);

          // Put renderer in speaking state
          if (renderer && typeof renderer.onState === 'function') {
            renderer.onState('speaking');
          }

          // Trigger word captions
          if (renderer && typeof renderer.setCaptions === 'function') {
            renderer.setCaptions(result.cleanText || result.text, result.words || []);
          }

          // Speak text through renderer
          if (renderer && typeof renderer.say === 'function') {
            await renderer.say(result.text);
          }
        }
      } catch (e) {
        console.warn('[PipelineEngine] Turn execution note:', e.message);
      } finally {
        isTurnActive = false;
        if (renderer && typeof renderer.onState === 'function') {
          renderer.onState('listening');
        }
      }
    },

    /**
     * Trigger candidate barge-in interrupt
     */
    interrupt(rendererInstance) {
      const renderer = rendererInstance || (typeof HyperRealRenderer !== 'undefined' ? HyperRealRenderer : null);
      if (renderer && typeof renderer.onState === 'function') {
        renderer.onState('listening');
      }
      isTurnActive = false;
    },

    getQuestionIndex() { return currentQuestionIndex; },
    getHistory() { return conversationHistory; }
  };
})();
