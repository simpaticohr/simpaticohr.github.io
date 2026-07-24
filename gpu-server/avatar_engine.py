"""
avatar_engine.py — Talking-head frame generator for the Simpatico local GPU server.

Two quality tiers, auto-selected at startup:

  TIER 1 — MuseTalk (real-time neural lip-sync, ~30fps on RTX 4060 8GB)
           Enabled automatically when the MuseTalk repo + weights are found
           (set MUSETALK_DIR env var or place it at ./MuseTalk).

  TIER 2 — Procedural warp fallback (works out of the box, zero downloads)
           Audio-energy driven jaw/mouth warp on the presenter image using
           OpenCV remap. Not neural quality, but keeps the pipeline alive
           until MuseTalk weights are installed.

LatentSync is intentionally NOT used here for live frames — it is an offline
diffusion model (1-3 min per 10s clip on a 4060). It is used by
prerender_questions.py to bake maximum-quality clips for the fixed
certification questions.
"""

import io
import os
import sys
import wave
import math
import time
import base64
import logging
import tempfile
import subprocess
from pathlib import Path
from typing import AsyncGenerator, Optional

import numpy as np

log = logging.getLogger("avatar-engine")

try:
    import cv2
except ImportError:
    cv2 = None
    log.error("opencv-python is required: pip install opencv-python")

HERE = Path(__file__).parent
PRESENTER_IMAGE = Path(os.environ.get("PRESENTER_IMAGE", HERE.parent / "assets" / "presenter" / "interviewer.png"))
PRESENTER_VIDEO = Path(os.environ.get("PRESENTER_VIDEO", HERE / "presenter" / "idle.mp4"))
MUSETALK_DIR = Path(os.environ.get("MUSETALK_DIR", HERE / "MuseTalk"))

FPS = 25
JPEG_QUALITY = 80
FRAME_SIZE = 512


# ──────────────────────────────────────────────────────────────────────
# Audio helpers
# ──────────────────────────────────────────────────────────────────────

def wav_bytes_to_mono_f32(wav_bytes: bytes) -> tuple[np.ndarray, int]:
    """Decode a WAV byte string to mono float32 [-1, 1] plus sample rate."""
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        sr = wf.getframerate()
        n = wf.getnframes()
        ch = wf.getnchannels()
        sw = wf.getsampwidth()
        raw = wf.readframes(n)
    if sw == 2:
        data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sw == 4:
        data = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        data = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    if ch > 1:
        data = data.reshape(-1, ch).mean(axis=1)
    return data, sr


def per_frame_energy(samples: np.ndarray, sr: int, fps: int = FPS) -> np.ndarray:
    """RMS energy per video frame, normalized 0..1 with smoothing."""
    spf = int(sr / fps)
    n_frames = max(1, int(math.ceil(len(samples) / spf)))
    env = np.zeros(n_frames, dtype=np.float32)
    for i in range(n_frames):
        chunk = samples[i * spf:(i + 1) * spf]
        if len(chunk):
            env[i] = float(np.sqrt(np.mean(chunk ** 2)))
    peak = env.max() if env.max() > 1e-6 else 1.0
    env = np.clip(env / peak, 0.0, 1.0)
    # attack/decay smoothing for natural mouth motion
    out = np.zeros_like(env)
    v = 0.0
    for i, e in enumerate(env):
        v = v + (e - v) * (0.55 if e > v else 0.30)
        out[i] = v
    return out


# ──────────────────────────────────────────────────────────────────────
# TIER 2 — Procedural warp engine (always available)
# ──────────────────────────────────────────────────────────────────────

