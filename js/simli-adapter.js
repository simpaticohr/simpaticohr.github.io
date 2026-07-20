/**
 * SimliAdapter v2.0 — Production-grade Simli Avatar Integration Adapter.
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
 */
const SimliAdapter = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let stageEl, videoEl, containerEl, orbEl, captionEl;
  let client = null;
  let ready = false;
  let currentState = 'idle';
  let destroyed = false;

  const SDK_URL = 'https://cdn.simli.com/sdk/simli-client.min.js';

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

  return {
    async init() {
      destroyed = false;
      stageEl = $('avatar-stage');
      videoEl = $('simli-video');
      containerEl = $('simli-avatar');
      orbEl = $('ai-avatar-canvas');
      captionEl = $('duix-captions');

      const apiKey = localStorage.getItem('evalis_simli_key') || localStorage.getItem('simli_api_key') || '';
      const faceId = localStorage.getItem('evalis_simli_face_id') || localStorage.getItem('simli_face_id') || 'default_female_01';

      if (!apiKey) {
        console.warn('[SimliAdapter] No API key configured. Cannot start Simli stream.');
        throw new Error('SIMLI_API_KEY_MISSING');
      }

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

      try {
        console.log('[SimliAdapter] Loading Simli WebRTC SDK...');
        await _loadScript(SDK_URL);

        if (!window.SimliClient) {
          throw new Error('SimliClient SDK not loaded successfully');
        }

        client = new window.SimliClient();
        await client.Initialize({
          apiKey: apiKey,
          faceID: faceId,
          handleSilence: true,
          videoElement: videoEl,
          audioElement: null, // We play audio locally to maintain WebRTC synchronization
        });

        await client.start();
        ready = true;
        console.log('[SimliAdapter] Simli avatar pipeline connected successfully.');
        return 'simli';
      } catch (e) {
        console.error('[SimliAdapter] Initialization failed:', e.message);
        ready = false;
        throw e;
      }
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
      // Simli is audio-reactive; TTS speech text is rendered via feedAudio(pcm)
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
        // Convert Int16 buffer to Uint8Array payload for Simli WebRTC audio channel
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
      if (client) {
        try {
          client.close();
        } catch (e) {}
        client = null;
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
