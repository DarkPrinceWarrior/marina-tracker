"""SQLite database schema, connection, transaction, and shared domain helpers."""

from __future__ import annotations

from collections.abc import Generator
from contextlib import closing, contextmanager
from datetime import date, datetime, timedelta
import os
from pathlib import Path
import sqlite3
from typing import Annotated, Any
import unicodedata
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException

ROOT = Path(__file__).resolve().parent.parent
MOSCOW = ZoneInfo("Europe/Moscow")

WORKOUT_LABELS: dict[str, str] = {
    "breathing": "Дыхательная практика",
    "pilates": "Пилатес",
    "qigong": "Цигун",
    "other": "Тренировка",
}

CYCLE_PHASE_LABELS: dict[str, str] = {
    "menstruation": "Менструация",
    "follicular": "Фолликулярная фаза",
    "ovulation": "Овуляция",
    "luteal": "Лютеиновая фаза",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    period_of_day TEXT NOT NULL CHECK(period_of_day IN ('morning','afternoon','evening')),
    category TEXT NOT NULL DEFAULT 'habit' CHECK(category IN ('habit','vitamin')),
    dose_or_note TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'sparkles',
    color TEXT NOT NULL DEFAULT 'sage',
    target_days_per_week INTEGER NOT NULL DEFAULT 7 CHECK(target_days_per_week BETWEEN 1 AND 7),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    log_date TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 1 CHECK(completed IN (0,1)),
    completed_at TEXT,
    note TEXT NOT NULL DEFAULT '',
    UNIQUE(habit_id, log_date)
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habit_id, log_date);

CREATE TABLE IF NOT EXISTS water_settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    daily_goal_ml INTEGER NOT NULL DEFAULT 2000 CHECK(daily_goal_ml BETWEEN 200 AND 10000)
);

CREATE TABLE IF NOT EXISTS water_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL,
    amount_ml INTEGER NOT NULL CHECK(amount_ml > 0 AND amount_ml <= 5000),
    logged_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_water_logs_date ON water_logs(log_date);

CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL,
    workout_type TEXT NOT NULL CHECK(workout_type IN ('breathing','pilates','qigong','other')),
    custom_label TEXT NOT NULL DEFAULT '',
    duration_min INTEGER NOT NULL DEFAULT 20 CHECK(duration_min > 0 AND duration_min <= 600),
    intensity TEXT NOT NULL DEFAULT 'medium' CHECK(intensity IN ('light','medium','intense')),
    mood TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 1 CHECK(completed IN (0,1)),
    logged_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(log_date);

CREATE TABLE IF NOT EXISTS cycle_settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    avg_cycle_length INTEGER NOT NULL DEFAULT 28 CHECK(avg_cycle_length BETWEEN 18 AND 45),
    avg_period_length INTEGER NOT NULL DEFAULT 5 CHECK(avg_period_length BETWEEN 2 AND 12)
);

CREATE TABLE IF NOT EXISTS cycle_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL UNIQUE,
    is_period INTEGER NOT NULL DEFAULT 0 CHECK(is_period IN (0,1)),
    flow TEXT NOT NULL DEFAULT 'none' CHECK(flow IN ('none','light','medium','heavy')),
    symptoms_json TEXT NOT NULL DEFAULT '[]',
    mood TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cycle_days_period ON cycle_days(is_period, log_date);

CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    meal_slot TEXT NOT NULL DEFAULT 'any' CHECK(meal_slot IN ('breakfast','lunch','dinner','snack','any')),
    default_portion TEXT NOT NULL DEFAULT '1 порция',
    default_grams INTEGER NOT NULL DEFAULT 200 CHECK(default_grams >= 0),
    kcal INTEGER NOT NULL DEFAULT 0 CHECK(kcal >= 0),
    protein_g REAL NOT NULL DEFAULT 0 CHECK(protein_g >= 0),
    fat_g REAL NOT NULL DEFAULT 0 CHECK(fat_g >= 0),
    carbs_g REAL NOT NULL DEFAULT 0 CHECK(carbs_g >= 0),
    category TEXT NOT NULL DEFAULT 'Домашнее',
    is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0,1))
);

