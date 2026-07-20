// server/hyperreal-session.js — HeyGen / Tavus / D-ID streaming token session endpoints
// Express route — npm i express; env: HEYGEN_API_KEY, HEYGEN_AVATAR_NAME, HEYGEN_VOICE_ID
const express = require('express');
const app = express();
app.use(express.json());

// CORS for local dev
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ────────────────────────────────────────────────────────────────────
// POST /api/avatar/session/heygen
// ────────────────────────────────────────────────────────────────────
app.post('/api/avatar/session/heygen', async (req, res) => {
  try {
    const apiKey = process.env.HEYGEN_API_KEY || '';
    if (!apiKey) {
      return res.status(401).json({ error: 'HEYGEN_API_KEY not configured on server' });
    }

    const r = await fetch('https://api.heygen.com/v2/streaming/create_token', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({}),
    });
    const j = await r.json();
    if (!r.ok) return res.status(r.status).json(j);
    res.json({
      token: j.data?.token ?? j.token,
      avatarName: process.env.HEYGEN_AVATAR_NAME || 'Ann_Doctor_Standing2_public',
      voiceId: process.env.HEYGEN_VOICE_ID || '265511f088344783b38c644837582b9a',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/api/avatar/session/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: 'heygen',
    heygenKeySet: !!process.env.HEYGEN_API_KEY,
  });
});

const PORT = process.env.SESSION_PORT || 8790;
app.listen(PORT, () => {
  console.log(`[hyperreal-session] Listening on :${PORT}  heygenKey=${!!process.env.HEYGEN_API_KEY}`);
});
