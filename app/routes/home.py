"""Home chores and shopping list endpoints."""

from __future__ import annotations

from datetime import date, timedelta
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
)

router = APIRouter(prefix="/api/home", tags=["home"])

ChoreFrequency = Literal["daily", "weekly", "monthly", "once"]
ShoppingListType = Literal["groceries", "household"]


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


class ChoreCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    zone: str = Field(default="Комнаты", max_length=60)
    frequency: ChoreFrequency = "weekly"
    sort_order: int | None = None

    @field_validator("zone", mode="before")
    @classmethod
    def _coerce_zone(cls, v: Any) -> Any:
        return "Комнаты" if v is None else v

    @field_validator("frequency", mode="before")
    @classmethod
    def _coerce_freq(cls, v: Any) -> Any:
        return "weekly" if v is None or v == "" else v


class ChoreUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    zone: str | None = Field(default=None, max_length=60)
    frequency: ChoreFrequency | None = None
    active: bool | None = None
    sort_order: int | None = None


class ChoreToggle(BaseModel):
    date: str | None = None
    log_date: str | None = None
    completed: bool | None = None


class ShoppingItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(default="Прочее", max_length=80)
    quantity: str = Field(default="1 шт", max_length=60)
    list_type: ShoppingListType = "groceries"

    @field_validator("category", mode="before")
    @classmethod
    def _coerce_cat(cls, v: Any) -> Any:
        return "Прочее" if v is None else v

    @field_validator("quantity", mode="before")
    @classmethod
    def _coerce_qty(cls, v: Any) -> Any:
        return "1 шт" if v is None else v

    @field_validator("list_type", mode="before")
    @classmethod
    def _coerce_list_type(cls, v: Any) -> Any:
        return "groceries" if v is None or v == "" else v


class ShoppingItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=80)
    quantity: str | None = Field(default=None, max_length=60)
    list_type: ShoppingListType | None = None
    bought: bool | None = None


class ShoppingClearBought(BaseModel):
    list_type: ShoppingListType | None = None


# ---------------------------------------------------------------------------
# Chores Helpers & Endpoints
# ---------------------------------------------------------------------------


def _format_chore(
    chore: dict[str, Any],
    day_log: dict[str, Any] | None,
    last_log: dict[str, Any] | None,
) -> dict[str, Any]:
    completed_today = bool(day_log and day_log["completed"] == 1)
    return {
        "id": int(chore["id"]),
        "title": chore["title"],
        "zone": chore["zone"],
        "frequency": chore["frequency"],
        "active": bool(chore["active"]),
        "sort_order": int(chore["sort_order"]),
        "completed": completed_today,
        "completed_at": day_log["completed_at"] if (completed_today and day_log) else None,
        "last_completed_date": last_log["log_date"] if last_log else None,
        "last_completed_at": last_log["completed_at"] if last_log else None,
    }


def _fetch_single_chore(
    db: sqlite3.Connection,
    chore_id: int,
    target_date: str,
) -> dict[str, Any]:
    chore = record(db, "SELECT * FROM chores WHERE id = ?", (chore_id,))
    if chore is None:
        raise HTTPException(status_code=404, detail="Домашнее дело не найдено")
    day_log = record(
        db,
        "SELECT * FROM chore_logs WHERE chore_id = ? AND log_date = ?",
        (chore_id, target_date),
    )
    last_log = record(
        db,
        """SELECT log_date, completed_at
           FROM chore_logs
           WHERE chore_id = ? AND completed = 1 AND log_date <= ?
           ORDER BY log_date DESC, id DESC
           LIMIT 1""",
        (chore_id, target_date),
    )
    return _format_chore(chore, day_log, last_log)


@router.get("/chores")
def list_chores(
    db: DB,
    date_str: Annotated[str | None, Query(alias="date")] = None,
) -> dict[str, Any]:
    target_date = validate_date_str(date_str, default_today=True)
    ref_date = date.fromisoformat(target_date)
    week_start = (ref_date - timedelta(days=6)).isoformat()

    chore_rows = records(
        db,
        "SELECT * FROM chores WHERE active = 1 ORDER BY sort_order ASC, id ASC",
    )
    day_logs = records(
        db,
        "SELECT * FROM chore_logs WHERE log_date = ?",
        (target_date,),
    )
    day_log_map = {int(r["chore_id"]): r for r in day_logs}

    # Latest completed log up to target_date per chore
    last_rows = records(
        db,
        """SELECT cl.chore_id, cl.log_date, cl.completed_at
           FROM chore_logs cl
           WHERE cl.completed = 1 AND cl.log_date <= ?
           ORDER BY cl.log_date DESC, cl.id DESC""",
        (target_date,),
    )
    last_log_map: dict[int, dict[str, Any]] = {}
    for row in last_rows:
        c_id = int(row["chore_id"])
        if c_id not in last_log_map:
            last_log_map[c_id] = row

    items: list[dict[str, Any]] = []
    by_zone: dict[str, list[dict[str, Any]]] = {}
    for chore in chore_rows:
        c_id = int(chore["id"])
        item = _format_chore(chore, day_log_map.get(c_id), last_log_map.get(c_id))
        items.append(item)
        by_zone.setdefault(item["zone"], []).append(item)

    done_today = sum(1 for item in items if item["completed"])
    daily_items = [item for item in items if item["frequency"] == "daily"]
    weekly_items = [item for item in items if item["frequency"] == "weekly"]
    daily_done = sum(1 for item in daily_items if item["completed"])
    weekly_done = sum(
        1
        for item in weekly_items
        if item["last_completed_date"] is not None and item["last_completed_date"] >= week_start
    )

    return {
        "date": target_date,
        "items": items,
        "by_zone": by_zone,
        "summary": {
            "done_today": done_today,
            "total_active": len(items),
            "daily_done": daily_done,
            "daily_total": len(daily_items),
            "weekly_done": weekly_done,
            "weekly_total": len(weekly_items),
        },
    }


