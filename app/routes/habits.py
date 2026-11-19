"""Habits, vitamins, water tracker, and workouts endpoints."""

from __future__ import annotations

from datetime import date, timedelta
import re
import sqlite3
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Path, Query, status
from pydantic import BaseModel, Field, field_validator

from ..db import (
    DB,
    now_hhmm,
    now_iso,
    record,
    records,
    today_iso,
    transaction,
    validate_date_str,
    workout_label,
)

router = APIRouter(prefix="/api", tags=["habits", "water", "workouts"])

HabitPeriod = Literal["morning", "afternoon", "evening"]
HabitCategory = Literal["habit", "vitamin"]
WorkoutType = Literal["breathing", "pilates", "qigong", "other"]
WorkoutIntensity = Literal["light", "medium", "intense"]

_HHMM_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def _validate_hhmm(value: str | None, *, default_now: bool = False) -> str:
    if value is None:
        return now_hhmm() if default_now else ""
    cleaned = value.strip()
    if not cleaned:
        return now_hhmm() if default_now else ""
    if not _HHMM_RE.match(cleaned):
        raise HTTPException(
            status_code=422,
            detail=f"Неверный формат времени '{value}', ожидается HH:MM",
        )
    return cleaned


def _require_non_empty(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(
            status_code=422,
            detail=f"Поле '{field_name}' не может быть пустым",
        )
    return cleaned


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class HabitCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    period_of_day: HabitPeriod
    category: HabitCategory = "habit"
    dose_or_note: str = Field(default="", max_length=240)
    icon: str = Field(default="sparkles", max_length=40)
    color: str = Field(default="sage", max_length=40)
    target_days_per_week: int = Field(default=7, ge=1, le=7)
    sort_order: int | None = None

    @field_validator("dose_or_note", mode="before")
    @classmethod
    def _coerce_empty_str(cls, v: Any) -> Any:
        return "" if v is None else v

    @field_validator("icon", mode="before")
    @classmethod
    def _coerce_icon(cls, v: Any) -> Any:
        return "sparkles" if v is None else v

    @field_validator("color", mode="before")
    @classmethod
    def _coerce_color(cls, v: Any) -> Any:
        return "sage" if v is None else v

    @field_validator("category", mode="before")
    @classmethod
    def _coerce_category(cls, v: Any) -> Any:
        return "habit" if v is None else v

    @field_validator("target_days_per_week", mode="before")
    @classmethod
    def _coerce_target_days(cls, v: Any) -> Any:
        return 7 if v is None else v


class HabitUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    period_of_day: HabitPeriod | None = None
    category: HabitCategory | None = None
    dose_or_note: str | None = Field(default=None, max_length=240)
    icon: str | None = Field(default=None, max_length=40)
    color: str | None = Field(default=None, max_length=40)
    target_days_per_week: int | None = Field(default=None, ge=1, le=7)
    active: bool | None = None
    sort_order: int | None = None


class HabitToggle(BaseModel):
    date: str | None = None
    log_date: str | None = None
    completed: bool | None = None
    note: str | None = Field(default=None, max_length=500)


class WaterLogCreate(BaseModel):
    date: str | None = None
    log_date: str | None = None
    amount_ml: int = Field(gt=0, le=5000)
    logged_at: str | None = Field(default=None, max_length=10)


class WaterGoalUpdate(BaseModel):
    daily_goal_ml: int = Field(ge=200, le=10000)


class WorkoutCreate(BaseModel):
    log_date: str | None = None
    date: str | None = None
    workout_type: WorkoutType
    custom_label: str = Field(default="", max_length=120)
    duration_min: int = Field(default=20, gt=0, le=600)
    intensity: WorkoutIntensity = "medium"
    mood: str = Field(default="", max_length=60)
    note: str = Field(default="", max_length=1000)
    completed: bool = True
    logged_at: str | None = Field(default=None, max_length=10)

    @field_validator("custom_label", "mood", "note", mode="before")
    @classmethod
    def _coerce_empty_str(cls, v: Any) -> Any:
        return "" if v is None else v

    @field_validator("intensity", mode="before")
    @classmethod
    def _coerce_intensity(cls, v: Any) -> Any:
        return "medium" if v is None else v

    @field_validator("completed", mode="before")
    @classmethod
    def _coerce_completed(cls, v: Any) -> Any:
        return True if v is None else v


class WorkoutUpdate(BaseModel):
    log_date: str | None = None
    date: str | None = None
    workout_type: WorkoutType | None = None
    custom_label: str | None = Field(default=None, max_length=120)
    duration_min: int | None = Field(default=None, gt=0, le=600)
    intensity: WorkoutIntensity | None = None
    mood: str | None = Field(default=None, max_length=60)
    note: str | None = Field(default=None, max_length=1000)
    completed: bool | None = None
    logged_at: str | None = Field(default=None, max_length=10)


# ---------------------------------------------------------------------------
# Habits Helpers
# ---------------------------------------------------------------------------


def _compute_streak(completed_dates: set[str], ref_date: date) -> int:
    ref_iso = ref_date.isoformat()
    if ref_iso in completed_dates:
        cursor = ref_date
    elif (ref_date - timedelta(days=1)).isoformat() in completed_dates:
        cursor = ref_date - timedelta(days=1)
    else:
        return 0

    streak = 0
    while cursor.isoformat() in completed_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _compute_week_done(completed_dates: set[str], ref_date: date) -> int:
    start = (ref_date - timedelta(days=6)).isoformat()
    end = ref_date.isoformat()
    return sum(1 for d in completed_dates if start <= d <= end)


def _format_habit(
    habit: dict[str, Any],
    day_log: dict[str, Any] | None,
    completed_dates: set[str],
    ref_date: date,
) -> dict[str, Any]:
    is_done = bool(day_log and day_log["completed"] == 1)
    target_days = int(habit["target_days_per_week"])
    return {
        "id": int(habit["id"]),
        "title": habit["title"],
        "period_of_day": habit["period_of_day"],
        "category": habit["category"],
        "dose_or_note": habit["dose_or_note"],
        "icon": habit["icon"],
        "color": habit["color"],
        "target_days_per_week": target_days,
        "active": bool(habit["active"]),
        "sort_order": int(habit["sort_order"]),
        "completed": is_done,
        "completed_at": day_log["completed_at"] if (is_done and day_log) else None,
        "note": day_log["note"] if day_log else "",
        "streak_days": _compute_streak(completed_dates, ref_date),
        "week_done": _compute_week_done(completed_dates, ref_date),
        "week_target": target_days,
    }


def _fetch_single_habit_item(
    db: sqlite3.Connection,
    habit_id: int,
    target_date: str,
) -> dict[str, Any]:
    habit = record(db, "SELECT * FROM habits WHERE id = ?", (habit_id,))
    if habit is None:
        raise HTTPException(status_code=404, detail="Привычка не найдена")
    day_log = record(
        db,
        "SELECT * FROM habit_logs WHERE habit_id = ? AND log_date = ?",
        (habit_id, target_date),
    )
    done_rows = records(
        db,
        "SELECT log_date FROM habit_logs WHERE habit_id = ? AND completed = 1 AND log_date <= ?",
        (habit_id, target_date),
    )
    completed_dates = {r["log_date"] for r in done_rows}
    return _format_habit(habit, day_log, completed_dates, date.fromisoformat(target_date))


# ---------------------------------------------------------------------------
# Habits Endpoints
# ---------------------------------------------------------------------------


@router.get("/habits")
def list_habits(
    db: DB,
    date_str: Annotated[str | None, Query(alias="date")] = None,
) -> dict[str, Any]:
    target_date = validate_date_str(date_str, default_today=True)
    ref_date = date.fromisoformat(target_date)

    habit_rows = records(
        db,
        """SELECT * FROM habits
           WHERE active = 1
           ORDER BY CASE period_of_day
                        WHEN 'morning' THEN 0
                        WHEN 'afternoon' THEN 1
                        ELSE 2
                    END,
                    sort_order ASC,
                    id ASC""",
    )
    day_logs = records(
        db,
        "SELECT * FROM habit_logs WHERE log_date = ?",
        (target_date,),
    )
    day_log_map = {int(r["habit_id"]): r for r in day_logs}

    done_rows = records(
        db,
        """SELECT hl.habit_id, hl.log_date
           FROM habit_logs hl
           JOIN habits h ON h.id = hl.habit_id
           WHERE h.active = 1 AND hl.completed = 1 AND hl.log_date <= ?""",
        (target_date,),
    )
    completed_by_habit: dict[int, set[str]] = {}
    for row in done_rows:
        completed_by_habit.setdefault(int(row["habit_id"]), set()).add(row["log_date"])

    items: list[dict[str, Any]] = []
    groups: dict[str, list[dict[str, Any]]] = {
        "morning": [],
        "afternoon": [],
        "evening": [],
    }
    for habit in habit_rows:
        h_id = int(habit["id"])
        item = _format_habit(
            habit,
            day_log_map.get(h_id),
            completed_by_habit.get(h_id, set()),
            ref_date,
        )
        items.append(item)
        groups[item["period_of_day"]].append(item)

    total = len(items)
    done = sum(1 for item in items if item["completed"])
    vitamins_total = sum(1 for item in items if item["category"] == "vitamin")
    vitamins_done = sum(
        1 for item in items if item["category"] == "vitamin" and item["completed"]
    )
    percent = round(done * 100 / total) if total > 0 else 0

    return {
        "date": target_date,
        "groups": groups,
        "items": items,
        "summary": {
            "done": done,
            "total": total,
            "vitamins_done": vitamins_done,
            "vitamins_total": vitamins_total,
            "percent": percent,
        },
    }


@router.post("/habits", status_code=status.HTTP_201_CREATED)
def create_habit(db: DB, body: HabitCreate) -> dict[str, Any]:
    title = _require_non_empty(body.title, "title")
    created_at = now_iso()

    with transaction(db):
        sort_order = body.sort_order
        if sort_order is None:
            max_row = record(db, "SELECT COALESCE(MAX(sort_order), 0) AS m FROM habits")
            sort_order = int(max_row["m"]) + 1 if max_row else 1
        cur = db.execute(
            """INSERT INTO habits(
                   title, period_of_day, category, dose_or_note, icon, color,
                   target_days_per_week, active, sort_order, created_at
               ) VALUES(?,?,?,?,?,?,?,1,?,?)""",
            (
                title,
                body.period_of_day,
                body.category,
                body.dose_or_note.strip(),
                body.icon.strip() or "sparkles",
                body.color.strip() or "sage",
                body.target_days_per_week,
                sort_order,
                created_at,
            ),
        )
        habit_id = int(cur.lastrowid)

    return _fetch_single_habit_item(db, habit_id, today_iso())


@router.patch("/habits/{habit_id}")
def update_habit(
    db: DB,
    habit_id: Annotated[int, Path(ge=1)],
    body: HabitUpdate,
) -> dict[str, Any]:
    existing = record(db, "SELECT * FROM habits WHERE id = ?", (habit_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Привычка не найдена")

    fields = body.model_fields_set
    updates: dict[str, Any] = {}
    if "title" in fields and body.title is not None:
        updates["title"] = _require_non_empty(body.title, "title")
    if "period_of_day" in fields and body.period_of_day is not None:
        updates["period_of_day"] = body.period_of_day
    if "category" in fields and body.category is not None:
        updates["category"] = body.category
    if "dose_or_note" in fields and body.dose_or_note is not None:
        updates["dose_or_note"] = body.dose_or_note.strip()
    if "icon" in fields and body.icon is not None:
        updates["icon"] = body.icon.strip() or "sparkles"
    if "color" in fields and body.color is not None:
        updates["color"] = body.color.strip() or "sage"
    if "target_days_per_week" in fields and body.target_days_per_week is not None:
        updates["target_days_per_week"] = body.target_days_per_week
    if "active" in fields and body.active is not None:
        updates["active"] = 1 if body.active else 0
    if "sort_order" in fields and body.sort_order is not None:
        updates["sort_order"] = body.sort_order

    if updates:
        set_clause = ", ".join(f"{col} = ?" for col in updates)
        params = tuple(updates.values()) + (habit_id,)
        with transaction(db):
            db.execute(f"UPDATE habits SET {set_clause} WHERE id = ?", params)

    return _fetch_single_habit_item(db, habit_id, today_iso())


@router.delete("/habits/{habit_id}")
def delete_habit(
    db: DB,
    habit_id: Annotated[int, Path(ge=1)],
) -> dict[str, Any]:
    existing = record(db, "SELECT id FROM habits WHERE id = ?", (habit_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Привычка не найдена")
    with transaction(db):
        db.execute("DELETE FROM habits WHERE id = ?", (habit_id,))
    return {"deleted": True, "id": habit_id}


@router.post("/habits/{habit_id}/toggle")
def toggle_habit(
    db: DB,
    habit_id: Annotated[int, Path(ge=1)],
    body: HabitToggle | None = None,
) -> dict[str, Any]:
    payload = body or HabitToggle()
    existing_habit = record(db, "SELECT id FROM habits WHERE id = ?", (habit_id,))
    if existing_habit is None:
        raise HTTPException(status_code=404, detail="Привычка не найдена")

    target_date = validate_date_str(payload.date or payload.log_date, default_today=True)
    existing_log = record(
        db,
        "SELECT * FROM habit_logs WHERE habit_id = ? AND log_date = ?",
        (habit_id, target_date),
    )

    if payload.completed is not None:
        new_completed = payload.completed
    else:
        new_completed = not (existing_log is not None and existing_log["completed"] == 1)

    completed_at = now_hhmm() if new_completed else None
    note = (
        payload.note.strip()
        if payload.note is not None
        else (existing_log["note"] if existing_log is not None else "")
    )

    with transaction(db):
        db.execute(
            """INSERT INTO habit_logs(habit_id, log_date, completed, completed_at, note)
               VALUES(?,?,?,?,?)
               ON CONFLICT(habit_id, log_date) DO UPDATE SET
                   completed = excluded.completed,
                   completed_at = excluded.completed_at,
                   note = excluded.note""",
            (habit_id, target_date, 1 if new_completed else 0, completed_at, note),
        )

    return _fetch_single_habit_item(db, habit_id, target_date)


# ---------------------------------------------------------------------------
# Water Helpers & Endpoints
# ---------------------------------------------------------------------------


def _build_water_state(db: sqlite3.Connection, target_date: str) -> dict[str, Any]:
    goal_row = record(db, "SELECT daily_goal_ml FROM water_settings WHERE id = 1")
    goal_ml = int(goal_row["daily_goal_ml"]) if goal_row else 2000
    logs = records(
        db,
        "SELECT id, log_date, amount_ml, logged_at, created_at FROM water_logs WHERE log_date = ? ORDER BY logged_at DESC, id DESC",
        (target_date,),
    )
    total_ml = sum(int(entry["amount_ml"]) for entry in logs)
    percent = min(100, round(total_ml * 100 / max(1, goal_ml)))
    return {
        "date": target_date,
        "total_ml": total_ml,
        "goal_ml": goal_ml,
        "percent": percent,
        "logs": logs,
    }


@router.get("/water")
def get_water(
    db: DB,
    date_str: Annotated[str | None, Query(alias="date")] = None,
) -> dict[str, Any]:
    target_date = validate_date_str(date_str, default_today=True)
    return _build_water_state(db, target_date)


@router.post("/water/log", status_code=status.HTTP_201_CREATED)
def log_water(db: DB, body: WaterLogCreate) -> dict[str, Any]:
    target_date = validate_date_str(body.date or body.log_date, default_today=True)
    logged_at = _validate_hhmm(body.logged_at, default_now=True)
    created_at = now_iso()

    with transaction(db):
        cur = db.execute(
            "INSERT INTO water_logs(log_date, amount_ml, logged_at, created_at) VALUES(?,?,?,?)",
            (target_date, body.amount_ml, logged_at, created_at),
        )
        log_id = int(cur.lastrowid)

    saved = record(
        db,
        "SELECT id, log_date, amount_ml, logged_at, created_at FROM water_logs WHERE id = ?",
        (log_id,),
    )
    assert saved is not None
    state = _build_water_state(db, target_date)
    return {"id": log_id, "log": saved, **state}


@router.delete("/water/log/{log_id}")
def delete_water_log(
    db: DB,
    log_id: Annotated[int, Path(ge=1)],
) -> dict[str, Any]:
    existing = record(db, "SELECT id, log_date FROM water_logs WHERE id = ?", (log_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Запись о воде не найдена")

    log_date = existing["log_date"]
    with transaction(db):
        db.execute("DELETE FROM water_logs WHERE id = ?", (log_id,))

    state = _build_water_state(db, log_date)
    return {"deleted": True, "id": log_id, **state}


@router.put("/water/goal")
def update_water_goal(db: DB, body: WaterGoalUpdate) -> dict[str, Any]:
    with transaction(db):
        db.execute(
            """INSERT INTO water_settings(id, daily_goal_ml) VALUES(1, ?)
               ON CONFLICT(id) DO UPDATE SET daily_goal_ml = excluded.daily_goal_ml""",
            (body.daily_goal_ml,),
        )
    return {"daily_goal_ml": body.daily_goal_ml}


# ---------------------------------------------------------------------------
# Workouts Helpers & Endpoints
# ---------------------------------------------------------------------------


def _format_workout(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "log_date": row["log_date"],
        "workout_type": row["workout_type"],
        "custom_label": row["custom_label"],
        "label": workout_label(row["workout_type"], row["custom_label"]),
        "duration_min": int(row["duration_min"]),
        "intensity": row["intensity"],
        "mood": row["mood"],
        "note": row["note"],
        "completed": bool(row["completed"]),
        "logged_at": row["logged_at"],
        "created_at": row["created_at"],
    }


@router.get("/workouts")
def list_workouts(
    db: DB,
    date_str: Annotated[str | None, Query(alias="date")] = None,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
) -> dict[str, Any]:
    target_date = validate_date_str(date_str, default_today=True)
    ref_date = date.fromisoformat(target_date)
    since_date = (ref_date - timedelta(days=days - 1)).isoformat()
    week_start = (ref_date - timedelta(days=6)).isoformat()

    day_rows = records(
        db,
        "SELECT * FROM workouts WHERE log_date = ? ORDER BY logged_at DESC, id DESC",
        (target_date,),
    )
    recent_rows = records(
        db,
        """SELECT * FROM workouts
           WHERE log_date >= ? AND log_date <= ?
           ORDER BY log_date DESC, logged_at DESC, id DESC""",
        (since_date, target_date),
    )

    week_rows = records(
        db,
        """SELECT workout_type, duration_min
           FROM workouts
           WHERE completed = 1 AND log_date >= ? AND log_date <= ?""",
        (week_start, target_date),
    )
    by_type = {"breathing": 0, "pilates": 0, "qigong": 0, "other": 0}
    total_minutes = 0
    for row in week_rows:
        w_type = row["workout_type"]
        if w_type in by_type:
            by_type[w_type] += 1
        total_minutes += int(row["duration_min"])

    return {
        "date": target_date,
        "day_items": [_format_workout(r) for r in day_rows],
        "recent_items": [_format_workout(r) for r in recent_rows],
        "weekly_summary": {
            "total_sessions": len(week_rows),
            "total_minutes": total_minutes,
            "by_type": by_type,
        },
    }


@router.post("/workouts", status_code=status.HTTP_201_CREATED)
def create_workout(db: DB, body: WorkoutCreate) -> dict[str, Any]:
    target_date = validate_date_str(body.log_date or body.date, default_today=True)
    logged_at = _validate_hhmm(body.logged_at, default_now=True)
    created_at = now_iso()

    with transaction(db):
        cur = db.execute(
            """INSERT INTO workouts(
                   log_date, workout_type, custom_label, duration_min, intensity,
                   mood, note, completed, logged_at, created_at
               ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (
                target_date,
                body.workout_type,
                body.custom_label.strip(),
                body.duration_min,
                body.intensity,
                body.mood.strip(),
                body.note.strip(),
                1 if body.completed else 0,
                logged_at,
                created_at,
            ),
        )
        workout_id = int(cur.lastrowid)

    saved = record(db, "SELECT * FROM workouts WHERE id = ?", (workout_id,))
    assert saved is not None
    return _format_workout(saved)


@router.patch("/workouts/{workout_id}")
def update_workout(
    db: DB,
    workout_id: Annotated[int, Path(ge=1)],
    body: WorkoutUpdate,
) -> dict[str, Any]:
    existing = record(db, "SELECT * FROM workouts WHERE id = ?", (workout_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Тренировка не найдена")

    fields = body.model_fields_set
    updates: dict[str, Any] = {}
    if "log_date" in fields and body.log_date is not None:
        updates["log_date"] = validate_date_str(body.log_date)
    elif "date" in fields and body.date is not None:
        updates["log_date"] = validate_date_str(body.date)
    if "workout_type" in fields and body.workout_type is not None:
        updates["workout_type"] = body.workout_type
    if "custom_label" in fields and body.custom_label is not None:
        updates["custom_label"] = body.custom_label.strip()
    if "duration_min" in fields and body.duration_min is not None:
        updates["duration_min"] = body.duration_min
    if "intensity" in fields and body.intensity is not None:
        updates["intensity"] = body.intensity
    if "mood" in fields and body.mood is not None:
        updates["mood"] = body.mood.strip()
    if "note" in fields and body.note is not None:
        updates["note"] = body.note.strip()
    if "completed" in fields and body.completed is not None:
        updates["completed"] = 1 if body.completed else 0
    if "logged_at" in fields:
        updates["logged_at"] = _validate_hhmm(body.logged_at, default_now=False)

    if updates:
        set_clause = ", ".join(f"{col} = ?" for col in updates)
        params = tuple(updates.values()) + (workout_id,)
        with transaction(db):
            db.execute(f"UPDATE workouts SET {set_clause} WHERE id = ?", params)

    saved = record(db, "SELECT * FROM workouts WHERE id = ?", (workout_id,))
    assert saved is not None
    return _format_workout(saved)


@router.delete("/workouts/{workout_id}")
def delete_workout(
    db: DB,
    workout_id: Annotated[int, Path(ge=1)],
) -> dict[str, Any]:
    existing = record(db, "SELECT id FROM workouts WHERE id = ?", (workout_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Тренировка не найдена")
    with transaction(db):
        db.execute("DELETE FROM workouts WHERE id = ?", (workout_id,))
    return {"deleted": True, "id": workout_id}