class ProceduralEngine:
    """Audio-envelope jaw-drop warp on the presenter image/idle video."""

    name = "procedural-warp"

    def __init__(self):
        self.idle_frames: list[np.ndarray] = []
        self._load_source()

    def _load_source(self):
        if cv2 is None:
            return
        if PRESENTER_VIDEO.exists():
            cap = cv2.VideoCapture(str(PRESENTER_VIDEO))
            while len(self.idle_frames) < 200:
                ok, frame = cap.read()
                if not ok:
                    break
                self.idle_frames.append(cv2.resize(frame, (FRAME_SIZE, FRAME_SIZE)))
            cap.release()
            log.info("Loaded %d idle frames from %s", len(self.idle_frames), PRESENTER_VIDEO)
        if not self.idle_frames and PRESENTER_IMAGE.exists():
            img = cv2.imread(str(PRESENTER_IMAGE))
            if img is not None:
                self.idle_frames = [cv2.resize(img, (FRAME_SIZE, FRAME_SIZE))]
                log.info("Loaded presenter still image %s", PRESENTER_IMAGE)
        if not self.idle_frames:
            blank = np.full((FRAME_SIZE, FRAME_SIZE, 3), 24, dtype=np.uint8)
            cv2.putText(blank, "PRESENTER MISSING", (60, 256),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (80, 80, 240), 2)
            self.idle_frames = [blank]
            log.warning("No presenter media found — using placeholder frame")

    def _idle_frame(self, t: float) -> np.ndarray:
        if len(self.idle_frames) > 1:
            idx = int(t * FPS) % len(self.idle_frames)
            return self.idle_frames[idx].copy()
        # subtle breathing sway on a still image
        frame = self.idle_frames[0]
        dy = math.sin(t * 1.7) * 2.0
        M = np.float32([[1, 0, 0], [0, 1, dy]])
        return cv2.warpAffine(frame, M, (FRAME_SIZE, FRAME_SIZE),
                              borderMode=cv2.BORDER_REPLICATE)

    def _mouth_warp(self, frame: np.ndarray, amount: float, t: float) -> np.ndarray:
        """Vertically stretch the lower-face region proportional to `amount`."""
        if amount < 0.03:
            return frame
        h, w = frame.shape[:2]
        # lower-face band (heuristic for a centered head-and-shoulders portrait)
        y0, y1 = int(h * 0.52), int(h * 0.78)
        cx = w // 2
        band_h = y1 - y0
        stretch = 1.0 + amount * 0.16

        map_y, map_x = np.mgrid[0:h, 0:w].astype(np.float32)
        band = (map_y >= y0) & (map_y <= y1)
        rel = (map_y - y0) / max(band_h, 1)
        # pull pixels upward within band => open-jaw illusion
        falloff = np.exp(-((map_x - cx) ** 2) / (2 * (w * 0.18) ** 2))
        map_y = np.where(band, y0 + rel * band_h / stretch * (1 + (stretch - 1) * (1 - falloff)), map_y)

        warped = cv2.remap(frame, map_x, map_y, cv2.INTER_LINEAR,
                           borderMode=cv2.BORDER_REPLICATE)

        # dark inner-mouth ellipse
        mouth_y = int(h * 0.565)
        mw = int(w * 0.055 * (0.6 + amount))
        mh = max(2, int(h * 0.022 * amount * 1.6))
        overlay = warped.copy()
        cv2.ellipse(overlay, (cx, mouth_y), (mw, mh), 0, 0, 360, (18, 12, 28), -1)
        return cv2.addWeighted(overlay, min(0.85, amount + 0.25), warped, 1 - min(0.85, amount + 0.25), 0)

    async def frames_for_audio(self, wav_bytes: bytes) -> AsyncGenerator[bytes, None]:
        samples, sr = wav_bytes_to_mono_f32(wav_bytes)
        env = per_frame_energy(samples, sr)
        t0 = time.time()
        for i, amount in enumerate(env):
            t = t0 + i / FPS
            frame = self._idle_frame(t - t0)
            frame = self._mouth_warp(frame, float(amount), t)
            ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
            if ok:
                yield buf.tobytes()

    def idle_jpeg(self, t: float) -> bytes:
        frame = self._idle_frame(t)
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        return buf.tobytes() if ok else b""


