"""Dual SQLite / PostgreSQL database layer, schema, migrations, and shared helpers."""

from __future__ import annotations

from collections.abc import Generator, Iterator
from contextlib import closing, contextmanager
from datetime import date, datetime, timedelta
import os
from pathlib import Path
import re
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

GOAL_CATEGORIES: tuple[str, ...] = (
    "Здоровье и спорт",
    "Семья и отношения",
    "Друзья и социум",
    "Развлечения и отдых",
    "Хобби и увлечения",
    "Деньги и благосостояние",
    "Работа и бизнес",
)

LEGACY_GOAL_CATEGORY_MAP: dict[str, str] = {
    "Здоровье и тело": "Здоровье и спорт",
    "Отношения": "Семья и отношения",
    "Финансы": "Деньги и благосостояние",
    "Карьера": "Работа и бизнес",
    "Карьера и проекты": "Работа и бизнес",
    "Личностный рост": "Хобби и увлечения",
    "Дом и уют": "Семья и отношения",
}

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

ID_PK_TABLES: frozenset[str] = frozenset(
    {
        "habits",
        "habit_logs",
        "water_logs",
        "workouts",
        "cycle_days",
        "menu_items",
        "meal_logs",
        "goals",
        "goal_milestones",
        "goal_checkins",
        "tasks",
        "chores",
        "chore_logs",
        "shopping_items",
        "gratitudes",
        "calendar_events",
        "wishes",
        "push_subscriptions",
        "push_deliveries",
    }
)

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
    category TEXT NOT NULL DEFAULT 'Хобби и увлечения',
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

CREATE TABLE IF NOT EXISTS wishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_year INTEGER NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Развлечения и отдых',
    note TEXT NOT NULL DEFAULT '',
    fulfilled INTEGER NOT NULL DEFAULT 0 CHECK(fulfilled IN (0,1)),
    fulfilled_at TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wishes_year ON wishes(target_year, sort_order);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    device_label TEXT NOT NULL DEFAULT 'iPhone',
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_success_at TEXT,
    last_error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_push_subs_active ON push_subscriptions(active);

CREATE TABLE IF NOT EXISTS notification_settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
    timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
    morning_enabled INTEGER NOT NULL DEFAULT 1 CHECK(morning_enabled IN (0,1)),
    morning_time TEXT NOT NULL DEFAULT '08:30',
    afternoon_enabled INTEGER NOT NULL DEFAULT 1 CHECK(afternoon_enabled IN (0,1)),
    afternoon_time TEXT NOT NULL DEFAULT '13:30',
    evening_enabled INTEGER NOT NULL DEFAULT 1 CHECK(evening_enabled IN (0,1)),
    evening_time TEXT NOT NULL DEFAULT '20:30',
    water_enabled INTEGER NOT NULL DEFAULT 1 CHECK(water_enabled IN (0,1)),
    water_interval_hours INTEGER NOT NULL DEFAULT 3 CHECK(water_interval_hours BETWEEN 1 AND 8),
    events_enabled INTEGER NOT NULL DEFAULT 1 CHECK(events_enabled IN (0,1)),
    events_lead_minutes INTEGER NOT NULL DEFAULT 60 CHECK(events_lead_minutes BETWEEN 5 AND 1440),
    cycle_enabled INTEGER NOT NULL DEFAULT 1 CHECK(cycle_enabled IN (0,1)),
    cycle_days_before INTEGER NOT NULL DEFAULT 2 CHECK(cycle_days_before BETWEEN 1 AND 7),
    goals_enabled INTEGER NOT NULL DEFAULT 1 CHECK(goals_enabled IN (0,1)),
    goals_weekday INTEGER NOT NULL DEFAULT 6 CHECK(goals_weekday BETWEEN 0 AND 6),
    goals_time TEXT NOT NULL DEFAULT '11:00',
    quiet_start TEXT NOT NULL DEFAULT '22:30',
    quiet_end TEXT NOT NULL DEFAULT '07:30',
    updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS push_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dedupe_key TEXT UNIQUE NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_deliveries_sent_at ON push_deliveries(sent_at);
