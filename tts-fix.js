/**
 * EVALIS PLATFORM — TTS Sound Fix v2.0
 * 
 * Problem: Chrome blocks audio without user gesture.
 *          speechSynthesis.speak() fails silently if no prior user interaction.
 * 
 * Fix: 
 *   1. Show "Enable Sound" button that unlocks AudioContext on click.
 *   2. Robust voice loading with retry.
 *   3. Chunk long text to avoid Chrome 15s cut-off bug.
 *   4. AudioContext keep-alive to prevent suspension.
 *
 * USAGE: Include this AFTER your existing script block in evalis-platform.html.
 *        Call SoundFix.init() on page load.
 */

const SoundFix = (() => {
  let audioCtx = null;
  let soundUnlocked = false;
  let voices = [];
  let voiceLoadAttempts = 0;

  // ─── Inject "Enable Sound" banner ───
  function injectSoundBanner() {
    if (document.getElementById('sfBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'sfBanner';
    banner.style.cssText = `
      position:fixed;bottom:16px;left:50%;transform:translateX(-50%);
      background:#1e293b;border:1px solid rgba(99,102,241,.4);
      border-radius:40px;padding:10px 20px;z-index:9999;
      display:flex;align-items:center;gap:12px;
      box-shadow:0 8px 32px rgba(0,0,0,.5);
      animation:sfSlideIn .4s cubic-bezier(.4,0,.2,1);
      font-family:'Plus Jakarta Sans',sans-serif;
    `;
    banner.innerHTML = `
      <style>
        @keyframes sfSlideIn{from{transform:translateX(-50%) translateY(80px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
        @keyframes sfFadeOut{to{transform:translateX(-50%) translateY(80px);opacity:0}}
        #sfBtn{background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:20px;
               color:#fff;font-size:0.85rem;font-weight:700;padding:8px 20px;cursor:pointer;
               font-family:inherit;transition:all .2s;}
        #sfBtn:hover{transform:scale(1.05);}
      </style>
      <span style="font-size:1rem;">🔊</span>
      <span style="font-size:0.82rem;color:#94a3b8;">AI interviewer needs audio permission</span>
      <button id="sfBtn" onclick="SoundFix.unlock()">Enable Sound</button>
    `;
    document.body.appendChild(banner);
  }

  // ─── Unlock audio (must be called from user gesture) ───
  async function unlock() {
    try {
      // Create and resume AudioContext
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Play silent buffer to unlock
      const buffer = audioCtx.createBuffer(1, 1, 22050);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start(0);

      // Also unlock Web Speech API with a silent utterance
      const utter = new SpeechSynthesisUtterance(' ');
      utter.volume = 0;
      utter.rate = 2;
      window.speechSynthesis.speak(utter);

      soundUnlocked = true;

      // Dismiss banner
      const banner = document.getElementById('sfBanner');
      if (banner) {
        banner.style.animation = 'sfFadeOut .3s ease forwards';
        setTimeout(() => banner.remove(), 320);
      }

      console.log('[SoundFix] Audio unlocked ✓');

      // Preload voices after unlock
      loadVoices();
    } catch (e) {
      console.error('[SoundFix] Unlock error:', e);
    }
  }

  // ─── Load voices with retry ───
  function loadVoices() {
    voices = window.speechSynthesis?.getVoices() || [];
    if (voices.length > 0) {
      console.log('[SoundFix] Loaded', voices.length, 'voices');
      return voices;
    }
    if (voiceLoadAttempts < 10) {
      voiceLoadAttempts++;
      setTimeout(loadVoices, 200 * voiceLoadAttempts);
    }
    return voices;
  }

  // ─── Find best voice for language ───
  function findVoice(langCode) {
    if (!voices.length) voices = window.speechSynthesis?.getVoices() || [];
    const lang = langCode?.split('-')[0] || 'en';
    return (
      voices.find(v => v.lang.startsWith(langCode) && !v.localService) ||
      voices.find(v => v.lang.startsWith(langCode)) ||
      voices.find(v => v.lang.startsWith(lang) && v.name.includes('Google')) ||
      voices.find(v => v.lang.startsWith(lang)) ||
      voices.find(v => v.lang.startsWith('en'))
    );
  }

  // ─── Split text into speakable chunks ───
  function splitText(text, maxLen = 180) {
    if (text.length <= maxLen) return [text];
    const chunks = [];
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
    let chunk = '';
    for (const sentence of sentences) {
      if ((chunk + sentence).length <= maxLen) {
        chunk += sentence;
      } else {
        if (chunk.trim()) chunks.push(chunk.trim());
        chunk = sentence;
      }
    }
    if (chunk.trim()) chunks.push(chunk.trim());
    return chunks.length ? chunks : [text.substring(0, maxLen)];
  }

  // ─── Robust speak function (replaces original) ───
  function speak(text, langCode = 'en-US', onDone = null) {
    return new Promise(resolve => {
      if (!window.speechSynthesis || !text) { resolve(); if (onDone) onDone(); return; }

      const done = () => { resolve(); if (onDone) onDone(); };

      // If audio not unlocked yet, show banner and skip speaking
      if (!soundUnlocked) {
        injectSoundBanner();
        console.warn('[SoundFix] Sound not unlocked — skipping TTS');
        resolve();
        return;
      }

      window.speechSynthesis.cancel();

      const chunks = splitText(text);
      let idx = 0;

      function speakChunk() {
        if (idx >= chunks.length) { done(); return; }
        const chunk = chunks[idx++];

        const utter = new SpeechSynthesisUtterance(chunk);
        utter.lang = langCode;
        utter.rate = 0.9;
        utter.pitch = 1.0;
        utter.volume = 1.0;

        const voice = findVoice(langCode);
        if (voice) utter.voice = voice;

        // Chrome 15s cut-off workaround
        const keepAlive = setInterval(() => {
          if (!window.speechSynthesis.speaking) { clearInterval(keepAlive); return; }
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }, 8000);

        utter.onend = () => { clearInterval(keepAlive); speakChunk(); };
        utter.onerror = (e) => {
          clearInterval(keepAlive);
          console.error('[SoundFix] TTS error:', e.error);
          speakChunk(); // Continue with next chunk
        };

        // Small delay between chunks
        setTimeout(() => {
          try {
            window.speechSynthesis.speak(utter);
          } catch (e) {
            console.error('[SoundFix] Speak exception:', e);
            speakChunk();
          }
        }, idx > 1 ? 100 : 0);
      }

      speakChunk();
    });
  }

  // ─── Keep AudioContext alive ───
  function keepAliveAudioCtx() {
    if (!audioCtx) return;
    setInterval(() => {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    }, 30000);
  }

  // ─── Init ───
  function init() {
    // Load voices
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
      setTimeout(loadVoices, 100);
      setTimeout(loadVoices, 500);
      setTimeout(loadVoices, 1500);
    }

    // Show banner on interview start
    document.addEventListener('DOMContentLoaded', () => {
      // Show banner immediately as a prompt
      setTimeout(() => {
        if (!soundUnlocked) injectSoundBanner();
      }, 1000);
    });

    // Also unlock on any user interaction if not already done
    const events = ['click', 'keydown', 'touchstart'];
    function onUserGesture() {
      if (!soundUnlocked) {
        unlock();
        events.forEach(e => document.removeEventListener(e, onUserGesture));
      }
    }
    events.forEach(e => document.addEventListener(e, onUserGesture, { once: false }));

    keepAliveAudioCtx();

    console.log('[SoundFix] Initialized ✓');
  }

  return { init, unlock, speak, loadVoices, isUnlocked: () => soundUnlocked };
})();

// ─── Patch the existing speak() function ───
// This overrides the original speak() in evalis-platform.html
// The original function is replaced with SoundFix.speak()
window.speak = function(text) {
  // Get the current language from the interview
  const lang = typeof window.lang !== 'undefined' ? window.lang : 'en';
  const L_map = {
    en: 'en-US', hi: 'hi-IN', ml: 'ml-IN', ta: 'ta-IN',
    te: 'te-IN', kn: 'kn-IN', bn: 'bn-IN', es: 'es-ES',
    ar: 'ar-SA', fr: 'fr-FR', de: 'de-DE', ur: 'ur-PK'
  };
  const langCode = L_map[lang] || 'en-US';

  // Set orb to speaking state if the function exists
  if (typeof window.setOrb === 'function') window.setOrb('speaking');

  return SoundFix.speak(text, langCode, () => {
    if (typeof window.setOrb === 'function') window.setOrb('listening');
  });
};

// Auto-init
SoundFix.init();
