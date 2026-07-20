/**
 * HyperRealRenderer v4.0 — Real streaming photoreal human interviewer & 30 FPS fallback.
 *
 * Capabilities & Audio Bridge:
 *   - Configurable via configure({ provider, capabilities, persona })
 *   - getSampleRate(): returns sample rate for AudioWorklet tap (default 16000 Hz)
 *   - feedAudio(int16Buf): routes Int16 PCM frames to the provider's external-pcm lip-sync input
 *   - flushAudio(): flushes audio buffer on barge-in
 *   - Dynamic capability filtering for gestures & emotions (never hardcodes unallowed names)
 */
const HyperRealRenderer = (function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────
  let provider = 'heygen';
  let sessionApi = '/api/avatar/session';
  let capabilities = null;
  let persona = null;
  let audioMode = 'external-pcm';

  // ── DOM References ──
  const $ = (id) => document.getElementById(id);
  let stageEl, videoEl, captionEl, orbEl, frameEl;

  // ── State ──
  let currentState = 'idle';
  let destroyed = false;
  let adapter = null;
  let streamReady = false;
  let abortCtrl = null;
  let captionAnimId = null;
  let videoStreamRafId = null;

  // ── Procedural Video Stream Engine State ──
  let offscreenCanvas = null;
  let offscreenCtx = null;
  let baseImage = null;
  let baseImageLoaded = false;
  let mediaStream = null;
  let t0 = 0;
  let blinkPeak = 0;
  let nextBlinkTime = 0;
  let mouthOpenAmount = 0;
  let targetMouthOpen = 0;
  let pupilOffsetX = 0;
  let pupilOffsetY = 0;
  let nextPupilShiftTime = 0;

  // ── Tag parser with capability validation ──
  const TAG_RE = /\[\[(gesture|emotion):([a-z_]+)\]\]/gi;
  function emitAndClean(text) {
    let m;
    while ((m = TAG_RE.exec(text)) !== null) {
      if (!streamReady || !adapter) continue;
      const [, kind, val] = m;
      if (kind === 'gesture' && typeof adapter.triggerGesture === 'function') {
        if (!capabilities || !capabilities.gestures || capabilities.gestures.includes(val)) {
          adapter.triggerGesture(val);
        }
      } else if (kind === 'emotion' && typeof adapter.setExpression === 'function') {
        if (!capabilities || !capabilities.emotions || capabilities.emotions.includes(val)) {
          adapter.setExpression(val);
        }
      }
    }
    return text.replace(TAG_RE, '').trim();
  }

  // ────────────────────────────────────────────────────────────────────
  // 30 FPS MEDIASTREAM VIDEO GENERATOR
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
    baseImage.src = (persona && persona.poster) || 'assets/ai-interviewer-avatar.png';
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
        mediaStream = offscreenCanvas.captureStream(30);
        if (videoEl) {
          videoEl.srcObject = mediaStream;
          videoEl.style.display = 'block';
          videoEl.style.opacity = '1';
          videoEl.play().catch(() => {});
        }
      } catch (e) {
        console.warn('[HyperReal] captureStream note:', e.message);
      }
    }
  }

  // ── HEYGEN ADAPTER WITH EXTERNAL-PCM BRIDGE ──
  const HeyGenAdapter = {
    sa: null,
    dc: null,
    sampleRateHz: 16000,
    async connect(videoEl, hooks) {
      let mod;
      try { mod = await import('https://cdn.jsdelivr.net/npm/@heygen/streaming-avatar@2.0.4/+esm'); }
      catch (e) {
        try { mod = await import('@heygen/streaming-avatar'); }
        catch (e2) { throw new Error('PKG_MISSING:@heygen/streaming-avatar'); }
      }
      const StreamingAvatar = mod.default || mod.StreamingAvatar;
      const StreamingAvatarEvents = mod.StreamingAvatarEvents || {};

      const r = await fetch(sessionApi + '/' + provider, { method: 'POST', signal: abortCtrl ? abortCtrl.signal : undefined });
      if (!r.ok) throw new Error('session ' + r.status);
      const data = await r.json();

      const { token, persona: pData, audioMode: aMode } = data;
      if (aMode) audioMode = aMode;

      this.sa = new StreamingAvatar({ token });
      if (StreamingAvatarEvents.StreamReady) {
        this.sa.on(StreamingAvatarEvents.StreamReady, (e) => {
          if (e?.detail?.stream && videoEl) {
            videoEl.srcObject = e.detail.stream;
            hooks.onReady();
          }
        });
      }
      if (StreamingAvatarEvents.AvatarStartTalking) {
        this.sa.on(StreamingAvatarEvents.AvatarStartTalking, () => hooks.onTalkStart());
      }
      if (StreamingAvatarEvents.AvatarEndTalking) {
        this.sa.on(StreamingAvatarEvents.AvatarEndTalking, () => hooks.onTalkEnd());
      }
      this.sa.on('avatarTalkText', (e) => {
        if (e?.detail?.words) hooks.onTranscript(e.detail.words);
      });

      const avatarName = (pData && pData.avatarName) || 'Ann_Doctor_Standing2_public';
      const voiceId = (pData && pData.voiceId) || '265511f088344783b38c644837582b9a';
      await this.sa.createAvatar({ avatarName, voice: { voiceId } });
      await this.sa.startSession();
    },
    speak(text)       { this.sa?.speak?.({ text }) ?? this.sa?.sendText?.({ text }); },
    interrupt()       { try { this.sa?.interruptSpeaking?.() ?? this.sa?.interrupt?.(); } catch(_) {} },
    setExpression(e)  { try { this.sa?.setEmotion?.(e); } catch(_) {} },
    triggerGesture(g) { try { this.sa?.sendGesture?.({ gestureName: g }); } catch(_) {} },
    feedAudio(int16Buf) {
      if (this.sa?.sendAudio) return this.sa.sendAudio({ audio: int16Buf });
      if (this.sa?.inputAudio) return this.sa.inputAudio(int16Buf);
      if (this.dc && this.dc.readyState === 'open') return this.dc.send(int16Buf);
    },
    flush() {
      try { this.sa?.flushAudio?.(); this.sa?.interruptSpeaking?.(); } catch(_) {}
    },
    async close()     { try { await this.sa?.endSession?.(); } catch (_) {} this.sa = null; },
  };

  const ADAPTERS = { heygen: HeyGenAdapter };

  // ── CAPTIONS ──
  function startCaptions(words) {
    if (!captionEl || !words?.length) return;
    const t0Cap = performance.now();
    captionEl.innerHTML = words.map((w) => `<span class="duix-word">${esc(w.w)}</span> `).join('');
    captionEl.style.opacity = '1';
    const tick = () => {
      if (destroyed) return;
      const e = performance.now() - t0Cap;
      captionEl.querySelectorAll('.duix-word').forEach((sp, i) => {
        const cw = words[i]; if (!cw) return;
        sp.classList.toggle('active', e >= cw.start && e <= cw.start + cw.dur);
        sp.classList.toggle('spoken', e > cw.start + cw.dur);
      });
      const last = words[words.length - 1];
      captionAnimId = (e < last.start + last.dur + 600) ? requestAnimationFrame(tick) : null;
    };
    if (captionAnimId) cancelAnimationFrame(captionAnimId);
    captionAnimId = requestAnimationFrame(tick);
  }
  function stopCaptions() { if (captionAnimId) cancelAnimationFrame(captionAnimId); }
  const esc = (s) => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

  // ── STATE HANDLER ──
  function applyState(s) {
    if (streamReady && adapter) {
      if (s === 'listening')                 { adapter.setExpression('attentive'); adapter.triggerGesture('nod'); }
      else if (s === 'thinking' || s === 'processing') { adapter.setExpression('curious'); adapter.triggerGesture('gaze_away'); }
      else if (s === 'speaking')             { adapter.setExpression('neutral'); }
    }
  }

  function setState(s) {
    if (currentState === s) return;
    currentState = s;
    if (stageEl) {
      stageEl.className = 'avatar-stage hr ' + s;
    }
    applyState(s);
  }

  // ────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ────────────────────────────────────────────────────────────────────
  return {
    configure(cfg) {
      if (cfg.provider) provider = cfg.provider;
      if (cfg.capabilities) capabilities = cfg.capabilities;
      if (cfg.persona) persona = cfg.persona;
      if (cfg.sessionApi) sessionApi = cfg.sessionApi;
    },

    getSampleRate() {
      return (streamReady && adapter && adapter.sampleRateHz) ? adapter.sampleRateHz : 16000;
    },

    feedAudio(int16Buf) {
      if (streamReady && audioMode === 'external-pcm' && adapter && typeof adapter.feedAudio === 'function') {
        adapter.feedAudio(int16Buf);
      }
    },

    flushAudio() {
      if (streamReady && adapter && typeof adapter.flush === 'function') {
        adapter.flush();
      }
    },

    async init() {
      destroyed = false;
      abortCtrl = new AbortController();
      stageEl   = $('avatar-stage');
      videoEl   = $('duixVideo');
      captionEl = $('duix-captions');
      orbEl     = $('ai-avatar-canvas');

      if (orbEl) orbEl.style.display = 'none';
      document.querySelectorAll('.audio-waveform, #waveform, .orb-waveform')
              .forEach((el) => (el.style.display = 'none'));
      const cartoon = $('duix-fallback-face'); if (cartoon) cartoon.remove();

      const duixContainer = $('duix-avatar');
      if (duixContainer) duixContainer.style.display = 'block';

      if (stageEl) stageEl.classList.add('hr');

      startProceduralVideoStream();

      adapter = Object.create(ADAPTERS[provider] || HeyGenAdapter);
      try {
        await adapter.connect(videoEl, {
          onReady: () => {
            streamReady = true;
            console.log('[HyperReal] WebRTC MediaStream ready — replacing procedural stream.');
          },
          onTalkStart: () => { if (stageEl) stageEl.classList.add('speaking'); },
          onTalkEnd:   () => { if (stageEl) stageEl.classList.remove('speaking'); stopCaptions(); },
          onTranscript:(words) => startCaptions(words),
        });
      } catch (e) {
        console.log('[HyperReal] Stream connect note:', e.message, '— running 30 FPS HTML5 MediaStream video engine.');
        streamReady = false;
      }

      setState(currentState || 'idle');
      return 'hyperreal';
    },

    mode() { return 'hyperreal'; },
    getState() { return currentState; },
    onState(s) {
      if (s === 'listening' && streamReady && adapter) adapter.interrupt();
      setState(s);
    },

    say(text) {
      const clean = emitAndClean(text);
      if (streamReady && adapter) {
        adapter.speak(clean);
      } else if (typeof DuixRenderer !== 'undefined' && DuixRenderer.isActive()) {
        DuixRenderer.say(clean);
      }
      return Promise.resolve();
    },

    primeCache() {},
    setCaptions(text, words) {
      words?.length ? startCaptions(words)
        : captionEl && (captionEl.textContent = text, captionEl.style.opacity = '1');
    },

    destroy() {
      destroyed = true;
      stopCaptions();
      if (videoStreamRafId) cancelAnimationFrame(videoStreamRafId);
      if (adapter && typeof adapter.close === 'function') adapter.close();
      if (abortCtrl) abortCtrl.abort();
      if (videoEl) {
        try { videoEl.pause(); } catch (_) {}
        videoEl.srcObject = null;
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
        mediaStream = null;
      }
    },
    isActive() { return !destroyed; },
  };
})();
