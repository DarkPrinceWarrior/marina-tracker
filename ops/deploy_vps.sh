#!/usr/bin/env bash
# Deploy / update marina-tracker («Ритм») on Timeweb Cloud VPS (72.56.86.145)
# without touching /srv/apps/tracker/data/marina_tracker.sqlite3 or /srv/apps/tracker/.env.
set -euo pipefail

export PATH="/home/ruslan_safaev/.local/bin:/home/ruslan_safaev/.nvm/versions/node/v22.23.2/bin:$PATH"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_HOST="${VPS_HOST:-72.56.86.145}"
VPS_USER="${VPS_USER:-root}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_a100}"
DOMAIN="${TRACKER_DOMAIN:-tracker.72.56.86.145.sslip.io}"

SSH_OPTS=(-i "${SSH_KEY}" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
ARCHIVE="/tmp/marina-tracker-src-$$.tar.gz"
trap 'rm -f "${ARCHIVE}"' EXIT

cd "${ROOT}"

echo "==> [1/5] Building fresh frontend dist/ locally..."
npm run build

echo "==> [2/5] Packing slim production source bundle..."
tar -czf "${ARCHIVE}" \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.pytest_cache' \
  Dockerfile.vps \
  pyproject.toml \
  uv.lock \
  app \
  dist

echo "==> [3/5] Uploading bundle to ${VPS_USER}@${VPS_HOST}..."
scp "${SSH_OPTS[@]}" "${ARCHIVE}" "${VPS_USER}@${VPS_HOST}:/tmp/tracker-src.tar.gz"

echo "==> [4/5] Rebuilding & restarting tracker container on VPS..."
ssh "${SSH_OPTS[@]}" "${VPS_USER}@${VPS_HOST}" 'bash -s' <<'REMOTE'
set -euo pipefail
mkdir -p /srv/apps/tracker/src /srv/apps/tracker/data
rm -rf /srv/apps/tracker/src/*
tar -xzf /tmp/tracker-src.tar.gz -C /srv/apps/tracker/src
rm -f /tmp/tracker-src.tar.gz
chown -R 10001:10001 /srv/apps/tracker/data

cd /srv/apps
docker compose up -d --build --no-deps tracker

echo "Waiting for tracker container to become healthy..."
for i in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' apps-tracker-1 2>/dev/null || echo starting)"
  if [ "${status}" = "healthy" ]; then
    echo "tracker is healthy!"
    break
  fi
  if [ "${i}" -eq 30 ]; then
    echo "ERROR: tracker did not become healthy (status=${status})" >&2
    docker logs --tail 40 apps-tracker-1 >&2 || true
    exit 1
  fi
  sleep 2
done

docker builder prune -af >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
docker compose ps
REMOTE

echo "==> [5/5] Verifying live HTTPS endpoint https://${DOMAIN}/api/health ..."
curl -fsS "https://${DOMAIN}/api/health"
echo ""
echo "Deploy complete: https://${DOMAIN}"
