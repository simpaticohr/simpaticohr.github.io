"""
server.py — Simpatico local RTX GPU avatar server.

Runs on your RTX 4060 laptop and serves the cert-interview frontend
(GitHub Pages) through a Cloudflare Tunnel.

Endpoints
  GET  /health                      status + engine tier + GPU info
  POST /tts        {text, voice}    Edge-TTS -> audio/mpeg
  POST /tts/wav    {text, voice}    Edge-TTS -> audio/wav (for lip-sync)
  WS   /ws                          live avatar protocol (see below)
  GET  /clips/manifest.json         pre-rendered LatentSync clip manifest
  GET  /clips/<file>.mp4            pre-rendered clips (if not on Supabase)

WebSocket protocol (backwards compatible with js/hyperreal-renderer.js
LatentSyncAdapter, extended for js/local-avatar-engine.js):

  client -> server
    {"type":"ping"}
    {"type":"speak",   "text":"...", "voice":"en-US-AriaNeural"}
    {"type":"animate", "text":"..."}          (legacy alias for speak)
    {"type":"audio",   "data":"<b64 int16 pcm 24k>"}  (Gemini Live passthrough)
    {"type":"stop"}

  server -> client
    {"type":"pong", "engine":{...}}
    {"type":"speak_start", "utterance_id":n}
    {"type":"audio_wav", "data":"<b64 wav>", "utterance_id":n}
    {"type":"frame", "data":"<b64 jpeg>", "utterance_id":n}
    {"type":"speak_end", "utterance_id":n}
    {"type":"error", "message":"..."}

Run:  python server.py         (listens on 0.0.0.0:8000)
"""

import io
import os
import json
import base64
import asyncio
import logging
import time
import wave

import numpy as np
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from avatar_engine import get_engines, engine_status, FPS, per_frame_energy

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger("gpu-server")

HERE = Path(__file__).parent
CLIPS_DIR = HERE / "clips"
CLIPS_DIR.mkdir(exist_ok=True)

DEFAULT_VOICE = os.environ.get("TTS_VOICE", "en-US-AriaNeural")
PORT = int(os.environ.get("PORT", "8000"))

app = FastAPI(title="Simpatico RTX Avatar Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # GitHub Pages origin varies; server holds no secrets
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/clips", StaticFiles(directory=str(CLIPS_DIR)), name="clips")


# ──────────────────────────────────────────────────────────────────────
# Edge-TTS
# ──────────────────────────────────────────────────────────────────────

async def synthesize_mp3(text: str, voice: str = DEFAULT_VOICE) -> bytes:
    import edge_tts
    buf = io.BytesIO()
    communicate = edge_tts.Communicate(text, voice, rate="-4%")
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    return buf.getvalue()


async def synthesize_wav(text: str, voice: str = DEFAULT_VOICE) -> bytes:
    """Edge-TTS emits mp3; convert to wav via ffmpeg for lip-sync engines."""
    mp3 = await synthesize_mp3(text, voice)
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-i", "pipe:0", "-ar", "24000", "-ac", "1", "-f", "wav", "pipe:1",
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
    )
    out, _ = await proc.communicate(mp3)
    if proc.returncode != 0 or not out:
        raise RuntimeError("ffmpeg mp3->wav conversion failed (is ffmpeg installed?)")
    return out


# ──────────────────────────────────────────────────────────────────────
# HTTP endpoints
# ──────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    gpu = None
    try:
        import torch
        if torch.cuda.is_available():
            gpu = torch.cuda.get_device_name(0)
    except Exception:
        pass
    return {
        "ok": True,
        "service": "simpatico-rtx-avatar-server",
        "gpu": gpu,
        "engine": engine_status(),
        "clips": (CLIPS_DIR / "manifest.json").exists(),
        "time": time.time(),
    }


@app.post("/tts")
async def tts(payload: dict):
    text = (payload.get("text") or "").strip()
    if not text:
        return JSONResponse({"error": "text required"}, status_code=400)
    audio = await synthesize_mp3(text, payload.get("voice") or DEFAULT_VOICE)
    return Response(content=audio, media_type="audio/mpeg")


@app.post("/tts/wav")
async def tts_wav(payload: dict):
    text = (payload.get("text") or "").strip()
    if not text:
        return JSONResponse({"error": "text required"}, status_code=400)
    audio = await synthesize_wav(text, payload.get("voice") or DEFAULT_VOICE)
    return Response(content=audio, media_type="audio/wav")


# ──────────────────────────────────────────────────────────────────────
# WebSocket live avatar
# ──────────────────────────────────────────────────────────────────────

