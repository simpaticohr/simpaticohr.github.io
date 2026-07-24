@echo off
REM ============================================================
REM  Simpatico RTX Avatar Server — one-time setup (Windows)
REM  Requires: Python 3.10+, Git, ffmpeg on PATH, NVIDIA driver
REM ============================================================
cd /d "%~dp0"

echo [1/5] Creating Python virtual environment...
python -m venv venv
call venv\Scripts\activate.bat

echo [2/5] Installing base server requirements...
pip install --upgrade pip
pip install -r requirements.txt

echo [3/5] Installing PyTorch with CUDA 12.1 (RTX 4060)...
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

echo [4/5] Cloning MuseTalk (real-time lip-sync engine)...
if not exist MuseTalk (
  git clone https://github.com/TMElyralab/MuseTalk
  pip install -r MuseTalk\requirements.txt
  echo.
  echo   NOTE: download MuseTalk weights per MuseTalk\README.md
  echo   (models\musetalkV15\unet.pth etc). The server runs in
  echo   procedural fallback mode until weights are present.
)

echo [5/5] Cloning LatentSync (offline max-quality pre-rendering)...
if not exist LatentSync (
  git clone https://github.com/bytedance/LatentSync
  echo.
  echo   NOTE: download LatentSync checkpoints per LatentSync\README.md
  echo   (checkpoints\latentsync_unet.pt). Only needed for
  echo   prerender_questions.py, not for the live server.
)

echo.
echo ============================================================
echo  Setup complete.
echo    start.bat   - run the avatar server  (http://localhost:8000)
echo    tunnel.bat  - expose it via Cloudflare Tunnel (HTTPS)
echo ============================================================
pause
