"""Daily tasks, multi-year & monthly mini-goals, and calendar events endpoints."""

from __future__ import annotations

import calendar
from datetime import date, timedelta
import sqlite3
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Path, Query, status
from pydantic import BaseModel, Field, field_validator

from ..db import (
    DB,
    now_dt,
    now_hhmm,
    now_iso,
    parse_iso_date,
    record,
    records,
    today_iso,
    transaction,
    validate_date_str,
)

router = APIRouter(prefix="/api", tags=["tasks", "goals", "events", "wishes"])

TaskPriority = Literal["low", "medium", "high"]
TaskSectionTag = Literal["personal", "work", "health", "home", "goal"]
GoalStatus = Literal["active", "completed", "paused"]
HorizonUnit = Literal["month", "year"]
CheckinCadence = Literal["weekly", "biweekly", "monthly"]
EventCategory = Literal["doctor", "beauty", "meeting", "event", "personal", "home"]

CADENCE_DAYS: dict[str, int] = {
    "weekly": 7,
    "biweekly": 14,
    "monthly": 30,
}

PACE_LABELS: dict[str, str] = {
    "on_track": "В графике",
    "attention": "Нужно внимание",
    "ahead": "Опережаю план",
}


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    task_date: str | None = None
    time_slot: str | None = Field(default="", max_length=20)
    priority: TaskPriority = "medium"
    section_tag: TaskSectionTag = "personal"
    goal_id: int | None = None
    sort_order: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    task_date: str | None = None
    time_slot: str | None = Field(default=None, max_length=20)
    priority: TaskPriority | None = None
    section_tag: TaskSectionTag | None = None
    goal_id: int | None = None
    completed: bool | None = None
    sort_order: int | None = None


class TaskToggle(BaseModel):
    completed: bool | None = None


class TaskReschedule(BaseModel):
    task_date: str | None = None
    days: int = Field(default=1, ge=-365, le=365)


class MilestoneInput(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    target_year: int = Field(ge=2024, le=2045)
    target_quarter: str | None = Field(default="Q4", max_length=10)
    sort_order: int | None = None


class MilestoneUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    target_year: int | None = Field(default=None, ge=2024, le=2045)
    target_quarter: str | None = Field(default=None, max_length=10)
    completed: bool | None = None
    sort_order: int | None = None
    sync_progress: bool = True


class GoalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    description: str | None = Field(default="", max_length=1500)
    category: str | None = Field(default="Хобби и увлечения", max_length=80)
    horizon_unit: HorizonUnit = "year"
    horizon_years: int = Field(default=1, ge=1, le=10)
    parent_goal_id: int | None = None
    start_date: str | None = None
    target_date: str | None = None
    progress_pct: int = Field(default=0, ge=0, le=100)
    linked_habit_id: int | None = None
    status: GoalStatus = "active"
    check_in_cadence: CheckinCadence = "weekly"
    milestones: list[MilestoneInput] = Field(default_factory=list)

    @field_validator("horizon_unit", mode="before")
    @classmethod
    def _coerce_horizon_unit(cls, v: Any) -> Any:
        return "year" if v is None or v == "" else v


class GoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=1500)
    category: str | None = Field(default=None, max_length=80)
    horizon_unit: HorizonUnit | None = None
    horizon_years: int | None = Field(default=None, ge=1, le=10)
    parent_goal_id: int | None = None
    start_date: str | None = None
    target_date: str | None = None
    progress_pct: int | None = Field(default=None, ge=0, le=100)
    linked_habit_id: int | None = None
    status: GoalStatus | None = None
    check_in_cadence: CheckinCadence | None = None


class GoalCheckinCreate(BaseModel):
    progress_pct: int = Field(ge=0, le=100)
    note: str | None = Field(default="", max_length=1500)
    feeling: str | None = Field(default="", max_length=60)
    checkin_date: str | None = None


class EventCreate(BaseModel):
    event_date: str | None = None
    date: str | None = None
    event_time: str | None = Field(default="", max_length=20)
    title: str = Field(min_length=1, max_length=240)
    category: EventCategory = "event"
    location: str | None = Field(default="", max_length=200)
    note: str | None = Field(default="", max_length=1500)

    @field_validator("category", mode="before")
    @classmethod
    def _coerce_category(cls, v: Any) -> Any:
        return "event" if v is None or v == "" else v


class EventUpdate(BaseModel):
    event_date: str | None = None
    date: str | None = None
    event_time: str | None = Field(default=None, max_length=20)
    title: str | None = Field(default=None, min_length=1, max_length=240)
    category: EventCategory | None = None
    location: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=1500)
    completed: bool | None = None


class EventToggle(BaseModel):
    completed: bool | None = None


class WishCreate(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    target_year: int | None = Field(default=None, ge=2020, le=2045)
    category: str | None = Field(default="Развлечения и отдых", max_length=80)
    note: str | None = Field(default="", max_length=1500)
    sort_order: int | None = None


class WishUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    target_year: int | None = Field(default=None, ge=2020, le=2045)
    category: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=1500)
    fulfilled: bool | None = None
    sort_order: int | None = None


class WishToggle(BaseModel):
    fulfilled: bool | None = None


# ---------------------------------------------------------------------------
# Helpers (shared with today.py)
# ---------------------------------------------------------------------------


def _require_non_empty(value: str, label: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=422, detail=f"Поле «{label}» не может быть пустым")
    return cleaned


def add_years_safe(base: date, years: int) -> date:
    try:
        return base.replace(year=base.year + years)
    except ValueError:
        return base.replace(month=2, day=28, year=base.year + years)


def add_months_safe(base: date, months: int) -> date:
    total_months = (base.year * 12 + (base.month - 1)) + months
    year = total_months // 12
    month = (total_months % 12) + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(base.day, last_day))


