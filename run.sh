#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

export PATH="/home/ruslan_safaev/.local/bin:/home/ruslan_safaev/.nvm/versions/node/v22.23.2/bin:$PATH"

HOST="${MARINA_HOST:-0.0.0.0}"
PORT="${MARINA_PORT:-${PORT:-8098}}"

if [ ! -d ".venv" ]; then
  echo "Installing Python dependencies via uv sync..."
  uv sync
fi

if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies via npm install..."
  npm install
fi

if [ "${1:-}" = "--dev" ]; then
  echo "Starting Marina Tracker in dev mode (API :$PORT, Vite :5173)..."
  uv run uvicorn app.main:app --host "$HOST" --port "$PORT" --reload &
  API_PID=$!
  trap 'kill "$API_PID" 2>/dev/null || true' EXIT INT TERM
  npm run dev
  exit 0
fi

if [ ! -d "dist" ] || [ "${MARINA_REBUILD:-0}" = "1" ]; then
  echo "Building frontend into dist/..."
  npm run build
fi

echo "Starting Marina Tracker on http://${HOST}:${PORT}"
exec uv run uvicorn app.main:app --host "$HOST" --port "$PORT"
