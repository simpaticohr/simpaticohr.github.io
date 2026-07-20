/**
 * DuixRenderer — drop-in renderer adapter for hyper-realistic video avatar.
 *
 * Architecture:
 *   speaking  → play pre-rendered / live DuiX clips from a queue (lip-sync baked in).
 *   otherwise → freeze DuiX, run the idle-life overlay on top of the last frame.
 *
 * The idle-life overlay is the free trick DuiX alone can't do:
 *   - DuiX freezes when no audio is playing (no lip movement = dead face)
 *   - This overlay drives breathing, blinking, nod (listening), gaze-aversion (thinking)
 *     as CSS transforms + canvas ON TOP of the frozen last DuiX frame
 *   - Result: the avatar looks alive even when not speaking
 *
 * Conforms to the existing Renderer interface so Brain / Choreographer / proctoring
 * are completely untouched.
 */
const DuixRenderer = (function () {
  'use strict';

  // ── Config ──
  const DUIX_API = '/api/duix';
  const TTS_API = '/api/tts-free';

  // ── DOM refs (resolved lazily) ──
  let video = null;
  let wrap = null;        // breathing + posture wrapper
  let lid = null;         // blink overlay
  let captionEl = null;   // word-highlighted caption bar
  let stageEl = null;     // avatar-stage container

  // ── State ──
  let mode = 'duix';
  let currentState = 'idle';   // idle | speaking | listening | thinking | processing
  let queue = [];              // clip URLs queued for playback
  let playing = false;
  let cache = new Map();       // text → { url, words } (speculative cache)
  let destroyed = false;

  // ── Idle-life overlay state ──
  let blinkProgress = 0;
  let blinkPeak = 0;
  let nextBlinkTime = 0;
  let overlayT0 = 0;
  let overlayRunning = false;

  // ── Caption state ──
  let captionWords = [];
  let captionAudioStart = 0;
  let captionAnimId = null;

  // ────────────────────────────────────────────────────────────────────
  // DOM helpers
  // ────────────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  function resolveRefs() {
    video = $('duixVideo');
    wrap = $('duixWrap');
    stageEl = $('avatar-stage');
    captionEl = $('duix-captions');
  }

  // ────────────────────────────────────────────────────────────────────
  // CLIP QUEUE PLAYER — seamless back-to-back; idle overlay covers seams
  // ────────────────────────────────────────────────────────────────────
  async function playQueue() {
    if (playing || destroyed) return;
    playing = true;

    while (queue.length && currentState === 'speaking') {
      const item = queue.shift();
      const url = typeof item === 'string' ? item : item.url;
      const words = typeof item === 'object' ? item.words : [];

      // Start caption highlighting
      if (words && words.length) startCaptions(words);

      await new Promise((resolve) => {
        video.src = url;
        video.onended = resolve;
        video.onerror = resolve;
        video.play().catch(resolve);
      });

      stopCaptions();
    }

    playing = false;

    // Natural handoff: when speech ends, transition to listening
    if (currentState === 'speaking') {
      setState('listening');
    }
  }

  function enqueue(item) {
    queue.push(item);
    playQueue();
  }

  // ────────────────────────────────────────────────────────────────────
  // SPEAK TEXT — live path; pre-rendered cache preferred
  // ────────────────────────────────────────────────────────────────────
  async function speakText(text) {
    // 1. Check speculative cache first (zero latency)
    if (cache.has(text)) {
      const cached = cache.get(text);
      enqueue(cached);
      return;
    }

    // 2. Live render path — client covers latency with thinking overlay
    try {
      const resp = await fetch(DUIX_API + '/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await resp.json();
      if (data.url) {
        enqueue({ url: data.url, words: data.words || [] });
      }
    } catch (e) {
      console.error('[DuixRenderer] Live render failed:', e);
      // Fallback: play TTS audio directly without video clip
      await fallbackTtsOnly(text);
    }
  }

  // Fallback: if DuiX render fails, at least play the audio
  async function fallbackTtsOnly(text) {
    try {
      const resp = await fetch(TTS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) return;

      const wordTimingsRaw = resp.headers.get('X-Word-Timings');
      const words = wordTimingsRaw
        ? JSON.parse(decodeURIComponent(wordTimingsRaw))
        : [];

      const audioBlob = await resp.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      if (words.length) startCaptions(words);

      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
      });

      stopCaptions();
      URL.revokeObjectURL(audioUrl);
    } catch (e) {
      console.warn('[DuixRenderer] TTS fallback also failed:', e);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // CAPTION SYSTEM — word-level highlighting driven by TTS timings
  // ────────────────────────────────────────────────────────────────────
  function startCaptions(words) {
    if (!captionEl || !words.length) return;
    captionWords = words;
    captionAudioStart = performance.now();

    // Build the caption HTML with span per word
    captionEl.innerHTML = words
      .map((w, i) => `<span class="duix-word" data-idx="${i}">${escapeHtml(w.w)}</span> `)
      .join('');
    captionEl.style.opacity = '1';

    // Animate highlighting
    function tick() {
      const elapsed = performance.now() - captionAudioStart;
      const wordSpans = captionEl.querySelectorAll('.duix-word');

      for (let i = 0; i < captionWords.length; i++) {
        const cw = captionWords[i];
        const span = wordSpans[i];
        if (!span) continue;

        if (elapsed >= cw.start && elapsed <= cw.start + cw.dur) {
          span.classList.add('active');
        } else if (elapsed > cw.start + cw.dur) {
          span.classList.remove('active');
          span.classList.add('spoken');
        } else {
          span.classList.remove('active', 'spoken');
        }
      }

      if (elapsed < (captionWords[captionWords.length - 1].start + captionWords[captionWords.length - 1].dur + 500)) {
        captionAnimId = requestAnimationFrame(tick);
      }
    }

    captionAnimId = requestAnimationFrame(tick);
  }

  function stopCaptions() {
    if (captionAnimId) {
      cancelAnimationFrame(captionAnimId);
      captionAnimId = null;
    }
    if (captionEl) {
      setTimeout(() => {
        if (captionEl) captionEl.style.opacity = '0';
      }, 800);
    }
  }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
  }

  // ────────────────────────────────────────────────────────────────────
  // IDLE-LIFE OVERLAY — the free trick DuiX alone can't do
  // Drives breath / blink / gaze-aversion / nod as CSS transforms
  // ON TOP of the frozen last DuiX frame, so while the candidate talks
  // the avatar looks alive, not paused.
  // ────────────────────────────────────────────────────────────────────
  function scheduleNextBlink() {
    // Natural blink interval: 1.8–5s, with occasional rapid double-blink
    nextBlinkTime = performance.now() + 1800 + Math.random() * 3200;
  }

  function overlayLoop(now) {
    if (destroyed || !overlayRunning) return;

    const t = now - overlayT0;

    // ── BREATHING: subtle vertical oscillation (~0.87 Hz) ──
    const breath = Math.sin(t * 0.00087) * 0.4;

    // ── STATE-DRIVEN MICRO-ANIMATIONS ──
    let extraTransform = '';
    if (currentState === 'listening') {
      // Gentle nod — positive engagement signal
      const nodVal = Math.max(0, Math.sin(t * 0.0018)) * 2.4;
      extraTransform = `translateY(${nodVal.toFixed(2)}px)`;
    } else if (currentState === 'thinking' || currentState === 'processing') {
      // Slight head tilt + lateral drift — "considering" body language
      const tilt = 0.8 + Math.sin(t * 0.0009) * 0.5;
      extraTransform = `rotate(${tilt.toFixed(2)}deg) translateX(3px)`;
    }

    if (wrap) {
      wrap.style.transform = `translateY(${breath.toFixed(2)}px) ${extraTransform}`;
    }

    // ── BLINK: procedural eyelid overlay ──
    // Two skin-toned lids scaling over the eyes — works on ANY frozen frame
    if (now >= nextBlinkTime) {
      blinkPeak = now;
      scheduleNextBlink();
      // 18% chance of immediate double-blink
      if (Math.random() < 0.18) {
        nextBlinkTime = now + 380;
      }
    }

    const dt = now - blinkPeak;
    const blinkDuration = 190; // ms
    const p = dt / blinkDuration;
    if (dt >= 0 && dt <= blinkDuration) {
      blinkProgress = p < 0.42 ? p / 0.42 : 1 - (p - 0.42) / 0.58;
    } else {
      blinkProgress = 0;
    }

    if (lid) {
      lid.style.transform = `scaleY(${(0.04 + blinkProgress * 0.96).toFixed(3)})`;
      // DuiX blinks itself while talking; only show overlay blink when NOT speaking
      lid.style.opacity = currentState === 'speaking' ? '0' : '1';
    }

    requestAnimationFrame(overlayLoop);
  }

  // ────────────────────────────────────────────────────────────────────
  // STATE MANAGEMENT
  // ────────────────────────────────────────────────────────────────────
  function setState(s) {
    currentState = s;

    if (stageEl) {
      stageEl.className = 'avatar-stage';
      if (s === 'speaking') stageEl.classList.add('speaking');
      else if (s === 'listening') stageEl.classList.add('listening');
      else if (s === 'thinking' || s === 'processing') stageEl.classList.add('processing');
    }

    // When leaving speaking state, flush the queue so DuiX freezes
    // and the overlay takes over
    if (s !== 'speaking') {
      queue = [];
      if (video) {
        try { video.pause(); } catch (_) {}
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ────────────────────────────────────────────────────────────────────
  return {
    /**
     * Initialize the DuiX renderer.
     * Sets up the video element, lid overlay, and starts the idle-life loop.
     * @returns {string} 'duix' on success
     */
    async init() {
      destroyed = false;
      resolveRefs();

      if (!video) {
        console.error('[DuixRenderer] #duixVideo element not found');
        return null;
      }

      video.style.display = 'block';

      // Create the lid overlay element for blink simulation
      // Positioned over the eyes; tune the radial-gradient percentages
      // to match your specific base video plate's eye positions
      if (!lid) {
        lid = document.createElement('div');
        lid.id = 'duixLid';
        lid.style.cssText = [
          'position:absolute',
          'inset:0',
          'z-index:5',
          'pointer-events:none',
          'transform-origin:center 33%',
          'background:radial-gradient(11% 4% at 44% 33%, rgba(30,25,20,0.95) 99%, transparent),' +
            'radial-gradient(11% 4% at 56% 33%, rgba(30,25,20,0.95) 99%, transparent)',
          'mix-blend-mode:multiply',
          'opacity:0',
          'transform:scaleY(.04)',
          'border-radius:inherit',
        ].join(';');

        const frameEl = video.parentElement;
        if (frameEl) frameEl.appendChild(lid);
      }

      // Hide other avatar renderers
      const orbCanvas = $('ai-avatar-canvas');
      if (orbCanvas) orbCanvas.style.display = 'none';
      const simliContainer = $('simli-avatar');
      if (simliContainer) simliContainer.style.display = 'none';
      const duixContainer = $('duix-avatar');
      if (duixContainer) duixContainer.style.display = 'block';

      // Start the idle-life overlay animation loop
      overlayT0 = performance.now();
      overlayRunning = true;
      scheduleNextBlink();
      requestAnimationFrame(overlayLoop);

      console.log('[DuixRenderer] Initialized — idle-life overlay active');
      return 'duix';
    },

    /** Current renderer mode */
    mode() { return mode; },

    /** Get current state */
    getState() { return currentState; },

    /**
     * State change handler — called by the turn manager.
     * @param {string} s — 'speaking' | 'listening' | 'thinking' | 'processing' | 'idle'
     */
    onState(s) {
      setState(s);
    },

    /**
     * Speak a line of text using DuiX clip rendering.
     * Checks speculative cache first for zero-latency playback.
     * Falls back to TTS-only audio if DuiX render fails.
     * @param {string} text
     */
    say(text) {
      return speakText(text);
    },

    /**
     * Prime the speculative cache with pre-rendered clips.
     * Called from listenWindow() with results from /api/duix/prerender.
     * @param {Array<{text, url, words}>} clips
     */
    primeCache(clips) {
      if (!Array.isArray(clips)) return;
      clips.forEach((c) => {
        if (c.text && c.url) {
          cache.set(c.text, { url: c.url, words: c.words || [] });
        }
      });
      console.log(`[DuixRenderer] Cache primed with ${clips.length} clips`);
    },

    /**
     * Set word timings + start caption display for a given set of words.
     * Used when the turn manager has TTS word timings from a separate source.
     * @param {string} text — full text for display
     * @param {Array<{w, start, dur}>} words
     */
    setCaptions(text, words) {
      if (words && words.length) {
        startCaptions(words);
      } else if (captionEl) {
        captionEl.textContent = text;
        captionEl.style.opacity = '1';
      }
    },

    /**
     * Not used by DuiX — lip-sync is baked into the clip.
     * Exists for interface compatibility.
     */
    feedAudio() { /* noop */ },

    /**
     * Destroy the DuiX renderer and clean up resources.
     */
    destroy() {
      destroyed = true;
      overlayRunning = false;
      queue = [];
      cache.clear();
      stopCaptions();

      if (video) {
        try { video.pause(); } catch (_) {}
        video.src = '';
        video.style.display = 'none';
      }

      if (lid && lid.parentElement) {
        lid.parentElement.removeChild(lid);
        lid = null;
      }

      // Restore other renderers
      const orbCanvas = $('ai-avatar-canvas');
      if (orbCanvas) orbCanvas.style.display = 'block';
      const duixContainer = $('duix-avatar');
      if (duixContainer) duixContainer.style.display = 'none';

      console.log('[DuixRenderer] Destroyed');
    },

    /**
     * Check if DuiX renderer is currently active
     * @returns {boolean}
     */
    isActive() {
      return !destroyed && overlayRunning;
    },
  };
})();
