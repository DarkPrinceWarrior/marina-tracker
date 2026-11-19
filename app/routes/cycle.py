"""Female cycle tracker (12+ months history & predictions) endpoints."""

from __future__ import annotations

import calendar
from collections import Counter
from datetime import date, timedelta
import json
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Path, Query
from pydantic import BaseModel, Field, field_validator

from ..db import (
    DB,
    compute_cycle_snapshot,
    extract_period_episodes,
    now_dt,
    now_iso,
    record,
    records,
    today_iso,
    transaction,
    validate_date_str,
)

router = APIRouter(prefix="/api/cycle", tags=["cycle"])

FlowLevel = Literal["none", "light", "medium", "heavy"]


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class CycleDayUpsert(BaseModel):
    is_period: bool = False
    flow: FlowLevel = "none"
    symptoms: list[str] = Field(default_factory=list, max_length=25)
    mood: str = Field(default="", max_length=60)
    note: str = Field(default="", max_length=1000)

    @field_validator("flow", mode="before")
    @classmethod
    def _coerce_flow(cls, v: Any) -> Any:
        return "none" if v is None or v == "" else v

    @field_validator("symptoms", mode="before")
    @classmethod
    def _coerce_symptoms(cls, v: Any) -> Any:
        return [] if v is None else v

    @field_validator("mood", "note", mode="before")
    @classmethod
    def _coerce_str(cls, v: Any) -> Any:
        return "" if v is None else v


class CycleSettingsUpdate(BaseModel):
    avg_cycle_length: int = Field(ge=18, le=45)
    avg_period_length: int = Field(ge=2, le=12)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_symptoms(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item).strip() for item in parsed if str(item).strip()]


def _format_cycle_day(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "log_date": row["log_date"],
        "is_period": bool(row["is_period"]),
        "flow": row["flow"],
        "symptoms": _parse_symptoms(row.get("symptoms_json")),
        "mood": row["mood"],
        "note": row["note"],
        "updated_at": row["updated_at"],
    }


def _collect_dominant_symptoms(
    episode_dates: list[str],
    days_by_date: dict[str, dict[str, Any]],
) -> list[str]:
    counter: Counter[str] = Counter()
    first_seen: dict[str, int] = {}
    order_idx = 0
    for d_str in episode_dates:
        entry = days_by_date.get(d_str)
        if not entry:
            continue
        for sym in entry["symptoms"]:
            counter[sym] += 1
            if sym not in first_seen:
                first_seen[sym] = order_idx
                order_idx += 1
    ranked = sorted(counter.keys(), key=lambda s: (-counter[s], first_seen[s]))
    return ranked[:4]


def _collect_episode_notes(
    episode_dates: list[str],
    days_by_date: dict[str, dict[str, Any]],
) -> str:
    notes: list[str] = []
    seen: set[str] = set()
    for d_str in episode_dates:
        entry = days_by_date.get(d_str)
        if not entry:
            continue
        note = entry["note"].strip()
        if note and note not in seen:
            seen.add(note)
            notes.append(note)
    return " · ".join(notes)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/overview")
