// server/hyperreal-session.js
// Full premium streaming-avatar session broker.
// Providers: heygen | tavus | did | selfhost   (each independent; missing key => that route 503, others live)
// Premium model: Gemini = brain+voice, avatar = face. Audio bridge is CLIENT<->provider (see client section).
//   Server mints sessions, declares capabilities, brokers self-host WebRTC, cleans up, observes, secures.
'use strict';

const express = require('express');
const crypto  = require('crypto');

const app = express();
app.set('trust proxy', true);                 // correct req.ip behind reverse proxy
app.use(express.json({ limit: '256kb' }));

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG (validated at boot; missing key disables ONLY that provider)
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  port:            parseInt(process.env.SESSION_PORT || '8790', 10),
  env:             process.env.NODE_ENV || 'development',
  allowedOrigins:  (process.env.CORS_ORIGINS || 'http://localhost:*,http://127.0.0.1:*').split(',').map(s => s.trim()),
  webhookSecret:   process.env.WEBHOOK_SECRET || '',
  ratePerMin:      parseInt(process.env.RATE_PER_MIN || '120', 10),
  rateBurst:       parseInt(process.env.RATE_BURST || '30', 10),
  sessionTtlMs:    parseInt(process.env.SESSION_TTL_MIN || '120', 10) * 60_000,
  maxConcurPerIp:  parseInt(process.env.MAX_CONCUR_PER_IP || '3', 10),
  upstreamTimeout: parseInt(process.env.UPSTREAM_TIMEOUT_MS || '9000', 10),
  heygen: {
    key:        process.env.HEYGEN_API_KEY || '',
    avatarName: process.env.HEYGEN_AVATAR_NAME || 'Ann_Doctor_Standing2_public',
    voiceId:    process.env.HEYGEN_VOICE_ID || '265511f088344783b38c644837582b9a',
  },
  tavus: {
    key:        process.env.TAVUS_API_KEY || '',
    replicaId:  process.env.TAVUS_REPLICA_ID || '',
    personaId:  process.env.TAVUS_PERSONA_ID || '',
  },
  did: {
    key:        process.env.DID_API_KEY || '',
    sourceUrl:  process.env.DID_SOURCE_URL || '',   // photoreal presenter image/video url
    voiceId:    process.env.DID_VOICE_ID || 'en-US-AriaNeural',
  },
  selfhost: {
    signalUrl:  process.env.SELFHOST_SIGNAL_URL || '',   // e.g. http://gpu-box:8000
  },
  gemini: { key: process.env.GEMINI_API_KEY || '' },     // only for /api/tts-free fallback
};

// Per-role persona override (premium: interviewer look matches the role). Env JSON optional.
let ROLE_PERSONA = {};
try { ROLE_PERSONA = JSON.parse(process.env.ROLE_PERSONA || '{}'); } catch (_) {}

// ─────────────────────────────────────────────────────────────────────────────
// CAPABILITIES — the front-end reads these; it NEVER hard-codes gesture names.
// audioModes: 'external-pcm' = PREMIUM (Gemini voice drives lips). 'native' = provider speaks.
// ─────────────────────────────────────────────────────────────────────────────
const CAPS = {
  heygen: {
    transport: 'webrtc-sdk',                 // @heygen/streaming-avatar → MediaStream into <video>
    audioModes: ['external-pcm', 'native'],  // PREMIUM supported
    wordTimings: 'sdk-event',                // avatarTalkText / word timestamps if SDK emits
    bargeIn: true,
    gestures: ['nod', 'head_tilt', 'gaze_away', 'explain', 'hand_raise', 'shake_head'],
    emotions: ['neutral', 'happy', 'curious', 'serious', 'empathetic', 'attentive'],
    sampleRateHz: 16000,                     // external-pcm expected rate
  },
  tavus: {
    transport: 'sdk-div',                    // Tavus CVI SDK mounts into a div (no iframe)
    audioModes: ['native'],                  // Tavus speaks; we send Gemini TEXT, mute Gemini TTS
    wordTimings: 'webhook',
    bargeIn: true,
    gestures: ['nod', 'gaze_away', 'explain'],
    emotions: ['neutral', 'happy', 'curious', 'serious'],
  },
  did: {
    transport: 'sdk-ws',                     // @d-id/client-sdk streaming over websocket
    audioModes: ['native'],                  // D-ID speaks via SSML <express-as>
    wordTimings: 'sdk-event',                // 'timestamp' events
    bargeIn: true,
    gestures: ['nod', 'gaze_away'],
    emotions: ['neutral', 'happy', 'curious', 'serious', 'empathetic'],
  },
  selfhost: {
    transport: 'webrtc-signal',              // GPU box (Hallo3/LivePortrait/EchoMimicV3) over WebRTC
    audioModes: ['external-pcm'],            // client adds audio send-track → GPU lip-syncs (PREMIUM)
    wordTimings: 'none',
    bargeIn: true,
    gestures: ['nod', 'head_tilt', 'gaze_away', 'explain', 'hand_raise', 'shake_head', 'smile', 'frown'],
    emotions: ['neutral', 'happy', 'curious', 'serious', 'empathetic', 'attentive', 'thinking'],
    sampleRateHz: 16000,
  },
};
const enabled = (p) =>
  (p === 'heygen' && !!C.heygen.key) ||
  (p === 'tavus'  && !!C.tavus.key && !!C.tavus.replicaId && !!C.tavus.personaId) ||
  (p === 'did'    && !!C.did.key) ||
  (p === 'selfhost' && !!C.selfhost.signalUrl);

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURED LOG + REQUEST ID + METRICS (no deps)
// ─────────────────────────────────────────────────────────────────────────────
const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));

