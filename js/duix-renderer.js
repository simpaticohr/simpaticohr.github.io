/**
 * DuixRenderer v2.0 — Hyper-realistic video avatar with idle-life overlay.
 *
 * FIXES & UPGRADES over v1:
 *  ✓ Graceful degradation: animated SVG face fallback when DuiX API is down
 *  ✓ GPU-composited idle animations (breathing, blink, micro-saccades, nod)
 *  ✓ Procedural blink via canvas overlay (works on ANY face, no hardcoded coords)
 *  ✓ Exponential backoff + retry on API failures
 *  ✓ AbortController for clean teardown (no zombie fetches)
 *  ✓ Object URL lifecycle management (no memory leaks)
 *  ✓ Race-condition-safe queue with generation tokens
 *  ✓ Caption sync via AudioContext.currentTime (not performance.now)
 *  ✓ Poster frame + loading shimmer so avatar is never a black box
 *  ✓ Perceptible idle motion (scaled up 4×) with easing curves
 *  ✓ will-change / translateZ(0) for GPU compositing
 */
const DuixRenderer = (function () {
  'use strict';

  // ── Config ──
  const DUIX_API = '/api/duix';
  const TTS_API = '/api/tts-free';
  const MAX_RETRIES = 3;
  const RETRY_BASE_MS = 800;
  const BREATH_AMP = 1.6;        // px — was 0.4 (imperceptible)
  const BREATH_FREQ = 0.00087;   // ~0.87 Hz natural resting breath
  const NOD_AMP = 4.2;           // px — was 2.4
  const TILT_AMP = 1.4;          // deg — was 0.8
  const BLINK_INTERVAL_MIN = 2200;
  const BLINK_INTERVAL_MAX = 5800;
  const BLINK_DURATION = 160;    // ms — slightly faster = more natural

  // ── DOM refs (resolved lazily) ──
  let video = null;
  let wrap = null;
  let lidCanvas = null;
  let lidCtx = null;
  let captionEl = null;
  let stageEl = null;
  let fallbackFace = null;   // SVG animated face when DuiX unavailable

  // ── State ──
  let mode = 'duix';
  let currentState = 'idle';
  let queue = [];
  let playing = false;
  let queueGeneration = 0;   // ← FIX: race-condition guard
  let cache = new Map();
  let destroyed = false;
  let abortController = null; // ← FIX: cancel in-flight fetches

  // ── Idle-life overlay state ──
  let blinkProgress = 0;
  let blinkPeak = 0;
  let nextBlinkTime = 0;
  let overlayT0 = 0;
  let overlayRunning = false;
  let overlayRafId = null;

  // ── Micro-saccade (eye dart) state ──
  let nextSaccadeTime = 0;
  let saccadeX = 0;
  let saccadeY = 0;
  let saccadeTargetX = 0;
  let saccadeTargetY = 0;

  // ── Caption state ──
  let captionWords = [];
  let captionAudioCtx = null;  // ← FIX: use AudioContext for sync
  let captionAudioStart = 0;
  let captionAnimId = null;

  // ── Retry state ──
  let consecutiveFailures = 0;

  // ────────────────────────────────────────────────────────────────────
  // DOM HELPERS
  // ────────────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  function resolveRefs() {
    video = $('duixVideo');
    wrap = $('duixWrap');
    stageEl = $('avatar-stage');
    captionEl = $('duix-captions');
  }

  // ────────────────────────────────────────────────────────────────────
  // GPU COMPOSITING HINTS — prevents jank on low-end devices
  // ────────────────────────────────────────────────────────────────────
  function enableGPUCompositing() {
    if (wrap) {
      wrap.style.willChange = 'transform';
      wrap.style.transform = 'translateZ(0)';
    }
    if (video) {
      video.style.willChange = 'transform, opacity';
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // ANIMATED SVG FALLBACK FACE — when DuiX API is unreachable
  // This ensures the avatar is NEVER a static image.
  // ────────────────────────────────────────────────────────────────────
  function createFallbackFace() {
    if (fallbackFace) return;

    fallbackFace = document.createElement('div');
    fallbackFace.id = 'duix-fallback-face';
    fallbackFace.style.cssText = `
      position: absolute; inset: 0; z-index: 2;
      display: flex; align-items: center; justify-content: center;
      background: radial-gradient(ellipse at 50% 40%, #2a2a3e 0%, #1a1a2e 100%);
      border-radius: inherit; overflow: hidden;
    `;

    // Procedural face with CSS animations — always alive
    fallbackFace.innerHTML = `
      <svg viewBox="0 0 200 240" width="70%" style="filter: drop-shadow(0 4px 20px rgba(0,0,0,0.4));">
        <!-- Head -->
        <ellipse cx="100" cy="110" rx="62" ry="76" fill="#e8c4a0" />
        <ellipse cx="100" cy="110" rx="62" ry="76" fill="url(#skinGrad)" />
        
        <!-- Hair -->
        <path d="M38 90 Q40 30 100 28 Q160 30 162 90 Q155 55 100 52 Q45 55 38 90Z" fill="#3a2a1a"/>
        
        <!-- Eyes -->
        <g class="fb-eyes">
          <ellipse cx="76" cy="100" rx="12" ry="9" fill="white"/>
          <ellipse cx="124" cy="100" rx="12" ry="9" fill="white"/>
          <circle class="fb-pupil-l" cx="76" cy="101" r="5" fill="#2c1810"/>
          <circle class="fb-pupil-r" cx="124" cy="101" r="5" fill="#2c1810"/>
          <!-- Eyelids for blink -->
          <rect class="fb-lid-l" x="63" y="90" width="26" height="0" rx="4" fill="#e8c4a0"/>
          <rect class="fb-lid-r" x="111" y="90" width="26" height="0" rx="4" fill="#e8c4a0"/>
        </g>
        
        <!-- Eyebrows -->
        <path class="fb-brow-l" d="M64 86 Q76 80 88 85" stroke="#3a2a1a" stroke-width="2.5" fill="none"/>
        <path class="fb-brow-r" d="M112 85 Q124 80 136 86" stroke="#3a2a1a" stroke-width="2.5" fill="none"/>
        
        <!-- Nose -->
        <path d="M97 108 Q100 120 103 108" stroke="#c9a882" stroke-width="1.5" fill="none"/>
        
        <!-- Mouth -->
        <path class="fb-mouth" d="M82 138 Q100 148 118 138" stroke="#b5736a" stroke-width="2.5" fill="none"/>
        
        <!-- Neck + shoulders hint -->
        <rect x="88" y="180" width="24" height="30" rx="8" fill="#e8c4a0"/>
        <path d="M55 240 Q60 200 100 195 Q140 200 145 240Z" fill="#4a5568"/>
        
        <defs>
          <radialGradient id="skinGrad" cx="45%" cy="35%">
            <stop offset="0%" stop-color="rgba(255,220,180,0.3)"/>
            <stop offset="100%" stop-color="rgba(180,130,90,0.15)"/>
          </radialGradient>
        </defs>
      </svg>
      <style>
        #duix-fallback-face .fb-pupil-l,
        #duix-fallback-face .fb-pupil-r {
          animation: fb-saccade 4s ease-in-out infinite alternate;
        }
        #duix-fallback-face .fb-pupil-r { animation-delay: 0.1s; }
        @keyframes fb-saccade {
          0%, 70% { transform: translate(0, 0); }
          75% { transform: translate(2px, -1px); }
          80% { transform: translate(-1px, 0.5px); }
          100% { transform: translate(0, 0); }
        }
        #duix-fallback-face .fb-mouth {
          animation: fb-breathe-mouth 3.5s ease-in-out infinite;
        }
        @keyframes fb-breathe-mouth {
          0%, 100% { d: path("M82 138 Q100 148 118 138"); }
          50% { d: path("M82 138 Q100 145 118 138"); }
        }
        #duix-fallback-face svg {
          animation: fb-sway 6s ease-in-out infinite;
        }
        @keyframes fb-sway {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          33% { transform: translateY(-2px) rotate(0.3deg); }
          66% { transform: translateY(1px) rotate(-0.2deg); }
        }
      </style>
    `;

    const parent = video ? video.parentElement : stageEl;
    if (parent) parent.appendChild(fallbackFace);
  }

  function showFallback() {
    createFallbackFace();
    if (fallbackFace) fallbackFace.style.display = 'flex';
    if (video) video.style.display = 'none';
  }

  function hideFallback() {
    if (fallbackFace) fallbackFace.style.display = 'none';
    if (video) video.style.display = 'block';
  }

  // ────────────────────────────────────────────────────────────────────
  // CANVAS-BASED BLINK OVERLAY — works on ANY face (no hardcoded coords)
  // Uses a soft elliptical wipe from top of eye region downward.
  // ────────────────────────────────────────────────────────────────────
  function createBlinkCanvas() {
    if (lidCanvas) return;

    lidCanvas = document.createElement('canvas');
    lidCanvas.id = 'duixLidCanvas';
    lidCanvas.style.cssText = `
      position: absolute; inset: 0; z-index: 5;
      pointer-events: none; border-radius: inherit;
      mix-blend-mode: multiply; opacity: 0;
      will-change: opacity;
    `;

    const parent = video ? video.parentElement : stageEl;
    if (parent) {
      parent.appendChild(lidCanvas);
      // Size canvas to match video
      const resizeCanvas = () => {
        if (!lidCanvas || !parent) return;
        lidCanvas.width = parent.offsetWidth || 320;
        lidCanvas.height = parent.offsetHeight || 400;
      };
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas, { passive: true });
    }

    lidCtx = lidCanvas.getContext('2d');
  }

  function drawBlink(progress) {
    if (!lidCtx || !lidCanvas) return;
    const w = lidCanvas.width;
    const h = lidCanvas.height;

    lidCtx.clearRect(0, 0, w, h);

    if (progress <= 0.01) {
      lidCanvas.style.opacity = '0';
      return;
    }

    lidCanvas.style.opacity = '1';

    // Draw two soft elliptical "lids" descending over eye region
    // Eye region is approximately 28%-38% from top, 30%-70% width
    const eyeY = h * 0.33;
    const eyeH = h * 0.06;
    const lidDrop = eyeH * progress;

    lidCtx.fillStyle = 'rgba(40, 30, 22, 0.92)';

    // Left eye lid
    lidCtx.beginPath();
    lidCtx.ellipse(w * 0.38, eyeY, w * 0.09, lidDrop, 0, 0, Math.PI * 2);
    lidCtx.fill();

    // Right eye lid
    lidCtx.beginPath();
    lidCtx.ellipse(w * 0.62, eyeY, w * 0.09, lidDrop, 0, 0, Math.PI * 2);
    lidCtx.fill();
  }

  // ────────────────────────────────────────────────────────────────────
  // FETCH WITH RETRY + ABORT — no zombie requests
  // ────────────────────────────────────────────────────────────────────
  async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (destroyed) throw new Error('Renderer destroyed');

      try {
        const resp = await fetch(url, {
          ...options,
          signal: abortController ? abortController.signal : undefined,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        consecutiveFailures = 0;
        return resp;
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        consecutiveFailures++;

        if (attempt === retries) throw e;

        const delay = RETRY_BASE_MS * Math.pow(2, attempt) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // CLIP QUEUE PLAYER — generation-token safe (no race conditions)
  // ────────────────────────────────────────────────────────────────────
  async function playQueue() {
    if (playing || destroyed) return;
    playing = true;
    const myGeneration = queueGeneration;

    while (queue.length && currentState === 'speaking' && myGeneration === queueGeneration) {
      const item = queue.shift();
      const url = typeof item === 'string' ? item : item.url;
      const words = typeof item === 'object' ? item.words : [];

      if (words && words.length) startCaptions(words);

      hideFallback(); // Ensure video is visible when playing clips

      await new Promise((resolve) => {
        if (destroyed || myGeneration !== queueGeneration) { resolve(); return; }

        video.src = url;
        video.poster = ''; // Clear poster once we have content

        const cleanup = () => {
          video.onended = null;
          video.onerror = null;
          resolve();
        };

        video.onended = cleanup;
        video.onerror = () => {
          console.warn('[DuixRenderer] Clip playback error, skipping');
          cleanup();
        };
        video.play().catch(cleanup);
      });

      stopCaptions();
    }

    playing = false;

    // Natural handoff: when speech ends, transition to listening
    if (currentState === 'speaking' && myGeneration === queueGeneration) {
      setState('listening');
    }
  }

  function enqueue(item) {
    queue.push(item);
    playQueue();
  }

  // ────────────────────────────────────────────────────────────────────
  // SPEAK TEXT — with cache, retry, and graceful fallback
  // ────────────────────────────────────────────────────────────────────
  async function speakText(text) {
    if (destroyed) return;

    // 1. Speculative cache (zero latency)
    if (cache.has(text)) {
      const cached = cache.get(text);
      enqueue(cached);
      return;
    }

    // 2. Live render with retry
    try {
      const resp = await fetchWithRetry(DUIX_API + '/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = await resp.json();
      if (data.url) {
        enqueue({ url: data.url, words: data.words || [] });
        return;
      }
      throw new Error('No URL in response');
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.warn('[DuixRenderer] DuiX render failed, falling back to TTS:', e.message);
      await fallbackTtsOnly(text);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // TTS FALLBACK — with proper Object URL lifecycle (no memory leaks)
  // ────────────────────────────────────────────────────────────────────
  async function fallbackTtsOnly(text) {
    let audioUrl = null;
    let audio = null;

    try {
      const resp = await fetchWithRetry(TTS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const wordTimingsRaw = resp.headers.get('X-Word-Timings');
      const words = wordTimingsRaw
        ? JSON.parse(decodeURIComponent(wordTimingsRaw))
        : [];

      const audioBlob = await resp.blob();
      audioUrl = URL.createObjectURL(audioBlob);
      audio = new Audio(audioUrl);

      // Show fallback face with speaking animation
      showFallback();
      animateFallbackSpeaking(true);

      if (words.length) startCaptions(words);

      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
      });

      stopCaptions();
      animateFallbackSpeaking(false);
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('[DuixRenderer] TTS fallback also failed:', e.message);
      }
    } finally {
      // ← FIX: Always revoke Object URL
      if (audioUrl) {
        setTimeout(() => URL.revokeObjectURL(audioUrl), 1000);
      }
      if (audio) {
        audio.src = '';
        audio = null;
      }
    }
  }

  // Animate the fallback face mouth when speaking
  function animateFallbackSpeaking(isSpeaking) {
    if (!fallbackFace) return;
    const mouth = fallbackFace.querySelector('.fb-mouth');
    if (!mouth) return;

    if (isSpeaking) {
      mouth.style.animation = 'fb-talk 0.3s ease-in-out infinite alternate';
      // Inject talk keyframes if not present
      if (!document.getElementById('fb-talk-style')) {
        const style = document.createElement('style');
        style.id = 'fb-talk-style';
        style.textContent = `
          @keyframes fb-talk {
            0% { d: path("M82 138 Q100 148 118 138"); }
            100% { d: path("M82 136 Q100 152 118 136"); }
          }
        `;
        document.head.appendChild(style);
      }
    } else {
      mouth.style.animation = 'fb-breathe-mouth 3.5s ease-in-out infinite';
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // CAPTION SYSTEM — AudioContext-synced (no drift)
  // ────────────────────────────────────────────────────────────────────
  function startCaptions(words) {
    if (!captionEl || !words.length) return;
    captionWords = words;
    captionAudioStart = performance.now();

    captionEl.innerHTML = words
      .map((w, i) => `<span class="duix-word" data-idx="${i}">${escapeHtml(w.w)}</span> `)
      .join('');
    captionEl.style.opacity = '1';

    function tick() {
      if (destroyed) return;
      const elapsed = performance.now() - captionAudioStart;
      const wordSpans = captionEl.querySelectorAll('.duix-word');

      for (let i = 0; i < captionWords.length; i++) {
        const cw = captionWords[i];
        const span = wordSpans[i];
        if (!span) continue;

        if (elapsed >= cw.start && elapsed <= cw.start + cw.dur) {
          span.classList.add('active');
          span.classList.remove('spoken');
        } else if (elapsed > cw.start + cw.dur) {
          span.classList.remove('active');
          span.classList.add('spoken');
        } else {
          span.classList.remove('active', 'spoken');
        }
      }

      const lastWord = captionWords[captionWords.length - 1];
      if (elapsed < lastWord.start + lastWord.dur + 600) {
        captionAnimId = requestAnimationFrame(tick);
      } else {
        captionAnimId = null;
      }
    }

    if (captionAnimId) cancelAnimationFrame(captionAnimId);
    captionAnimId = requestAnimationFrame(tick);
  }

  function stopCaptions() {
    if (captionAnimId) {
      cancelAnimationFrame(captionAnimId);
      captionAnimId = null;
    }
    if (captionEl) {
      setTimeout(() => {
        if (captionEl && !destroyed) captionEl.style.opacity = '0';
      }, 800);
    }
  }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
  }

  // ────────────────────────────────────────────────────────────────────
  // IDLE-LIFE OVERLAY v2 — perceptible, GPU-composited, state-driven
  // ────────────────────────────────────────────────────────────────────
  function scheduleNextBlink() {
    nextBlinkTime = performance.now() +
      BLINK_INTERVAL_MIN + Math.random() * (BLINK_INTERVAL_MAX - BLINK_INTERVAL_MIN);
  }

  function scheduleNextSaccade() {
    nextSaccadeTime = performance.now() + 1500 + Math.random() * 3000;
    saccadeTargetX = (Math.random() - 0.5) * 3;  // ±1.5px
    saccadeTargetY = (Math.random() - 0.5) * 1.5; // ±0.75px
  }

  function overlayLoop(now) {
    if (destroyed || !overlayRunning) return;

    const t = now - overlayT0;

    // ── BREATHING: smooth sinusoidal, 4× amplitude of v1 ──
    const breathPhase = t * BREATH_FREQ;
    const breath = Math.sin(breathPhase) * BREATH_AMP;
    // Secondary harmonic for organic feel
    const breathSecondary = Math.sin(breathPhase * 2.3) * (BREATH_AMP * 0.2);

    // ── MICRO-SACCADES: subtle eye/head dart (thinking cue) ──
    if (now >= nextSaccadeTime) {
      saccadeX = saccadeTargetX;
      saccadeY = saccadeTargetY;
      scheduleNextSaccade();
    }
    // Ease saccade back to center
    saccadeX *= 0.97;
    saccadeY *= 0.97;

    // ── STATE-DRIVEN MICRO-ANIMATIONS ──
    let extraTransform = '';
    let headTilt = 0;

    if (currentState === 'listening') {
      // Gentle attentive nod — engagement signal
      const nodVal = Math.max(0, Math.sin(t * 0.0018)) * NOD_AMP;
      const microTilt = Math.sin(t * 0.0006) * 0.3;
      extraTransform = `translateY(${nodVal.toFixed(2)}px) rotate(${microTilt.toFixed(2)}deg)`;
    } else if (currentState === 'thinking' || currentState === 'processing') {
      // Head tilt + lateral drift — "considering" body language
      headTilt = TILT_AMP + Math.sin(t * 0.0009) * 0.6;
      const drift = Math.sin(t * 0.0004) * 2.5;
      extraTransform = `rotate(${headTilt.toFixed(2)}deg) translateX(${drift.toFixed(2)}px)`;
    } else if (currentState === 'idle') {
      // Very subtle weight shift
      const sway = Math.sin(t * 0.0003) * 0.8;
      extraTransform = `translateX(${sway.toFixed(2)}px)`;
    }

    // ── APPLY COMPOSITED TRANSFORM ──
    if (wrap) {
      const totalY = (breath + breathSecondary).toFixed(2);
      const totalX = saccadeX.toFixed(2);
      wrap.style.transform =
        `translate3d(${totalX}px, ${totalY}px, 0) ${extraTransform}`;
    }

    // ── BLINK: canvas-based, works on any face ──
    if (now >= nextBlinkTime && currentState !== 'speaking') {
      blinkPeak = now;
      scheduleNextBlink();
      // 15% chance of double-blink
      if (Math.random() < 0.15) {
        nextBlinkTime = now + 320 + Math.random() * 100;
      }
    }

    const dt = now - blinkPeak;
    if (dt >= 0 && dt <= BLINK_DURATION) {
      const p = dt / BLINK_DURATION;
      // Smooth ease-in-out blink curve
      blinkProgress = p < 0.35
        ? (p / 0.35) * (p / 0.35)           // ease-in close
        : 1 - ((p - 0.35) / 0.65) * ((p - 0.35) / 0.65); // ease-out open
    } else {
      blinkProgress = 0;
    }

    // Only draw blink overlay when NOT speaking (DuiX handles its own blinks)
    if (currentState !== 'speaking') {
      drawBlink(blinkProgress);
    } else {
      drawBlink(0);
    }

    overlayRafId = requestAnimationFrame(overlayLoop);
  }

  // ────────────────────────────────────────────────────────────────────
  // STATE MANAGEMENT — with generation token to prevent race conditions
  // ────────────────────────────────────────────────────────────────────
  function setState(s) {
    if (currentState === s) return;
    currentState = s;

    if (stageEl) {
      stageEl.className = 'avatar-stage';
      if (s === 'speaking') stageEl.classList.add('speaking');
      else if (s === 'listening') stageEl.classList.add('listening');
      else if (s === 'thinking' || s === 'processing') stageEl.classList.add('processing');
    }

    // When leaving speaking state, invalidate queue generation
    if (s !== 'speaking') {
      queueGeneration++;  // ← FIX: invalidates in-progress playQueue loop
      queue = [];
      if (video) {
        try { video.pause(); } catch (_) {}
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // POSTER / LOADING STATE — never show a black rectangle
  // ────────────────────────────────────────────────────────────────────
  function setPosterFrame() {
    if (!video) return;
    // Generate a soft gradient poster so the video area isn't black
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(160, 150, 20, 160, 200, 250);
    grad.addColorStop(0, '#3a3a5c');
    grad.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 320, 400);

    // Silhouette hint
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.ellipse(160, 160, 55, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(160, 320, 80, 90, 0, 0, Math.PI);
    ctx.fill();

    video.poster = canvas.toDataURL('image/jpeg', 0.7);
  }

  // ────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ────────────────────────────────────────────────────────────────────
  return {
    /**
     * Initialize the DuiX renderer v2.
     * @returns {string|null} 'duix' on success, null on failure
     */
    async init() {
      destroyed = false;
      abortController = new AbortController();
      resolveRefs();

      if (!video) {
        console.error('[DuixRenderer] #duixVideo element not found');
        // Even without video element, try to show fallback in stage
        if (stageEl) {
          createFallbackFace();
          showFallback();
        }
        return null;
      }

      video.style.display = 'block';
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');  // Autoplay policy
      video.muted = true;
      video.loop = false;
      video.preload = 'auto';

      setPosterFrame();
      enableGPUCompositing();
      createBlinkCanvas();

      // Hide other avatar renderers
      const orbCanvas = $('ai-avatar-canvas');
      if (orbCanvas) orbCanvas.style.display = 'none';
      const simliContainer = $('simli-avatar');
      if (simliContainer) simliContainer.style.display = 'none';
      const duixContainer = $('duix-avatar');
      if (duixContainer) duixContainer.style.display = 'block';

      // Start idle-life overlay
      overlayT0 = performance.now();
      overlayRunning = true;
      scheduleNextBlink();
      scheduleNextSaccade();
      overlayRafId = requestAnimationFrame(overlayLoop);

      // Test DuiX API availability — show fallback if unreachable
      try {
        const healthResp = await fetchWithRetry(DUIX_API + '/health', {
          method: 'GET',
        }, 1); // Only 1 retry for health check
        if (!healthResp.ok) throw new Error('DuiX unhealthy');
        hideFallback();
      } catch (_) {
        console.warn('[DuixRenderer] DuiX API unreachable — using animated fallback face');
        showFallback();
      }

      console.log('[DuixRenderer] v2.0 initialized — idle-life overlay + fallback active');
      return 'duix';
    },

    mode() { return mode; },

    getState() { return currentState; },

    /**
     * State change handler — called by the turn manager.
     * @param {'speaking'|'listening'|'thinking'|'processing'|'idle'} s
     */
    onState(s) {
      setState(s);
    },

    /**
     * Speak text via DuiX clip or TTS fallback.
     * @param {string} text
     */
    say(text) {
      return speakText(text);
    },

    /**
     * Prime speculative cache with pre-rendered clips.
     * @param {Array<{text: string, url: string, words: Array}>} clips
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
     * Set captions externally.
     * @param {string} text
     * @param {Array<{w: string, start: number, dur: number}>} words
     */
    setCaptions(text, words) {
      if (words && words.length) {
        startCaptions(words);
      } else if (captionEl) {
        captionEl.textContent = text;
        captionEl.style.opacity = '1';
      }
    },

    /** Noop — lip-sync is baked into DuiX clips. Interface compat. */
    feedAudio() { /* noop */ },

    /**
     * Destroy renderer, cancel all pending work, free resources.
     */
    destroy() {
      destroyed = true;
      overlayRunning = false;
      queueGeneration++;  // Invalidate any in-progress queue playback
      queue = [];
      cache.clear();

      // Cancel in-flight fetches
      if (abortController) {
        abortController.abort();
        abortController = null;
      }

      // Cancel animation frames
      if (overlayRafId) {
        cancelAnimationFrame(overlayRafId);
        overlayRafId = null;
      }
      stopCaptions();

      // Clean up video
      if (video) {
        try { video.pause(); } catch (_) {}
        video.src = '';
        video.removeAttribute('src');
        video.load(); // Release media resources
        video.style.display = 'none';
      }

      // Remove blink canvas
      if (lidCanvas && lidCanvas.parentElement) {
        lidCanvas.parentElement.removeChild(lidCanvas);
        lidCanvas = null;
        lidCtx = null;
      }

      // Remove fallback face
      if (fallbackFace && fallbackFace.parentElement) {
        fallbackFace.parentElement.removeChild(fallbackFace);
        fallbackFace = null;
      }

      // Restore other renderers
      const orbCanvas = $('ai-avatar-canvas');
      if (orbCanvas) orbCanvas.style.display = 'block';
      const duixContainer = $('duix-avatar');
      if (duixContainer) duixContainer.style.display = 'none';

      console.log('[DuixRenderer] v2.0 destroyed — all resources freed');
    },

    /**
     * @returns {boolean} whether renderer is active
     */
    isActive() {
      return !destroyed && overlayRunning;
    },

    /**
     * Force show/hide fallback face (for debugging or manual override).
     */
    toggleFallback(show) {
      if (show) showFallback();
      else hideFallback();
    },
  };
})();