def get_cycle_overview(
    db: DB,
    year: Annotated[int | None, Query(ge=2020, le=2040)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
) -> dict[str, Any]:
    today_date = now_dt().date()
    today_str = today_iso()
    target_year = year if year is not None else today_date.year
    target_month = month if month is not None else today_date.month

    settings_row = record(
        db,
        "SELECT avg_cycle_length, avg_period_length FROM cycle_settings WHERE id = 1",
    ) or {"avg_cycle_length": 28, "avg_period_length": 5}
    settings = {
        "avg_cycle_length": int(settings_row["avg_cycle_length"]),
        "avg_period_length": int(settings_row["avg_period_length"]),
    }

    all_rows = records(db, "SELECT * FROM cycle_days ORDER BY log_date ASC")
    all_days = [_format_cycle_day(r) for r in all_rows]
    days_by_date = {d["log_date"]: d for d in all_days}

    period_dates = [d["log_date"] for d in all_days if d["is_period"]]
    period_set = set(period_dates)
    episodes = extract_period_episodes(period_dates)

    snapshot = compute_cycle_snapshot(db, today_str)
    computed_cycle = int(snapshot["avg_cycle_length"])
    computed_period = int(snapshot["avg_period_length"])

    last_period_start: str | None = snapshot["last_period_start"]
    next_period_start: str | None = snapshot["next_period_date"]
    next_period_end: str | None = None
    ovulation_date_str: str | None = None
    fertile_start_str: str | None = None
    fertile_end_str: str | None = None

    predicted_period_set: set[str] = set()
    predicted_fertile_set: set[str] = set()
    predicted_ovulation_set: set[str] = set()

    last_dom = calendar.monthrange(target_year, target_month)[1]
    requested_month_start = date(target_year, target_month, 1)
    requested_month_end = date(target_year, target_month, last_dom)

    if next_period_start is not None and last_period_start is not None:
        next_start_d = date.fromisoformat(next_period_start)
        next_period_end = (next_start_d + timedelta(days=computed_period - 1)).isoformat()

        # Luteal length (14d standard, safely clamped for extreme cycle/period settings)
        luteal_days = min(14, max(8, computed_cycle - computed_period - 2))

        # Current active cycle ovulation & fertile window
        active_ovul_d = next_start_d - timedelta(days=luteal_days)
        ovulation_date_str = active_ovul_d.isoformat()
        fertile_start_str = (active_ovul_d - timedelta(days=4)).isoformat()
        fertile_end_str = (active_ovul_d + timedelta(days=1)).isoformat()

        # Project predictions through at least next 3 cycles and beyond requested month
        horizon_end = max(
            today_date + timedelta(days=computed_cycle * 3 + 14),
            requested_month_end + timedelta(days=computed_cycle + 7),
        )

        # Include current cycle's fertile window & ovulation
        predicted_ovulation_set.add(active_ovul_d.isoformat())
        for delta in range(-4, 2):
            predicted_fertile_set.add((active_ovul_d + timedelta(days=delta)).isoformat())

        # Project upcoming cycles starting at next_start_d
        cursor_start = next_start_d
        guard = 0
        while cursor_start <= horizon_end and guard < 36:
            for i in range(computed_period):
                p_day = (cursor_start + timedelta(days=i)).isoformat()
                if p_day not in period_set:
                    predicted_period_set.add(p_day)

            next_cycle_start = cursor_start + timedelta(days=computed_cycle)
            ovul_d = next_cycle_start - timedelta(days=luteal_days)
            predicted_ovulation_set.add(ovul_d.isoformat())
            for delta in range(-4, 2):
                predicted_fertile_set.add((ovul_d + timedelta(days=delta)).isoformat())

            cursor_start = next_cycle_start
            guard += 1

    # Requested month logged entries
    month_prefix = f"{target_year:04d}-{target_month:02d}-"
    month_days = [d for d in all_days if d["log_date"].startswith(month_prefix)]

    # 12–18 months history (newest first)
    history_cutoff = (today_date - timedelta(days=550)).isoformat()
    history_12m: list[dict[str, Any]] = []
    for ep in reversed(episodes):
        if ep["end_date"] < history_cutoff:
            continue
        ep_dates = ep["dates"]
        history_12m.append(
            {
                "cycle_number": ep["cycle_number"],
                "start_date": ep["start_date"],
                "end_date": ep["end_date"],
                "period_length": ep["period_length"],
                "cycle_length": ep["cycle_length"],
                "dominant_symptoms": _collect_dominant_symptoms(ep_dates, days_by_date),
                "notes": _collect_episode_notes(ep_dates, days_by_date),
            }
        )

    # Raw day map for last 400 days (+ full 6-week grid of requested month if older than 400 days)
    map_cutoff = (today_date - timedelta(days=400)).isoformat()
    grid_start = (requested_month_start - timedelta(days=7)).isoformat()
    grid_end = (requested_month_end + timedelta(days=14)).isoformat()
    days_map_400d = {
        d["log_date"]: d
        for d in all_days
        if d["log_date"] >= map_cutoff or (grid_start <= d["log_date"] <= grid_end)
    }

    return {
        "year": target_year,
        "month": target_month,
        "today": today_str,
        "settings": settings,
        "stats": {
            "computed_avg_cycle_length": computed_cycle,
            "computed_avg_period_length": computed_period,
            "tracked_cycles_count": len(episodes),
            "current_cycle_day": snapshot["cycle_day"],
            "current_phase": snapshot["phase"],
            "current_phase_label": snapshot["phase_label"],
            "last_period_start": last_period_start,
            "next_period_start": next_period_start,
            "next_period_end": next_period_end,
            "days_until_period": snapshot["days_until_period"],
            "ovulation_date": ovulation_date_str,
            "fertile_window_start": fertile_start_str,
            "fertile_window_end": fertile_end_str,
        },
        "month_days": month_days,
        "predicted_period_dates": sorted(predicted_period_set),
        "predicted_fertile_dates": sorted(predicted_fertile_set),
        "predicted_ovulation_dates": sorted(predicted_ovulation_set),
        "history_12m": history_12m,
        "days_map_400d": days_map_400d,
    }


@router.put("/day/{log_date}")
def upsert_cycle_day(
    db: DB,
    log_date: Annotated[str, Path()],
    body: CycleDayUpsert,
) -> dict[str, Any]:
    target_date = validate_date_str(log_date)
    updated_at = now_iso()

    if body.is_period:
        flow = (
            body.flow
            if "flow" in body.model_fields_set
            else "medium"
        )
    else:
        flow = "none"

    cleaned_symptoms: list[str] = []
    seen: set[str] = set()
    for sym in body.symptoms:
        s = sym.strip()
        if s and s not in seen:
            seen.add(s)
            cleaned_symptoms.append(s)
    symptoms_json = json.dumps(cleaned_symptoms, ensure_ascii=False)

    with transaction(db):
        db.execute(
            """INSERT INTO cycle_days(log_date, is_period, flow, symptoms_json, mood, note, updated_at)
               VALUES(?,?,?,?,?,?,?)
               ON CONFLICT(log_date) DO UPDATE SET
                   is_period = excluded.is_period,
                   flow = excluded.flow,
                   symptoms_json = excluded.symptoms_json,
                   mood = excluded.mood,
                   note = excluded.note,
                   updated_at = excluded.updated_at""",
            (
                target_date,
                1 if body.is_period else 0,
                flow,
                symptoms_json,
                body.mood.strip(),
                body.note.strip(),
                updated_at,
            ),
        )

    saved = record(db, "SELECT * FROM cycle_days WHERE log_date = ?", (target_date,))
    assert saved is not None
    return _format_cycle_day(saved)


@router.delete("/day/{log_date}")
def delete_cycle_day(
    db: DB,
    log_date: Annotated[str, Path()],
) -> dict[str, Any]:
    target_date = validate_date_str(log_date)
    with transaction(db):
        cur = db.execute("DELETE FROM cycle_days WHERE log_date = ?", (target_date,))
    return {"deleted": cur.rowcount > 0, "log_date": target_date}


@router.put("/settings")
def update_cycle_settings(db: DB, body: CycleSettingsUpdate) -> dict[str, Any]:
    with transaction(db):
        db.execute(
            """INSERT INTO cycle_settings(id, avg_cycle_length, avg_period_length)
               VALUES(1, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                   avg_cycle_length = excluded.avg_cycle_length,
                   avg_period_length = excluded.avg_period_length""",
            (body.avg_cycle_length, body.avg_period_length),
        )
    return {
        "avg_cycle_length": body.avg_cycle_length,
        "avg_period_length": body.avg_period_length,
    }