const metrics = {
  sessions_created: 0, sessions_ended: 0, upstream_errors: 0,
  by_provider: {}, latency_sum_ms: 0, latency_n: 0,
};
const bump = (p) => { metrics.by_provider[p] = (metrics.by_provider[p] || 0) + 1; };

app.use((req, _res, next) => {
  req.id = (req.headers['x-request-id'] || crypto.randomUUID()).slice(0, 24);
  req.t0 = Date.now();
  next();
});
app.use((req, res, next) => {
  res.on('finish', () => {
    metrics.latency_sum_ms += Date.now() - req.t0; metrics.latency_n++;
    log('info', 'req', { id: req.id, m: req.method, p: req.path, s: res.statusCode, ms: Date.now() - req.t0 });
  });
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// CORS (by env) + tiny in-memory rate limiter (token bucket per IP)
// ─────────────────────────────────────────────────────────────────────────────
const originOk = (o) => C.allowedOrigins.some(pat => {
  const re = new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return re.test(o || '');
});
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && originOk(o)) { res.set('Access-Control-Allow-Origin', o); res.set('Vary', 'Origin'); }
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
const buckets = new Map();
app.use((req, res, next) => {
  const ip = req.ip || 'na'; const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now - b.t > 60_000) b = { t: now, n: 0 };
  b.n++; buckets.set(ip, b);
  if (b.n > C.ratePerMin + C.rateBurst) { log('warn', 'rate-limited', { ip, id: req.id }); return res.sendStatus(429); }
  next();
});
setInterval(() => { const now = Date.now(); for (const [k, v] of buckets) if (now - v.t > 120_000) buckets.delete(k); }, 60_000).unref();

// ─────────────────────────────────────────────────────────────────────────────
// UPSTREAM CLIENT — timeout + retry on 5xx/network, NEVER on 4xx, never leak keys
// ─────────────────────────────────────────────────────────────────────────────
async function upstream(url, opts = {}, { retries = 2, tag = 'upstream' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), C.upstreamTimeout);
    try {
      const r = await fetch(url, { ...opts, signal: ac.signal });
      clearTimeout(timer);
      const text = await r.text();
      let body; try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { raw: text }; }
      if (r.status >= 500) throw Object.assign(new Error(`${tag} ${r.status}`), { status: r.status, body, retryable: true });
      return { status: r.status, body, headers: r.headers };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      const retryable = e.retryable || e.name === 'AbortError' || /fetch|network|ECONN|ETIMEDOUT/i.test(e.message);
      if (!retryable || attempt === retries) break;
      await new Promise(r => setTimeout(r, 500 * 2 ** attempt + Math.random() * 200));
    }
  }
  metrics.upstream_errors++;
  throw lastErr;
}
const sendUpstreamErr = (res, e) => {
  const status = (e && e.status >= 400 && e.status < 600) ? e.status : 502;
  log('error', 'upstream-failed', { status, msg: e && e.message });
  res.status(status).json({ error: 'avatar upstream error', detail: e && e.name === 'AbortError' ? 'timeout' : 'see server logs' });
};

