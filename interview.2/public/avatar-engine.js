/**
 * avatar-engine.js — Photoreal AI Avatar Engine (Simli/HeyGen-style, fully client-side)
 *
 * Turns a single portrait photo into a live, talking human avatar:
 *  - MediaPipe FaceMesh (static mode) locates lips, eyes, jaw & face bounds once
 *  - Real-time lip sync: WebAudio analyser drives a grid-based jaw/lip mesh warp
 *  - Procedural mouth interior (teeth + inner shadow) appears as the mouth opens
 *  - Natural blinking, micro head sway, nodding while listening, breathing
 *  - Pseudo-viseme generator for browser speechSynthesis (no audio element)
 *
 * API:
 *   AvatarEngine.init({ canvas, image, fallbackEl })
 *   AvatarEngine.setState('idle' | 'speaking' | 'listening' | 'thinking')
 *   AvatarEngine.attachAudio(audioElement)   // real lip sync from TTS audio
 */
(function () {
  'use strict';

  const E = {
    canvas: null, ctx: null, img: null,
    ready: false, failed: false,
    state: 'idle',
    // face geometry (image-space pixels)
    face: null,
    crop: null, // {x,y,w,h}
    scale: 1,
    // animation
    mouthOpen: 0, mouthTarget: 0,
    blink: 0, blinkPhase: 0, nextBlink: 0,
    t0: performance.now(),
    // audio
    audioCtx: null, analyser: null, audioActive: false,
    _freqData: null,
    // pseudo speech
    _pseudoSeed: Math.random() * 100,
    fallbackEl: null,
  };

  // ── Fallback normalized landmarks (tuned for a centered portrait) ──
  const FALLBACK = {
    mouth: { cx: 0.478, cy: 0.470, w: 0.085 },
    chin: { x: 0.478, y: 0.545 },
    eyeL: { cx: 0.438, cy: 0.336, w: 0.052, h: 0.020 },
    eyeR: { cx: 0.560, cy: 0.334, w: 0.052, h: 0.020 },
    faceTop: 0.10, faceBottom: 0.56, faceCx: 0.49,
  };

  function log(msg) { console.log('[v0] [AvatarEngine] ' + msg); }

  // ══════════════ INIT ══════════════
  async function init(opts) {
    try {
      E.canvas = typeof opts.canvas === 'string' ? document.getElementById(opts.canvas) : opts.canvas;
      E.fallbackEl = typeof opts.fallbackEl === 'string' ? document.getElementById(opts.fallbackEl) : opts.fallbackEl;
      if (!E.canvas) { log('canvas not found'); return; }
      E.ctx = E.canvas.getContext('2d');

      E.img = new Image();
      E.img.crossOrigin = 'anonymous';
      await new Promise((res, rej) => {
        E.img.onload = res;
        E.img.onerror = rej;
        E.img.src = opts.image;
      });
      log('portrait loaded ' + E.img.naturalWidth + 'x' + E.img.naturalHeight);

      // Try FaceMesh landmark detection (4s timeout), else fallback ratios
      let lm = null;
      try { lm = await detectLandmarks(E.img); } catch (e) { log('FaceMesh unavailable: ' + e.message); }
      buildGeometry(lm);
      computeCrop();

      E.ready = true;
      if (E.fallbackEl) E.fallbackEl.style.display = 'none';
      E.canvas.style.display = 'block';
      scheduleBlink();
      requestAnimationFrame(loop);
      log('avatar live (' + (lm ? 'FaceMesh landmarks' : 'fallback geometry') + ')');
    } catch (err) {
      E.failed = true;
      log('init failed: ' + err.message);
      if (E.canvas) E.canvas.style.display = 'none';
      if (E.fallbackEl) E.fallbackEl.style.display = '';
    }
  }

  function detectLandmarks(img) {
    return new Promise((resolve, reject) => {
      if (typeof FaceMesh === 'undefined') return reject(new Error('FaceMesh script not loaded'));
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('timeout')); } }, 6000);
      try {
        const fm = new FaceMesh({
          locateFile: (f) => 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/' + f,
        });
        fm.setOptions({ staticImageMode: true, maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5 });
        fm.onResults((r) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          const faces = r.multiFaceLandmarks;
          if (faces && faces.length) resolve(faces[0]);
          else reject(new Error('no face found'));
        });
        fm.send({ image: img }).catch((e) => {
          if (!done) { done = true; clearTimeout(timer); reject(e); }
        });
      } catch (e) {
        if (!done) { done = true; clearTimeout(timer); reject(e); }
      }
    });
  }

  function buildGeometry(lm) {
    const W = E.img.naturalWidth, H = E.img.naturalHeight;
    const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
    if (lm) {
      const upperLip = P(13), lowerLip = P(14), cornerL = P(61), cornerR = P(291);
      const chin = P(152), forehead = P(10);
      const eL = { o: P(33), i: P(133), t: P(159), b: P(145) };
      const eR = { o: P(263), i: P(362), t: P(386), b: P(374) };
      E.face = {
        mouth: {
          cx: (cornerL.x + cornerR.x) / 2,
          cy: (upperLip.y + lowerLip.y) / 2,
          w: Math.abs(cornerR.x - cornerL.x),
          lipY: upperLip.y,
        },
        chin: chin,
        eyeL: eyeRect(eL), eyeR: eyeRect(eR),
        top: forehead.y, bottom: chin.y,
        cx: (forehead.x + chin.x) / 2,
      };
    } else {
      const f = FALLBACK;
      E.face = {
        mouth: { cx: f.mouth.cx * W, cy: f.mouth.cy * H, w: f.mouth.w * W, lipY: f.mouth.cy * H - 4 },
        chin: { x: f.chin.x * W, y: f.chin.y * H },
        eyeL: { x: (f.eyeL.cx - f.eyeL.w / 2) * W, y: (f.eyeL.cy - f.eyeL.h / 2) * H, w: f.eyeL.w * W, h: f.eyeL.h * H * 2.4 },
        eyeR: { x: (f.eyeR.cx - f.eyeR.w / 2) * W, y: (f.eyeR.cy - f.eyeR.h / 2) * H, w: f.eyeR.w * W, h: f.eyeR.h * H * 2.4 },
        top: f.faceTop * H, bottom: f.faceBottom * H, cx: f.faceCx * W,
      };
    }
  }

  function eyeRect(e) {
    const x = Math.min(e.o.x, e.i.x), x2 = Math.max(e.o.x, e.i.x);
    const y = Math.min(e.t.y, e.b.y), y2 = Math.max(e.t.y, e.b.y);
    const w = x2 - x, h = Math.max(y2 - y, 6);
    // pad the rect a bit so lashes are covered
    return { x: x - w * 0.18, y: y - h * 0.9, w: w * 1.36, h: h * 2.6 };
  }

  function computeCrop() {
    const W = E.img.naturalWidth, H = E.img.naturalHeight;
    const faceH = E.face.bottom - E.face.top;
    let size = faceH * 2.35;
    size = Math.min(size, W, H);
    let cx = E.face.cx;
    let cy = E.face.top + faceH * 0.42;
    let x = Math.max(0, Math.min(W - size, cx - size / 2));
    let y = Math.max(0, Math.min(H - size, cy - size / 2));
    E.crop = { x: x, y: y, w: size, h: size };
    E.scale = E.canvas.width / size;
  }

  // image-space → canvas-space
  function cvx(x) { return (x - E.crop.x) * E.scale; }
  function cvy(y) { return (y - E.crop.y) * E.scale; }

  // ══════════════ AUDIO (real lip sync) ══════════════
  function attachAudio(audioEl) {
    try {
      if (!E.audioCtx) E.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (E.audioCtx.state === 'suspended') E.audioCtx.resume();
      const src = E.audioCtx.createMediaElementSource(audioEl);
      const an = E.audioCtx.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.55;
      src.connect(an);
      an.connect(E.audioCtx.destination);
      E.analyser = an;
      E._freqData = new Uint8Array(an.frequencyBinCount);
      E.audioActive = true;
      const off = () => { E.audioActive = false; };
      audioEl.addEventListener('ended', off);
      audioEl.addEventListener('pause', off);
      audioEl.addEventListener('error', off);
      log('audio attached — real lip sync active');
    } catch (e) {
      log('attachAudio failed (' + e.message + '), pseudo visemes will be used');
    }
  }

  function audioLevel() {
    if (!E.analyser || !E.audioActive) return null;
    E.analyser.getByteFrequencyData(E._freqData);
    // speech energy lives mostly in the lower bins
    let sum = 0; const n = Math.min(48, E._freqData.length);
    for (let i = 2; i < n; i++) sum += E._freqData[i];
    const avg = sum / (n - 2) / 255;
    return Math.min(1, Math.pow(avg * 2.1, 1.25));
  }

  // natural pseudo-viseme pattern for speechSynthesis fallback
  function pseudoLevel(t) {
    const s = E._pseudoSeed;
    const syll = Math.max(0, Math.sin(t * 0.0128 + s) * 0.6 + Math.sin(t * 0.0093 + s * 2) * 0.5 + Math.sin(t * 0.021 + s * 3) * 0.35);
    const pause = (Math.sin(t * 0.0021 + s) > -0.55) ? 1 : 0.06; // occasional breath pauses
    return Math.min(1, syll * pause);
  }

  // ══════════════ BLINK ══════════════
  function scheduleBlink() {
    E.nextBlink = performance.now() + 1800 + Math.random() * 3200;
  }

  function blinkAmount(now) {
    if (now >= E.nextBlink) {
      E.blinkPhase = now;
      scheduleBlink();
      // occasional double blink
      if (Math.random() < 0.18) E.nextBlink = now + 380;
    }
    const dt = now - E.blinkPhase;
    const DUR = 190;
    if (dt < 0 || dt > DUR) return 0;
    const p = dt / DUR;
    return p < 0.42 ? p / 0.42 : 1 - (p - 0.42) / 0.58; // fast close, slower open
  }

  // ══════════════ RENDER LOOP ══════════════
  function loop(now) {
    if (E.failed) return;
    const t = now - E.t0;
    const ctx = E.ctx, cw = E.canvas.width, ch = E.canvas.height;

    // ── mouth target from audio / pseudo / silence ──
    let target = 0;
    if (E.state === 'speaking') {
      const real = audioLevel();
      target = real !== null ? real : pseudoLevel(t);
    }
    // smooth (attack fast, decay slower — like real jaw)
    const k = target > E.mouthOpen ? 0.42 : 0.22;
    E.mouthOpen += (target - E.mouthOpen) * k;

    E.blink = blinkAmount(now);

    // ── head motion per state ──
    let rot = Math.sin(t * 0.00045) * 0.010 + Math.sin(t * 0.00113) * 0.005;
    let dx = Math.sin(t * 0.00061) * 2.2;
    let dy = Math.sin(t * 0.00087) * 1.6 + Math.sin(t * 0.0032) * 0.4; // breathing
    if (E.state === 'speaking') {
      rot += Math.sin(t * 0.0021) * 0.012 * (0.3 + E.mouthOpen);
      dy += Math.sin(t * 0.0038) * 1.4 * E.mouthOpen;
      dx += Math.sin(t * 0.0016) * 1.2;
    } else if (E.state === 'listening') {
      dy += Math.max(0, Math.sin(t * 0.0018)) * 3.2; // gentle nodding
      rot += Math.sin(t * 0.0007) * 0.008;
    } else if (E.state === 'thinking') {
      rot += 0.02 + Math.sin(t * 0.0009) * 0.006; // pensive tilt
      dx += 3;
    }

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(cw / 2 + dx, ch / 2 + dy);
    ctx.rotate(rot);
    const zoom = 1.04 + Math.sin(t * 0.00087) * 0.004; // slight overscan hides edges
    ctx.scale(zoom, zoom);
    ctx.translate(-cw / 2, -ch / 2);

    // base portrait
    ctx.drawImage(E.img, E.crop.x, E.crop.y, E.crop.w, E.crop.h, 0, 0, cw, ch);

    // jaw/lip warp + mouth interior
    if (E.mouthOpen > 0.015) drawMouth(ctx, E.mouthOpen);

    // eyelids
    if (E.blink > 0.03) {
      drawEyelid(ctx, E.face.eyeL, E.blink);
      drawEyelid(ctx, E.face.eyeR, E.blink);
    }

    ctx.restore();
    requestAnimationFrame(loop);
  }

  // ── Grid-slice jaw drop warp (mesh-warp approximation) ──
  function drawMouth(ctx, open) {
    const m = E.face.mouth;
    const maxDrop = m.w * 0.34 * E.scale; // max jaw travel in canvas px
    const drop = maxDrop * open;

    // warp region (image space)
    const rw = m.w * 2.3;
    const rx = m.cx - rw / 2;
    const ry = m.lipY - m.w * 0.16;
    const rh = (E.face.chin.y - ry) + m.w * 0.42;

    const COLS = 9, ROWS = 14;
    const cellW = rw / COLS, cellH = rh / ROWS;
    const lipRow = (m.cy - ry) / rh; // normalized row of the lip line

    for (let r = 0; r < ROWS; r++) {
      const vy = (r + 0.5) / ROWS;
      // vertical profile: 0 above lips → 1 at lips → ease back to 0 at chin bottom
      let vProf;
      if (vy < lipRow) vProf = Math.pow(vy / lipRow, 2.2);
      else vProf = 1 - Math.pow((vy - lipRow) / (1 - lipRow), 1.7) * 0.9;
      for (let c = 0; c < COLS; c++) {
        const ux = (c + 0.5) / COLS;
        const hProf = Math.pow(Math.cos((ux - 0.5) * Math.PI), 1.4); // falloff at sides
        const d = drop * vProf * hProf;
        if (d < 0.15) continue;
        const sx = rx + c * cellW, sy = ry + r * cellH;
        ctx.drawImage(
          E.img,
          sx, sy, cellW + 1, cellH + 1,
          cvx(sx), cvy(sy) + d, cellW * E.scale + 1.2, cellH * E.scale + 1.2
        );
      }
    }

    // mouth interior — dark cavity + subtle teeth
    if (open > 0.13) {
      const mx = cvx(m.cx), myTop = cvy(m.lipY) + drop * 0.18;
      const innerH = drop * 0.72;
      const innerW = m.w * E.scale * (0.44 + open * 0.14);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(mx, myTop + innerH / 2, innerW, innerH / 2, 0, 0, Math.PI * 2);
      ctx.clip();
      // cavity
      const g = ctx.createLinearGradient(0, myTop, 0, myTop + innerH);
      g.addColorStop(0, '#3a1f22');
      g.addColorStop(0.45, '#1f0e11');
      g.addColorStop(1, '#2b1417');
      ctx.fillStyle = g;
      ctx.fillRect(mx - innerW, myTop - 2, innerW * 2, innerH + 4);
      // upper teeth
      if (open > 0.22) {
        ctx.fillStyle = 'rgba(238,232,224,' + Math.min(0.85, (open - 0.2) * 2.4) + ')';
        ctx.beginPath();
        ctx.ellipse(mx, myTop + innerH * 0.16, innerW * 0.8, Math.min(innerH * 0.3, 7), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ── Blink: stretch eyelid skin down over the eye ──
  function drawEyelid(ctx, eye, amt) {
    const dh = eye.h * amt;
    if (dh < 1) return;
    // source: thin strip of skin right above the eye
    const stripH = Math.max(3, eye.h * 0.16);
    ctx.save();
    // soft clip so edges blend
    ctx.beginPath();
    ctx.ellipse(cvx(eye.x + eye.w / 2), cvy(eye.y) + (dh * E.scale) / 2, (eye.w / 2) * E.scale * 1.02, (dh / 2) * E.scale * 1.15, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      E.img,
      eye.x, eye.y - stripH, eye.w, stripH,
      cvx(eye.x), cvy(eye.y), eye.w * E.scale, dh * E.scale
    );
    // lash line at the closing edge
    ctx.strokeStyle = 'rgba(40,22,20,' + 0.35 * amt + ')';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cvx(eye.x + eye.w * 0.12), cvy(eye.y) + dh * E.scale);
    ctx.quadraticCurveTo(
      cvx(eye.x + eye.w / 2), cvy(eye.y) + dh * E.scale + 2,
      cvx(eye.x + eye.w * 0.88), cvy(eye.y) + dh * E.scale
    );
    ctx.stroke();
    ctx.restore();
  }

  // ══════════════ PUBLIC API ══════════════
  window.AvatarEngine = {
    init: init,
    attachAudio: attachAudio,
    setState: function (s) {
      E.state = s || 'idle';
      if (E.state !== 'speaking') E.mouthTarget = 0;
    },
    isReady: function () { return E.ready; },
  };
})();