CREATE TABLE IF NOT EXISTS meal_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL,
    meal_slot TEXT NOT NULL CHECK(meal_slot IN ('breakfast','lunch','dinner','snack')),
    menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
    dish_name TEXT NOT NULL,
    amount_value REAL NOT NULL DEFAULT 1 CHECK(amount_value > 0),
    amount_unit TEXT NOT NULL DEFAULT 'порц.',
    grams INTEGER NOT NULL DEFAULT 0 CHECK(grams >= 0),
    eaten_at TEXT NOT NULL DEFAULT '',
    kcal INTEGER NOT NULL DEFAULT 0 CHECK(kcal >= 0),
    note TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 1 CHECK(completed IN (0,1)),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meal_logs_date ON meal_logs(log_date, meal_slot);

CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Личностный рост',
    horizon_unit TEXT NOT NULL DEFAULT 'year' CHECK(horizon_unit IN ('month','year')),
    horizon_years INTEGER NOT NULL DEFAULT 1 CHECK(horizon_years BETWEEN 1 AND 10),
    parent_goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
    start_date TEXT NOT NULL,
    target_date TEXT NOT NULL,
    progress_pct INTEGER NOT NULL DEFAULT 0 CHECK(progress_pct BETWEEN 0 AND 100),
    linked_habit_id INTEGER REFERENCES habits(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','paused')),
    check_in_cadence TEXT NOT NULL DEFAULT 'weekly' CHECK(check_in_cadence IN ('weekly','biweekly','monthly')),
    last_checkin_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goal_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    target_year INTEGER NOT NULL,
    target_quarter TEXT NOT NULL DEFAULT 'Q4',
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
    completed_at TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal ON goal_milestones(goal_id, sort_order);

CREATE TABLE IF NOT EXISTS goal_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    checkin_date TEXT NOT NULL,
    progress_pct INTEGER NOT NULL CHECK(progress_pct BETWEEN 0 AND 100),
    note TEXT NOT NULL DEFAULT '',
    feeling TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goal_checkins_goal ON goal_checkins(goal_id, checkin_date);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_date TEXT NOT NULL,
    title TEXT NOT NULL,
    time_slot TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
    section_tag TEXT NOT NULL DEFAULT 'personal' CHECK(section_tag IN ('personal','work','health','home','goal')),
    goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
    completed_at TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(task_date, sort_order);

CREATE TABLE IF NOT EXISTS chores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    zone TEXT NOT NULL DEFAULT 'Комнаты',
    frequency TEXT NOT NULL DEFAULT 'weekly' CHECK(frequency IN ('daily','weekly','monthly','once')),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chore_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chore_id INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    log_date TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 1 CHECK(completed IN (0,1)),
    completed_at TEXT,
    UNIQUE(chore_id, log_date)
);
CREATE INDEX IF NOT EXISTS idx_chore_logs_date ON chore_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_chore_logs_chore ON chore_logs(chore_id, log_date);

CREATE TABLE IF NOT EXISTS shopping_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Прочее',
    quantity TEXT NOT NULL DEFAULT '1 шт',
    list_type TEXT NOT NULL DEFAULT 'groceries' CHECK(list_type IN ('groceries','household')),
    bought INTEGER NOT NULL DEFAULT 0 CHECK(bought IN (0,1)),
    bought_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS day_reflections (
    log_date TEXT PRIMARY KEY,
    summary_note TEXT NOT NULL DEFAULT '',
    energy_level INTEGER CHECK(energy_level IS NULL OR energy_level BETWEEN 1 AND 5),
    mood TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gratitudes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'day' CHECK(category IN ('self','people','day','body','other')),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gratitudes_date ON gratitudes(log_date);

CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_date TEXT NOT NULL,
    event_time TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'event' CHECK(category IN ('doctor','beauty','meeting','event','personal','home')),
    location TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
    completed_at TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date);