// ─────────────────────────────────────────────────────────────────────────────
// SESSION STORE (TTL sweep + per-IP concurrency)
// ─────────────────────────────────────────────────────────────────────────────
const sessions = new Map();   // id -> {id,provider,ip,createdAt,lastSeen,external,audioMode}
const liveCountByIp = (ip) => [...sessions.values()].filter(s => s.ip === ip).length;
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.lastSeen > C.sessionTtlMs) { sessions.delete(id); log('info', 'session reaped', { id }); }
}, 60_000).unref();
const touch = (id) => { const s = sessions.get(id); if (s) s.lastSeen = Date.now(); return s; };

// ─────────────────────────────────────────────────────────────────────────────
// PERSONA (role-aware look + voice + idle assets)
// ─────────────────────────────────────────────────────────────────────────────
function personaFor(provider, role) {
  const roleMap = ROLE_PERSONA[provider] || {};
  const avatarName = (role && roleMap[role]) || roleMap.default || C[provider === 'selfhost' ? 'selfhost' : provider]?.avatarName || '';
  return {
    provider,
    avatarName,
    voiceId:   C[provider]?.voiceId || '',
    idleLoop:  `/assets/avatar/${avatarName || 'default'}/idle-loop.mp4`,
    poster:    `/assets/avatar/${avatarName || 'default'}/idle-poster.jpg`,
    capabilities: CAPS[provider],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═════════════════════════════════════════════════════════════════════════════
app.get('/health', (_req, res) => res.json({
  status: 'ok', env: C.env,
  providers: { heygen: enabled('heygen'), tavus: enabled('tavus'), did: enabled('did'), selfhost: enabled('selfhost') },
}));

app.get('/metrics', (_req, res) => {
  const avg = metrics.latency_n ? (metrics.latency_sum_ms / metrics.latency_n).toFixed(1) : 0;
  res.type('text/plain').send([
    `avatar_sessions_created ${metrics.sessions_created}`,
    `avatar_sessions_ended ${metrics.sessions_ended}`,
    `avatar_upstream_errors ${metrics.upstream_errors}`,
    `avatar_active_sessions ${sessions.size}`,
    `avatar_req_avg_ms ${avg}`,
    ...Object.entries(metrics.by_provider).map(([p, n]) => `avatar_sessions_by_provider{provider="${p}"} ${n}`),
    '',
  ].join('\n'));
});

app.get('/api/avatar/capabilities/:provider', (req, res) => {
  const p = req.params.provider;
  if (!CAPS[p]) return res.status(404).json({ error: 'unknown provider' });
  res.json({ provider: p, enabled: enabled(p), ...CAPS[p] });
});

app.get('/api/avatar/persona/:id', (req, res) => {
  const p = req.query.provider || 'heygen';
  if (!CAPS[p]) return res.status(404).json({ error: 'unknown provider' });
  res.json({ id: req.params.id, ...personaFor(p, req.query.role) });
});

const getKey = (p, req) => {
  const reqKey = req ? (req.headers['x-avatar-key'] || req.headers[`x-${p}-key`] || (req.body && req.body.apiKey)) : '';
  return reqKey || C[p]?.key || '';
};

const enabledReq = (p, req) =>
  (p === 'heygen' && !!getKey('heygen', req)) ||
  (p === 'tavus'  && !!getKey('tavus', req) && !!C.tavus.replicaId && !!C.tavus.personaId) ||
  (p === 'did'    && !!getKey('did', req)) ||
  (p === 'selfhost' && !!C.selfhost.signalUrl);

// ── CREATE SESSION ──────
app.post('/api/avatar/session/:provider', async (req, res) => {
  const p = req.params.provider;
  if (!CAPS[p]) return res.status(404).json({ error: 'unknown provider' });
  const activeKey = getKey(p, req);
  if (!enabledReq(p, req)) return res.status(503).json({ error: `provider ${p} API key not configured on server or request` });
  const ip = req.ip || 'na';
  if (liveCountByIp(ip) >= C.maxConcurPerIp) return res.status(429).json({ error: 'too many concurrent avatar sessions' });

  const want = req.body || {};
  const role = want.role;
  const persona = personaFor(p, role);
  const audioMode = (want.audioMode === 'native') ? 'native'
    : (CAPS[p].audioModes.includes('external-pcm') ? 'external-pcm' : 'native');

  const id = crypto.randomUUID();
  const base = { id, provider: p, ip, createdAt: Date.now(), lastSeen: Date.now(), external: {}, audioMode, persona };

  try {
    if (p === 'heygen') {
      const { body } = await upstream('https://api.heygen.com/v2/streaming/create_token', {
        method: 'POST',
        headers: { 'X-Api-Key': activeKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }, { tag: 'heygen.create_token' });
      base.external.token = body?.data?.token ?? body?.token;
      if (!base.external.token) throw Object.assign(new Error('no token in heygen response'), { status: 502 });

    } else if (p === 'tavus') {
      const { body } = await upstream('https://api.tavus.io/v2/conversations', {
        method: 'POST',
        headers: { 'x-api-key': C.tavus.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replica_id: C.tavus.replicaId, persona_id: C.tavus.personaId,
          properties: { max_call_duration_seconds: 1800, conversation_name: `evalis-${id.slice(0, 8)}` },
        }),
      }, { tag: 'tavus.create' });
      base.external.conversationId = body.conversation_id;
      base.external.conversationUrl = body.conversation_url;

    } else if (p === 'did') {
      const activeKey = getKey('did', req);
      const { body } = await upstream('https://api.d-id.com/talks/streams', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(activeKey + ':').toString('base64')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source_url: C.did.sourceUrl || 'https://d-id-public-bucket.s3.amazonaws.com/alice.png'
        })
      }, { tag: 'did.create_stream' });
      base.external.streamId = body.id;
      base.external.offer = body.offer;
      base.external.iceServers = body.ice_servers;
      base.external.sessionId = body.session_id;

    } else if (p === 'selfhost') {
      const { body } = await upstream(`${C.selfhost.signalUrl}/reserve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id, sampleRateHz: CAPS.selfhost.sampleRateHz }),
      }, { tag: 'selfhost.reserve' });
      base.external.offer = body.offer;
    }

    sessions.set(id, base);
    metrics.sessions_created++; bump(p);
    res.json({
      sessionId: id, provider: p, audioMode,
      ...base.external,
      persona, capabilities: CAPS[p],
    });
  } catch (e) { sendUpstreamErr(res, e); }
});

// ── SELF-HOST WebRTC answer + ICE trickle ─────────────────
app.post('/api/avatar/session/selfhost/answer', async (req, res) => {
  const s = touch(req.body?.sessionId); if (!s) return res.status(404).json({ error: 'no session' });
  try { await upstream(`${C.selfhost.signalUrl}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: s.id, answer: req.body.answer }) }, { retries: 1 }); res.json({ ok: true }); }
  catch (e) { sendUpstreamErr(res, e); }
});
app.post('/api/avatar/session/selfhost/ice', async (req, res) => {
  const s = touch(req.body?.sessionId); if (!s) return res.status(404).json({ error: 'no session' });
  fetch(`${C.selfhost.signalUrl}/ice`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: s.id, candidate: req.body.candidate }) }).catch(() => {});
  res.json({ ok: true });
});

