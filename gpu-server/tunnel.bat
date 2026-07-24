@echo off
REM ============================================================
REM  Expose the local GPU server over HTTPS via Cloudflare Tunnel
REM  Install cloudflared first:  winget install Cloudflare.cloudflared
REM
REM  Quick tunnel (random *.trycloudflare.com URL, easiest):
REM    just run this script and copy the printed https URL.
REM
REM  Stable named tunnel on your own domain (recommended):
REM    cloudflared tunnel login
REM    cloudflared tunnel create simpatico-gpu
REM    cloudflared tunnel route dns simpatico-gpu avatar.yourdomain.com
REM    cloudflared tunnel run --url http://localhost:8000 simpatico-gpu
REM ============================================================
cloudflared tunnel --url http://localhost:8000
pause
