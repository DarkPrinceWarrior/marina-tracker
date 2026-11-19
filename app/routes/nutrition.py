"""Nutrition menu catalog and daily meal logs endpoints."""

from __future__ import annotations

import base64
import binascii
from datetime import date, timedelta
import re
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Path, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from ..db import (
    DB,
    now_hhmm,
    now_iso,
    record,
    records,
    search_text,
    transaction,
    validate_date_str,
)

router = APIRouter(prefix="/api/nutrition", tags=["nutrition"])

MenuSlot = Literal["breakfast", "lunch", "dinner", "snack", "any"]
MealSlot = Literal["breakfast", "lunch", "dinner", "snack"]

_MEAL_SLOTS: tuple[str, ...] = ("breakfast", "lunch", "dinner", "snack")
_VALID_MENU_QUERY_SLOTS = {"breakfast", "lunch", "dinner", "snack", "any", "all"}
_HHMM_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
_DATA_URL_RE = re.compile(
    r"^data:(image/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$",
    re.IGNORECASE,
)
_MAX_PHOTO_BYTES = 2 * 1024 * 1024  # 2 MB decoded

_MEAL_SELECT_SQL = """
SELECT ml.*,
       COALESCE(m.photo_url, '') AS menu_photo_url,
       COALESCE(m.description, '') AS menu_description
FROM meal_logs ml
LEFT JOIN menu_items m ON m.id = ml.menu_item_id
"""


_NUTRITION_FIELD_LABELS: dict[str, str] = {
    "name": "Название блюда",
    "dish_name": "Название блюда",
}


def _validate_photo_url(value: str | None) -> str:
    cleaned = str(value or "").strip()
    if not cleaned:
        return ""
    if (
        cleaned.startswith("/api/nutrition/photos/")
        or cleaned.startswith("/dishes/")
        or cleaned.startswith("https://")
        or cleaned.startswith("http://")
    ):
        return cleaned
    raise HTTPException(
        status_code=422,
        detail="Некорректная ссылка на фотографию блюда",
    )


def _decode_image_data_url(data_url: str) -> tuple[str, bytes, str]:
    raw_str = str(data_url or "").strip()
    match = _DATA_URL_RE.match(raw_str)
    if not match:
        raise HTTPException(
            status_code=422,
            detail="Поддерживаются только изображения JPEG, PNG или WebP",
        )
    mime = match.group(1).lower()
    if mime == "image/jpg":
        mime = "image/jpeg"
    b64_payload = re.sub(r"\s+", "", match.group(2))
    try:
        raw_bytes = base64.b64decode(b64_payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail="Не удалось прочитать файл изображения",
        ) from exc

    if len(raw_bytes) < 16:
        raise HTTPException(
            status_code=422,
            detail="Файл изображения пуст или повреждён",
        )
    if len(raw_bytes) > _MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=422,
            detail="Размер фотографии не должен превышать 2 МБ",
        )

    is_jpeg = raw_bytes[:3] == b"\xff\xd8\xff"
    is_png = raw_bytes[:8] == b"\x89PNG\r\n\x1a\n"
    is_webp = len(raw_bytes) >= 12 and raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP"
    if not (is_jpeg or is_png or is_webp):
        raise HTTPException(
            status_code=422,
            detail="Поддерживаются только изображения JPEG, PNG или WebP",
        )

    detected_mime = "image/jpeg" if is_jpeg else ("image/png" if is_png else "image/webp")
    normalized_b64 = base64.b64encode(raw_bytes).decode("ascii")
    return detected_mime, raw_bytes, normalized_b64


def _validate_hhmm(value: str | None, *, default_now: bool = False) -> str:
    if value is None:
        return now_hhmm() if default_now else ""
    cleaned = value.strip()
    if not cleaned:
        return now_hhmm() if default_now else ""
    if not _HHMM_RE.match(cleaned):
        raise HTTPException(
            status_code=422,
            detail=f"Неверный формат времени «{value}», ожидается ЧЧ:ММ",
        )
    return cleaned


