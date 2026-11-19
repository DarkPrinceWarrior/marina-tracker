"""Today aggregator and daily reflection endpoints."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from ..db import (
    DB,
    compute_cycle_snapshot,
    now_dt,
    now_iso,
    record,
    records,
    today_iso,
    transaction,
    validate_date_str,
    workout_label,
)
from .tasks_goals import compute_goals_summary, fetch_tasks_for_date

router = APIRouter(prefix="/api/today", tags=["today"])

PERIOD_LABELS: dict[str, str] = {
    "morning": "Утро",
    "afternoon": "День",
    "evening": "Вечер",
}

MEAL_SLOT_LABELS: dict[str, str] = {
    "breakfast": "Завтрак",
    "lunch": "Обед",
    "dinner": "Ужин",
    "snack": "Перекус",
}

TASK_TAG_LABELS: dict[str, str] = {
    "personal": "Личное",
    "work": "Работа",
    "health": "Здоровье",
    "home": "Дом",
    "goal": "Цель",
}


class ReflectionUpsert(BaseModel):
    date: str | None = None
    log_date: str | None = None
    summary_note: str | None = Field(default="", max_length=2500)
    energy_level: int | None = Field(default=None, ge=1, le=5)
    mood: str | None = Field(default="", max_length=60)


def _greeting_period() -> str:
    hour = now_dt().hour
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 18:
        return "afternoon"
    return "evening"


@router.get("")
def get_today_overview(
    db: DB,
    date_str: Annotated[str | None, Query(alias="date")] = None,
) -> dict[str, Any]:
    target_date = validate_date_str(date_str, default_today=True)
    ref_date = date.fromisoformat(target_date)

    # 1. Habits & Vitamins
    habit_rows = records(
        db,
        """SELECT h.*, hl.completed AS log_completed, hl.completed_at
           FROM habits h
           LEFT JOIN habit_logs hl
             ON hl.habit_id = h.id AND hl.log_date = ?
           WHERE h.active = 1
           ORDER BY CASE h.period_of_day
                        WHEN 'morning' THEN 0
                        WHEN 'afternoon' THEN 1
                        ELSE 2
                    END,
                    h.sort_order ASC,
                    h.id ASC""",
        (target_date,),
    )
    habits_total = len(habit_rows)
    habits_done = sum(1 for h in habit_rows if h["log_completed"] == 1)
    vitamins_total = sum(1 for h in habit_rows if h["category"] == "vitamin")
    vitamins_done = sum(1 for h in habit_rows if h["category"] == "vitamin" and h["log_completed"] == 1)
    next_pending_row = next((h for h in habit_rows if h["log_completed"] != 1), None)
    next_pending = (
        {
            "id": next_pending_row["id"],
            "title": next_pending_row["title"],
            "category": next_pending_row["category"],
            "period_of_day": next_pending_row["period_of_day"],
            "dose_or_note": next_pending_row["dose_or_note"],
        }
        if next_pending_row is not None
        else None
    )

    # 2. Water
    water_goal_row = record(db, "SELECT daily_goal_ml FROM water_settings WHERE id = 1")
    water_goal = int(water_goal_row["daily_goal_ml"]) if water_goal_row else 2000
    water_logs = records(
        db,
        "SELECT * FROM water_logs WHERE log_date = ? ORDER BY logged_at DESC, id DESC",
        (target_date,),
    )
    water_total = sum(int(w["amount_ml"]) for w in water_logs)
    water_pct = min(100, round(water_total * 100 / max(1, water_goal)))

    # 3. Workouts
    workout_rows = records(
        db,
        """SELECT * FROM workouts
           WHERE log_date = ? AND completed = 1
           ORDER BY logged_at DESC, id DESC""",
        (target_date,),
    )
    workouts_total_min = sum(int(w["duration_min"]) for w in workout_rows)
    latest_workout = (
        {
            "id": workout_rows[0]["id"],
            "workout_type": workout_rows[0]["workout_type"],
            "custom_label": workout_rows[0]["custom_label"],
            "label": workout_label(workout_rows[0]["workout_type"], workout_rows[0]["custom_label"]),
            "duration_min": workout_rows[0]["duration_min"],
            "intensity": workout_rows[0]["intensity"],
            "logged_at": workout_rows[0]["logged_at"],
        }
        if workout_rows
        else None
    )

    # 4. Nutrition
    meal_rows = records(
        db,
        """SELECT * FROM meal_logs
           WHERE log_date = ? AND completed = 1
           ORDER BY eaten_at ASC, id ASC""",
        (target_date,),
    )
    slots_order = ["breakfast", "lunch", "dinner", "snack"]
    present_slots = {m["meal_slot"] for m in meal_rows}
    slots_done = [s for s in slots_order if s in present_slots]
    total_kcal = sum(int(m["kcal"]) for m in meal_rows)
    total_grams = sum(int(m["grams"]) for m in meal_rows)

    # 5. Tasks
    tasks = fetch_tasks_for_date(db, target_date)
    tasks_done = sum(1 for t in tasks if t["completed"])
    tasks_total = len(tasks)

    # 6. Chores & Shopping
    chore_rows = records(
        db,
        """SELECT c.*, cl.completed AS log_completed, cl.completed_at
           FROM chores c
           LEFT JOIN chore_logs cl
             ON cl.chore_id = c.id AND cl.log_date = ?
           WHERE c.active = 1
           ORDER BY c.sort_order ASC, c.id ASC""",
        (target_date,),
    )
    chores_done_rows = [c for c in chore_rows if c["log_completed"] == 1]
    daily_chores = [c for c in chore_rows if c["frequency"] == "daily"]
    chores_done = len(chores_done_rows)
    non_daily_done = sum(1 for c in chores_done_rows if c["frequency"] != "daily")
    chores_total = (len(daily_chores) + non_daily_done) if daily_chores else len(chore_rows)
    shopping_rem_row = record(db, "SELECT COUNT(*) AS cnt FROM shopping_items WHERE bought = 0")
    shopping_remaining = int(shopping_rem_row["cnt"]) if shopping_rem_row else 0

    # 7. Goals
    goals_summary = compute_goals_summary(db, ref_date=ref_date)

    # 8. Cycle
    cycle_summary = compute_cycle_snapshot(db, target_date)

    # 9. Overall daily completion percentage
    ratios: list[float] = []
    if habits_total > 0:
        ratios.append(habits_done / habits_total)
    if tasks_total > 0:
        ratios.append(tasks_done / tasks_total)
    ratios.append(min(1.0, water_total / max(1, water_goal)))
    ratios.append(min(1.0, len({s for s in slots_done if s != "snack"}) / 3.0))
    if chores_total > 0:
        ratios.append(min(1.0, chores_done / chores_total))
    overall_progress_pct = round(sum(ratios) * 100 / len(ratios)) if ratios else 0

    # 10. Completed Today Feed ("Что сделано за день")
    completed_feed: list[dict[str, Any]] = []
    for h in habit_rows:
        if h["log_completed"] == 1:
            completed_feed.append(
                {
                    "id": f"habit-{h['id']}",
                    "domain": "vitamin" if h["category"] == "vitamin" else "habit",
                    "title": h["title"],
                    "subtitle": PERIOD_LABELS.get(h["period_of_day"], ""),
                    "time": h["completed_at"] or "",
                }
            )
    if water_total > 0:
        latest_water_time = water_logs[0]["logged_at"] if water_logs else ""
        completed_feed.append(
            {
                "id": f"water-{target_date}",
                "domain": "water",
                "title": f"Вода: {water_total} из {water_goal} мл"
                if water_total < water_goal
                else f"Норма воды выполнена ({water_total} мл)",
                "subtitle": f"{water_pct}% дневной цели",
                "time": latest_water_time,
            }
        )
    for w in workout_rows:
        completed_feed.append(
            {
                "id": f"workout-{w['id']}",
                "domain": "workout",
                "title": workout_label(w["workout_type"], w["custom_label"]),
                "subtitle": f"{w['duration_min']} мин",
                "time": w["logged_at"] or "",
            }
        )
    for m in meal_rows:
        slot_ru = MEAL_SLOT_LABELS.get(m["meal_slot"], "Приём пищи")
        grams_part = f" · {m['grams']} г" if m["grams"] else ""
        completed_feed.append(
            {
                "id": f"meal-{m['id']}",
                "domain": "meal",
                "title": m["dish_name"],
                "subtitle": f"{slot_ru}{grams_part}",
                "time": m["eaten_at"] or "",
            }
        )
    for c in chores_done_rows:
        completed_feed.append(
            {
                "id": f"chore-{c['id']}",
                "domain": "chore",
                "title": c["title"],
                "subtitle": c["zone"],
                "time": c["completed_at"] or "",
            }
        )
    for t in tasks:
        if t["completed"]:
            completed_feed.append(
                {
                    "id": f"task-{t['id']}",
                    "domain": "task",
                    "title": t["title"],
                    "subtitle": TASK_TAG_LABELS.get(t["section_tag"], "Задача"),
                    "time": t["completed_at"] or t["time_slot"] or "",
                }
            )
    completed_feed.sort(key=lambda item: (item["time"] != "", item["time"]), reverse=True)

    # 11. Daily Reflection
    refl_row = record(db, "SELECT * FROM day_reflections WHERE log_date = ?", (target_date,))
    reflection = (
        refl_row
        if refl_row is not None
        else {
            "log_date": target_date,
            "summary_note": "",
            "energy_level": None,
            "mood": "",
            "updated_at": None,
        }
    )

    return {
        "date": target_date,
        "today": today_iso(),
        "greeting_period": _greeting_period(),
        "overall_progress_pct": overall_progress_pct,
        "summary": {
            "habits": {
                "done": habits_done,
                "total": habits_total,
                "vitamins_done": vitamins_done,
                "vitamins_total": vitamins_total,
                "next_pending": next_pending,
            },
            "water": {
                "total_ml": water_total,
                "goal_ml": water_goal,
                "percent": water_pct,
            },
            "workouts": {
                "count": len(workout_rows),
                "total_minutes": workouts_total_min,
                "latest": latest_workout,
            },
            "nutrition": {
                "meals_count": len(meal_rows),
                "slots_done": slots_done,
                "total_kcal": total_kcal,
                "total_grams": total_grams,
            },
            "tasks": {
                "done": tasks_done,
                "total": tasks_total,
            },
            "chores": {
                "done": chores_done,
                "total": chores_total,
                "shopping_remaining": shopping_remaining,
            },
            "goals": {
                "active_count": goals_summary["active_count"],
                "avg_progress_pct": goals_summary["avg_progress_pct"],
                "needs_attention_count": goals_summary["needs_attention_count"],
            },
            "cycle": cycle_summary,
        },
        "tasks": tasks,
        "completed_feed": completed_feed,
        "reflection": reflection,
    }


@router.put("/reflection")
def upsert_reflection(db: DB, body: ReflectionUpsert) -> dict[str, Any]:
    target_date = validate_date_str(body.date or body.log_date, default_today=True)
    updated_at = now_iso()
    with transaction(db):
        db.execute(
            """INSERT INTO day_reflections(log_date, summary_note, energy_level, mood, updated_at)
               VALUES(?,?,?,?,?)
               ON CONFLICT(log_date) DO UPDATE SET
                   summary_note = excluded.summary_note,
                   energy_level = excluded.energy_level,
                   mood = excluded.mood,
                   updated_at = excluded.updated_at""",
            (
                target_date,
                (body.summary_note or "").strip(),
                body.energy_level,
                (body.mood or "").strip(),
                updated_at,
            ),
        )
    saved = record(db, "SELECT * FROM day_reflections WHERE log_date = ?", (target_date,))
    assert saved is not None
    return saved