"""

PG_SCHEMA = (
    SCHEMA.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY").replace(
        " REAL ", " DOUBLE PRECISION "
    )
)

PG_SEARCH_TEXT_FN = """
CREATE OR REPLACE FUNCTION search_text(val TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT replace(lower(coalesce(val, '')), 'ё', 'е')
$$
"""


# ---------------------------------------------------------------------------
# PostgreSQL Compatibility Layer
# ---------------------------------------------------------------------------

_INSERT_OR_IGNORE_RE = re.compile(r"^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+", re.IGNORECASE)
_INSERT_TABLE_RE = re.compile(r"^\s*INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)", re.IGNORECASE)


def get_database_url() -> str:
    return os.environ.get("DATABASE_URL", "").strip()


def is_postgres() -> bool:
    url = get_database_url()
    return url.startswith("postgres://") or url.startswith("postgresql://")


def _replace_qmarks_outside_quotes(sql: str) -> str:
    """Convert SQLite `?` placeholders outside single-quoted literals to psycopg `%s`."""
    out: list[str] = []
    in_single = False
    i = 0
    length = len(sql)
    while i < length:
        ch = sql[i]
        if ch == "'":
            out.append(ch)
            if in_single and i + 1 < length and sql[i + 1] == "'":
                # Escaped single quote '' inside literal
                out.append("'")
                i += 2
                continue
            in_single = not in_single
        elif ch == "%":
            out.append("%%")
        elif ch == "?" and not in_single:
            out.append("%s")
        else:
            out.append(ch)
        i += 1
    return "".join(out)


def translate_sql_for_postgres(sql: str) -> tuple[str, bool]:
    """Translate SQLite-style SQL to PostgreSQL SQL.

    Returns `(translated_sql, appends_returning_id)`.
    """
    translated = _replace_qmarks_outside_quotes(sql).strip()
    trailing_semi = translated.endswith(";")
    if trailing_semi:
        translated = translated[:-1].rstrip()

    if _INSERT_OR_IGNORE_RE.match(translated):
        translated = _INSERT_OR_IGNORE_RE.sub("INSERT INTO ", translated, count=1)
        if not re.search(r"\bON\s+CONFLICT\b", translated, re.IGNORECASE):
            translated = f"{translated} ON CONFLICT DO NOTHING"

    appends_returning = False
    insert_match = _INSERT_TABLE_RE.match(translated)
    if insert_match:
        table_name = insert_match.group(1).lower()
        if table_name in ID_PK_TABLES and not re.search(r"\bRETURNING\b", translated, re.IGNORECASE):
            translated = f"{translated} RETURNING id"
            appends_returning = True

    return translated, appends_returning


class PgRow(dict):
    """Dict row that also supports integer indexing `row[0]` like `sqlite3.Row`."""

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class PgCursorAdapter:
    """Lightweight cursor wrapper providing sqlite3-compatible `.lastrowid`, `.rowcount`, fetch & iter."""

    def __init__(
        self,
        rows: list[PgRow],
        rowcount: int,
        lastrowid: int | None = None,
    ) -> None:
        self._rows = rows
        self._index = 0
        self.rowcount = rowcount
        self.lastrowid = lastrowid

    def fetchone(self) -> PgRow | None:
        if self._index >= len(self._rows):
            return None
        row = self._rows[self._index]
        self._index += 1
        return row

    def fetchall(self) -> list[PgRow]:
        remaining = self._rows[self._index :]
        self._index = len(self._rows)
        return remaining

    def __iter__(self) -> Iterator[PgRow]:
        return iter(self.fetchall())


class PgConnectionAdapter:
    """Thin adapter around psycopg3 connection matching the sqlite3 interface used by app routes."""

    def __init__(self, conn: Any) -> None:
        self._conn = conn
        self._in_tx = False

    def execute(self, sql: str, params: tuple[Any, ...] | list[Any] = ()) -> PgCursorAdapter:
        pg_sql, appends_returning = translate_sql_for_postgres(sql)
        exec_params = tuple(params) if params else None
        with self._conn.cursor() as cur:
            cur.execute(pg_sql, exec_params)
            rowcount = cur.rowcount if cur.rowcount is not None else -1
            if appends_returning:
                row = cur.fetchone()
                last_id = int(row["id"]) if row is not None and "id" in row else None
                return PgCursorAdapter([], rowcount=rowcount, lastrowid=last_id)
            if cur.description is not None:
                raw_rows = cur.fetchall()
                rows = [PgRow(r) for r in raw_rows]
                return PgCursorAdapter(rows, rowcount=rowcount, lastrowid=None)
            return PgCursorAdapter([], rowcount=rowcount, lastrowid=None)

    def execute_raw(self, sql: str, params: tuple[Any, ...] | list[Any] | None = None) -> None:
        with self._conn.cursor() as cur:
            cur.execute(sql, params)

    def begin(self) -> None:
        if not self._in_tx:
            self.execute_raw("BEGIN")
            self._in_tx = True

    def commit(self) -> None:
        if self._in_tx:
            self.execute_raw("COMMIT")
            self._in_tx = False

    def rollback(self) -> None:
        if self._in_tx:
            try:
                self.execute_raw("ROLLBACK")
            finally:
                self._in_tx = False

    def close(self) -> None:
        if self._in_tx:
            try:
                self.rollback()
            except Exception:
                pass
        self._conn.close()


# ---------------------------------------------------------------------------
# Dates, Text & Connection Primitives
# ---------------------------------------------------------------------------


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
        raise HTTPException(status_code=422, detail="Не указана дата в формате ГГГГ-ММ-ДД")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Неверный формат даты «{value}», ожидается ГГГГ-ММ-ДД",
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


def connect(path: str | Path | None = None) -> sqlite3.Connection | PgConnectionAdapter:
    if path is None and is_postgres():
        import psycopg
        from psycopg.rows import dict_row

        url = get_database_url()
        raw_conn = psycopg.connect(url, row_factory=dict_row, autocommit=True)
        return PgConnectionAdapter(raw_conn)

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
def transaction(db: Any) -> Generator[None, None, None]:
    if isinstance(db, PgConnectionAdapter):
        db.begin()
    else:
        db.execute("BEGIN IMMEDIATE")
    try:
        yield
        db.commit()
    except BaseException:
        db.rollback()
        raise


def records(db: Any, sql: str, args: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    return [dict(row) for row in db.execute(sql, args)]


def record(db: Any, sql: str, args: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    row = db.execute(sql, args).fetchone()
    return dict(row) if row is not None else None


def _table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table_name})")}


def _init_postgres(conn: PgConnectionAdapter) -> None:
    conn.execute_raw(PG_SEARCH_TEXT_FN)
    for stmt in PG_SCHEMA.split(";"):
        cleaned = stmt.strip()
        if cleaned:
            conn.execute_raw(cleaned)

    # Safe incremental migrations for existing PostgreSQL databases
    conn.execute_raw(
        "ALTER TABLE goals ADD COLUMN IF NOT EXISTS horizon_unit TEXT NOT NULL DEFAULT 'year'"
    )
    conn.execute_raw(
        "ALTER TABLE goals ADD COLUMN IF NOT EXISTS parent_goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL"
    )
    conn.execute_raw("CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_goal_id)")
    for old_cat, new_cat in LEGACY_GOAL_CATEGORY_MAP.items():
        conn.execute_raw(
            "UPDATE goals SET category = %s WHERE category = %s",
            (new_cat, old_cat),
        )
    conn.execute_raw(
        "ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS list_type TEXT NOT NULL DEFAULT 'groceries'"
    )
    conn.execute_raw(
        "CREATE INDEX IF NOT EXISTS idx_shopping_list_type ON shopping_items(list_type)"
    )

    conn.execute_raw("INSERT INTO water_settings(id, daily_goal_ml) VALUES(1, 2000) ON CONFLICT(id) DO NOTHING")
    conn.execute_raw(
        "INSERT INTO cycle_settings(id, avg_cycle_length, avg_period_length) VALUES(1, 28, 5) ON CONFLICT(id) DO NOTHING"
    )
    conn.execute_raw(
        "INSERT INTO notification_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING"
    )


def init_db(db: Any = None) -> None:
    own = db is None
    conn = connect() if own else db
    try:
        if isinstance(conn, PgConnectionAdapter):
            _init_postgres(conn)
            return

        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)

        # Safe incremental migrations for existing SQLite databases
        goal_cols = _table_columns(conn, "goals")
        if "horizon_unit" not in goal_cols:
            conn.execute("ALTER TABLE goals ADD COLUMN horizon_unit TEXT NOT NULL DEFAULT 'year'")
        if "parent_goal_id" not in goal_cols:
            conn.execute("ALTER TABLE goals ADD COLUMN parent_goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_goal_id)")
        for old_cat, new_cat in LEGACY_GOAL_CATEGORY_MAP.items():
            conn.execute(
                "UPDATE goals SET category = ? WHERE category = ?",
                (new_cat, old_cat),
            )

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
        conn.execute(
            "INSERT OR IGNORE INTO notification_settings(id) VALUES(1)"
        )
        conn.commit()
    finally:
        if own:
            conn.close()


def get_db() -> Generator[Any, None, None]:
    with closing(connect()) as db:
        yield db


DB = Annotated[Any, Depends(get_db)]


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


def compute_cycle_snapshot(db: Any, ref_date_str: str) -> dict[str, Any]:
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

    valid_cycle_lens = [e["cycle_length"] for e in episodes if e["cycle_length"] is not None]
    computed_cycle = round(sum(valid_cycle_lens[-12:]) / len(valid_cycle_lens[-12:])) if valid_cycle_lens else default_cycle
    valid_period_lens = [e["period_length"] for e in episodes if 2 <= e["period_length"] <= 10]
    computed_period = round(sum(valid_period_lens[-12:]) / len(valid_period_lens[-12:])) if valid_period_lens else default_period

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
