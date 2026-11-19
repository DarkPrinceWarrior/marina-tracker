"""FastAPI application entrypoint for Marina Tracker («Ритм»)."""

from __future__ import annotations

from contextlib import asynccontextmanager, closing
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .db import ROOT, connect, init_db, is_postgres, today_iso
from .routes import cycle, habits, home, nutrition, push, tasks_goals, today
from .seed import seed_if_empty

_FIELD_LABELS_RU: dict[str, str] = {
    "title": "Название",
    "name": "Название",
    "content": "Текст",
    "dish_name": "Блюдо",
    "note": "Заметка",
    "summary_note": "Итог дня",
    "description": "Описание",
    "photo_url": "Фотография",
    "data_url": "Изображение",
    "category": "Категория",
    "zone": "Зона",
    "quantity": "Количество",
    "date": "Дата",
    "log_date": "Дата",
    "task_date": "Дата задачи",
    "event_date": "Дата события",
    "start_date": "Дата старта",
    "target_date": "Целевая дата",
    "checkin_date": "Дата отметки",
    "time_slot": "Время",
    "event_time": "Время события",
    "eaten_at": "Время приёма пищи",
    "logged_at": "Время",
    "morning_time": "Утреннее время",
    "afternoon_time": "Дневное время",
    "evening_time": "Вечернее время",
    "goals_time": "Время напоминания о целях",
    "quiet_start": "Начало тихих часов",
    "quiet_end": "Окончание тихих часов",
    "amount_ml": "Объём воды",
    "daily_goal_ml": "Дневная норма воды",
    "duration_min": "Длительность",
    "amount_value": "Порция",
    "amount_unit": "Единица измерения",
    "grams": "Граммы",
    "default_grams": "Граммы",
    "kcal": "Калории",
    "protein_g": "Белки",
    "fat_g": "Жиры",
    "carbs_g": "Углеводы",
    "progress_pct": "Прогресс",
    "energy_level": "Уровень энергии",
    "target_year": "Год",
    "target_quarter": "Квартал",
    "horizon_years": "Горизонт",
    "horizon_unit": "Единица горизонта",
    "avg_cycle_length": "Длина цикла",
    "avg_period_length": "Длительность менструации",
    "target_days_per_week": "Дней в неделю",
    "water_interval_hours": "Интервал напоминаний о воде",
    "events_lead_minutes": "Время до события",
    "cycle_days_before": "Дней до цикла",
    "goals_weekday": "День недели",
    "endpoint": "Адрес подписки",
    "keys": "Ключи подписки",
    "year": "Год",
    "month": "Месяц",
    "days": "Дней",
}


def _format_validation_error_ru(err: dict[str, Any]) -> str:
    err_type = str(err.get("type", ""))
    ctx = err.get("ctx") or {}
    loc = [part for part in (err.get("loc") or ()) if part not in ("body", "query", "path")]
    raw_field = str(loc[-1]) if loc else ""
    label = _FIELD_LABELS_RU.get(raw_field, "")
    prefix = f"Поле «{label}»: " if label else ""

    if err_type == "missing":
        return f"Заполните поле «{label}»" if label else "Заполните обязательное поле"
    if err_type in ("string_too_short", "too_short"):
        min_len = ctx.get("min_length")
        if min_len == 1:
            return f"Поле «{label}» не может быть пустым" if label else "Поле не может быть пустым"
        return f"{prefix}слишком короткое значение (минимум {min_len} симв.)"
    if err_type in ("string_too_long", "too_long"):
        max_len = ctx.get("max_length")
        return f"{prefix}слишком длинное значение (максимум {max_len} симв.)"
    if err_type == "greater_than":
        return f"{prefix}значение должно быть больше {ctx.get('gt')}"
    if err_type == "greater_than_equal":
        return f"{prefix}значение должно быть не меньше {ctx.get('ge')}"
    if err_type == "less_than":
        return f"{prefix}значение должно быть меньше {ctx.get('lt')}"
    if err_type == "less_than_equal":
        return f"{prefix}значение должно быть не больше {ctx.get('le')}"
    if err_type in ("int_parsing", "int_type"):
        return f"{prefix}укажите целое число"
    if err_type in ("float_parsing", "float_type"):
        return f"{prefix}укажите число"
    if err_type in ("bool_parsing", "bool_type"):
        return f"{prefix}некорректное логическое значение"
    if err_type == "literal_error":
        return f"{prefix}выберите допустимое значение"
    if err_type == "json_invalid":
        return "Некорректный формат данных запроса"
    return f"{prefix}некорректное значение"


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


@app.exception_handler(RequestValidationError)
async def russian_validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    formatted = [_format_validation_error_ru(err) for err in exc.errors()]
    detail = formatted[0] if formatted else "Проверьте корректность введённых данных"
    return JSONResponse(
        status_code=422,
        content={"detail": detail, "errors": formatted},
    )


@app.get("/api/health", tags=["health"])
def health_check() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "marina-tracker",
        "today": today_iso(),
        "db_backend": "postgres" if is_postgres() else "sqlite",
    }


# All application routers
app.include_router(today.router)
app.include_router(tasks_goals.router)
app.include_router(habits.router)
app.include_router(cycle.router)
app.include_router(nutrition.router)
app.include_router(home.router)
app.include_router(push.router)


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
        raise HTTPException(status_code=404, detail="Манифест приложения не найден")
    return FileResponse(
        manifest,
        media_type="application/manifest+json",
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/sw.js", include_in_schema=False)
def serve_service_worker():
    sw = _resolve_static_file("sw.js")
    if sw is None:
        raise HTTPException(status_code=404, detail="Файл сервис-воркера не найден")
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
        raise HTTPException(status_code=404, detail="Ресурс не найден")

    if full_path:
        static_file = _resolve_static_file(full_path)
        if static_file is not None:
            headers = (
                {"Cache-Control": "public, max-age=604800"}
                if full_path.startswith("dishes/")
                else None
            )
            return FileResponse(static_file, headers=headers)

    index_html = DIST_DIR / "index.html"
    if index_html.is_file():
        return FileResponse(index_html, headers={"Cache-Control": "no-cache"})

    return JSONResponse({"service": "marina-tracker", "status": "api_ready"})
