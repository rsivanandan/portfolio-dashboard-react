#!/bin/bash
set -euo pipefail

# Deploy Portfolio Dashboard to the Synology NAS (DS420+).
#
# The NAS image is runtime-only (Python+Node+nginx+supervisor) and the source is a
# bind mount, so code changes NEVER need a docker rebuild. This script:
#   1. builds a fresh frontend bundle (frontend/dist)
#   2. streams the repo to the NAS as a tarball over SSH (excluding DBs, .env,
#      docker-compose.yml, node_modules, venv — rsync/scp fail on this NAS)
#   3. optionally copies the live DB from the existing deployment (initial only)
#   4. restarts the container (if SUDO_PASS is set)
#
# Usage:
#   ./deploy.sh update            # code + dist (default)
#   ./deploy.sh initial           # code + dist + copy live DB from the OLD deployment
#
# Env (defaults shown):
#   NAS_USER=rsivanandan   NAS_HOST=192.168.1.250   NAS_PORT=2222
#   NAS_DIR=/volume1/docker/portfolio-v2            NAS_DIR_OLD=/volume1/docker/portfolio
#   SUDO_PASS=<NAS password>  (required to auto-restart via sudo docker)
#
# One-time NAS setup (before first deploy): the v2 folder must exist with an
# identity-edited docker-compose.yml (image: portfolio-dashboard:next,
# container_name: portfolio-dashboard-next, port 8084) and a .env with JWT_SECRET.
# See README "NAS deployment" section.

NAS_USER="${NAS_USER:-rsivanandan}"
NAS_HOST="${NAS_HOST:-192.168.1.250}"
NAS_PORT="${NAS_PORT:-2222}"
NAS_DIR="${NAS_DIR:-/volume1/docker/portfolio-v2}"
NAS_DIR_OLD="${NAS_DIR_OLD:-/volume1/docker/portfolio}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${1:-update}"

# ── 1. Build fresh frontend bundle ──────────────────────────────────────────
echo "→ Building frontend..."
(cd frontend && npm run build)

# ── 2. Sync code + dist to the NAS ──────────────────────────────────────────
# Note: macOS ships openrsync (protocol 29), which is incompatible with the NAS
# rsync 3.1.2 (protocol 31) — rsync/scp both fail ("unexpected end of file").
# So we stream a tarball over SSH instead. This does not delete files that were
# removed locally; remove them on the NAS manually if ever needed.
echo "→ Syncing to ${NAS_USER}@${NAS_HOST}:${NAS_DIR} ..."
COPYFILE_DISABLE=1 tar czf - \
  --exclude='./.git' --exclude='./.git/*' \
  --exclude='*node_modules*' \
  --exclude='*venv*' \
  --exclude='*__pycache__*' \
  --exclude='*.pyc' \
  --exclude='*.DS_Store' \
  --exclude='*.pytest_cache*' \
  --exclude='BGBNG*.pdf' \
  --exclude='./data' \
  --exclude='./e2e' \
  --exclude='./.env' \
  --exclude='./docker-compose.yml' \
  --exclude='*.db.bak*' \
  --exclude='investments.db' --exclude='demoinvestment.db' --exclude='newinvestments.db' \
  --exclude='latest.db' \
  --exclude='.jwt_secret' \
  . | ssh -p "${NAS_PORT}" "${NAS_USER}@${NAS_HOST}" \
    "tar xzf - -C '${NAS_DIR}' && chmod -R a+rX '${NAS_DIR}/frontend/dist' && find '${NAS_DIR}' -name '._*' -delete"

# ── 3. Initial mode: bring over the live DB from the existing deployment ────
if [ "$MODE" = "initial" ]; then
  echo "→ Copying live DB from existing deployment (${NAS_DIR_OLD}) ..."
  ssh -p "${NAS_PORT}" "${NAS_USER}@${NAS_HOST}" \
    "cp '${NAS_DIR_OLD}/backend/investments.db' '${NAS_DIR}/backend/investments.db'"
fi

# ── 4. Restart the container (optional, needs sudo password) ─────────────────
# The image is runtime-only (source is a bind mount), so code changes never
# change the image SHA — `up -d` alone would NOT restart a running container.
# --force-recreate guarantees the new code is actually loaded.
# When run interactively without SUDO_PASS, prompt for it (read -s keeps the
# password out of shell history and process listings).
if [ -z "${SUDO_PASS:-}" ] && [ -t 0 ]; then
  printf "NAS sudo password (Enter to skip restart): "
  read -rs SUDO_PASS
  echo
fi
if [ -n "${SUDO_PASS:-}" ]; then
  echo "→ Restarting container on NAS ..."
  ssh -p "${NAS_PORT}" "${NAS_USER}@${NAS_HOST}" \
    "cd '${NAS_DIR}' && printf '%s\\n' '${SUDO_PASS}' | sudo -S /usr/local/bin/docker compose up -d --build --force-recreate"
else
  echo "ℹ  SUDO_PASS not set — restart the container manually:"
  echo "   ssh -p ${NAS_PORT} ${NAS_USER}@${NAS_HOST}"
  echo "   cd ${NAS_DIR} && printf '%s\\n' '<password>' | sudo -S /usr/local/bin/docker compose up -d --build --force-recreate"
fi

echo "✅ Done → http://${NAS_HOST}:8084"
