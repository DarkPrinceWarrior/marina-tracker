"""FastAPI application entrypoint for Marina Tracker («Ритм»)."""

from __future__ import annotations

from contextlib import asynccontextmanager, closing
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .db import ROOT, connect, init_db, today_iso
from .routes import cycle, habits, home, nutrition, tasks_goals, today
from .seed import seed_if_empty


@asynccontextmanager
async def lifespan(_app: FastAPI):
    with closing(connect()) as db:
        init_db(db)
        seed_if_empty(db)
    yield


app = FastAPI(
    title="Marina Tracker («Ритм»)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["health"])
def health_check() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "marina-tracker",
        "today": today_iso(),
    }


# All application routers
app.include_router(today.router)
app.include_router(tasks_goals.router)
app.include_router(habits.router)
app.include_router(cycle.router)
app.include_router(nutrition.router)
app.include_router(home.router)


# ---------------------------------------------------------------------------
# Static Frontend, PWA Assets & SPA Fallback
# ---------------------------------------------------------------------------

DIST_DIR = ROOT / "dist"
PUBLIC_DIR = ROOT / "public"

if (DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")


def _resolve_static_file(relative_path: str) -> Path | None:
    for base in (DIST_DIR, PUBLIC_DIR):
        if not base.exists():
            continue
        base_resolved = base.resolve()
        candidate = (base / relative_path).resolve()
        if candidate.is_file() and str(candidate).startswith(str(base_resolved)):
            return candidate
    return None


@app.get("/manifest.webmanifest", include_in_schema=False)
def serve_manifest():
    manifest = _resolve_static_file("manifest.webmanifest")
    if manifest is None:
        raise HTTPException(status_code=404, detail="manifest.webmanifest not found")
    return FileResponse(
        manifest,
        media_type="application/manifest+json",
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/sw.js", include_in_schema=False)
def serve_service_worker():
    sw = _resolve_static_file("sw.js")
    if sw is None:
        raise HTTPException(status_code=404, detail="sw.js not found")
    return FileResponse(
        sw,
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-cache",
            "Service-Worker-Allowed": "/",
        },
    )


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")

    if full_path:
        static_file = _resolve_static_file(full_path)
        if static_file is not None:
            return FileResponse(static_file)

    index_html = DIST_DIR / "index.html"
    if index_html.is_file():
        return FileResponse(index_html, headers={"Cache-Control": "no-cache"})

    return JSONResponse({"service": "marina-tracker", "status": "api_ready"})