class Session:
    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.utterance_id = 0
        self.speak_task: asyncio.Task | None = None
        self.pcm_buffer = bytearray()
        self.last_pcm_time = 0.0

    def cancel_speech(self):
        if self.speak_task and not self.speak_task.done():
            self.speak_task.cancel()
        self.speak_task = None


async def stream_utterance(sess: Session, text: str, voice: str):
    """TTS the text, send wav to client, then stream frames paced at FPS."""
    uid = sess.utterance_id
    primary, fallback = get_engines()
    try:
        wav = await synthesize_wav(text, voice)
    except Exception as e:
        log.error("TTS failed: %s", e)
        await sess.ws.send_text(json.dumps({"type": "error", "message": f"tts: {e}"}))
        return

    await sess.ws.send_text(json.dumps({"type": "speak_start", "utterance_id": uid}))
    await sess.ws.send_text(json.dumps({
        "type": "audio_wav",
        "data": base64.b64encode(wav).decode(),
        "utterance_id": uid,
    }))

    frame_interval = 1.0 / FPS
    next_at = time.monotonic()

    async def send_frames(engine):
        nonlocal next_at
        async for jpeg in engine.frames_for_audio(wav):
            now = time.monotonic()
            if next_at > now:
                await asyncio.sleep(next_at - now)
            next_at += frame_interval
            await sess.ws.send_text(json.dumps({
                "type": "frame",
                "data": base64.b64encode(jpeg).decode(),
                "utterance_id": uid,
            }))

    try:
        try:
            await send_frames(primary)
        except Exception as e:
            if primary is not fallback:
                log.warning("Primary engine failed (%s), falling back to procedural", e)
                await send_frames(fallback)
            else:
                raise
        await sess.ws.send_text(json.dumps({"type": "speak_end", "utterance_id": uid}))
    except asyncio.CancelledError:
        raise
    except Exception as e:
        log.error("Frame streaming error: %s", e)
        try:
            await sess.ws.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass


async def animate_pcm_buffer(sess: Session):
    """Animate buffered external PCM (Gemini Live passthrough, audio already
    playing in the browser) using the procedural engine — low latency path."""
    if len(sess.pcm_buffer) < 4800:  # <0.1s at 24k, ignore
        sess.pcm_buffer.clear()
        return
    pcm = bytes(sess.pcm_buffer)
    sess.pcm_buffer.clear()

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(pcm)
    wav = buf.getvalue()

    _, fallback = get_engines()
    uid = sess.utterance_id
    frame_interval = 1.0 / FPS
    next_at = time.monotonic()
    try:
        async for jpeg in fallback.frames_for_audio(wav):
            now = time.monotonic()
            if next_at > now:
                await asyncio.sleep(next_at - now)
            next_at += frame_interval
            await sess.ws.send_text(json.dumps({
                "type": "frame",
                "data": base64.b64encode(jpeg).decode(),
                "utterance_id": uid,
            }))
    except asyncio.CancelledError:
        raise
    except Exception as e:
        log.error("PCM animate error: %s", e)


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    sess = Session(ws)
    log.info("WS client connected")
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            mtype = msg.get("type")

            if mtype == "ping":
                await ws.send_text(json.dumps({"type": "pong", "engine": engine_status()}))

            elif mtype in ("speak", "animate"):
                text = (msg.get("text") or "").strip()
                if not text:
                    continue
                sess.cancel_speech()
                sess.utterance_id += 1
                voice = msg.get("voice") or DEFAULT_VOICE
                sess.speak_task = asyncio.create_task(stream_utterance(sess, text, voice))

            elif mtype == "audio":
                # External PCM passthrough (int16 @ 24kHz from Gemini Live)
                try:
                    sess.pcm_buffer.extend(base64.b64decode(msg.get("data") or ""))
                    sess.last_pcm_time = time.monotonic()
                    # animate once buffer holds ~0.6s and nothing is running
                    if len(sess.pcm_buffer) >= 24000 * 2 * 0.6 and (
                        sess.speak_task is None or sess.speak_task.done()
                    ):
                        sess.utterance_id += 1
                        sess.speak_task = asyncio.create_task(animate_pcm_buffer(sess))
                except Exception:
                    pass

            elif mtype == "stop":
                sess.cancel_speech()
                sess.pcm_buffer.clear()

    except WebSocketDisconnect:
        log.info("WS client disconnected")
    finally:
        sess.cancel_speech()


if __name__ == "__main__":
    log.info("Engine status: %s", engine_status())
    uvicorn.run(app, host="0.0.0.0", port=PORT)