def _require_non_empty(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        label = _NUTRITION_FIELD_LABELS.get(field_name, field_name)
        raise HTTPException(
            status_code=422,
            detail=f"Поле «{label}» не может быть пустым",
        )
    return cleaned


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class PhotoUploadBody(BaseModel):
    data_url: str = Field(min_length=20, max_length=3_000_000)


class MenuItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=240)
    photo_url: str = Field(default="", max_length=500)
    meal_slot: MenuSlot = "any"
    default_portion: str = Field(default="1 порция", max_length=80)
    default_grams: int = Field(default=200, ge=0, le=5000)
    kcal: int = Field(default=0, ge=0, le=10000)
    protein_g: float = Field(default=0.0, ge=0, le=1000)
    fat_g: float = Field(default=0.0, ge=0, le=1000)
    carbs_g: float = Field(default=0.0, ge=0, le=1000)
    category: str = Field(default="Домашнее", max_length=80)
    is_favorite: bool = False

    @field_validator("description", "photo_url", mode="before")
    @classmethod
    def _coerce_optional_str(cls, v: Any) -> Any:
        return "" if v is None else v

    @field_validator("meal_slot", mode="before")
    @classmethod
    def _coerce_slot(cls, v: Any) -> Any:
        return "any" if v is None or v == "" else v

    @field_validator("default_portion", mode="before")
    @classmethod
    def _coerce_portion(cls, v: Any) -> Any:
        return "1 порция" if v is None else v

    @field_validator("category", mode="before")
    @classmethod
    def _coerce_category(cls, v: Any) -> Any:
        return "Домашнее" if v is None else v

    @field_validator("default_grams", mode="before")
    @classmethod
    def _coerce_grams(cls, v: Any) -> Any:
        return 200 if v is None or v == "" else v

    @field_validator("kcal", mode="before")
    @classmethod
    def _coerce_kcal(cls, v: Any) -> Any:
        return 0 if v is None or v == "" else v

    @field_validator("protein_g", "fat_g", "carbs_g", mode="before")
    @classmethod
    def _coerce_macro(cls, v: Any) -> Any:
        return 0.0 if v is None or v == "" else v

    @field_validator("is_favorite", mode="before")
    @classmethod
    def _coerce_fav(cls, v: Any) -> Any:
        return False if v is None else v


class MenuItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=240)
    photo_url: str | None = Field(default=None, max_length=500)
    meal_slot: MenuSlot | None = None
    default_portion: str | None = Field(default=None, max_length=80)
    default_grams: int | None = Field(default=None, ge=0, le=5000)
    kcal: int | None = Field(default=None, ge=0, le=10000)
    protein_g: float | None = Field(default=None, ge=0, le=1000)
    fat_g: float | None = Field(default=None, ge=0, le=1000)
    carbs_g: float | None = Field(default=None, ge=0, le=1000)
    category: str | None = Field(default=None, max_length=80)
    is_favorite: bool | None = None


class MealLogCreate(BaseModel):
    log_date: str | None = None
    date: str | None = None
    meal_slot: MealSlot
    menu_item_id: int | None = None
    dish_name: str | None = Field(default=None, max_length=200)
    amount_value: float = Field(default=1.0, gt=0, le=10000)
    amount_unit: str = Field(default="порц.", max_length=40)
    grams: int | None = Field(default=None, ge=0, le=10000)
    eaten_at: str | None = Field(default=None, max_length=10)
    kcal: int | None = Field(default=None, ge=0, le=15000)
    note: str = Field(default="", max_length=500)
    photo_url: str = Field(default="", max_length=500)
    completed: bool = True

    @field_validator("amount_value", mode="before")
    @classmethod
    def _coerce_amount(cls, v: Any) -> Any:
        return 1.0 if v is None or v == "" else v

    @field_validator("amount_unit", mode="before")
    @classmethod
    def _coerce_unit(cls, v: Any) -> Any:
        return "порц." if v is None else v

    @field_validator("note", "photo_url", mode="before")
    @classmethod
    def _coerce_note(cls, v: Any) -> Any:
        return "" if v is None else v

    @field_validator("completed", mode="before")
    @classmethod
    def _coerce_completed(cls, v: Any) -> Any:
        return True if v is None else v


