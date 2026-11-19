"""Daily tasks and multi-year goals (1–5 years) endpoints."""

from __future__ import annotations

from datetime import date, timedelta
import sqlite3
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Path, Query, status
from pydantic import BaseModel, Field

from ..db import (
    DB,
    now_hhmm,
    now_iso,
    parse_iso_date,
    record,
    records,
    today_iso,
    transaction,
    validate_date_str,
)

router = APIRouter(prefix="/api", tags=["tasks", "goals"])

TaskPriority = Literal["low", "medium", "high"]
TaskSectionTag = Literal["personal", "work", "health", "home", "goal"]
GoalStatus = Literal["active", "completed", "paused"]
CheckinCadence = Literal["weekly", "biweekly", "monthly"]

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
    category: str | None = Field(default="Личностный рост", max_length=80)
    horizon_years: int = Field(default=1, ge=1, le=10)
    start_date: str | None = None
    target_date: str | None = None
    progress_pct: int = Field(default=0, ge=0, le=100)
    linked_habit_id: int | None = None
    status: GoalStatus = "active"
    check_in_cadence: CheckinCadence = "weekly"
    milestones: list[MilestoneInput] = Field(default_factory=list)


class GoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=1500)
    category: str | None = Field(default=None, max_length=80)
    horizon_years: int | None = Field(default=None, ge=1, le=10)
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
        # Handle Feb 29 -> Feb 28
        return base.replace(month=2, day=28, year=base.year + years)


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


def build_goal_detail(
    db: sqlite3.Connection,
    goal_row: dict[str, Any],
    ref_date: date | None = None,
) -> dict[str, Any]:
    today = ref_date or parse_iso_date(today_iso())
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
        "horizon_years": goal_row["horizon_years"],
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
        "last_checkin_at": last_checkin_str,
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
    details = [build_goal_detail(db, r, ref_date=ref_date) for r in rows]
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
# Multi-Year Goals Endpoints
# ---------------------------------------------------------------------------


@router.get("/goals")
def list_goals(
    db: DB,
    goal_status: Annotated[Literal["all", "active", "completed", "paused"], Query(alias="status")] = "all",
    horizon: Annotated[Literal["all", "1", "2-3", "5"], Query()] = "all",
) -> dict[str, Any]:
    rows = records(
        db,
        """SELECT * FROM goals
           ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
                    horizon_years ASC, id ASC""",
    )
    all_details = [build_goal_detail(db, r) for r in rows]

    filtered = all_details
    if goal_status != "all":
        filtered = [g for g in filtered if g["status"] == goal_status]
    if horizon == "1":
        filtered = [g for g in filtered if g["horizon_years"] == 1]
    elif horizon == "2-3":
        filtered = [g for g in filtered if 2 <= g["horizon_years"] <= 3]
    elif horizon == "5":
        filtered = [g for g in filtered if g["horizon_years"] >= 4]

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
    start_d = parse_iso_date(body.start_date, default_today=True)
    target_d = (
        parse_iso_date(body.target_date)
        if body.target_date
        else add_years_safe(start_d, body.horizon_years)
    )
    if target_d <= start_d:
        raise HTTPException(status_code=422, detail="Целевая дата должна быть позже даты старта")
    if body.linked_habit_id is not None:
        if record(db, "SELECT id FROM habits WHERE id = ?", (body.linked_habit_id,)) is None:
            raise HTTPException(status_code=404, detail="Связанная привычка не найдена")

    created_ts = now_iso()
    with transaction(db):
        cur = db.execute(
            """INSERT INTO goals(
                title, description, category, horizon_years, start_date, target_date,
                progress_pct, linked_habit_id, status, check_in_cadence, last_checkin_at, created_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                title,
                (body.description or "").strip(),
                (body.category or "").strip() or "Личностный рост",
                body.horizon_years,
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
        updates["category"] = body.category.strip() or "Личностный рост"
    if "horizon_years" in fields and body.horizon_years is not None:
        updates["horizon_years"] = body.horizon_years
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
