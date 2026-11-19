# syntax=docker/dockerfile:1.7
# Stage 1: Build frontend assets
FROM node:22-slim AS frontend-builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY index.html vite.config.js ./
COPY public ./public
COPY web ./web
RUN npm run build

# Stage 2: Build Python virtualenv with uv
FROM python:3.12-slim AS backend-builder
COPY --from=ghcr.io/astral-sh/uv:0.12.19 /uv /uvx /bin/
ENV UV_PYTHON_DOWNLOADS=0 UV_LINK_MODE=copy
WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN uv sync --locked --no-dev --no-install-project --compile-bytecode || uv sync --no-dev --no-install-project --compile-bytecode

# Stage 3: Minimal production runtime
FROM python:3.12-slim AS runtime
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    MARINA_DB_PATH=/tmp/marina-tracker/marina_tracker.sqlite3 \
    PORT=10000

RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin app

COPY --from=backend-builder /app/.venv /app/.venv
COPY app ./app
COPY --from=frontend-builder /app/dist ./dist

RUN python -m compileall -q /app/app \
    && mkdir -p /app/data /tmp/marina-tracker \
    && chown -R app:app /app /tmp/marina-tracker

USER app

EXPOSE 10000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --proxy-headers --forwarded-allow-ips='*'"]