def serialize_task(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "task_date": row["task_date"],
        "title": row["title"],
        "time_slot": row["time_slot"],
        "priority": row["priority"],
        "section_tag": row["section_tag"],
        "goal_id": row["goal_id"],
        "goal_title": row.get("goal_title"),
        "completed": bool(row["completed"]),
        "completed_at": row["completed_at"],
        "sort_order": row["sort_order"],
        "created_at": row["created_at"],
    }


def fetch_tasks_for_date(db: sqlite3.Connection, task_date: str) -> list[dict[str, Any]]:
    rows = records(
        db,
        """SELECT t.*, g.title AS goal_title
           FROM tasks t
           LEFT JOIN goals g ON g.id = t.goal_id
           WHERE t.task_date = ?
           ORDER BY t.completed ASC,
                    CASE WHEN t.time_slot = '' THEN 1 ELSE 0 END ASC,
                    t.time_slot ASC,
                    t.sort_order ASC,
                    t.id ASC""",
        (task_date,),
    )
    return [serialize_task(r) for r in rows]


def fetch_task_by_id(db: sqlite3.Connection, task_id: int) -> dict[str, Any]:
    row = record(
        db,
        """SELECT t.*, g.title AS goal_title
           FROM tasks t
           LEFT JOIN goals g ON g.id = t.goal_id
           WHERE t.id = ?""",
        (task_id,),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return serialize_task(row)


def _compute_pace(
    goal_row: dict[str, Any],
    today: date,
) -> tuple[int, str, int, bool, int]:
    start_d = date.fromisoformat(goal_row["start_date"])
    target_d = date.fromisoformat(goal_row["target_date"])
    total_span = max(1, (target_d - start_d).days)
    elapsed = (today - start_d).days
    expected_pct = max(0, min(100, round(elapsed * 100 / total_span)))
    days_remaining = max(0, (target_d - today).days)

    last_checkin_str = goal_row["last_checkin_at"]
    last_ref_d = date.fromisoformat(last_checkin_str[:10]) if last_checkin_str else start_d
    days_since_checkin = max(0, (today - last_ref_d).days)
    cadence_limit = CADENCE_DAYS.get(goal_row["check_in_cadence"], 7)
    checkin_overdue = goal_row["status"] == "active" and days_since_checkin > cadence_limit

    progress_pct = int(goal_row["progress_pct"])
    if progress_pct >= 100 or (progress_pct >= expected_pct + 8 and not checkin_overdue):
        pace_status = "ahead"
    elif progress_pct <= expected_pct - 10 or checkin_overdue:
        pace_status = "attention"
    else:
        pace_status = "on_track"

    return expected_pct, pace_status, days_remaining, checkin_overdue, days_since_checkin


def build_goal_detail(
    db: sqlite3.Connection,
    goal_row: dict[str, Any],
    ref_date: date | None = None,
    *,
    include_children: bool = True,
) -> dict[str, Any]:
    today = ref_date or parse_iso_date(today_iso())
    expected_pct, pace_status, days_remaining, checkin_overdue, days_since_checkin = _compute_pace(
        goal_row, today
    )
    progress_pct = int(goal_row["progress_pct"])
    horizon_unit = goal_row.get("horizon_unit") or "year"
    horizon_years = int(goal_row["horizon_years"])
    parent_goal_id = goal_row.get("parent_goal_id")

    parent_goal_title: str | None = None
    if parent_goal_id is not None:
        parent_row = record(db, "SELECT title FROM goals WHERE id = ?", (parent_goal_id,))
        if parent_row is not None:
            parent_goal_title = parent_row["title"]

    mini_goals: list[dict[str, Any]] = []
    if include_children:
        child_rows = records(
            db,
            """SELECT * FROM goals
               WHERE parent_goal_id = ?
               ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
                        target_date ASC, id ASC""",
            (goal_row["id"],),
        )
        for child in child_rows:
            _, c_pace, _, _, _ = _compute_pace(child, today)
            mini_goals.append(
                {
                    "id": int(child["id"]),
                    "title": child["title"],
                    "progress_pct": int(child["progress_pct"]),
                    "status": child["status"],
                    "target_date": child["target_date"],
                    "pace_status": c_pace,
                    "pace_label": PACE_LABELS[c_pace],
                    "horizon_unit": child.get("horizon_unit") or "month",
                    "horizon_years": int(child["horizon_years"]),
                }
            )

    linked_habit: dict[str, Any] | None = None
    linked_habit_id = goal_row["linked_habit_id"]
    if linked_habit_id is not None:
        habit_row = record(
            db,
            "SELECT id, title, target_days_per_week FROM habits WHERE id = ?",
            (linked_habit_id,),
        )
        if habit_row is not None:
            since_30 = (today - timedelta(days=29)).isoformat()
            until_30 = today.isoformat()
            cnt_row = record(
                db,
                """SELECT COUNT(*) AS cnt
                   FROM habit_logs
                   WHERE habit_id = ? AND completed = 1 AND log_date BETWEEN ? AND ?""",
                (linked_habit_id, since_30, until_30),
            )
            completions_30d = int(cnt_row["cnt"]) if cnt_row else 0
            target_30d = max(1, round(int(habit_row["target_days_per_week"]) * 30 / 7))
            rate_30d_pct = min(100, round(completions_30d * 100 / target_30d))
            linked_habit = {
                "id": habit_row["id"],
                "title": habit_row["title"],
                "completions_30d": completions_30d,
                "target_30d": target_30d,
                "rate_30d_pct": rate_30d_pct,
            }

    milestones_rows = records(
        db,
        """SELECT * FROM goal_milestones
           WHERE goal_id = ?
           ORDER BY sort_order ASC, target_year ASC, target_quarter ASC, id ASC""",
        (goal_row["id"],),
    )
    milestones = [
        {
            "id": m["id"],
            "goal_id": m["goal_id"],
            "title": m["title"],
            "target_year": m["target_year"],
            "target_quarter": m["target_quarter"],
            "completed": bool(m["completed"]),
            "completed_at": m["completed_at"],
            "sort_order": m["sort_order"],
        }
        for m in milestones_rows
    ]

    checkins_rows = records(
        db,
        """SELECT * FROM goal_checkins
           WHERE goal_id = ?
           ORDER BY checkin_date DESC, id DESC""",
        (goal_row["id"],),
    )
    checkins = [
        {
            "id": c["id"],
            "goal_id": c["goal_id"],
            "checkin_date": c["checkin_date"],
            "progress_pct": c["progress_pct"],
            "note": c["note"],
            "feeling": c["feeling"],
            "created_at": c["created_at"],
        }
        for c in checkins_rows
    ]

    return {
        "id": goal_row["id"],
        "title": goal_row["title"],
        "description": goal_row["description"],
        "category": goal_row["category"],
        "horizon_unit": horizon_unit,
        "horizon_years": horizon_years,
        "parent_goal_id": parent_goal_id,
        "parent_goal_title": parent_goal_title,
        "mini_goals": mini_goals,
        "start_date": goal_row["start_date"],
        "target_date": goal_row["target_date"],
        "progress_pct": progress_pct,
        "expected_progress_pct": expected_pct,
        "pace_status": pace_status,
        "pace_label": PACE_LABELS[pace_status],
        "days_remaining": days_remaining,
        "checkin_overdue": checkin_overdue,
        "days_since_checkin": days_since_checkin,
        "linked_habit_id": linked_habit_id,
        "linked_habit": linked_habit,
        "status": goal_row["status"],
        "check_in_cadence": goal_row["check_in_cadence"],
        "last_checkin_at": goal_row["last_checkin_at"],
        "created_at": goal_row["created_at"],
        "milestones": milestones,
        "checkins": checkins,
    }


def fetch_goal_detail(db: sqlite3.Connection, goal_id: int) -> dict[str, Any]:
    row = record(db, "SELECT * FROM goals WHERE id = ?", (goal_id,))
    if row is None:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    return build_goal_detail(db, row)


def compute_goals_summary(db: sqlite3.Connection, ref_date: date | None = None) -> dict[str, Any]:
    rows = records(db, "SELECT * FROM goals ORDER BY id ASC")
    details = [build_goal_detail(db, r, ref_date=ref_date, include_children=False) for r in rows]
    active = [g for g in details if g["status"] == "active"]
    completed = [g for g in details if g["status"] == "completed"]
    avg_progress = round(sum(g["progress_pct"] for g in active) / len(active)) if active else 0
    needs_attention = sum(1 for g in active if g["pace_status"] == "attention")
    due_checkin = sum(1 for g in active if g["checkin_overdue"])
    return {
        "active_count": len(active),
        "completed_count": len(completed),
        "avg_progress_pct": avg_progress,
        "needs_attention_count": needs_attention,
        "due_checkin_count": due_checkin,
    }


def serialize_event(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "event_date": row["event_date"],
        "event_time": row["event_time"],
        "title": row["title"],
        "category": row["category"],
        "location": row["location"],
        "note": row["note"],
        "completed": bool(row["completed"]),
        "completed_at": row["completed_at"],
        "created_at": row["created_at"],
    }


def fetch_event_by_id(db: sqlite3.Connection, event_id: int) -> dict[str, Any]:
    row = record(db, "SELECT * FROM calendar_events WHERE id = ?", (event_id,))
    if row is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    return serialize_event(row)


# ---------------------------------------------------------------------------
# Task Endpoints
# ---------------------------------------------------------------------------


@router.get("/tasks")
def list_tasks(
    db: DB,
    date_str: Annotated[str | None, Query(alias="date")] = None,
    task_status: Annotated[Literal["all", "active", "completed"], Query(alias="status")] = "all",
) -> dict[str, Any]:
    target_date = validate_date_str(date_str, default_today=True)
    all_items = fetch_tasks_for_date(db, target_date)
    done_count = sum(1 for t in all_items if t["completed"])
    total_count = len(all_items)
    if task_status == "active":
        items = [t for t in all_items if not t["completed"]]
    elif task_status == "completed":
        items = [t for t in all_items if t["completed"]]
    else:
        items = all_items
    return {
        "date": target_date,
        "items": items,
        "done": done_count,
        "total": total_count,
    }


@router.post("/tasks", status_code=status.HTTP_201_CREATED)
def create_task(db: DB, body: TaskCreate) -> dict[str, Any]:
    title = _require_non_empty(body.title, "Название задачи")
    task_date = validate_date_str(body.task_date, default_today=True)
    if body.goal_id is not None:
        if record(db, "SELECT id FROM goals WHERE id = ?", (body.goal_id,)) is None:
            raise HTTPException(status_code=404, detail="Связанная цель не найдена")

    with transaction(db):
        sort_order = body.sort_order
        if sort_order is None:
            max_row = record(
                db,
                "SELECT COALESCE(MAX(sort_order), 0) AS mx FROM tasks WHERE task_date = ?",
                (task_date,),
            )
            sort_order = int(max_row["mx"]) + 1 if max_row else 1
        cur = db.execute(
            """INSERT INTO tasks(
                task_date, title, time_slot, priority, section_tag, goal_id,
                completed, completed_at, sort_order, created_at
            ) VALUES(?,?,?,?,?,?,0,NULL,?,?)""",
            (
                task_date,
                title,
                (body.time_slot or "").strip(),
                body.priority,
                body.section_tag,
                body.goal_id,
                sort_order,
                now_iso(),
            ),
        )
        task_id = int(cur.lastrowid)
    return fetch_task_by_id(db, task_id)


@router.patch("/tasks/{task_id}")
def update_task(
    db: DB,
    task_id: Annotated[int, Path(ge=1)],
    body: TaskUpdate,
) -> dict[str, Any]:
    existing = record(db, "SELECT * FROM tasks WHERE id = ?", (task_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    fields = body.model_fields_set
    updates: dict[str, Any] = {}
    if "title" in fields and body.title is not None:
        updates["title"] = _require_non_empty(body.title, "Название задачи")
    if "task_date" in fields and body.task_date is not None:
        updates["task_date"] = validate_date_str(body.task_date)
    if "time_slot" in fields:
        updates["time_slot"] = (body.time_slot or "").strip()
    if "priority" in fields and body.priority is not None:
        updates["priority"] = body.priority
    if "section_tag" in fields and body.section_tag is not None:
        updates["section_tag"] = body.section_tag
    if "goal_id" in fields:
        if body.goal_id is not None:
            if record(db, "SELECT id FROM goals WHERE id = ?", (body.goal_id,)) is None:
                raise HTTPException(status_code=404, detail="Связанная цель не найдена")
        updates["goal_id"] = body.goal_id
    if "sort_order" in fields and body.sort_order is not None:
        updates["sort_order"] = body.sort_order
    if "completed" in fields and body.completed is not None:
        updates["completed"] = 1 if body.completed else 0
        updates["completed_at"] = now_hhmm() if body.completed else None

    if updates:
        clause = ", ".join(f"{col} = ?" for col in updates)
        with transaction(db):
            db.execute(f"UPDATE tasks SET {clause} WHERE id = ?", (*updates.values(), task_id))
    return fetch_task_by_id(db, task_id)


@router.post("/tasks/{task_id}/toggle")
def toggle_task(
    db: DB,
    task_id: Annotated[int, Path(ge=1)],
    body: TaskToggle | None = None,
) -> dict[str, Any]:
    existing = record(db, "SELECT * FROM tasks WHERE id = ?", (task_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    new_completed = (
        body.completed
        if body is not None and body.completed is not None
        else not bool(existing["completed"])
    )
    completed_at = now_hhmm() if new_completed else None
    with transaction(db):
        db.execute(
            "UPDATE tasks SET completed = ?, completed_at = ? WHERE id = ?",
            (1 if new_completed else 0, completed_at, task_id),
        )
    return fetch_task_by_id(db, task_id)


@router.post("/tasks/{task_id}/reschedule")
def reschedule_task(
    db: DB,
    task_id: Annotated[int, Path(ge=1)],
    body: TaskReschedule | None = None,
) -> dict[str, Any]:
    existing = record(db, "SELECT * FROM tasks WHERE id = ?", (task_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if body is not None and body.task_date:
        new_date = validate_date_str(body.task_date)
    else:
        shift = body.days if body is not None else 1
        current_d = date.fromisoformat(existing["task_date"])
        new_date = (current_d + timedelta(days=shift)).isoformat()
    with transaction(db):
        db.execute("UPDATE tasks SET task_date = ? WHERE id = ?", (new_date, task_id))
    return fetch_task_by_id(db, task_id)


@router.delete("/tasks/{task_id}")
def delete_task(db: DB, task_id: Annotated[int, Path(ge=1)]) -> dict[str, Any]:
    existing = record(db, "SELECT id FROM tasks WHERE id = ?", (task_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    with transaction(db):
        db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    return {"deleted": True, "id": task_id}


# ---------------------------------------------------------------------------
# Multi-Year & Monthly Mini-Goals Endpoints
# ---------------------------------------------------------------------------


@router.get("/goals")
def list_goals(
    db: DB,
    goal_status: Annotated[Literal["all", "active", "completed", "paused"], Query(alias="status")] = "all",
    horizon: Annotated[Literal["all", "month", "1y", "5y", "1", "2-3", "5"], Query()] = "all",
    category: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    rows = records(
        db,
        """SELECT * FROM goals
           ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
                    CASE horizon_unit WHEN 'month' THEN 0 ELSE 1 END,
                    horizon_years ASC, id ASC""",
    )
    all_details = [build_goal_detail(db, r) for r in rows]

    filtered = all_details
    if goal_status != "all":
        filtered = [g for g in filtered if g["status"] == goal_status]
    if horizon == "month":
        filtered = [g for g in filtered if g["horizon_unit"] == "month"]
    elif horizon in ("1", "1y"):
        filtered = [g for g in filtered if g["horizon_unit"] == "year" and g["horizon_years"] == 1]
    elif horizon == "2-3":
        filtered = [g for g in filtered if g["horizon_unit"] == "year" and 2 <= g["horizon_years"] <= 3]
    elif horizon in ("5", "5y"):
        filtered = [g for g in filtered if g["horizon_unit"] == "year" and g["horizon_years"] >= 4]
    if category and category.strip() and category.strip().lower() != "all":
        cat_clean = category.strip()
        filtered = [g for g in filtered if g["category"] == cat_clean]

    active = [g for g in all_details if g["status"] == "active"]
    completed = [g for g in all_details if g["status"] == "completed"]
    summary = {
        "active_count": len(active),
        "completed_count": len(completed),
        "avg_progress_pct": round(sum(g["progress_pct"] for g in active) / len(active)) if active else 0,
        "needs_attention_count": sum(1 for g in active if g["pace_status"] == "attention"),
        "due_checkin_count": sum(1 for g in active if g["checkin_overdue"]),
    }
    return {"items": filtered, "summary": summary}


@router.post("/goals", status_code=status.HTTP_201_CREATED)
def create_goal(db: DB, body: GoalCreate) -> dict[str, Any]:
    title = _require_non_empty(body.title, "Название цели")
    horizon_unit = body.horizon_unit
    horizon_years = 1 if horizon_unit == "month" else body.horizon_years
    start_d = parse_iso_date(body.start_date, default_today=True)
    if body.target_date:
        target_d = parse_iso_date(body.target_date)
    elif horizon_unit == "month":
        target_d = add_months_safe(start_d, 1)
    else:
        target_d = add_years_safe(start_d, horizon_years)
    if target_d <= start_d:
        raise HTTPException(status_code=422, detail="Целевая дата должна быть позже даты старта")
    if body.linked_habit_id is not None:
        if record(db, "SELECT id FROM habits WHERE id = ?", (body.linked_habit_id,)) is None:
            raise HTTPException(status_code=404, detail="Связанная привычка не найдена")
    if body.parent_goal_id is not None:
        if record(db, "SELECT id FROM goals WHERE id = ?", (body.parent_goal_id,)) is None:
            raise HTTPException(status_code=404, detail="Родительская цель не найдена")

    created_ts = now_iso()
    with transaction(db):
        cur = db.execute(
            """INSERT INTO goals(
                title, description, category, horizon_unit, horizon_years, parent_goal_id,
                start_date, target_date, progress_pct, linked_habit_id, status,
                check_in_cadence, last_checkin_at, created_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                title,
                (body.description or "").strip(),
                (body.category or "").strip() or "Хобби и увлечения",
                horizon_unit,
                horizon_years,
                body.parent_goal_id,
                start_d.isoformat(),
                target_d.isoformat(),
                body.progress_pct,
                body.linked_habit_id,
                body.status,
                body.check_in_cadence,
                start_d.isoformat(),
                created_ts,
            ),
        )
        goal_id = int(cur.lastrowid)
        for idx, m in enumerate(body.milestones):
            m_title = _require_non_empty(m.title, "Название вехи")
            db.execute(
                """INSERT INTO goal_milestones(
                    goal_id, title, target_year, target_quarter, completed, completed_at, sort_order
                ) VALUES(?,?,?,?,0,NULL,?)""",
                (
                    goal_id,
                    m_title,
                    m.target_year,
                    (m.target_quarter or "").strip() or "Q4",
                    m.sort_order if m.sort_order is not None else idx + 1,
                ),
            )
    return fetch_goal_detail(db, goal_id)


@router.patch("/goals/{goal_id}")
def update_goal(
    db: DB,
    goal_id: Annotated[int, Path(ge=1)],
    body: GoalUpdate,
) -> dict[str, Any]:
    existing = record(db, "SELECT * FROM goals WHERE id = ?", (goal_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Цель не найдена")

    fields = body.model_fields_set
    updates: dict[str, Any] = {}
    if "title" in fields and body.title is not None:
        updates["title"] = _require_non_empty(body.title, "Название цели")
    if "description" in fields:
        updates["description"] = (body.description or "").strip()
    if "category" in fields and body.category is not None:
        updates["category"] = body.category.strip() or "Хобби и увлечения"
    if "horizon_unit" in fields and body.horizon_unit is not None:
        updates["horizon_unit"] = body.horizon_unit
        if body.horizon_unit == "month" and "horizon_years" not in fields:
            updates["horizon_years"] = 1
    if "horizon_years" in fields and body.horizon_years is not None:
        updates["horizon_years"] = body.horizon_years
    if "parent_goal_id" in fields:
        if body.parent_goal_id is not None:
            if body.parent_goal_id == goal_id:
                raise HTTPException(status_code=422, detail="Цель не может ссылаться сама на себя")
            if record(db, "SELECT id FROM goals WHERE id = ?", (body.parent_goal_id,)) is None:
                raise HTTPException(status_code=404, detail="Родительская цель не найдена")
        updates["parent_goal_id"] = body.parent_goal_id
    if "start_date" in fields and body.start_date is not None:
        updates["start_date"] = validate_date_str(body.start_date)
    if "target_date" in fields and body.target_date is not None:
        updates["target_date"] = validate_date_str(body.target_date)
    new_start = updates.get("start_date", existing["start_date"])
    new_target = updates.get("target_date", existing["target_date"])
    if new_target <= new_start:
        raise HTTPException(status_code=422, detail="Целевая дата должна быть позже даты старта")
    if "progress_pct" in fields and body.progress_pct is not None:
        updates["progress_pct"] = body.progress_pct
    if "linked_habit_id" in fields:
        if body.linked_habit_id is not None:
            if record(db, "SELECT id FROM habits WHERE id = ?", (body.linked_habit_id,)) is None:
                raise HTTPException(status_code=404, detail="Связанная привычка не найдена")
        updates["linked_habit_id"] = body.linked_habit_id
    if "status" in fields and body.status is not None:
        updates["status"] = body.status
    if "check_in_cadence" in fields and body.check_in_cadence is not None:
        updates["check_in_cadence"] = body.check_in_cadence

    if updates:
        clause = ", ".join(f"{col} = ?" for col in updates)
        with transaction(db):
            db.execute(f"UPDATE goals SET {clause} WHERE id = ?", (*updates.values(), goal_id))
    return fetch_goal_detail(db, goal_id)


@router.delete("/goals/{goal_id}")
def delete_goal(db: DB, goal_id: Annotated[int, Path(ge=1)]) -> dict[str, Any]:
    existing = record(db, "SELECT id FROM goals WHERE id = ?", (goal_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Цель не найдена")
    with transaction(db):
        db.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
    return {"deleted": True, "id": goal_id}


@router.post("/goals/{goal_id}/milestones", status_code=status.HTTP_201_CREATED)
def create_milestone(
    db: DB,
    goal_id: Annotated[int, Path(ge=1)],
    body: MilestoneInput,
) -> dict[str, Any]:
    m_title = _require_non_empty(body.title, "Название вехи")
    if record(db, "SELECT id FROM goals WHERE id = ?", (goal_id,)) is None:
        raise HTTPException(status_code=404, detail="Цель не найдена")

    with transaction(db):
        sort_order = body.sort_order
        if sort_order is None:
            max_row = record(
                db,
                "SELECT COALESCE(MAX(sort_order), 0) AS mx FROM goal_milestones WHERE goal_id = ?",
                (goal_id,),
            )
            sort_order = int(max_row["mx"]) + 1 if max_row else 1
        cur = db.execute(
            """INSERT INTO goal_milestones(
                goal_id, title, target_year, target_quarter, completed, completed_at, sort_order
            ) VALUES(?,?,?,?,0,NULL,?)""",
            (goal_id, m_title, body.target_year, (body.target_quarter or "").strip() or "Q4", sort_order),
        )
        m_id = int(cur.lastrowid)

    goal_detail = fetch_goal_detail(db, goal_id)
    milestone = next(m for m in goal_detail["milestones"] if m["id"] == m_id)
    return {"id": m_id, "milestone": milestone, "goal": goal_detail}


@router.patch("/goals/{goal_id}/milestones/{milestone_id}")
def update_milestone(
    db: DB,
    goal_id: Annotated[int, Path(ge=1)],
    milestone_id: Annotated[int, Path(ge=1)],
    body: MilestoneUpdate,
) -> dict[str, Any]:
    existing = record(
        db,
        "SELECT * FROM goal_milestones WHERE id = ? AND goal_id = ?",
        (milestone_id, goal_id),
    )
    if existing is None:
        raise HTTPException(status_code=404, detail="Веха не найдена")

    fields = body.model_fields_set
    updates: dict[str, Any] = {}
    if "title" in fields and body.title is not None:
        updates["title"] = _require_non_empty(body.title, "Название вехи")
    if "target_year" in fields and body.target_year is not None:
        updates["target_year"] = body.target_year
    if "target_quarter" in fields and body.target_quarter is not None:
        updates["target_quarter"] = body.target_quarter.strip()
    if "sort_order" in fields and body.sort_order is not None:
        updates["sort_order"] = body.sort_order
    if "completed" in fields and body.completed is not None:
        updates["completed"] = 1 if body.completed else 0
        updates["completed_at"] = today_iso() if body.completed else None

    with transaction(db):
        if updates:
            clause = ", ".join(f"{col} = ?" for col in updates)
            db.execute(
                f"UPDATE goal_milestones SET {clause} WHERE id = ? AND goal_id = ?",
                (*updates.values(), milestone_id, goal_id),
            )
        if "completed" in fields and body.sync_progress:
            stats_row = record(
                db,
                """SELECT COUNT(*) AS total, COALESCE(SUM(completed), 0) AS done
                   FROM goal_milestones WHERE goal_id = ?""",
                (goal_id,),
            )
            if stats_row and int(stats_row["total"]) > 0:
                new_pct = round(int(stats_row["done"]) * 100 / int(stats_row["total"]))
                db.execute("UPDATE goals SET progress_pct = ? WHERE id = ?", (new_pct, goal_id))

    goal_detail = fetch_goal_detail(db, goal_id)
    milestone = next(m for m in goal_detail["milestones"] if m["id"] == milestone_id)
    return {"milestone": milestone, "goal": goal_detail}


@router.delete("/goals/{goal_id}/milestones/{milestone_id}")
def delete_milestone(
    db: DB,
    goal_id: Annotated[int, Path(ge=1)],
    milestone_id: Annotated[int, Path(ge=1)],
) -> dict[str, Any]:
    existing = record(
        db,
        "SELECT id FROM goal_milestones WHERE id = ? AND goal_id = ?",
        (milestone_id, goal_id),
    )
    if existing is None:
        raise HTTPException(status_code=404, detail="Веха не найдена")
    with transaction(db):
        db.execute("DELETE FROM goal_milestones WHERE id = ? AND goal_id = ?", (milestone_id, goal_id))
    return {"deleted": True, "id": milestone_id, "goal": fetch_goal_detail(db, goal_id)}


@router.post("/goals/{goal_id}/checkins", status_code=status.HTTP_201_CREATED)
def create_checkin(
    db: DB,
    goal_id: Annotated[int, Path(ge=1)],
    body: GoalCheckinCreate,
) -> dict[str, Any]:
    if record(db, "SELECT id FROM goals WHERE id = ?", (goal_id,)) is None:
        raise HTTPException(status_code=404, detail="Цель не найдена")

    checkin_date = validate_date_str(body.checkin_date, default_today=True)
    created_ts = now_iso()
    with transaction(db):
        cur = db.execute(
            """INSERT INTO goal_checkins(
                goal_id, checkin_date, progress_pct, note, feeling, created_at
            ) VALUES(?,?,?,?,?,?)""",
            (
                goal_id,
                checkin_date,
                body.progress_pct,
                (body.note or "").strip(),
                (body.feeling or "").strip(),
                created_ts,
            ),
        )
        c_id = int(cur.lastrowid)
        db.execute(
            "UPDATE goals SET progress_pct = ?, last_checkin_at = ? WHERE id = ?",
            (body.progress_pct, checkin_date, goal_id),
        )

    goal_detail = fetch_goal_detail(db, goal_id)
    checkin = next(c for c in goal_detail["checkins"] if c["id"] == c_id)
    return {"id": c_id, "checkin": checkin, "goal": goal_detail}


# ---------------------------------------------------------------------------
# Calendar Events Endpoints
# ---------------------------------------------------------------------------


@router.get("/events")
def list_events(
    db: DB,
    year: Annotated[int | None, Query(ge=2020, le=2045)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
    date_str: Annotated[str | None, Query(alias="date")] = None,
) -> dict[str, Any]:
    today_d = now_dt().date()
    today_str = today_d.isoformat()

    selected_date: str | None = None
    if date_str:
        parsed_d = parse_iso_date(date_str)
        selected_date = parsed_d.isoformat()
        target_year = year if year is not None else parsed_d.year
        target_month = month if month is not None else parsed_d.month
    else:
        target_year = year if year is not None else today_d.year
        target_month = month if month is not None else today_d.month

    month_start = date(target_year, target_month, 1).isoformat()
    month_end = date(
        target_year, target_month, calendar.monthrange(target_year, target_month)[1]
    ).isoformat()

    month_rows = records(
        db,
        """SELECT * FROM calendar_events
           WHERE event_date BETWEEN ? AND ?
           ORDER BY event_date ASC,
                    CASE WHEN event_time = '' THEN 1 ELSE 0 END ASC,
                    event_time ASC,
                    id ASC""",
        (month_start, month_end),
    )
    month_items = [serialize_event(r) for r in month_rows]

    month_days_map: dict[str, list[dict[str, Any]]] = {}
    for ev in month_items:
        month_days_map.setdefault(ev["event_date"], []).append(ev)

    if selected_date is not None:
        day_rows = records(
            db,
            """SELECT * FROM calendar_events
               WHERE event_date = ?
               ORDER BY completed ASC,
                        CASE WHEN event_time = '' THEN 1 ELSE 0 END ASC,
                        event_time ASC,
                        id ASC""",
            (selected_date,),
        )
        items = [serialize_event(r) for r in day_rows]
    else:
        items = month_items

    upcoming_end = (today_d + timedelta(days=21)).isoformat()
    upcoming_rows = records(
        db,
        """SELECT * FROM calendar_events
           WHERE completed = 0 AND event_date BETWEEN ? AND ?
           ORDER BY event_date ASC,
                    CASE WHEN event_time = '' THEN 1 ELSE 0 END ASC,
                    event_time ASC,
                    id ASC""",
        (today_str, upcoming_end),
    )
    upcoming = [serialize_event(r) for r in upcoming_rows]

    return {
        "year": target_year,
        "month": target_month,
        "today": today_str,
        "date": selected_date,
        "items": items,
        "month_days_map": month_days_map,
        "upcoming": upcoming,
    }


@router.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(db: DB, body: EventCreate) -> dict[str, Any]:
    title = _require_non_empty(body.title, "Название события")
    event_date = validate_date_str(body.event_date or body.date, default_today=True)
    created_at = now_iso()

    with transaction(db):
        cur = db.execute(
            """INSERT INTO calendar_events(
                event_date, event_time, title, category, location, note,
                completed, completed_at, created_at
            ) VALUES(?,?,?,?,?,?,0,NULL,?)""",
            (
                event_date,
                (body.event_time or "").strip(),
                title,
                body.category,
                (body.location or "").strip(),
                (body.note or "").strip(),
                created_at,
            ),
        )
        event_id = int(cur.lastrowid)
    return fetch_event_by_id(db, event_id)


@router.patch("/events/{event_id}")
def update_event(
    db: DB,
    event_id: Annotated[int, Path(ge=1)],
    body: EventUpdate,
) -> dict[str, Any]:
    existing = record(db, "SELECT * FROM calendar_events WHERE id = ?", (event_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")

    fields = body.model_fields_set
    updates: dict[str, Any] = {}
    if "title" in fields and body.title is not None:
        updates["title"] = _require_non_empty(body.title, "Название события")
    if "event_date" in fields and body.event_date is not None:
        updates["event_date"] = validate_date_str(body.event_date)
    elif "date" in fields and body.date is not None:
        updates["event_date"] = validate_date_str(body.date)
    if "event_time" in fields:
        updates["event_time"] = (body.event_time or "").strip()
    if "category" in fields and body.category is not None:
        updates["category"] = body.category
    if "location" in fields:
        updates["location"] = (body.location or "").strip()
    if "note" in fields:
        updates["note"] = (body.note or "").strip()
    if "completed" in fields and body.completed is not None:
        updates["completed"] = 1 if body.completed else 0
        updates["completed_at"] = now_hhmm() if body.completed else None

    if updates:
        clause = ", ".join(f"{col} = ?" for col in updates)
        with transaction(db):
            db.execute(
                f"UPDATE calendar_events SET {clause} WHERE id = ?",
                (*updates.values(), event_id),
            )
    return fetch_event_by_id(db, event_id)


@router.post("/events/{event_id}/toggle")
def toggle_event(
    db: DB,
    event_id: Annotated[int, Path(ge=1)],
    body: EventToggle | None = None,
) -> dict[str, Any]:
    existing = record(db, "SELECT * FROM calendar_events WHERE id = ?", (event_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    new_completed = (
        body.completed
        if body is not None and body.completed is not None
        else not bool(existing["completed"])
    )
    completed_at = now_hhmm() if new_completed else None
    with transaction(db):
        db.execute(
            "UPDATE calendar_events SET completed = ?, completed_at = ? WHERE id = ?",
            (1 if new_completed else 0, completed_at, event_id),
        )
    return fetch_event_by_id(db, event_id)


@router.delete("/events/{event_id}")
def delete_event(db: DB, event_id: Annotated[int, Path(ge=1)]) -> dict[str, Any]:
    existing = record(db, "SELECT id FROM calendar_events WHERE id = ?", (event_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    with transaction(db):
        db.execute("DELETE FROM calendar_events WHERE id = ?", (event_id,))
    return {"deleted": True, "id": event_id}


# ---------------------------------------------------------------------------
# Yearly Wishes («Список желаний на год») Endpoints
# ---------------------------------------------------------------------------


def serialize_wish(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "target_year": int(row["target_year"]),
        "title": row["title"],
        "category": row["category"],
        "note": row["note"],
        "fulfilled": bool(row["fulfilled"]),
        "fulfilled_at": row["fulfilled_at"],
        "sort_order": int(row["sort_order"]),
        "created_at": row["created_at"],
    }


def fetch_wish_by_id(db: Any, wish_id: int) -> dict[str, Any]:
    row = record(db, "SELECT * FROM wishes WHERE id = ?", (wish_id,))
    if row is None:
        raise HTTPException(status_code=404, detail="Желание не найдено")
    return serialize_wish(row)


@router.get("/wishes")
def list_wishes(
    db: DB,
    year: Annotated[int | None, Query(ge=2020, le=2045)] = None,
    category: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    target_year = year if year is not None else now_dt().year
    all_rows = records(
        db,
        """SELECT * FROM wishes
           WHERE target_year = ?
           ORDER BY fulfilled ASC, sort_order ASC, id DESC""",
        (target_year,),
    )
    all_items = [serialize_wish(r) for r in all_rows]
    if category and category.strip() and category.strip().lower() != "all":
        cat_clean = category.strip()
        items = [w for w in all_items if w["category"] == cat_clean]
    else:
        items = all_items

    by_category: dict[str, list[dict[str, Any]]] = {}
    for w in items:
        by_category.setdefault(w["category"], []).append(w)

    total = len(all_items)
    fulfilled = sum(1 for w in all_items if w["fulfilled"])
    remaining = total - fulfilled
    percent = round(fulfilled * 100 / total) if total > 0 else 0

    return {
        "year": target_year,
        "items": items,
        "summary": {
            "total": total,
            "fulfilled": fulfilled,
            "remaining": remaining,
            "percent": percent,
        },
        "by_category": by_category,
    }


@router.post("/wishes", status_code=status.HTTP_201_CREATED)
def create_wish(db: DB, body: WishCreate) -> dict[str, Any]:
    title = _require_non_empty(body.title, "Желание")
    target_year = body.target_year if body.target_year is not None else now_dt().year
    category = (body.category or "").strip() or "Развлечения и отдых"
    note = (body.note or "").strip()
    created_at = now_iso()

    with transaction(db):
        sort_order = body.sort_order
        if sort_order is None:
            max_row = record(
                db,
                "SELECT COALESCE(MAX(sort_order), 0) AS mx FROM wishes WHERE target_year = ?",
                (target_year,),
            )
            sort_order = int(max_row["mx"]) + 1 if max_row else 1
        cur = db.execute(
            """INSERT INTO wishes(
                target_year, title, category, note, fulfilled, fulfilled_at, sort_order, created_at
            ) VALUES(?,?,?,?,0,NULL,?,?)""",
            (target_year, title, category, note, sort_order, created_at),
        )
        wish_id = int(cur.lastrowid)
    return fetch_wish_by_id(db, wish_id)


@router.patch("/wishes/{wish_id}")
def update_wish(
    db: DB,
    wish_id: Annotated[int, Path(ge=1)],
    body: WishUpdate,
) -> dict[str, Any]:
    existing = record(db, "SELECT * FROM wishes WHERE id = ?", (wish_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Желание не найдено")

    fields = body.model_fields_set
    updates: dict[str, Any] = {}
    if "title" in fields and body.title is not None:
        updates["title"] = _require_non_empty(body.title, "Желание")
    if "target_year" in fields and body.target_year is not None:
        updates["target_year"] = body.target_year
    if "category" in fields and body.category is not None:
        updates["category"] = body.category.strip() or "Развлечения и отдых"
    if "note" in fields:
        updates["note"] = (body.note or "").strip()
    if "sort_order" in fields and body.sort_order is not None:
        updates["sort_order"] = body.sort_order
    if "fulfilled" in fields and body.fulfilled is not None:
        updates["fulfilled"] = 1 if body.fulfilled else 0
        updates["fulfilled_at"] = (existing["fulfilled_at"] or today_iso()) if body.fulfilled else None

    if updates:
        clause = ", ".join(f"{col} = ?" for col in updates)
        with transaction(db):
            db.execute(f"UPDATE wishes SET {clause} WHERE id = ?", (*updates.values(), wish_id))
    return fetch_wish_by_id(db, wish_id)


@router.post("/wishes/{wish_id}/toggle")
def toggle_wish(
    db: DB,
    wish_id: Annotated[int, Path(ge=1)],
    body: WishToggle | None = None,
) -> dict[str, Any]:
    existing = record(db, "SELECT * FROM wishes WHERE id = ?", (wish_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Желание не найдено")
    new_fulfilled = (
        body.fulfilled
        if body is not None and body.fulfilled is not None
        else not bool(existing["fulfilled"])
    )
    fulfilled_at = today_iso() if new_fulfilled else None
    with transaction(db):
        db.execute(
            "UPDATE wishes SET fulfilled = ?, fulfilled_at = ? WHERE id = ?",
            (1 if new_fulfilled else 0, fulfilled_at, wish_id),
        )
    return fetch_wish_by_id(db, wish_id)


@router.delete("/wishes/{wish_id}")
def delete_wish(db: DB, wish_id: Annotated[int, Path(ge=1)]) -> dict[str, Any]:
    existing = record(db, "SELECT id FROM wishes WHERE id = ?", (wish_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Желание не найдено")
    with transaction(db):
        db.execute("DELETE FROM wishes WHERE id = ?", (wish_id,))
    return {"deleted": True, "id": wish_id}