// ── D-ID WebRTC answer + ICE trickle + speak ─────────────────
app.post('/api/avatar/session/did/answer', async (req, res) => {
  const s = touch(req.body?.sessionId); if (!s) return res.status(404).json({ error: 'no session' });
  const activeKey = getKey('did', req);
  try {
    await upstream(`https://api.d-id.com/talks/streams/${s.external.streamId}/sdp`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(activeKey + ':').toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        answer: req.body.answer,
        session_id: s.external.sessionId
      })
    }, { retries: 1, tag: 'did.send_sdp' });
    res.json({ ok: true });
  } catch (e) { sendUpstreamErr(res, e); }
});

app.post('/api/avatar/session/did/ice', async (req, res) => {
  const s = touch(req.body?.sessionId); if (!s) return res.status(404).json({ error: 'no session' });
  const activeKey = getKey('did', req);
  try {
    await upstream(`https://api.d-id.com/talks/streams/${s.external.streamId}/ice`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(activeKey + ':').toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        candidate: req.body.candidate.candidate || req.body.candidate,
        sdpMid: req.body.candidate.sdpMid,
        sdpMLineIndex: req.body.candidate.sdpMLineIndex,
        session_id: s.external.sessionId
      })
    }, { retries: 1, tag: 'did.send_ice' });
    res.json({ ok: true });
  } catch (e) {}
});

