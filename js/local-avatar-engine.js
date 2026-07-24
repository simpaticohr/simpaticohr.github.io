/**
 * LocalAvatarEngine v1.0 — Hybrid LatentSync / MuseTalk RTX-GPU avatar driver.
 *
 * Priority chain when the interviewer speaks:
 *   1. PRE-RENDERED LatentSync clip (max quality, baked offline on the RTX
 *      4060 by gpu-server/prerender_questions.py) — matched by a djb2 hash
 *      of the spoken text against the published manifest.json.
 *   2. LIVE GPU server speech (gpu-server/server.py): Edge-TTS audio +
 *      MuseTalk (or procedural) frames streamed over WebSocket in realtime.
 *   3. Returns false -> caller falls back to the existing chain
 *      (Gemini TTS / speechSynthesis + HyperRealRenderer procedural canvas).
 *
 * Configuration (localStorage "adminConfig"):
 *   latentsyncUrl   — https URL of the GPU server (Cloudflare Tunnel), e.g.
 *                     "https://avatar.yourdomain.com" or a
 *                     "https://xxxx.trycloudflare.com" quick-tunnel URL.
 *                     Defaults to http://localhost:8000 for same-machine demos.
 *   clipManifestUrl — optional absolute URL of manifest.json when clips are
 *                     hosted on Supabase Storage.
 */
