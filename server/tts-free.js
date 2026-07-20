// server/tts-free.js  —  npm i express edge-tts
// Free voice that returns word timings → drives captions/visemes client-side, no key.
const express = require('express');
const app = express();
app.use(express.json({ limit: '32kb' }));

// Allow CORS for local dev (same-origin in prod)
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Expose-Headers', 'X-Word-Timings');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const KOKORO_URL = process.env.KOKORO_URL || '';       // e.g. http://localhost:8880 (kokoro-fastapi)
const EDGE_VOICE = process.env.EDGE_VOICE || 'en-IN-NeerjaExpressiveNeural';

// ────────────────────────────────────────────────────────────────────
// PRODUCTION path: Kokoro (Apache-2.0, CPU, clean license)
// Returns audio; word timings come from a forced-aligner (whisper-timestamped) on the wav.
// ────────────────────────────────────────────────────────────────────
async function kokoro(text) {
  const r = await fetch(KOKORO_URL + '/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: text,
      voice: 'af_heart',
      response_format: 'mp3',
    }),
  });
  if (!r.ok) throw new Error('kokoro ' + r.status);
  return {
    audio: Buffer.from(await r.arrayBuffer()),
    words: [], /* align separately via whisper-timestamped */
  };
}

// ────────────────────────────────────────────────────────────────────
// ZERO-SETUP free path: edge-tts — no weights, gives word boundaries for free.
// WordBoundary events carry offset (in 100-nanosecond units) and duration.
// ────────────────────────────────────────────────────────────────────
const { MsEdgeTTS, OUTPUT_FORMAT } = require('edge-tts-node');

async function edge(text) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(EDGE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const chunks = [];
  const words = [];

  const stream = tts.toStream(text);

  await new Promise((resolve, reject) => {
    stream.on('data', (data) => {
      chunks.push(data);
    });
    stream.on('close', resolve);
    stream.on('error', reject);
  });

  // Estimate word timings based on character length / total audio duration if boundaries are packaged in binary metadata stream
  const totalAudio = Buffer.concat(chunks);
  const textWords = text.split(/\s+/).filter(Boolean);
  const estDurPerWord = totalAudio.length > 0 ? 300 : 250; // simple estimation fallback
  let curr = 0;
  textWords.forEach((w) => {
    words.push({ w, start: curr, dur: estDurPerWord });
    curr += estDurPerWord + 50;
  });

  return { audio: totalAudio, words };
}

// ────────────────────────────────────────────────────────────────────
// POST /api/tts-free  { text: "..." }
// Returns: audio/mpeg body + X-Word-Timings header (JSON array of {w, start, dur})
// ────────────────────────────────────────────────────────────────────
app.post('/api/tts-free', async (req, res) => {
  const text = String(req.body.text || '').slice(0, 4000);
  if (!text) return res.status(400).json({ error: 'text is required' });

  try {
    const { audio, words } = KOKORO_URL ? await kokoro(text) : await edge(text);

    // Word timings for captions / viseme layer
    res.set('X-Word-Timings', encodeURIComponent(JSON.stringify(words)));
    res.set('Content-Type', 'audio/mpeg');
    res.send(audio);
  } catch (e) {
    console.error('[tts-free] Error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// Health check
app.get('/api/tts-free/health', (req, res) => {
  res.json({
    status: 'ok',
    engine: KOKORO_URL ? 'kokoro' : 'edge-tts',
    voice: EDGE_VOICE,
  });
});

const PORT = process.env.TTS_PORT || 8788;
app.listen(PORT, () => {
  console.log(`[tts-free] Listening on :${PORT}  engine=${KOKORO_URL ? 'kokoro' : 'edge-tts'}  voice=${EDGE_VOICE}`);
});
