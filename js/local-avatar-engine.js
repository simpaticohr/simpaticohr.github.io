/**
 * LocalAvatarEngine v1.0 — Simpatico Local RTX GPU Hybrid Avatar Engine.
 * 
 * Tier A — Pre-rendered ByteDance LatentSync 1080p HD Video Clips for fixed assessment questions.
 * Tier B — Realtime MuseTalk 1.5 / GPU WebSocket streaming for dynamic follow-ups.
 */
const LocalAvatarEngine = (function () {
  'use strict';

  let manifest = null;
  let manifestLoaded = false;

  function djb2(text) {
    const norm = text.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    let h = 5381;
    for (let i = 0; i < norm.length; i++) {
      h = ((h * 33) + norm.charCodeAt(i)) & 0xFFFFFFFF;
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function getVideoEl() {
    return document.getElementById('duixVideo') || document.getElementById('simli-video');
  }

  function getCanvasEl() {
    return document.getElementById('avatarCanvas') || document.getElementById('duixCanvas');
  }

  return {
    async init() {
      const cfg = JSON.parse(localStorage.getItem('adminConfig') || '{}');
      const baseUrl = (cfg.latentsyncUrl || 'http://localhost:8000').replace(/\/$/, '');

      try {
        const resp = await fetch(`${baseUrl}/clips/manifest.json`);
        if (resp.ok) {
          manifest = await resp.json();
          manifestLoaded = true;
          console.log('[LocalAvatarEngine] Loaded pre-rendered LatentSync clip manifest:', Object.keys(manifest.clips || {}).length, 'clips ready.');
        }
      } catch (e) {
        console.log('[LocalAvatarEngine] Manifest probe note:', e.message);
      }
    },

    async trySpeak(text) {
      if (!manifestLoaded || !manifest?.clips) return false;
      const key = djb2(text);
      const entry = manifest.clips[key];
      if (!entry) return false;

      const cfg = JSON.parse(localStorage.getItem('adminConfig') || '{}');
      const baseUrl = (cfg.latentsyncUrl || 'http://localhost:8000').replace(/\/$/, '');
      const clipUrl = entry.url.startsWith('http') ? entry.url : `${baseUrl}${entry.url}`;

      console.log('[LocalAvatarEngine] Playing pre-rendered LatentSync 1080p HD video clip for:', text.slice(0, 45));

      const videoEl = getVideoEl();
      const canvasEl = getCanvasEl();

      if (videoEl) {
        if (canvasEl) canvasEl.style.display = 'none';

        videoEl.src = clipUrl;
        videoEl.style.display = 'block';
        videoEl.style.objectFit = 'cover';
        try {
          await videoEl.play();
          videoEl.onended = () => {
            if (typeof HyperRealRenderer !== 'undefined') {
              try { HyperRealRenderer.onState('listening'); } catch(e) {}
            }
          };
          return true;
        } catch(e) {
          console.warn('[LocalAvatarEngine] Video play note:', e);
        }
      }
      return false;
    },

    stop() {
      const videoEl = getVideoEl();
      if (videoEl) {
        try { videoEl.pause(); } catch(e) {}
      }
    }
  };
})();
