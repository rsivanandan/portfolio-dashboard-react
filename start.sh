#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting Portfolio Dashboard..."

# ── Backend: create venv if needed, install deps, start ───────────────────
cd backend

if [ ! -d "venv" ]; then
  echo "→ Creating Python virtual environment..."
  python3 -m venv venv
fi

echo "→ Installing Python dependencies..."
source venv/bin/activate
pip install -r requirements.txt -q --upgrade

echo "→ Starting backend..."
python main.py &
BACKEND_PID=$!
deactivate
echo "✅ Backend started (PID: $BACKEND_PID) → http://localhost:8000"

# ── Frontend: install deps, start ─────────────────────────────────────────
cd ../frontend

echo "→ Installing frontend dependencies..."
npm install --silent

echo "→ Starting frontend..."
npm run dev &
FRONTEND_PID=$!
echo "✅ Frontend started (PID: $FRONTEND_PID) → http://localhost:5173"

echo ""
echo "📊 Dashboard : http://localhost:5173"
echo "🔧 API docs  : http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