app.post('/api/avatar/session/did/speak', async (req, res) => {
  const s = touch(req.body?.sessionId); if (!s) return res.status(404).json({ error: 'no session' });
  const activeKey = getKey('did', req);
  try {
    await upstream(`https://api.d-id.com/talks/streams/${s.external.streamId}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(activeKey + ':').toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        script: {
          type: 'text',
          input: req.body.text || ' ',
          provider: { type: 'microsoft', voice_id: C.did.voiceId || 'en-US-AriaNeural' }
        },
        session_id: s.external.sessionId
      })
    }, { retries: 1, tag: 'did.speak' });
    res.json({ ok: true });
  } catch (e) { sendUpstreamErr(res, e); }
});

// ── END SESSION ──────────────────────────────────
app.post('/api/avatar/session/:provider/end', async (req, res) => {
  const s = touch(req.body?.sessionId); if (!s) return res.json({ ok: true, note: 'already gone' });
  const activeKey = getKey(s.provider, req);
  try {
    if (s.provider === 'tavus' && s.external.conversationId)
      await upstream(`https://api.tavus.io/v2/conversations/${s.external.conversationId}/end`, { method: 'POST', headers: { 'x-api-key': C.tavus.key } }, { retries: 1 }).catch(() => {});
    else if (s.provider === 'did' && s.external.streamId)
      await upstream(`https://api.d-id.com/talks/streams/${s.external.streamId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${Buffer.from(activeKey + ':').toString('base64')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ session_id: s.external.sessionId })
      }, { retries: 1 }).catch(() => {});
    else if (s.provider === 'selfhost')
      fetch(`${C.selfhost.signalUrl}/release`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: s.id }) }).catch(() => {});
  } finally { sessions.delete(s.id); metrics.sessions_ended++; }
  res.json({ ok: true });
});

// ── WEBHOOKS ─────
app.post('/api/avatar/webhook/:provider', (req, res) => {
  const sig = req.headers['x-webhook-signature'] || req.headers['x-tavus-signature'] || '';
  if (C.env === 'production' && C.webhookSecret) {
    const expect = crypto.createHmac('sha256', C.webhookSecret).update(JSON.stringify(req.body)).digest('hex');
    if (!sig || !crypto.timingSafeEqual(Buffer.from(sig.padEnd(64)), Buffer.from(expect.padEnd(64))))
      return res.sendStatus(401);
  }
  const ev = req.body || {};
  const id = ev.session_id || ev.conversation_id || ev.talk_id;
  if (id && (ev.type === 'ended' || ev.event === 'end')) { sessions.delete(id); metrics.sessions_ended++; }
  log('info', 'webhook', { provider: req.params.provider, type: ev.type || ev.event, id });
  res.sendStatus(200);
});

// ── TTS FALLBACK ─
app.post('/api/tts-free', async (req, res) => {
  const text = String((req.body && req.body.text) || '').slice(0, 2000);
  if (!text) return res.sendStatus(400);
  if (!C.gemini.key) return res.sendStatus(204);          // no fallback TTS available
  try {
    const { body } = await upstream(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${C.gemini.key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
        }) }, { retries: 1, tag: 'gemini.tts' });
    const inline = body?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inline?.data) return res.sendStatus(204);
    const pcmB64 = inline.data;
    const words = text.split(/\s+/).filter(Boolean);
    const durEst = Math.max(0.4, words.length * 0.32);
    let t = 0; const timings = words.map(w => { const d = (w.length / Math.max(1, words.join('').length)) * durEst * 1000; const o = { w, start: Math.round(t * 1000), dur: Math.round(d) }; t += d / 1000 + 0.06; return o; });
    res.set('X-Word-Timings', encodeURIComponent(JSON.stringify(timings)));
    res.set('X-Timings-Approx', 'true');
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(pcmB64, 'base64'));
  } catch (e) { sendUpstreamErr(res, e); }
});

// ─────────────────────────────────────────────────────────────────────────────
// BOOT + graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────
const server = app.listen(C.port, () => {
  log('info', 'hyperreal-session up', {
    port: C.port, env: C.env,
    providers: { heygen: enabled('heygen'), tavus: enabled('tavus'), did: enabled('did'), selfhost: enabled('selfhost') },
  });
  if (!enabled('heygen') && !enabled('tavus') && !enabled('did') && !enabled('selfhost'))
    log('warn', 'NO avatar provider configured — set an API key or SELFHOST_SIGNAL_URL');
});
const shutdown = (sig) => { log('info', 'shutdown', { sig }); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref(); };
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = app;
