@echo off
cd /d "%~dp0"
call venv\Scripts\activate.bat
echo Starting Simpatico RTX Avatar Server on http://localhost:8000 ...
python server.py
pause