# ──────────────────────────────────────────────────────────────────────
# TIER 1 — MuseTalk realtime engine (used when repo + weights present)
# ──────────────────────────────────────────────────────────────────────

class MuseTalkEngine:
    """
    Wraps MuseTalk 1.5 realtime inference. On an RTX 4060 this sustains
    ~30fps at 256x256 face crops. We shell out to MuseTalk's realtime
    inference script per-utterance which keeps VRAM contained and avoids
    pinning the whole model graph inside this process.
    """

    name = "musetalk"

    def __init__(self):
        self.python = sys.executable
        self.avatar_prepared = False
        self._verify()

    def _verify(self):
        script = MUSETALK_DIR / "scripts" / "realtime_inference.py"
        weights = MUSETALK_DIR / "models" / "musetalkV15" / "unet.pth"
        alt_weights = MUSETALK_DIR / "models" / "musetalk" / "pytorch_model.bin"
        if not script.exists():
            raise RuntimeError("MuseTalk realtime_inference.py not found")
        if not (weights.exists() or alt_weights.exists()):
            raise RuntimeError("MuseTalk weights not downloaded")
        log.info("MuseTalk detected at %s", MUSETALK_DIR)

    async def frames_for_audio(self, wav_bytes: bytes) -> AsyncGenerator[bytes, None]:
        """
        Run MuseTalk on this utterance and stream resulting frames as JPEG.
        """
        with tempfile.TemporaryDirectory() as td:
            wav_path = Path(td) / "utterance.wav"
            out_dir = Path(td) / "out"
            out_dir.mkdir()
            wav_path.write_bytes(wav_bytes)

            src = str(PRESENTER_VIDEO if PRESENTER_VIDEO.exists() else PRESENTER_IMAGE)
            cmd = [
                self.python, str(MUSETALK_DIR / "scripts" / "realtime_inference.py"),
                "--avatar_id", "simpatico_interviewer",
                "--video_path", src,
                "--audio_path", str(wav_path),
                "--result_dir", str(out_dir),
                "--fps", str(FPS),
                "--batch_size", "8",
            ]
            proc = subprocess.run(cmd, cwd=str(MUSETALK_DIR),
                                  capture_output=True, timeout=600)
            if proc.returncode != 0:
                log.error("MuseTalk failed: %s", proc.stderr.decode()[-800:])
                raise RuntimeError("musetalk-inference-failed")

            videos = sorted(out_dir.rglob("*.mp4"))
            if not videos:
                raise RuntimeError("musetalk-no-output")
            cap = cv2.VideoCapture(str(videos[-1]))
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                frame = cv2.resize(frame, (FRAME_SIZE, FRAME_SIZE))
                ok2, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
                if ok2:
                    yield buf.tobytes()
            cap.release()


# ──────────────────────────────────────────────────────────────────────
# Engine factory
# ──────────────────────────────────────────────────────────────────────

_procedural = None
_musetalk = None


def get_engines():
    """Returns (primary_engine, procedural_fallback)."""
    global _procedural, _musetalk
    if _procedural is None:
        _procedural = ProceduralEngine()
    if _musetalk is None:
        try:
            _musetalk = MuseTalkEngine()
        except Exception as e:
            log.info("MuseTalk unavailable (%s) — using procedural warp tier", e)
            _musetalk = False
    primary = _musetalk if _musetalk else _procedural
    return primary, _procedural


def engine_status() -> dict:
    primary, _ = get_engines()
    return {
        "tier": primary.name,
        "musetalk_dir": str(MUSETALK_DIR),
        "musetalk_ready": bool(_musetalk),
        "presenter_image": str(PRESENTER_IMAGE) if PRESENTER_IMAGE.exists() else None,
        "presenter_video": str(PRESENTER_VIDEO) if PRESENTER_VIDEO.exists() else None,
        "fps": FPS,
    }