@router.post("/chores", status_code=status.HTTP_201_CREATED)
def create_chore(db: DB, body: ChoreCreate) -> dict[str, Any]:
    title = _require_non_empty(body.title, "title")
    created_at = now_iso()

    with transaction(db):
        sort_order = body.sort_order
        if sort_order is None:
            max_row = record(db, "SELECT COALESCE(MAX(sort_order), 0) AS m FROM chores")
            sort_order = int(max_row["m"]) + 1 if max_row else 1
        cur = db.execute(
            """INSERT INTO chores(title, zone, frequency, active, sort_order, created_at)
               VALUES(?,?,?,1,?,?)""",
            (
                title,
                body.zone.strip() or "Комнаты",
                body.frequency,
                sort_order,
                created_at,
            ),
        )
        chore_id = int(cur.lastrowid)

    return _fetch_single_chore(db, chore_id, today_iso())


@router.patch("/chores/{chore_id}")
def update_chore(
    db: DB,
    chore_id: Annotated[int, Path(ge=1)],
    body: ChoreUpdate,
) -> dict[str, Any]:
    existing = record(db, "SELECT * FROM chores WHERE id = ?", (chore_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Домашнее дело не найдено")

    fields = body.model_fields_set
    updates: dict[str, Any] = {}
    if "title" in fields and body.title is not None:
        updates["title"] = _require_non_empty(body.title, "title")
    if "zone" in fields and body.zone is not None:
        updates["zone"] = body.zone.strip() or "Комнаты"
    if "frequency" in fields and body.frequency is not None:
        updates["frequency"] = body.frequency
    if "active" in fields and body.active is not None:
        updates["active"] = 1 if body.active else 0
    if "sort_order" in fields and body.sort_order is not None:
        updates["sort_order"] = body.sort_order

    if updates:
        set_clause = ", ".join(f"{col} = ?" for col in updates)
        params = tuple(updates.values()) + (chore_id,)
        with transaction(db):
            db.execute(f"UPDATE chores SET {set_clause} WHERE id = ?", params)

    return _fetch_single_chore(db, chore_id, today_iso())


@router.delete("/chores/{chore_id}")
def delete_chore(
    db: DB,
    chore_id: Annotated[int, Path(ge=1)],
) -> dict[str, Any]:
    existing = record(db, "SELECT id FROM chores WHERE id = ?", (chore_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Домашнее дело не найдено")
    with transaction(db):
        db.execute("DELETE FROM chores WHERE id = ?", (chore_id,))
    return {"deleted": True, "id": chore_id}


@router.post("/chores/{chore_id}/toggle")
def toggle_chore(
    db: DB,
    chore_id: Annotated[int, Path(ge=1)],
    body: ChoreToggle | None = None,
) -> dict[str, Any]:
    payload = body or ChoreToggle()
    existing_chore = record(db, "SELECT id FROM chores WHERE id = ?", (chore_id,))
    if existing_chore is None:
        raise HTTPException(status_code=404, detail="Домашнее дело не найдено")

    target_date = validate_date_str(payload.date or payload.log_date, default_today=True)
    existing_log = record(
        db,
        "SELECT * FROM chore_logs WHERE chore_id = ? AND log_date = ?",
        (chore_id, target_date),
    )

    if payload.completed is not None:
        new_completed = payload.completed
    else:
        new_completed = not (existing_log is not None and existing_log["completed"] == 1)

    completed_at = now_hhmm() if new_completed else None
    with transaction(db):
        db.execute(
            """INSERT INTO chore_logs(chore_id, log_date, completed, completed_at)
               VALUES(?,?,?,?)
               ON CONFLICT(chore_id, log_date) DO UPDATE SET
                   completed = excluded.completed,
                   completed_at = excluded.completed_at""",
            (chore_id, target_date, 1 if new_completed else 0, completed_at),
        )

    return _fetch_single_chore(db, chore_id, target_date)


# ---------------------------------------------------------------------------
# Shopping List Helpers & Endpoints
# ---------------------------------------------------------------------------


def _format_shopping_item(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "name": row["name"],
        "category": row["category"],
        "quantity": row["quantity"],
        "list_type": row.get("list_type") or "groceries",
        "bought": bool(row["bought"]),
        "bought_at": row["bought_at"],
        "created_at": row["created_at"],
    }


@router.get("/shopping")
def list_shopping(
    db: DB,
    list_type: Annotated[ShoppingListType | None, Query()] = None,
) -> dict[str, Any]:
    if list_type is not None:
        rows = records(
            db,
            "SELECT * FROM shopping_items WHERE list_type = ? ORDER BY bought ASC, id DESC",
            (list_type,),
        )
    else:
        rows = records(
            db,
            "SELECT * FROM shopping_items ORDER BY bought ASC, id DESC",
        )
    items = [_format_shopping_item(r) for r in rows]
    by_category: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        by_category.setdefault(item["category"], []).append(item)

    bought = sum(1 for item in items if item["bought"])
    total = len(items)
    return {
        "list_type": list_type,
        "items": items,
        "by_category": by_category,
        "summary": {
            "remaining": total - bought,
            "bought": bought,
            "total": total,
        },
    }


@router.post("/shopping", status_code=status.HTTP_201_CREATED)
def create_shopping_item(db: DB, body: ShoppingItemCreate) -> dict[str, Any]:
    name = _require_non_empty(body.name, "name")
    created_at = now_iso()

    with transaction(db):
        cur = db.execute(
            """INSERT INTO shopping_items(name, category, quantity, list_type, bought, bought_at, created_at)
               VALUES(?,?,?,?,0,NULL,?)""",
            (
                name,
                body.category.strip() or "Прочее",
                body.quantity.strip() or "1 шт",
                body.list_type,
                created_at,
            ),
        )
        item_id = int(cur.lastrowid)

    saved = record(db, "SELECT * FROM shopping_items WHERE id = ?", (item_id,))
    assert saved is not None
    return _format_shopping_item(saved)


@router.patch("/shopping/{item_id}")
def update_shopping_item(
    db: DB,
    item_id: Annotated[int, Path(ge=1)],
    body: ShoppingItemUpdate,
) -> dict[str, Any]:
    existing = record(db, "SELECT * FROM shopping_items WHERE id = ?", (item_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Позиция в списке покупок не найдена")

    fields = body.model_fields_set
    updates: dict[str, Any] = {}
    if "name" in fields and body.name is not None:
        updates["name"] = _require_non_empty(body.name, "name")
    if "category" in fields and body.category is not None:
        updates["category"] = body.category.strip() or "Прочее"
    if "quantity" in fields and body.quantity is not None:
        updates["quantity"] = body.quantity.strip() or "1 шт"
    if "list_type" in fields and body.list_type is not None:
        updates["list_type"] = body.list_type
    if "bought" in fields and body.bought is not None:
        updates["bought"] = 1 if body.bought else 0
        if body.bought:
            updates["bought_at"] = existing["bought_at"] or now_iso()
        else:
            updates["bought_at"] = None

    if updates:
        set_clause = ", ".join(f"{col} = ?" for col in updates)
        params = tuple(updates.values()) + (item_id,)
        with transaction(db):
            db.execute(f"UPDATE shopping_items SET {set_clause} WHERE id = ?", params)

    saved = record(db, "SELECT * FROM shopping_items WHERE id = ?", (item_id,))
    assert saved is not None
    return _format_shopping_item(saved)


@router.delete("/shopping/{item_id}")
def delete_shopping_item(
    db: DB,
    item_id: Annotated[int, Path(ge=1)],
) -> dict[str, Any]:
    existing = record(db, "SELECT id FROM shopping_items WHERE id = ?", (item_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Позиция в списке покупок не найдена")
    with transaction(db):
        db.execute("DELETE FROM shopping_items WHERE id = ?", (item_id,))
    return {"deleted": True, "id": item_id}


@router.post("/shopping/clear-bought")
def clear_bought_shopping(
    db: DB,
    list_type: Annotated[ShoppingListType | None, Query()] = None,
    body: ShoppingClearBought | None = None,
) -> dict[str, Any]:
    effective_type = list_type or (body.list_type if body is not None else None)
    with transaction(db):
        if effective_type is not None:
            cur = db.execute(
                "DELETE FROM shopping_items WHERE bought = 1 AND list_type = ?",
                (effective_type,),
            )
        else:
            cur = db.execute("DELETE FROM shopping_items WHERE bought = 1")
    return {"cleared": cur.rowcount, "list_type": effective_type}
