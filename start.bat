@echo off
setlocal

set SCRIPT_DIR=%~dp0

echo Starting Portfolio Dashboard...

:: ── Backend: create venv if needed, install deps, start ──────────────────
cd /d "%SCRIPT_DIR%backend"

if not exist ".venv\" (
  echo ^> Creating Python virtual environment...
  python -m venv .venv
)

echo ^> Installing Python dependencies...
call .venv\Scripts\activate.bat
pip install -r requirements.txt -q --upgrade --prefer-binary

echo ^> Starting backend...
start "Backend" cmd /k ".venv\Scripts\activate.bat & python main.py"
call .venv\Scripts\deactivate.bat
echo Backend started ^-^> http://localhost:8000

:: ── Frontend: install deps, start ────────────────────────────────────────
cd /d "%SCRIPT_DIR%frontend"

echo ^> Installing frontend dependencies...
call npm install

echo ^> Starting frontend...
start "Frontend" cmd /k "cd /d "%SCRIPT_DIR%frontend" && npm run dev"
echo Frontend started ^-^> http://localhost:5173

echo.
echo Dashboard : http://localhost:5173
echo API docs  : http://localhost:8000/docs
echo.
echo Both servers are running in separate windows.
echo Close those windows to stop the servers.
echo.
pause