class MealLogUpdate(BaseModel):
    log_date: str | None = None
    date: str | None = None
    meal_slot: MealSlot | None = None
    menu_item_id: int | None = None
    dish_name: str | None = Field(default=None, min_length=1, max_length=200)
    amount_value: float | None = Field(default=None, gt=0, le=10000)
    amount_unit: str | None = Field(default=None, max_length=40)
    grams: int | None = Field(default=None, ge=0, le=10000)
    eaten_at: str | None = Field(default=None, max_length=10)
    kcal: int | None = Field(default=None, ge=0, le=15000)
    note: str | None = Field(default=None, max_length=500)
    photo_url: str | None = Field(default=None, max_length=500)
    completed: bool | None = None


# ---------------------------------------------------------------------------
# Formatters
# ---------------------------------------------------------------------------


def _format_menu_item(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "name": row["name"],
        "description": row.get("description") or "",
        "photo_url": row.get("photo_url") or "",
        "meal_slot": row["meal_slot"],
        "default_portion": row["default_portion"],
        "default_grams": int(row["default_grams"]),
        "kcal": int(row["kcal"]),
        "protein_g": round(float(row["protein_g"]), 1),
        "fat_g": round(float(row["fat_g"]), 1),
        "carbs_g": round(float(row["carbs_g"]), 1),
        "category": row["category"],
        "is_favorite": bool(row["is_favorite"]),
    }


def _format_meal_log(row: dict[str, Any]) -> dict[str, Any]:
    own_photo = row.get("photo_url") or ""
    menu_photo = row.get("menu_photo_url") or ""
    return {
        "id": int(row["id"]),
        "log_date": row["log_date"],
        "meal_slot": row["meal_slot"],
        "menu_item_id": int(row["menu_item_id"]) if row["menu_item_id"] is not None else None,
        "dish_name": row["dish_name"],
        "amount_value": round(float(row["amount_value"]), 2),
        "amount_unit": row["amount_unit"],
        "grams": int(row["grams"]),
        "eaten_at": row["eaten_at"],
        "kcal": int(row["kcal"]),
        "note": row["note"],
        "photo_url": own_photo,
        "effective_photo_url": own_photo or menu_photo,
        "description": row.get("menu_description") or "",
        "completed": bool(row["completed"]),
        "created_at": row["created_at"],
    }


# ---------------------------------------------------------------------------
# Dish Photo Upload & Serving Endpoints (SQLite + PostgreSQL 17 persistent)
# ---------------------------------------------------------------------------


@router.post("/photos", status_code=status.HTTP_201_CREATED)
def upload_nutrition_photo(db: DB, body: PhotoUploadBody) -> dict[str, Any]:
    mime_type, raw_bytes, b64_str = _decode_image_data_url(body.data_url)
    created_at = now_iso()
    with transaction(db):
        cur = db.execute(
            """INSERT INTO nutrition_photos(mime_type, data_b64, byte_size, created_at)
               VALUES(?,?,?,?)""",
            (mime_type, b64_str, len(raw_bytes), created_at),
        )
        photo_id = int(cur.lastrowid)

    return {
        "id": photo_id,
        "url": f"/api/nutrition/photos/{photo_id}",
        "mime_type": mime_type,
        "byte_size": len(raw_bytes),
    }