const LocalAvatarEngine = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let manifest = null;          // { clips: { hash: {url, text} } }
  let manifestLoaded = false;
  let ws = null;
  let wsReady = false;
  let audioCtx = null;
  let currentSource = null;     // active AudioBufferSourceNode
  let activeClipVideo = false;
  let serverHealthy = null;     // null = unknown, true/false = probed

  function cfg() {
    try { return JSON.parse(localStorage.getItem('adminConfig') || '{}'); }
    catch (_) { return {}; }
  }

  function serverBase() {
    const c = cfg();
    let base = (c.latentsyncUrl || 'http://localhost:8000').replace(/\/+$/, '');
    return base;
  }

  // MUST match djb2() in gpu-server/prerender_questions.py
  function normalizeAndHash(text) {
    let norm = '';
    for (const ch of String(text)) {
      norm += /[a-zA-Z0-9]/.test(ch) ? ch.toLowerCase() : ' ';
    }
    norm = norm.split(/\s+/).filter(Boolean).join(' ');
    let h = 5381;
    for (let i = 0; i < norm.length; i++) {
      h = (Math.imul(h, 33) + norm.charCodeAt(i)) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  // ── Manifest (pre-rendered LatentSync clips) ──────────────────────
  async function loadManifest() {
    if (manifestLoaded) return manifest;
    manifestLoaded = true;
    const c = cfg();
    const candidates = [];
    if (c.clipManifestUrl) candidates.push(c.clipManifestUrl);
    candidates.push(serverBase() + '/clips/manifest.json');

    for (const url of candidates) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (r.ok) {
          manifest = await r.json();
          console.log('[LocalAvatar] Clip manifest loaded:',
            Object.keys(manifest.clips || {}).length, 'clips from', url);
          manifest._baseUrl = url.replace(/\/manifest\.json.*$/, '');
          return manifest;
        }
      } catch (_) {}
    }
    console.log('[LocalAvatar] No pre-rendered clip manifest available.');
    return null;
  }

  function resolveClipUrl(entry) {
    let u = entry.url;
    if (/^https?:\/\//.test(u)) return u;
    if (u.startsWith('/clips/')) return serverBase() + u;
    return (manifest._baseUrl || serverBase() + '/clips') + '/' + u.replace(/^\/+/, '');
  }

  // ── Pre-rendered clip playback ─────────────────────────────────────
  function playClip(url) {
    return new Promise((resolve) => {
      const video = $('duixVideo');
      const canvas = $('avatarCanvas') || $('duixCanvas');
      if (!video) return resolve(false);

      const done = (ok) => {
        activeClipVideo = false;
        video.style.display = 'none';
        video.muted = true;
        if (canvas) canvas.style.display = 'block';
        if (typeof HyperRealRenderer !== 'undefined') {
          try { HyperRealRenderer.onState('listening'); } catch (_) {}
        }
        resolve(ok);
      };

      video.onended = () => done(true);
      video.onerror = () => done(false);

      activeClipVideo = true;
      video.srcObject = null;
      video.src = url;
      video.muted = false;
      video.style.display = 'block';
      if (canvas) canvas.style.display = 'none';
      if (typeof HyperRealRenderer !== 'undefined') {
        try { HyperRealRenderer.onState('speaking'); } catch (_) {}
      }
      video.play().catch((e) => {
        console.warn('[LocalAvatar] Clip autoplay blocked/failed:', e.message);
        done(false);
      });
    });
  }

  // ── Live GPU server (WebSocket) ────────────────────────────────────
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function connectWs() {
    return new Promise((resolve) => {
      if (ws && wsReady) return resolve(true);
      let url = serverBase().replace(/^http/, 'ws') + '/ws';
      try {
        ws = new WebSocket(url);
      } catch (_) { return resolve(false); }

      const timeout = setTimeout(() => { try { ws.close(); } catch (_) {} resolve(false); }, 3500);

      ws.onopen = () => {
        clearTimeout(timeout);
        wsReady = true;
        console.log('[LocalAvatar] Connected to RTX GPU server:', url);
        resolve(true);
      };
      ws.onclose = () => { wsReady = false; ws = null; };
      ws.onerror = () => { clearTimeout(timeout); wsReady = false; resolve(false); };

      ws.onmessage = (evt) => {
        let msg;
        try { msg = JSON.parse(evt.data); } catch (_) { return; }

        if (msg.type === 'audio_wav' && msg.data) {
          playWavBase64(msg.data);
        } else if (msg.type === 'frame' && msg.data && !activeClipVideo) {
          const canvas = $('avatarCanvas') || $('duixCanvas');
          if (!canvas) return;
          const img = new Image();
          img.onload = () => {
            const ctx2d = canvas.getContext('2d');
            if (ctx2d) ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          img.src = 'data:image/jpeg;base64,' + msg.data;
        } else if (msg.type === 'speak_end') {
          if (typeof HyperRealRenderer !== 'undefined') {
            try { HyperRealRenderer.onState('listening'); } catch (_) {}
          }
        } else if (msg.type === 'pong' && msg.engine) {
          console.log('[LocalAvatar] GPU engine tier:', msg.engine.tier);
        }
      };
    });
  }

  async function playWavBase64(b64) {
    try {
      const ctx = getAudioCtx();
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buffer = await ctx.decodeAudioData(bytes.buffer);
      stopAudio();
      currentSource = ctx.createBufferSource();
      currentSource.buffer = buffer;
      currentSource.connect(ctx.destination);
      currentSource.start();
      currentSource.onended = () => { currentSource = null; };
    } catch (e) {
      console.warn('[LocalAvatar] WAV playback error:', e.message);
    }
  }

  function stopAudio() {
    if (currentSource) { try { currentSource.stop(); } catch (_) {} currentSource = null; }
  }

  async function probeHealth() {
    if (serverHealthy !== null) return serverHealthy;
    try {
      const r = await fetch(serverBase() + '/health', { signal: AbortSignal.timeout(3000) });
      serverHealthy = r.ok;
      if (r.ok) {
        const h = await r.json();
        console.log('[LocalAvatar] GPU server healthy. GPU:', h.gpu, '| tier:', h.engine && h.engine.tier);
      }
    } catch (_) { serverHealthy = false; }
    return serverHealthy;
  }

  // ── Public API ─────────────────────────────────────────────────────
  return {
    /** Warm up: load clip manifest + probe GPU server. Call once at init. */
    async init() {
      await Promise.all([loadManifest(), probeHealth()]);
    },

    /**
     * Attempt to speak `text` with the highest-quality local pipeline.
     * Returns true if handled (audio + video covered), false if the caller
     * should fall back to its own TTS/avatar chain.
     */
    async trySpeak(text) {
      if (!text) return false;

      // 1) Pre-rendered LatentSync clip
      await loadManifest();
      if (manifest && manifest.clips) {
        const entry = manifest.clips[normalizeAndHash(text)];
        if (entry) {
          console.log('[LocalAvatar] Playing pre-rendered LatentSync clip.');
          this.stop();
          playClip(resolveClipUrl(entry)); // resolves in background on clip end
          return true;
        }
      }

      // 2) Live GPU server (MuseTalk / procedural + Edge-TTS)
      if (await probeHealth()) {
        const ok = await connectWs();
        if (ok && ws && wsReady) {
          this.stop();
          ws.send(JSON.stringify({ type: 'speak', text: text, voice: cfg().ttsVoice || 'en-US-AriaNeural' }));
          return true;
        }
      }

      return false; // fall back to legacy chain
    },

    /** Barge-in / interruption: halt clip video, live audio, and frames. */
    stop() {
      stopAudio();
      if (ws && wsReady) {
        try { ws.send(JSON.stringify({ type: 'stop' })); } catch (_) {}
      }
      const video = $('duixVideo');
      if (video && activeClipVideo) {
        try { video.pause(); } catch (_) {}
        video.onended = null;
        video.style.display = 'none';
        video.muted = true;
        activeClipVideo = false;
        const canvas = $('avatarCanvas') || $('duixCanvas');
        if (canvas) canvas.style.display = 'block';
      }
    },

    isServerAvailable() { return serverHealthy === true; },
    hasClips() { return !!(manifest && manifest.clips && Object.keys(manifest.clips).length); },
  };
})();

if (typeof window !== 'undefined') window.LocalAvatarEngine = LocalAvatarEngine;
