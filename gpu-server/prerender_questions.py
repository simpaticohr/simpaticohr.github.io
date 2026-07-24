"""
prerender_questions.py — Bake maximum-quality LatentSync clips for every
fixed certification question, then publish them + a manifest.

Pipeline per line of questions.json:
  1. Edge-TTS  -> wav
  2. LatentSync (ByteDance, Apache-2.0) -> lip-synced mp4 of the presenter
  3. Upload to Supabase Storage (if SUPABASE_URL + SUPABASE_SERVICE_KEY set)
     otherwise copy into ./clips served by server.py
  4. Write manifest.json mapping djb2(text) -> clip URL

Runtime on RTX 4060 (8GB): roughly 1-3 minutes per clip with
--inference_steps 20. 19 clips ~= 30-60 minutes, one time cost.

Prereqs (see README.md):
  git clone https://github.com/bytedance/LatentSync  (set LATENTSYNC_DIR)
  checkpoints downloaded per that repo's instructions
  a presenter video at gpu-server/presenter/idle.mp4 (5-15s, front-facing)

Usage:
  python prerender_questions.py                 # all lines
  python prerender_questions.py --only 0 1 2    # specific indices
  python prerender_questions.py --skip-existing
"""

import os
import sys
import json
import shutil
import asyncio
import argparse
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
CLIPS_DIR = HERE / "clips"
WORK_DIR = HERE / "prerender_work"
LATENTSYNC_DIR = Path(os.environ.get("LATENTSYNC_DIR", HERE / "LatentSync"))
PRESENTER_VIDEO = Path(os.environ.get("PRESENTER_VIDEO", HERE / "presenter" / "idle.mp4"))

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
SUPABASE_BUCKET = os.environ.get("SUPABASE_BUCKET", "avatar-clips")

INFERENCE_STEPS = os.environ.get("LS_STEPS", "20")
GUIDANCE = os.environ.get("LS_GUIDANCE", "1.5")


def djb2(text: str) -> str:
    """Hash MUST match normalizeAndHash() in js/local-avatar-engine.js."""
    norm = "".join(c.lower() if c.isalnum() else " " for c in text)
    norm = " ".join(norm.split())
    h = 5381
    for ch in norm:
        h = ((h * 33) + ord(ch)) & 0xFFFFFFFF
    return format(h, "08x")


async def tts_to_wav(text: str, voice: str, out_path: Path):
    import edge_tts
    mp3_path = out_path.with_suffix(".mp3")
    await edge_tts.Communicate(text, voice, rate="-4%").save(str(mp3_path))
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-i", str(mp3_path), "-ar", "16000", "-ac", "1", str(out_path)],
        check=True,
    )
    mp3_path.unlink(missing_ok=True)


def run_latentsync(audio_path: Path, out_path: Path):
    """Invoke LatentSync inference. Uses the repo's scripts.inference module
    with the standard stage2 config (see LatentSync README for weights)."""
    unet_cfg = LATENTSYNC_DIR / "configs" / "unet" / "stage2.yaml"
    ckpt = LATENTSYNC_DIR / "checkpoints" / "latentsync_unet.pt"
    if not unet_cfg.exists() or not ckpt.exists():
        raise SystemExit(
            f"LatentSync not ready.\n  config: {unet_cfg}\n  ckpt:   {ckpt}\n"
            "Clone https://github.com/bytedance/LatentSync and download "
            "checkpoints per its README, or set LATENTSYNC_DIR."
        )
    cmd = [
        sys.executable, "-m", "scripts.inference",
        "--unet_config_path", str(unet_cfg),
        "--inference_ckpt_path", str(ckpt),
        "--inference_steps", INFERENCE_STEPS,
        "--guidance_scale", GUIDANCE,
        "--video_path", str(PRESENTER_VIDEO),
        "--audio_path", str(audio_path),
        "--video_out_path", str(out_path),
    ]
    print("  [latentsync]", " ".join(cmd[-6:]))
    subprocess.run(cmd, cwd=str(LATENTSYNC_DIR), check=True)


def upload_supabase(local: Path, remote_name: str) -> str:
    """Upload via Supabase Storage REST API. Returns the public URL."""
    import urllib.request
    url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{remote_name}"
    req = urllib.request.Request(
        url, data=local.read_bytes(), method="POST",
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "video/mp4",
            "x-upsert": "true",
        },
    )
    urllib.request.urlopen(req).read()
    return f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{remote_name}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", type=int, help="line indices to render")
    ap.add_argument("--skip-existing", action="store_true")
    args = ap.parse_args()

    if not PRESENTER_VIDEO.exists():
        raise SystemExit(
            f"Presenter video missing: {PRESENTER_VIDEO}\n"
            "Record/create a 5-15 second front-facing idle clip of the presenter\n"
            "(you can animate assets/presenter/interviewer.png with any\n"
            "image-to-video tool, or film a consenting person)."
        )

    data = json.loads((HERE / "questions.json").read_text(encoding="utf-8"))
    voice = data.get("voice", "en-US-AriaNeural")
    lines = data["lines"]

    CLIPS_DIR.mkdir(exist_ok=True)
    WORK_DIR.mkdir(exist_ok=True)

    manifest_path = CLIPS_DIR / "manifest.json"
    manifest = {"version": 1, "voice": voice, "clips": {}}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text())
        except Exception:
            pass

    use_supabase = bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)
    print(f"Publishing to: {'Supabase bucket ' + SUPABASE_BUCKET if use_supabase else CLIPS_DIR}")

    for i, text in enumerate(lines):
        if args.only and i not in args.only:
            continue
        key = djb2(text)
        clip_name = f"q_{i:02d}_{key}.mp4"
        if args.skip_existing and key in manifest["clips"]:
            print(f"[{i}] skip (exists): {text[:60]}...")
            continue

        print(f"[{i}] {text[:70]}...")
        wav_path = WORK_DIR / f"q_{i:02d}.wav"
        out_path = WORK_DIR / clip_name

        asyncio.run(tts_to_wav(text, voice, wav_path))
        run_latentsync(wav_path, out_path)

        if use_supabase:
            url = upload_supabase(out_path, clip_name)
        else:
            shutil.copy2(out_path, CLIPS_DIR / clip_name)
            url = f"/clips/{clip_name}"  # resolved against latentsyncUrl in JS

        manifest["clips"][key] = {"url": url, "text": text, "index": i}
        manifest_path.write_text(json.dumps(manifest, indent=2))
        print(f"  -> {url}")

    if use_supabase:
        # publish manifest itself to Supabase too
        import urllib.request
        murl = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/manifest.json"
        req = urllib.request.Request(
            murl, data=manifest_path.read_bytes(), method="POST",
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
                "x-upsert": "true",
            },
        )
        urllib.request.urlopen(req).read()
        print(f"Manifest: {SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/manifest.json")

    print("Done.")


if __name__ == "__main__":
    main()