@router.get("/photos/{photo_id}")
def get_nutrition_photo(
    db: DB,
    photo_id: Annotated[int, Path(ge=1)],
) -> Response:
    row = record(
        db,
        "SELECT mime_type, data_b64 FROM nutrition_photos WHERE id = ?",
        (photo_id,),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Фотография блюда не найдена")
    try:
        raw_bytes = base64.b64decode(row["data_b64"])
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=404, detail="Фотография блюда не найдена") from exc
    return Response(
        content=raw_bytes,
        media_type=row["mime_type"] or "image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


# ---------------------------------------------------------------------------
# Menu Catalog Endpoints
# ---------------------------------------------------------------------------


@router.get("/menu")
def list_menu(
    db: DB,
    slot: Annotated[str | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
) -> dict[str, Any]:
    conditions: list[str] = []
    params: list[Any] = []
    order_parts: list[str] = []

    slot_clean = (slot or "").strip().lower()
    if slot_clean:
        if slot_clean not in _VALID_MENU_QUERY_SLOTS:
            raise HTTPException(
                status_code=422,
                detail=f"Неверный слот меню «{slot}»",
            )
        if slot_clean in _MEAL_SLOTS:
            conditions.append("(meal_slot = ? OR meal_slot = 'any')")
            params.append(slot_clean)
            order_parts.append("CASE WHEN meal_slot = ? THEN 0 ELSE 1 END")
        elif slot_clean == "any":
            conditions.append("meal_slot = 'any'")

    q_clean = search_text(q).strip() if q else ""
    if q_clean:
        like = f"%{q_clean}%"
        conditions.append(
            "(search_text(name) LIKE ? OR search_text(category) LIKE ? OR search_text(description) LIKE ?)"
        )
        params.extend([like, like, like])

    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    order_parts.extend(["is_favorite DESC", "id ASC"])
    order_params: list[Any] = [slot_clean] if slot_clean in _MEAL_SLOTS else []

    rows = records(
        db,
        f"SELECT * FROM menu_items {where_sql} ORDER BY {', '.join(order_parts)}",
        tuple(params + order_params),
    )
    items = [_format_menu_item(r) for r in rows]
    return {"items": items, "total": len(items)}


@router.post("/menu", status_code=status.HTTP_201_CREATED)
def create_menu_item(db: DB, body: MenuItemCreate) -> dict[str, Any]:
    name = _require_non_empty(body.name, "name")
    photo_url = _validate_photo_url(body.photo_url)
    with transaction(db):
        cur = db.execute(
            """INSERT INTO menu_items(
                   name, description, photo_url, meal_slot, default_portion,
                   default_grams, kcal, protein_g, fat_g, carbs_g, category, is_favorite
               ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                name,
                body.description.strip(),
                photo_url,
                body.meal_slot,
                body.default_portion.strip() or "1 порция",
                body.default_grams,
                body.kcal,
                body.protein_g,
                body.fat_g,
                body.carbs_g,
                body.category.strip() or "Домашнее",
                1 if body.is_favorite else 0,
            ),
        )
        item_id = int(cur.lastrowid)

    saved = record(db, "SELECT * FROM menu_items WHERE id = ?", (item_id,))
    assert saved is not None
    return _format_menu_item(saved)


@router.patch("/menu/{item_id}")
def update_menu_item(
    db: DB,
    item_id: Annotated[int, Path(ge=1)],
    body: MenuItemUpdate,
) -> dict[str, Any]:
    existing = record(db, "SELECT * FROM menu_items WHERE id = ?", (item_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Блюдо в меню не найдено")

    fields = body.model_fields_set
    updates: dict[str, Any] = {}
    if "name" in fields and body.name is not None:
        updates["name"] = _require_non_empty(body.name, "name")
    if "description" in fields and body.description is not None:
        updates["description"] = body.description.strip()
    if "photo_url" in fields:
        updates["photo_url"] = _validate_photo_url(body.photo_url)
    if "meal_slot" in fields and body.meal_slot is not None:
        updates["meal_slot"] = body.meal_slot
    if "default_portion" in fields and body.default_portion is not None:
        updates["default_portion"] = body.default_portion.strip() or "1 порция"
    if "default_grams" in fields and body.default_grams is not None:
        updates["default_grams"] = body.default_grams
    if "kcal" in fields and body.kcal is not None:
        updates["kcal"] = body.kcal
    if "protein_g" in fields and body.protein_g is not None:
        updates["protein_g"] = body.protein_g
    if "fat_g" in fields and body.fat_g is not None:
        updates["fat_g"] = body.fat_g
    if "carbs_g" in fields and body.carbs_g is not None:
        updates["carbs_g"] = body.carbs_g
    if "category" in fields and body.category is not None:
        updates["category"] = body.category.strip() or "Домашнее"
    if "is_favorite" in fields and body.is_favorite is not None:
        updates["is_favorite"] = 1 if body.is_favorite else 0

    if updates:
        set_clause = ", ".join(f"{col} = ?" for col in updates)
        params = tuple(updates.values()) + (item_id,)
        with transaction(db):
            db.execute(f"UPDATE menu_items SET {set_clause} WHERE id = ?", params)

    saved = record(db, "SELECT * FROM menu_items WHERE id = ?", (item_id,))
    assert saved is not None
    return _format_menu_item(saved)


@router.delete("/menu/{item_id}")
def delete_menu_item(
    db: DB,
    item_id: Annotated[int, Path(ge=1)],
) -> dict[str, Any]:
    existing = record(db, "SELECT id FROM menu_items WHERE id = ?", (item_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Блюдо в меню не найдено")
    with transaction(db):
        db.execute("DELETE FROM menu_items WHERE id = ?", (item_id,))
    return {"deleted": True, "id": item_id}


# ---------------------------------------------------------------------------
# Daily Meals Endpoints
# ---------------------------------------------------------------------------


@router.get("/day")
def get_nutrition_day(
    db: DB,
    date_str: Annotated[str | None, Query(alias="date")] = None,
) -> dict[str, Any]:
    target_date = validate_date_str(date_str, default_today=True)
    ref_date = date.fromisoformat(target_date)

    rows = records(
        db,
        f"""{_MEAL_SELECT_SQL}
            WHERE ml.log_date = ?
            ORDER BY CASE ml.meal_slot
                         WHEN 'breakfast' THEN 0
                         WHEN 'lunch' THEN 1
                         WHEN 'dinner' THEN 2
                         ELSE 3
                     END,
                     ml.eaten_at ASC,
                     ml.id ASC""",
        (target_date,),
    )
    items = [_format_meal_log(r) for r in rows]

    slots: dict[str, list[dict[str, Any]]] = {slot: [] for slot in _MEAL_SLOTS}
    for item in items:
        slots[item["meal_slot"]].append(item)

    completed_items = [item for item in items if item["completed"]]
    present_slots = {item["meal_slot"] for item in completed_items}
    slots_completed = [slot for slot in _MEAL_SLOTS if slot in present_slots]

    totals = {
        "meals_count": len(completed_items),
        "total_kcal": sum(item["kcal"] for item in completed_items),
        "total_grams": sum(item["grams"] for item in completed_items),
        "slots_completed": slots_completed,
    }

    # Recent 7-day consistency
    week_start = (ref_date - timedelta(days=6)).isoformat()
    week_rows = records(
        db,
        """SELECT log_date, meal_slot, kcal
           FROM meal_logs
           WHERE completed = 1 AND log_date >= ? AND log_date <= ?""",
        (week_start, target_date),
    )
    by_day: dict[str, list[dict[str, Any]]] = {}
    for row in week_rows:
        by_day.setdefault(row["log_date"], []).append(row)

    recent_7d: list[dict[str, Any]] = []
    for offset in range(6, -1, -1):
        d_iso = (ref_date - timedelta(days=offset)).isoformat()
        day_meals = by_day.get(d_iso, [])
        day_slots = {m["meal_slot"] for m in day_meals}
        recent_7d.append(
            {
                "date": d_iso,
                "meals_count": len(day_meals),
                "total_kcal": sum(int(m["kcal"]) for m in day_meals),
                "has_breakfast": "breakfast" in day_slots,
                "has_lunch": "lunch" in day_slots,
                "has_dinner": "dinner" in day_slots,
            }
        )

    return {
        "date": target_date,
        "slots": slots,
        "items": items,
        "totals": totals,
        "recent_7d": recent_7d,
    }


@router.post("/meals", status_code=status.HTTP_201_CREATED)
def create_meal(db: DB, body: MealLogCreate) -> dict[str, Any]:
    target_date = validate_date_str(body.log_date or body.date, default_today=True)
    eaten_at = _validate_hhmm(body.eaten_at, default_now=True)
    created_at = now_iso()

    menu_item: dict[str, Any] | None = None
    if body.menu_item_id is not None:
        menu_item = record(
            db,
            "SELECT * FROM menu_items WHERE id = ?",
            (body.menu_item_id,),
        )
        if menu_item is None:
            raise HTTPException(status_code=404, detail="Блюдо из меню не найдено")

    raw_name = body.dish_name if body.dish_name is not None else (menu_item["name"] if menu_item else "")
    dish_name = _require_non_empty(raw_name, "dish_name")
    amount_unit = body.amount_unit.strip() or "порц."

    grams = body.grams
    if grams is None:
        if amount_unit.lower() in {"г", "гр", "g", "мл", "ml"}:
            grams = round(body.amount_value)
        elif menu_item is not None:
            grams = round(int(menu_item["default_grams"]) * body.amount_value)
        else:
            grams = 0

    kcal = body.kcal
    if kcal is None:
        if menu_item is not None and int(menu_item["default_grams"]) > 0 and grams > 0:
            kcal = round(int(menu_item["kcal"]) * (grams / int(menu_item["default_grams"])))
        elif menu_item is not None:
            kcal = round(int(menu_item["kcal"]) * body.amount_value)
        else:
            kcal = 0

    photo_url = _validate_photo_url(body.photo_url)

    with transaction(db):
        cur = db.execute(
            """INSERT INTO meal_logs(
                   log_date, meal_slot, menu_item_id, dish_name, amount_value,
                   amount_unit, grams, eaten_at, kcal, note, photo_url, completed, created_at
               ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                target_date,
                body.meal_slot,
                body.menu_item_id,
                dish_name,
                body.amount_value,
                amount_unit,
                max(0, grams),
                eaten_at,
                max(0, kcal),
                body.note.strip(),
                photo_url,
                1 if body.completed else 0,
                created_at,
            ),
        )
        meal_id = int(cur.lastrowid)

    saved = record(db, f"{_MEAL_SELECT_SQL} WHERE ml.id = ?", (meal_id,))
    assert saved is not None
    return _format_meal_log(saved)


@router.patch("/meals/{meal_id}")
def update_meal(
    db: DB,
    meal_id: Annotated[int, Path(ge=1)],
    body: MealLogUpdate,
) -> dict[str, Any]:
    existing = record(db, "SELECT * FROM meal_logs WHERE id = ?", (meal_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Запись о приёме пищи не найдена")

    fields = body.model_fields_set
    updates: dict[str, Any] = {}
    if "log_date" in fields and body.log_date is not None:
        updates["log_date"] = validate_date_str(body.log_date)
    elif "date" in fields and body.date is not None:
        updates["log_date"] = validate_date_str(body.date)
    if "meal_slot" in fields and body.meal_slot is not None:
        updates["meal_slot"] = body.meal_slot
    if "menu_item_id" in fields:
        if body.menu_item_id is not None:
            found_menu = record(db, "SELECT id FROM menu_items WHERE id = ?", (body.menu_item_id,))
            if found_menu is None:
                raise HTTPException(status_code=404, detail="Блюдо из меню не найдено")
        updates["menu_item_id"] = body.menu_item_id
    if "dish_name" in fields and body.dish_name is not None:
        updates["dish_name"] = _require_non_empty(body.dish_name, "dish_name")
    if "amount_value" in fields and body.amount_value is not None:
        updates["amount_value"] = body.amount_value
    if "amount_unit" in fields and body.amount_unit is not None:
        updates["amount_unit"] = body.amount_unit.strip() or "порц."
    if "grams" in fields and body.grams is not None:
        updates["grams"] = body.grams
    if "eaten_at" in fields:
        updates["eaten_at"] = _validate_hhmm(body.eaten_at, default_now=False)
    if "kcal" in fields and body.kcal is not None:
        updates["kcal"] = body.kcal
    if "note" in fields and body.note is not None:
        updates["note"] = body.note.strip()
    if "photo_url" in fields:
        updates["photo_url"] = _validate_photo_url(body.photo_url)
    if "completed" in fields and body.completed is not None:
        updates["completed"] = 1 if body.completed else 0

    if updates:
        set_clause = ", ".join(f"{col} = ?" for col in updates)
        params = tuple(updates.values()) + (meal_id,)
        with transaction(db):
            db.execute(f"UPDATE meal_logs SET {set_clause} WHERE id = ?", params)

    saved = record(db, f"{_MEAL_SELECT_SQL} WHERE ml.id = ?", (meal_id,))
    assert saved is not None
    return _format_meal_log(saved)


@router.delete("/meals/{meal_id}")
def delete_meal(
    db: DB,
    meal_id: Annotated[int, Path(ge=1)],
) -> dict[str, Any]:
    existing = record(db, "SELECT id FROM meal_logs WHERE id = ?", (meal_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Запись о приёме пищи не найдена")
    with transaction(db):
        db.execute("DELETE FROM meal_logs WHERE id = ?", (meal_id,))
    return {"deleted": True, "id": meal_id}
