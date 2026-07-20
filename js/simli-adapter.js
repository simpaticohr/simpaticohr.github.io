/**
 * SimliAdapter v3.0 — Production-grade Simli Avatar Integration Adapter.
 *
 * Implements the standard renderer contract:
 *   - init()
 *   - mode()
 *   - getState()
 *   - onState(s)
 *   - say(text)
 *   - primeCache(clips)
 *   - setCaptions(text, words)
 *   - feedAudio(int16Buf)
 *   - destroy()
 *   - isActive()
 *
 * Features:
 *   - Real 30 FPS MediaStream video fallback while connecting / if connection drops.
 *   - Seamless transition to Simli WebRTC stream upon connection.
 */
const SimliAdapter = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let stageEl, videoEl, containerEl, orbEl, captionEl;
  let client = null;
  let ready = false;
  let currentState = 'idle';
  let destroyed = false;
  let streamReady = false;

  const SDK_URL = 'https://cdn.simli.com/sdk/simli-client.min.js';
  const HUMAN_FACE_SRC = 'assets/ai-interviewer-avatar.png';

  // ── Procedural Video Stream Fallback ──
  let offscreenCanvas = null;
  let offscreenCtx = null;
  let baseImage = null;
  let baseImageLoaded = false;
  let fallbackStream = null;
  let t0 = 0;
  let blinkPeak = 0;
  let nextBlinkTime = 0;
  let mouthOpenAmount = 0;
  let targetMouthOpen = 0;
  let pupilOffsetX = 0;
  let pupilOffsetY = 0;
  let nextPupilShiftTime = 0;
  let videoStreamRafId = null;

  function _loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.SimliClient) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // 30 FPS FALLBACK VIDEO GENERATOR
  // ────────────────────────────────────────────────────────────────────
  function initOffscreenVideoCanvas() {
    if (offscreenCanvas) return;

    offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = 512;
    offscreenCanvas.height = 512;
    offscreenCtx = offscreenCanvas.getContext('2d');

    baseImage = new Image();
    baseImage.crossOrigin = 'anonymous';
    baseImage.onload = () => {
      baseImageLoaded = true;
    };
    baseImage.src = HUMAN_FACE_SRC;
  }

  function scheduleNextBlink() {
    nextBlinkTime = performance.now() + 2000 + Math.random() * 3500;
  }

  function scheduleNextPupilShift() {
    nextPupilShiftTime = performance.now() + 1500 + Math.random() * 3000;
    pupilOffsetX = (Math.random() - 0.5) * 3;
    pupilOffsetY = (Math.random() - 0.5) * 1.5;
  }

  function renderVideoFrame(now) {
    if (!offscreenCtx || !baseImageLoaded || !videoEl) return;
    const w = offscreenCanvas.width;
    const h = offscreenCanvas.height;
    const elapsed = now - t0;

    offscreenCtx.clearRect(0, 0, w, h);

    const breathY = Math.sin(elapsed * 0.001) * 3.5;
    const swayX = Math.sin(elapsed * 0.0005) * 2.0;
    let headAngle = Math.sin(elapsed * 0.0004) * 0.012;

    if (currentState === 'listening') {
      const nodVal = Math.max(0, Math.sin(elapsed * 0.003)) * 6.0;
      headAngle += nodVal * 0.003;
    } else if (currentState === 'thinking' || currentState === 'processing') {
      headAngle += 0.025 + Math.sin(elapsed * 0.001) * 0.01;
    } else if (currentState === 'speaking') {
      targetMouthOpen = 0.35 + Math.abs(Math.sin(elapsed * 0.015)) * 0.65;
    } else {
      targetMouthOpen = 0;
    }

    offscreenCtx.save();
    offscreenCtx.translate(w / 2 + swayX, h / 2 + breathY);
    offscreenCtx.rotate(headAngle);
    offscreenCtx.drawImage(baseImage, -w / 2, -h / 2, w, h);

    // Micro Pupil Shift
    if (now >= nextPupilShiftTime) {
      scheduleNextPupilShift();
    }
    const eyeY = h * 0.285;
    const leftEyeX = w * 0.425;
    const rightEyeX = w * 0.575;

    offscreenCtx.fillStyle = 'rgba(40, 24, 18, 0.9)';
    offscreenCtx.beginPath();
    offscreenCtx.arc(leftEyeX + pupilOffsetX, eyeY + pupilOffsetY, 4.5, 0, Math.PI * 2);
    offscreenCtx.arc(rightEyeX + pupilOffsetX, eyeY + pupilOffsetY, 4.5, 0, Math.PI * 2);
    offscreenCtx.fill();

    // Blink
    if (now >= nextBlinkTime && currentState !== 'speaking') {
      blinkPeak = now;
      scheduleNextBlink();
    }

    const blinkDt = now - blinkPeak;
    const blinkDur = 160;
    let blinkP = 0;
    if (blinkDt >= 0 && blinkDt <= blinkDur) {
      const p = blinkDt / blinkDur;
      blinkP = p < 0.4 ? (p / 0.4) : 1 - ((p - 0.4) / 0.6);
    }

    if (blinkP > 0.02) {
      const lidDrop = (h * 0.045) * blinkP;
      offscreenCtx.fillStyle = 'rgba(78, 62, 52, 0.96)';

      offscreenCtx.beginPath();
      offscreenCtx.ellipse(leftEyeX, eyeY + lidDrop * 0.4, w * 0.065, Math.max(1, lidDrop), -0.05, 0, Math.PI * 2);
      offscreenCtx.fill();

      offscreenCtx.beginPath();
      offscreenCtx.ellipse(rightEyeX, eyeY + lidDrop * 0.4, w * 0.065, Math.max(1, lidDrop), 0.05, 0, Math.PI * 2);
      offscreenCtx.fill();
    }

    // Lip Sync Mouth
    mouthOpenAmount += (targetMouthOpen - mouthOpenAmount) * 0.35;

    if (mouthOpenAmount > 0.04 && currentState === 'speaking') {
      const mouthY = h * 0.47;
      const mouthW = w * 0.085;
      const mouthH = h * 0.032 * mouthOpenAmount;

      offscreenCtx.fillStyle = 'rgba(45, 18, 18, 0.96)';
      offscreenCtx.beginPath();
      offscreenCtx.ellipse(w * 0.50, mouthY, mouthW, mouthH, 0, 0, Math.PI * 2);
      offscreenCtx.fill();

      offscreenCtx.strokeStyle = 'rgba(175, 110, 105, 0.7)';
      offscreenCtx.lineWidth = 2.0;
      offscreenCtx.beginPath();
      offscreenCtx.arc(w * 0.50, mouthY - mouthH * 0.2, mouthW * 0.8, Math.PI, 0);
      offscreenCtx.stroke();

      offscreenCtx.strokeStyle = 'rgba(185, 120, 115, 0.8)';
      offscreenCtx.beginPath();
      offscreenCtx.arc(w * 0.50, mouthY + mouthH * 0.3, mouthW * 0.8, 0, Math.PI);
      offscreenCtx.stroke();
    }

    offscreenCtx.restore();
  }

  function startProceduralVideoStream() {
    initOffscreenVideoCanvas();
    t0 = performance.now();
    scheduleNextBlink();
    scheduleNextPupilShift();

    function videoLoop(now) {
      if (destroyed) return;
      if (!streamReady) {
        renderVideoFrame(now);
      }
      videoStreamRafId = requestAnimationFrame(videoLoop);
    }

    if (videoStreamRafId) cancelAnimationFrame(videoStreamRafId);
    videoStreamRafId = requestAnimationFrame(videoLoop);

    if (offscreenCanvas && typeof offscreenCanvas.captureStream === 'function') {
      try {
        fallbackStream = offscreenCanvas.captureStream(30);
        if (videoEl) {
          videoEl.srcObject = fallbackStream;
          videoEl.style.display = 'block';
          videoEl.style.opacity = '1';
          videoEl.play().catch(() => {});
        }
      } catch (e) {
        console.warn('[SimliAdapter] captureStream note:', e.message);
      }
    }
  }

  return {
    async init() {
      destroyed = false;
      streamReady = false;
      stageEl = $('avatar-stage');
      videoEl = $('simli-video');
      containerEl = $('simli-avatar');
      orbEl = $('ai-avatar-canvas');
      captionEl = $('duix-captions');

      const apiKey = localStorage.getItem('evalis_simli_key') || localStorage.getItem('simli_api_key') || '';
      const faceId = localStorage.getItem('evalis_simli_face_id') || localStorage.getItem('simli_face_id') || 'default_female_01';

      // Hide WebGL orb canvas & duix video
      if (orbEl) orbEl.style.display = 'none';
      const duixVid = $('duixVideo');
      if (duixVid) duixVid.style.display = 'none';
      document.querySelectorAll('.audio-waveform, #waveform, .orb-waveform')
              .forEach((el) => (el.style.display = 'none'));
      const cartoon = $('duix-fallback-face'); if (cartoon) cartoon.remove();

      // Show Simli container
      if (containerEl) {
        containerEl.style.display = 'block';
      }

      if (stageEl) stageEl.classList.add('hr');

      // Start realistic 30 FPS loader video
      startProceduralVideoStream();

      if (!apiKey) {
        console.warn('[SimliAdapter] No API key configured. Running on procedural motion engine.');
        return 'simli';
      }

      try {
        await _loadScript(SDK_URL);

        if (!window.SimliClient) {
          throw new Error('SimliClient SDK not loaded successfully');
        }

        client = new window.SimliClient();
        const dummyAudio = document.createElement('audio');
        
        // Listen to connection established event
        client.on('connected', () => {
          console.log('[SimliAdapter] SDK WebRTC stream connected and established!');
          streamReady = true; // Stop procedural video loop, let WebRTC stream take over
        });
        
        await client.Initialize({
          apiKey: apiKey,
          faceID: faceId,
          handleSilence: true,
          videoRef: videoEl,
          audioRef: dummyAudio,
        });

        await client.start();
        ready = true;
        return 'simli';
      } catch (e) {
        console.warn('[SimliAdapter] SDK connection note:', e.message, '— using procedural 30 FPS fallback.');
        ready = false;
      }

      return 'simli';
    },

    mode() { return 'simli'; },
    getState() { return currentState; },
    onState(s) {
      currentState = s;
      if (s === 'listening') {
        this.clearBuffer();
      }
    },

    say(text) {
      return Promise.resolve();
    },

    primeCache() {},

    setCaptions(text, words) {
      if (captionEl) {
        captionEl.textContent = text;
        captionEl.style.opacity = '1';
      }
    },

    feedAudio(int16Buf) {
      if (!ready || !client) return;
      try {
        const i16Array = new Int16Array(int16Buf);
        const u8Array = new Uint8Array(i16Array.buffer);
        client.sendAudioData(u8Array);
      } catch (e) {
        console.warn('[SimliAdapter] Audio buffer transmission failed:', e.message);
      }
    },

    clearBuffer() {
      if (client && ready) {
        try {
          client.ClearBuffer();
        } catch (e) {}
      }
    },

    destroy() {
      destroyed = true;
      ready = false;
      streamReady = false;
      if (videoStreamRafId) cancelAnimationFrame(videoStreamRafId);
      if (client) {
        try {
          client.close();
        } catch (e) {}
        client = null;
      }

      if (videoEl) {
        try { videoEl.pause(); } catch (_) {}
        videoEl.srcObject = null;
      }
      if (fallbackStream) {
        fallbackStream.getTracks().forEach((t) => t.stop());
        fallbackStream = null;
      }

      // Hide Simli container & restore WebGL orb canvas
      if (containerEl) containerEl.style.display = 'none';
      if (orbEl) orbEl.style.display = 'block';
    },

    isActive() { return ready && !destroyed; }
  };
})();

// Export globally
window.SimliAdapter = SimliAdapter;
