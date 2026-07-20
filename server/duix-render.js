// server/duix-render.js  —  abstracts DuiX-Avatar (base video + audio → clip)
// Replace duixRenderClip() with the real DuiX CLI/SDK call; shape is what matters.
const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '64kb' }));

// Allow CORS for local dev
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Static serving for rendered clips
const OUT = path.join(__dirname, 'clips');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
app.use('/clips', express.static(OUT));

const BASE_VIDEO = process.env.DUIX_BASE_VIDEO || '';       // your filmed source clip (the "Priya" plate)
const TTS_URL = process.env.TTS_URL || 'http://localhost:8788';

// ────────────────────────────────────────────────────────────────────
// DuiX-Avatar: one original video + audio → lip-matched talking-head clip
// ⬇️ SWAP for the actual DuiX invocation; keep this (audio, baseVideo) → outMp4 contract
// ────────────────────────────────────────────────────────────────────
function duixRenderClip(audioPath, outName) {
  return new Promise((resolve, reject) => {
    const out = path.join(OUT, outName);

    if (!BASE_VIDEO) {
      // No base video configured — create a stub response for dev/testing
      // In production, this would call the real DuiX binary
      console.warn('[duix] No BASE_VIDEO configured, returning audio-only stub');
      try {
        fs.copyFileSync(audioPath, out);
      } catch (e) {
        // If copy fails, create empty file
        fs.writeFileSync(out, '');
      }
      return resolve('/clips/' + outName);
    }

    execFile(
      process.env.DUIX_BIN || 'duix-render',
      ['--base', BASE_VIDEO, '--audio', audioPath, '--out', out],
      { timeout: 30000 },
      (err) => (err ? reject(err) : resolve('/clips/' + outName))
    );
  });
}

// ────────────────────────────────────────────────────────────────────
// Helper: fetch TTS audio for a line of text
// ────────────────────────────────────────────────────────────────────
async function fetchTtsAudio(text) {
  const resp = await fetch(TTS_URL + '/api/tts-free', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) throw new Error(`TTS error: ${resp.status}`);

  const wordTimingsRaw = resp.headers.get('X-Word-Timings');
  const words = wordTimingsRaw
    ? JSON.parse(decodeURIComponent(wordTimingsRaw))
    : [];

  return {
    audio: Buffer.from(await resp.arrayBuffer()),
    words,
  };
}

// ────────────────────────────────────────────────────────────────────
// POST /api/duix/prerender
// Speculative pre-render: client sends likely-next lines during the candidate's turn;
// we render them NOW so the follow-up plays at ~0ms.
// Body: { lines: ["line1", "line2", ...] }  (max 4)
// Returns: { clips: [{ text, url, words }] }
// ────────────────────────────────────────────────────────────────────
app.post('/api/duix/prerender', async (req, res) => {
  const lines = Array.isArray(req.body.lines) ? req.body.lines.slice(0, 4) : [];
  if (!lines.length) return res.json({ clips: [] });

  try {
    const jobs = lines.map(async (text, i) => {
      const id = 'pr_' + Date.now() + '_' + i + '.mp4';
      const wavPath = path.join(OUT, id + '.mp3');

      // 1. Synthesize audio with word timings
      const { audio, words } = await fetchTtsAudio(text);
      fs.writeFileSync(wavPath, audio);

      // 2. Render lip-synced clip via DuiX
      const url = await duixRenderClip(wavPath, id);

      // 3. Clean up temp audio
      try { fs.unlinkSync(wavPath); } catch (_) {}

      return { text, url, words };
    });

    const clips = await Promise.all(jobs);
    res.json({ clips });
  } catch (e) {
    console.error('[duix/prerender] Error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────────
// POST /api/duix/render
// Live render (novel LLM line): render on demand;
// client covers latency with thinking overlay.
// Body: { text: "..." }
// Returns: { url, words }
// ────────────────────────────────────────────────────────────────────
app.post('/api/duix/render', async (req, res) => {
  const text = String(req.body.text || '').slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'text is required' });

  try {
    const id = 'lv_' + Date.now() + '.mp4';
    const wavPath = path.join(OUT, id + '.mp3');

    // 1. Synthesize audio with word timings
    const { audio, words } = await fetchTtsAudio(text);
    fs.writeFileSync(wavPath, audio);

    // 2. Render lip-synced clip via DuiX
    const url = await duixRenderClip(wavPath, id);

    // 3. Clean up temp audio
    try { fs.unlinkSync(wavPath); } catch (_) {}

    res.json({ url, words });
  } catch (e) {
    console.error('[duix/render] Error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// Health check
app.get('/api/duix/health', (req, res) => {
  res.json({
    status: 'ok',
    baseVideo: BASE_VIDEO || '(none — stub mode)',
    ttsUrl: TTS_URL,
    clipDir: OUT,
  });
});

const PORT = process.env.DUIX_PORT || 8789;
app.listen(PORT, () => {
  console.log(`[duix-render] Listening on :${PORT}  base=${BASE_VIDEO || '(stub)'}  tts=${TTS_URL}`);
});
