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
#   ./deploy.sh update            # code + dist, light `compose restart` (default)
#   ./deploy.sh recreate          # code + dist + --build --force-recreate (compose-config/image changes)
#   ./deploy.sh initial           # code + dist + copy live DB from the OLD deployment (+ recreate)
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

# ── SSH connection sharing ───────────────────────────────────────────────────
# The script makes several SSH calls (sync, optional DB copy, restart probe,
# restart). Without multiplexing each one re-authenticates — i.e. multiple
# password prompts when key auth isn't set up. ControlMaster authenticates
# once and every later call reuses the same connection.
SSH_CTL="${HOME}/.ssh/deploy-ctl-%r@%h-%p"
nas_ssh() {
  ssh -p "${NAS_PORT}" \
      -o ControlMaster=auto -o ControlPath="${SSH_CTL}" -o ControlPersist=300 \
      "${NAS_USER}@${NAS_HOST}" "$@"
}
cleanup_ssh() {
  ssh -p "${NAS_PORT}" -o ControlPath="${SSH_CTL}" -O exit \
      "${NAS_USER}@${NAS_HOST}" 2>/dev/null || true
}
trap cleanup_ssh EXIT

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
  . | nas_ssh \
    "tar xzf - -C '${NAS_DIR}' && chmod -R a+rX '${NAS_DIR}/frontend/dist' && find '${NAS_DIR}' -name '._*' -delete"

# ── 3. Initial mode: bring over the live DB from the existing deployment ────
if [ "$MODE" = "initial" ]; then
  echo "→ Copying live DB from existing deployment (${NAS_DIR_OLD}) ..."
  nas_ssh "cp '${NAS_DIR_OLD}/backend/investments.db' '${NAS_DIR}/backend/investments.db'"
fi

# ── 4. Restart the container ─────────────────────────────────────────────────
# The image is runtime-only and the source is a bind mount, so code changes
# never change the image SHA — `docker compose restart` re-runs the entrypoint
# and picks up the freshly synced code without recreating the container.
# Use `./deploy.sh recreate` (or `initial`) for `up -d --build --force-recreate`,
# which is only required when compose config changes (env, ports, image tag,
# volumes) or the image itself needs rebuilding.
#
# Tries passwordless sudo first (works after the one-time NOPASSWD sudoers
# setup on the NAS); falls back to SUDO_PASS, then to an interactive prompt
# (read -s keeps the password out of shell history and process listings).
RESTART_CMD="restart"
if [ "$MODE" = "recreate" ] || [ "$MODE" = "initial" ]; then
  RESTART_CMD="up -d --build --force-recreate"
fi
echo "→ Restarting container on NAS (compose ${RESTART_CMD}) ..."
if nas_ssh "cd '${NAS_DIR}' && sudo -n /usr/local/bin/docker compose ${RESTART_CMD}"; then
  echo "✓ Restarted (passwordless sudo)"
else
  if [ -z "${SUDO_PASS:-}" ] && [ -t 0 ]; then
    printf "NAS sudo password (Enter to skip restart): "
    read -rs SUDO_PASS
    echo
  fi
  if [ -n "${SUDO_PASS:-}" ]; then
    nas_ssh "cd '${NAS_DIR}' && printf '%s\\n' '${SUDO_PASS}' | sudo -S /usr/local/bin/docker compose ${RESTART_CMD}"
  else
    echo "ℹ  Skipped — restart the container manually:"
    echo "   ssh -p ${NAS_PORT} ${NAS_USER}@${NAS_HOST}"
    echo "   cd ${NAS_DIR} && sudo /usr/local/bin/docker compose ${RESTART_CMD}"
  fi
fi

echo "✅ Done → http://${NAS_HOST}:8084"