"""


def now_dt() -> datetime:
    return datetime.now(MOSCOW)


def now_iso() -> str:
    return now_dt().isoformat(timespec="seconds")


def today_iso() -> str:
    return now_dt().date().isoformat()


def now_hhmm() -> str:
    return now_dt().strftime("%H:%M")


def parse_iso_date(value: str | None, *, default_today: bool = False) -> date:
    if not value:
        if default_today:
            return now_dt().date()
        raise HTTPException(status_code=422, detail="Не указана дата в формате YYYY-MM-DD")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Неверный формат даты '{value}', ожидается YYYY-MM-DD",
        ) from exc


def validate_date_str(value: str | None, *, default_today: bool = False) -> str:
    return parse_iso_date(value, default_today=default_today).isoformat()


def search_text(value: Any) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).casefold().replace("ё", "е")


def get_db_path(path: str | Path | None = None) -> Path:
    if path is not None:
        return Path(path)
    env_path = os.environ.get("MARINA_DB_PATH")
    if env_path:
        return Path(env_path)
    return ROOT / "data" / "marina_tracker.sqlite3"


def connect(path: str | Path | None = None) -> sqlite3.Connection:
    file = get_db_path(path)
    file.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(file, timeout=12, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.create_function("search_text", 1, search_text, deterministic=True)
    db.execute("PRAGMA busy_timeout = 10000")
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA synchronous = NORMAL")
    return db


@contextmanager
def transaction(db: sqlite3.Connection) -> Generator[None, None, None]:
    db.execute("BEGIN IMMEDIATE")
    try:
        yield
        db.commit()
    except BaseException:
        db.rollback()
        raise


def records(db: sqlite3.Connection, sql: str, args: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    return [dict(row) for row in db.execute(sql, args)]


def record(db: sqlite3.Connection, sql: str, args: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    row = db.execute(sql, args).fetchone()
    return dict(row) if row is not None else None


HOUSEHOLD_MIGRATION_CATEGORIES: tuple[str, ...] = (
    "Для уборки и дома",
    "Для дома и быта",
    "Моющие и уборка",
    "Бытовая техника",
    "Мебель и интерьер",
    "Текстиль и уют",
    "Хозтовары",
    "Ремонт и мелочи",
)


def _table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table_name})")}


def init_db(db: sqlite3.Connection | None = None) -> None:
    own = db is None
    conn = connect() if own else db
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)

        # Safe incremental migrations for existing SQLite databases
        goal_cols = _table_columns(conn, "goals")
        if "horizon_unit" not in goal_cols:
            conn.execute("ALTER TABLE goals ADD COLUMN horizon_unit TEXT NOT NULL DEFAULT 'year'")
        if "parent_goal_id" not in goal_cols:
            conn.execute("ALTER TABLE goals ADD COLUMN parent_goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_goal_id)")

        shopping_cols = _table_columns(conn, "shopping_items")
        if "list_type" not in shopping_cols:
            conn.execute("ALTER TABLE shopping_items ADD COLUMN list_type TEXT NOT NULL DEFAULT 'groceries'")
            placeholders = ",".join("?" for _ in HOUSEHOLD_MIGRATION_CATEGORIES)
            conn.execute(
                f"UPDATE shopping_items SET list_type = 'household' WHERE category IN ({placeholders})",
                HOUSEHOLD_MIGRATION_CATEGORIES,
            )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_shopping_list_type ON shopping_items(list_type)")

        conn.execute(
            "INSERT OR IGNORE INTO water_settings(id, daily_goal_ml) VALUES(1, 2000)"
        )
        conn.execute(
            "INSERT OR IGNORE INTO cycle_settings(id, avg_cycle_length, avg_period_length) VALUES(1, 28, 5)"
        )
        conn.commit()
    finally:
        if own:
            conn.close()


def get_db() -> Generator[sqlite3.Connection, None, None]:
    with closing(connect()) as db:
        yield db


DB = Annotated[sqlite3.Connection, Depends(get_db)]


def workout_label(workout_type: str, custom_label: str = "") -> str:
    if workout_type == "other" and custom_label.strip():
        return custom_label.strip()
    return WORKOUT_LABELS.get(workout_type, "Тренировка")


def extract_period_episodes(period_dates: list[str], gap_days: int = 2) -> list[dict[str, Any]]:
    """Group sorted period YYYY-MM-DD dates into contiguous cycle episodes."""
    if not period_dates:
        return []
    parsed = sorted({date.fromisoformat(d) for d in period_dates})
    episodes: list[list[date]] = [[parsed[0]]]
    for current in parsed[1:]:
        if (current - episodes[-1][-1]).days <= gap_days:
            episodes[-1].append(current)
        else:
            episodes.append([current])

    result: list[dict[str, Any]] = []
    for idx, days in enumerate(episodes):
        start = days[0]
        end = days[-1]
        period_length = (end - start).days + 1
        cycle_length: int | None = None
        if idx + 1 < len(episodes):
            diff = (episodes[idx + 1][0] - start).days
            if 15 <= diff <= 60:
                cycle_length = diff
        result.append(
            {
                "cycle_number": idx + 1,
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "period_length": period_length,
                "cycle_length": cycle_length,
                "dates": [d.isoformat() for d in days],
            }
        )
    return result


def compute_cycle_snapshot(db: sqlite3.Connection, ref_date_str: str) -> dict[str, Any]:
    """Compute cycle day, phase, and next predicted period relative to ref_date_str."""
    ref_date = date.fromisoformat(ref_date_str)
    settings = record(db, "SELECT avg_cycle_length, avg_period_length FROM cycle_settings WHERE id = 1") or {
        "avg_cycle_length": 28,
        "avg_period_length": 5,
    }
    default_cycle = int(settings["avg_cycle_length"])
    default_period = int(settings["avg_period_length"])

    rows = records(
        db,
        "SELECT log_date FROM cycle_days WHERE is_period = 1 ORDER BY log_date ASC",
    )
    period_dates = [r["log_date"] for r in rows]
    episodes = extract_period_episodes(period_dates)

    # Compute empirical averages from last 12 cycles if available
    valid_cycle_lens = [e["cycle_length"] for e in episodes if e["cycle_length"] is not None]
    computed_cycle = round(sum(valid_cycle_lens[-12:]) / len(valid_cycle_lens[-12:])) if valid_cycle_lens else default_cycle
    valid_period_lens = [e["period_length"] for e in episodes if 2 <= e["period_length"] <= 10]
    computed_period = round(sum(valid_period_lens[-12:]) / len(valid_period_lens[-12:])) if valid_period_lens else default_period

    # Find latest episode starting on or before ref_date
    past_episodes = [e for e in episodes if e["start_date"] <= ref_date_str]
    is_period_today = ref_date_str in set(period_dates)

    if not past_episodes:
        return {
            "cycle_day": None,
            "phase": "follicular",
            "phase_label": "Нет отметок цикла",
            "is_period_today": is_period_today,
            "last_period_start": None,
            "next_period_date": None,
            "days_until_period": None,
            "avg_cycle_length": computed_cycle,
            "avg_period_length": computed_period,
        }

    latest = past_episodes[-1]
    last_start = date.fromisoformat(latest["start_date"])
    cycle_day = (ref_date - last_start).days + 1
    next_start = last_start + timedelta(days=computed_cycle)
    while next_start < ref_date:
        next_start += timedelta(days=computed_cycle)
    days_until = (next_start - ref_date).days

    ovulation_day = max(computed_period + 3, computed_cycle - 14)
    if is_period_today or cycle_day <= computed_period:
        phase = "menstruation"
    elif cycle_day <= ovulation_day - 2:
        phase = "follicular"
    elif cycle_day <= ovulation_day + 1:
        phase = "ovulation"
    else:
        phase = "luteal"

    return {
        "cycle_day": cycle_day,
        "phase": phase,
        "phase_label": CYCLE_PHASE_LABELS[phase],
        "is_period_today": is_period_today,
        "last_period_start": latest["start_date"],
        "next_period_date": next_start.isoformat(),
        "days_until_period": days_until,
        "avg_cycle_length": computed_cycle,
        "avg_period_length": computed_period,
    }
