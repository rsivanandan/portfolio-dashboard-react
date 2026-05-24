# ── Portfolio Dashboard — Runtime-only image ──────────────────────────────
# Source code lives on a mounted volume, not in this image.
# This image only provides: Python packages, Node/npm, nginx, supervisor.
# Rebuild this image only when you add new pip or npm dependencies.
#
# Build for DS420+ (amd64) from Mac (arm64):
#   docker buildx build --platform linux/amd64 -t mf-dashboard:latest .

FROM --platform=linux/amd64 python:3.12-slim

# ── System packages ────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    supervisor \
    curl \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# ── Node 22 LTS via NodeSource (replaces apt's ancient nodejs) ─────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node -v && npm -v

# ── Python dependencies (cached until requirements.txt changes) ────────────
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# ── Pre-install npm dependencies (cached until package.json changes) ───────
COPY frontend/package.json frontend/package-lock.json /tmp/frontend/
RUN cd /tmp/frontend && npm ci --silent

# ── nginx + supervisor config ──────────────────────────────────────────────
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# ── Entrypoint ────────────────────────────────────────────────────────────
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# ── Ensure runtime dirs exist ─────────────────────────────────────────────
RUN mkdir -p /app /var/log/supervisor /var/log/nginx /var/run /var/lib/nginx /var/cache/nginx \
    && touch /var/run/nginx.pid

# ── Everything else (source + db) comes from the mounted volume ────────────
VOLUME ["/app"]

EXPOSE 8080

# Runs as root — fine for a home NAS deployment
ENTRYPOINT ["/entrypoint.sh"]
