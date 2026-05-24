#!/bin/bash
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Portfolio Dashboard — Starting up"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Validate volume is mounted ─────────────────────────────────────────────
if [ ! -d "/app/frontend" ] || [ ! -d "/app/backend" ]; then
  echo "✗ ERROR: /app volume not mounted correctly."
  echo "  Expected structure:"
  echo "    /app/backend/main.py"
  echo "    /app/frontend/package.json"
  echo "  Mount your source folder to /app and restart."
  exit 1
fi

if [ ! -f "/app/backend/investments.db" ]; then
  echo "⚠  WARNING: /app/backend/investments.db not found."
  echo "   Copy your investments.db into the mounted /app/backend/ folder."
  echo "   The dashboard will start but show no data until the DB is present."
fi

# ── Build React frontend (skip if dist/ already exists) ───────────────────
cd /app/frontend
if [ -d "dist" ] && [ -f "dist/index.html" ]; then
  echo "✓ Pre-built frontend found → /app/frontend/dist (skipping build)"
else
  echo ""
  echo "→ Syncing frontend dependencies..."
  # Copy pre-installed node_modules from build if missing, then sync
  if [ ! -d "node_modules" ] && [ -d "/tmp/frontend/node_modules" ]; then
    echo "  Copying cached node_modules..."
    cp -r /tmp/frontend/node_modules .
  fi
  npm install --silent 2>&1 || {
    echo "⚠  npm install failed — trying with cached modules only"
  }

  echo "→ Building frontend..."
  npm run build 2>&1
  echo "✓ Frontend built → /app/frontend/dist"
fi

# ── Update nginx to serve from volume dist ────────────────────────────────
# nginx.conf already points to /app/frontend/dist
echo "✓ nginx configured"

# ── Inject env vars into supervisord config ───────────────────────────────
SUPERVISOR_CONF="/etc/supervisor/conf.d/supervisord.conf"
CORS="${CORS_ORIGINS:-http://localhost:8080}"
APIKEY="${PORTFOLIO_API_KEY:-}"
# Replace the comment line with actual environment directive
sed -i "s|^; environment is injected.*|environment=CORS_ORIGINS=\"${CORS}\",PORTFOLIO_API_KEY=\"${APIKEY}\",DB_PATH=\"/app/backend/investments.db\"|" "$SUPERVISOR_CONF"

# ── Create supervisor log dir ─────────────────────────────────────────────
mkdir -p /var/log/supervisor

echo ""
echo "✓ Starting services..."
echo "  Dashboard → http://localhost:8080"
echo "  API       → http://localhost:8080/api/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Start supervisor (nginx + uvicorn) ────────────────────────────────────
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
