"""Web Push notifications (VAPID subscribe, schedule settings, test & cron dispatch)."""

from __future__ import annotations

import hmac
import json
import os
import re
import sqlite3
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..db import (
    DB,
    MOSCOW,
    compute_cycle_snapshot,
    now_dt,
    now_iso,
    record,
    records,
    transaction,
)

try:
    from pywebpush import WebPushException, webpush
except ImportError:  # pragma: no cover
    webpush = None  # type: ignore[assignment]

    class WebPushException(Exception):  # type: ignore[no-redef]
        response: Any = None


router = APIRouter(prefix="/api/push", tags=["push"])

_HHMM_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")

DEFAULT_NOTIFICATION_SETTINGS: dict[str, Any] = {
    "enabled": True,
    "timezone": "Europe/Moscow",
    "morning_enabled": True,
    "morning_time": "08:30",
    "afternoon_enabled": True,
    "afternoon_time": "13:30",
    "evening_enabled": True,
    "evening_time": "20:30",
    "water_enabled": True,
    "water_interval_hours": 3,
    "events_enabled": True,
    "events_lead_minutes": 60,
    "cycle_enabled": True,
    "cycle_days_before": 2,
    "goals_enabled": True,
    "goals_weekday": 6,
    "goals_time": "11:00",
    "quiet_start": "22:30",
    "quiet_end": "07:30",
    "updated_at": "",
}


# ---------------------------------------------------------------------------
# Helpers: Env, Time, Pluralization, Formatting
# ---------------------------------------------------------------------------


def _vapid_public_key() -> str:
    return os.environ.get("VAPID_PUBLIC_KEY", "").strip()


def _vapid_private_key() -> str:
    raw = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    if "\\n" in raw:
        raw = raw.replace("\\n", "\n")
    return raw


def _vapid_subject() -> str:
    return os.environ.get("VAPID_SUBJECT", "").strip() or "mailto:ritm@marina-tracker.app"


def _cron_secret() -> str:
    return os.environ.get("PUSH_CRON_SECRET", "").strip()


def _is_vapid_configured() -> bool:
    return bool(_vapid_public_key() and _vapid_private_key())


def _validate_hhmm(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not _HHMM_RE.match(cleaned):
        raise HTTPException(
            status_code=422,
            detail=f"Неверный формат времени в поле '{field_name}': '{value}', ожидается HH:MM",
        )
    return cleaned


def _hhmm_to_minutes(hhmm: str) -> int:
    h, m = hhmm.split(":", 1)
    return int(h) * 60 + int(m)


def _in_window(now_min: int, target_min: int, window: int = 25) -> bool:
    return 0 <= (now_min - target_min) <= window


def _in_quiet_hours(now_min: int, quiet_start: str, quiet_end: str) -> bool:
    if not _HHMM_RE.match(quiet_start) or not _HHMM_RE.match(quiet_end):
        return False
    qs = _hhmm_to_minutes(quiet_start)
    qe = _hhmm_to_minutes(quiet_end)
    if qs == qe:
        return False
    if qs < qe:
        return qs <= now_min < qe
    return now_min >= qs or now_min < qe


def _plural_ru(n: int, one: str, few: str, many: str) -> str:
    n_abs = abs(n)
    mod100 = n_abs % 100
    mod10 = n_abs % 10
    if 11 <= mod100 <= 14:
        return f"{n} {many}"
    if mod10 == 1:
        return f"{n} {one}"
    if 2 <= mod10 <= 4:
        return f"{n} {few}"
    return f"{n} {many}"


def _format_settings(row: dict[str, Any] | None) -> dict[str, Any]:
    if row is None:
        return dict(DEFAULT_NOTIFICATION_SETTINGS)
    return {
        "enabled": bool(row["enabled"]),
        "timezone": row["timezone"] or "Europe/Moscow",
        "morning_enabled": bool(row["morning_enabled"]),
        "morning_time": row["morning_time"] or "08:30",
        "afternoon_enabled": bool(row["afternoon_enabled"]),
        "afternoon_time": row["afternoon_time"] or "13:30",
        "evening_enabled": bool(row["evening_enabled"]),
        "evening_time": row["evening_time"] or "20:30",
        "water_enabled": bool(row["water_enabled"]),
        "water_interval_hours": int(row["water_interval_hours"]),
        "events_enabled": bool(row["events_enabled"]),
        "events_lead_minutes": int(row["events_lead_minutes"]),
        "cycle_enabled": bool(row["cycle_enabled"]),
        "cycle_days_before": int(row["cycle_days_before"]),
        "goals_enabled": bool(row["goals_enabled"]),
        "goals_weekday": int(row["goals_weekday"]),
        "goals_time": row["goals_time"] or "11:00",
        "quiet_start": row["quiet_start"] or "22:30",
        "quiet_end": row["quiet_end"] or "07:30",
        "updated_at": row["updated_at"] or "",
    }


def _get_settings(db: sqlite3.Connection) -> dict[str, Any]:
    row = record(db, "SELECT * FROM notification_settings WHERE id = 1")
    return _format_settings(row)


def _active_subscriptions_count(db: sqlite3.Connection) -> int:
    row = record(db, "SELECT COUNT(*) AS cnt FROM push_subscriptions WHERE active = 1")
    return int(row["cnt"]) if row else 0


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class PushSubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=512)
    auth: str = Field(min_length=1, max_length=256)


class PushSubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=10, max_length=2000)
    keys: PushSubscriptionKeys
    device_label: str = Field(default="iPhone", max_length=80)
    user_agent: str = Field(default="", max_length=400)

    @field_validator("device_label", mode="before")
    @classmethod
    def _coerce_device_label(cls, v: Any) -> Any:
        return "iPhone" if v is None or str(v).strip() == "" else v

    @field_validator("user_agent", mode="before")
    @classmethod
    def _coerce_user_agent(cls, v: Any) -> Any:
        return "" if v is None else v


class PushUnsubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2000)


class NotificationSettingsUpdate(BaseModel):
    enabled: bool | None = None
    timezone: str | None = Field(default=None, max_length=64)
    morning_enabled: bool | None = None
    morning_time: str | None = Field(default=None, max_length=10)
    afternoon_enabled: bool | None = None
    afternoon_time: str | None = Field(default=None, max_length=10)
    evening_enabled: bool | None = None
    evening_time: str | None = Field(default=None, max_length=10)
    water_enabled: bool | None = None
    water_interval_hours: Literal[2, 3, 4] | None = None
    events_enabled: bool | None = None
    events_lead_minutes: Literal[30, 60, 120] | None = None
    cycle_enabled: bool | None = None
    cycle_days_before: Literal[1, 2, 3] | None = None
    goals_enabled: bool | None = None
    goals_weekday: int | None = Field(default=None, ge=0, le=6)
    goals_time: str | None = Field(default=None, max_length=10)
    quiet_start: str | None = Field(default=None, max_length=10)
    quiet_end: str | None = Field(default=None, max_length=10)


# ---------------------------------------------------------------------------
# Web Push Delivery Engine
# ---------------------------------------------------------------------------


def _send_web_push(
    db: sqlite3.Connection,
    title: str,
    body: str,
    *,
    url: str = "/",
    tab: str = "today",
    sub: str = "",
    tag: str = "ritm",
) -> dict[str, Any]:
    """Send Web Push notification to all active subscriptions."""
    if not _is_vapid_configured():
        return {"sent": 0, "failed": 0, "errors": ["VAPID не настроен"]}
    if webpush is None:
        return {"sent": 0, "failed": 0, "errors": ["pywebpush не установлен"]}

    subs = records(
        db,
        """SELECT id, endpoint, p256dh, auth, device_label
           FROM push_subscriptions
           WHERE active = 1
           ORDER BY id ASC""",
    )
    if not subs:
        return {"sent": 0, "failed": 0, "errors": []}

    payload = json.dumps(
        {
            "title": title,
            "body": body,
            "url": url,
            "tab": tab,
            "sub": sub,
            "tag": tag,
        },
        ensure_ascii=False,
    )
    private_key = _vapid_private_key()
    claims = {"sub": _vapid_subject()}

    sent = 0
    failed = 0
    errors: list[str] = []
    ts = now_iso()

    for sub_row in subs:
        sub_id = int(sub_row["id"])
        sub_info = {
            "endpoint": sub_row["endpoint"],
            "keys": {
                "p256dh": sub_row["p256dh"],
                "auth": sub_row["auth"],
            },
        }
        try:
            webpush(
                subscription_info=sub_info,
                data=payload,
                vapid_private_key=private_key,
                vapid_claims=claims,
                ttl=3600,
            )
            with transaction(db):
                db.execute(
                    """UPDATE push_subscriptions
                       SET last_success_at = ?, last_error = '', updated_at = ?
                       WHERE id = ?""",
                    (ts, ts, sub_id),
                )
            sent += 1
        except WebPushException as exc:
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            err_msg = str(exc).strip()[:300] or f"WebPush HTTP {status_code}"
            with transaction(db):
                if status_code in (404, 410):
                    db.execute(
                        """UPDATE push_subscriptions
                           SET active = 0, last_error = ?, updated_at = ?
                           WHERE id = ?""",
                        (err_msg, ts, sub_id),
                    )
                else:
                    db.execute(
                        """UPDATE push_subscriptions
                           SET last_error = ?, updated_at = ?
                           WHERE id = ?""",
                        (err_msg, ts, sub_id),
                    )
            failed += 1
            errors.append(err_msg)
        except Exception as exc:  # pragma: no cover - defensive catch
            err_msg = str(exc).strip()[:300] or type(exc).__name__
            with transaction(db):
                db.execute(
                    """UPDATE push_subscriptions
                       SET last_error = ?, updated_at = ?
                       WHERE id = ?""",
                    (err_msg, ts, sub_id),
                )
            failed += 1
            errors.append(err_msg)

    return {"sent": sent, "failed": failed, "errors": errors}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/config")
def get_push_config(db: DB) -> dict[str, Any]:
    devices = records(
        db,
        """SELECT id, device_label, updated_at, last_success_at
           FROM push_subscriptions
           WHERE active = 1
           ORDER BY updated_at DESC, id DESC""",
    )
    deliveries = records(
        db,
        """SELECT id, dedupe_key, kind, title, body, sent_count, failed_count, sent_at
           FROM push_deliveries
           ORDER BY id DESC
           LIMIT 10""",
    )
    return {
        "configured": _is_vapid_configured(),
        "vapid_public_key": _vapid_public_key(),
        "subscriptions_count": len(devices),
        "devices": devices,
        "settings": _get_settings(db),
        "recent_deliveries": deliveries,
    }


@router.post("/subscribe")
def subscribe_push(db: DB, body: PushSubscribeRequest) -> dict[str, Any]:
    endpoint = body.endpoint.strip()
    if not endpoint.startswith(("https://", "http://")):
        raise HTTPException(
            status_code=422,
            detail="Некорректный адрес push-подписки (ожидается https://)",
        )
    p256dh = body.keys.p256dh.strip()
    auth = body.keys.auth.strip()
    if not p256dh or not auth:
        raise HTTPException(status_code=422, detail="Отсутствуют ключи шифрования push-подписки")

    device_label = body.device_label.strip() or "iPhone"
    user_agent = body.user_agent.strip()
    ts = now_iso()

    with transaction(db):
        db.execute(
            """INSERT INTO push_subscriptions(
                   endpoint, p256dh, auth, user_agent, device_label, active,
                   created_at, updated_at, last_error
               ) VALUES(?,?,?,?,?,1,?,?,'')
               ON CONFLICT(endpoint) DO UPDATE SET
                   p256dh = excluded.p256dh,
                   auth = excluded.auth,
                   user_agent = excluded.user_agent,
                   device_label = excluded.device_label,
                   active = 1,
                   updated_at = excluded.updated_at,
                   last_error = ''""",
            (endpoint, p256dh, auth, user_agent, device_label, ts, ts),
        )

    saved = record(db, "SELECT id FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
    assert saved is not None
    return {
        "ok": True,
        "id": int(saved["id"]),
        "subscriptions_count": _active_subscriptions_count(db),
    }


@router.post("/unsubscribe")
def unsubscribe_push(db: DB, body: PushUnsubscribeRequest) -> dict[str, Any]:
    endpoint = body.endpoint.strip()
    ts = now_iso()
    with transaction(db):
        db.execute(
            "UPDATE push_subscriptions SET active = 0, updated_at = ? WHERE endpoint = ?",
            (ts, endpoint),
        )
    return {
        "ok": True,
        "subscriptions_count": _active_subscriptions_count(db),
    }


@router.get("/settings")
def get_push_settings(db: DB) -> dict[str, Any]:
    return _get_settings(db)


@router.put("/settings")
def update_push_settings(db: DB, body: NotificationSettingsUpdate) -> dict[str, Any]:
    current = _get_settings(db)
    merged = dict(current)
    fields = body.model_fields_set

    if "enabled" in fields and body.enabled is not None:
        merged["enabled"] = body.enabled
    if "timezone" in fields and body.timezone is not None:
        tz_name = body.timezone.strip() or "Europe/Moscow"
        try:
            ZoneInfo(tz_name)
        except ZoneInfoNotFoundError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Неизвестный часовой пояс '{tz_name}'",
            ) from exc
        merged["timezone"] = tz_name

    for bool_field in (
        "morning_enabled",
        "afternoon_enabled",
        "evening_enabled",
        "water_enabled",
        "events_enabled",
        "cycle_enabled",
        "goals_enabled",
    ):
        val = getattr(body, bool_field)
        if bool_field in fields and val is not None:
            merged[bool_field] = val

    for time_field in (
        "morning_time",
        "afternoon_time",
        "evening_time",
        "goals_time",
        "quiet_start",
        "quiet_end",
    ):
        val = getattr(body, time_field)
        if time_field in fields and val is not None:
            merged[time_field] = _validate_hhmm(val, time_field)

    for int_field in (
        "water_interval_hours",
        "events_lead_minutes",
        "cycle_days_before",
        "goals_weekday",
    ):
        val = getattr(body, int_field)
        if int_field in fields and val is not None:
            merged[int_field] = int(val)

    updated_at = now_iso()
    with transaction(db):
        db.execute(
            """INSERT INTO notification_settings(
                   id, enabled, timezone,
                   morning_enabled, morning_time,
                   afternoon_enabled, afternoon_time,
                   evening_enabled, evening_time,
                   water_enabled, water_interval_hours,
                   events_enabled, events_lead_minutes,
                   cycle_enabled, cycle_days_before,
                   goals_enabled, goals_weekday, goals_time,
                   quiet_start, quiet_end, updated_at
               ) VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                   enabled = excluded.enabled,
                   timezone = excluded.timezone,
                   morning_enabled = excluded.morning_enabled,
                   morning_time = excluded.morning_time,
                   afternoon_enabled = excluded.afternoon_enabled,
                   afternoon_time = excluded.afternoon_time,
                   evening_enabled = excluded.evening_enabled,
                   evening_time = excluded.evening_time,
                   water_enabled = excluded.water_enabled,
                   water_interval_hours = excluded.water_interval_hours,
                   events_enabled = excluded.events_enabled,
                   events_lead_minutes = excluded.events_lead_minutes,
                   cycle_enabled = excluded.cycle_enabled,
                   cycle_days_before = excluded.cycle_days_before,
                   goals_enabled = excluded.goals_enabled,
                   goals_weekday = excluded.goals_weekday,
                   goals_time = excluded.goals_time,
                   quiet_start = excluded.quiet_start,
                   quiet_end = excluded.quiet_end,
                   updated_at = excluded.updated_at""",
            (
                1 if merged["enabled"] else 0,
                merged["timezone"],
                1 if merged["morning_enabled"] else 0,
                merged["morning_time"],
                1 if merged["afternoon_enabled"] else 0,
                merged["afternoon_time"],
                1 if merged["evening_enabled"] else 0,
                merged["evening_time"],
                1 if merged["water_enabled"] else 0,
                merged["water_interval_hours"],
                1 if merged["events_enabled"] else 0,
                merged["events_lead_minutes"],
                1 if merged["cycle_enabled"] else 0,
                merged["cycle_days_before"],
                1 if merged["goals_enabled"] else 0,
                merged["goals_weekday"],
                merged["goals_time"],
                merged["quiet_start"],
                merged["quiet_end"],
                updated_at,
            ),
        )

    return _get_settings(db)


@router.post("/test")
def send_test_push(db: DB) -> dict[str, Any]:
    if not _is_vapid_configured():
        raise HTTPException(
            status_code=400,
            detail="Push-уведомления на сервере ещё не настроены (отсутствуют VAPID-ключи).",
        )
    if _active_subscriptions_count(db) == 0:
        raise HTTPException(
            status_code=400,
            detail="Сначала включите уведомления на этом устройстве.",
        )

    result = _send_web_push(
        db,
        title="Ритм · Уведомления работают",
        body="Напоминания о привычках, воде, событиях и цикле будут приходить сюда.",
        url="/?tab=today",
        tab="today",
        sub="",
        tag="ritm-test",
    )
    if result["sent"] == 0 and result["failed"] > 0:
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось отправить тестовое уведомление: {result['errors'][0]}",
        )
    return {
        "ok": result["sent"] > 0,
        "sent": result["sent"],
        "failed": result["failed"],
        "errors": result["errors"],
    }


def _dispatch_if_new(
    db: sqlite3.Connection,
    *,
    dedupe_key: str,
    kind: str,
    title: str,
    body: str,
    url: str,
    tab: str,
    sub: str,
    tag: str,
    dispatched: list[dict[str, Any]],
    skipped: list[str],
) -> None:
    already = record(
        db,
        "SELECT id FROM push_deliveries WHERE dedupe_key = ?",
        (dedupe_key,),
    )
    if already is not None:
        skipped.append(f"deduped:{dedupe_key}")
        return

    res = _send_web_push(db, title, body, url=url, tab=tab, sub=sub, tag=tag)
    ts = now_iso()
    with transaction(db):
        db.execute(
            """INSERT INTO push_deliveries(
                   dedupe_key, kind, title, body, sent_count, failed_count, sent_at
               ) VALUES(?,?,?,?,?,?,?)
               ON CONFLICT(dedupe_key) DO NOTHING""",
            (dedupe_key, kind, title, body, res["sent"], res["failed"], ts),
        )
    dispatched.append(
        {
            "kind": kind,
            "dedupe_key": dedupe_key,
            "title": title,
            "body": body,
            "sent": res["sent"],
            "failed": res["failed"],
        }
    )


@router.post("/dispatch")
def dispatch_push_reminders(
    db: DB,
    authorization: Annotated[str | None, Header()] = None,
    x_cron_secret: Annotated[str | None, Header(alias="X-Cron-Secret")] = None,
) -> dict[str, Any]:
    secret = _cron_secret()
    if secret:
        provided = ""
        if authorization:
            parts = authorization.strip().split(None, 1)
            if len(parts) == 2 and parts[0].lower() == "bearer":
                provided = parts[1].strip()
        if not provided and x_cron_secret:
            provided = x_cron_secret.strip()
        if not provided or not hmac.compare_digest(provided, secret):
            raise HTTPException(
                status_code=401,
                detail="Неверный ключ авторизации рассылки",
            )

    settings = _get_settings(db)
    active_subs = _active_subscriptions_count(db)
    dispatched: list[dict[str, Any]] = []
    skipped: list[str] = []

    if not settings["enabled"]:
        return {
            "ok": True,
            "active_subscriptions": active_subs,
            "dispatched": dispatched,
            "skipped": ["notifications_disabled"],
        }
    if not _is_vapid_configured():
        return {
            "ok": True,
            "active_subscriptions": active_subs,
            "dispatched": dispatched,
            "skipped": ["vapid_not_configured"],
        }
    if active_subs == 0:
        return {
            "ok": True,
            "active_subscriptions": 0,
            "dispatched": dispatched,
            "skipped": ["no_active_subscriptions"],
        }

    try:
        tz = ZoneInfo(settings["timezone"])
    except ZoneInfoNotFoundError:
        tz = MOSCOW

    current_dt = now_dt().astimezone(tz)
    today_str = current_dt.date().isoformat()
    now_minutes = current_dt.hour * 60 + current_dt.minute
    weekday = current_dt.weekday()

    if _in_quiet_hours(now_minutes, settings["quiet_start"], settings["quiet_end"]):
        return {
            "ok": True,
            "active_subscriptions": active_subs,
            "dispatched": dispatched,
            "skipped": ["quiet_hours"],
        }

    # 1. Morning / Afternoon / Evening habits & vitamins (+ evening gratitude/reflection)
    period_specs = (
        ("morning", "morning_enabled", "morning_time", "Доброе утро · Ритм", "на утро"),
        ("afternoon", "afternoon_enabled", "afternoon_time", "Дневной ритм", "на день"),
        ("evening", "evening_enabled", "evening_time", "Вечерний ритуал · Ритм", "на вечер"),
    )
    for period, enabled_key, time_key, title_text, period_phrase in period_specs:
        if not settings[enabled_key]:
            continue
        target_min = _hhmm_to_minutes(settings[time_key])
        if not _in_window(now_minutes, target_min, 25):
            continue

        pending_rows = records(
            db,
            """SELECT h.category, h.title
               FROM habits h
               LEFT JOIN habit_logs hl ON hl.habit_id = h.id AND hl.log_date = ?
               WHERE h.active = 1 AND h.period_of_day = ? AND COALESCE(hl.completed, 0) = 0
               ORDER BY h.sort_order ASC, h.id ASC""",
            (today_str, period),
        )
        pending_habits = sum(1 for r in pending_rows if r["category"] == "habit")
        pending_vitamins = sum(1 for r in pending_rows if r["category"] == "vitamin")

        needs_evening_note = False
        if period == "evening":
            g_row = record(db, "SELECT COUNT(*) AS cnt FROM gratitudes WHERE log_date = ?", (today_str,))
            r_row = record(db, "SELECT summary_note FROM day_reflections WHERE log_date = ?", (today_str,))
            has_gratitude = bool(g_row and int(g_row["cnt"]) > 0)
            has_reflection = bool(r_row and str(r_row["summary_note"] or "").strip())
            needs_evening_note = not has_gratitude and not has_reflection

        parts: list[str] = []
        if pending_habits > 0:
            parts.append(_plural_ru(pending_habits, "привычка", "привычки", "привычек"))
        if pending_vitamins > 0:
            parts.append(_plural_ru(pending_vitamins, "витамин", "витамина", "витаминов"))

        if parts:
            body_text = f"Осталось {' и '.join(parts)} {period_phrase}."
            if needs_evening_note:
                body_text += " Загляните также в благодарности и итог дня."
            _dispatch_if_new(
                db,
                dedupe_key=f"{period}_habits:{today_str}",
                kind=f"{period}_habits",
                title=title_text,
                body=body_text,
                url="/?tab=habits&sub=habits",
                tab="habits",
                sub="habits",
                tag=f"ritm-{period}",
                dispatched=dispatched,
                skipped=skipped,
            )
        elif needs_evening_note:
            _dispatch_if_new(
                db,
                dedupe_key=f"{period}_habits:{today_str}",
                kind=f"{period}_habits",
                title=title_text,
                body="Запишите благодарность и пару строк в итог дня перед сном.",
                url="/?tab=today&sub=gratitude",
                tab="today",
                sub="gratitude",
                tag=f"ritm-{period}",
                dispatched=dispatched,
                skipped=skipped,
            )
        else:
            skipped.append(f"{period}_habits:all_done")

    # 2. Water reminders (10:00..19:30 at water_interval_hours slots)
    if settings["water_enabled"]:
        interval_min = int(settings["water_interval_hours"]) * 60
        slot_min = 10 * 60
        while slot_min <= 19 * 60 + 30:
            if _in_window(now_minutes, slot_min, 25):
                goal_row = record(db, "SELECT daily_goal_ml FROM water_settings WHERE id = 1")
                goal_ml = int(goal_row["daily_goal_ml"]) if goal_row else 2000
                sum_row = record(
                    db,
                    "SELECT COALESCE(SUM(amount_ml), 0) AS total_ml FROM water_logs WHERE log_date = ?",
                    (today_str,),
                )
                total_ml = int(sum_row["total_ml"]) if sum_row else 0
                slot_hhmm = f"{slot_min // 60:02d}:{slot_min % 60:02d}"
                if total_ml < goal_ml:
                    remaining = goal_ml - total_ml
                    _dispatch_if_new(
                        db,
                        dedupe_key=f"water:{today_str}:{slot_hhmm}",
                        kind="water",
                        title="Время выпить воды",
                        body=f"Сегодня выпито {total_ml} из {goal_ml} мл — осталось {remaining} мл.",
                        url="/?tab=habits&sub=habits",
                        tab="habits",
                        sub="habits",
                        tag="ritm-water",
                        dispatched=dispatched,
                        skipped=skipped,
                    )
                else:
                    skipped.append(f"water:{slot_hhmm}:goal_reached")
                break
            slot_min += interval_min

    # 3. Calendar events today within [now, now + events_lead_minutes + 15m]
    if settings["events_enabled"]:
        lead_max = now_minutes + int(settings["events_lead_minutes"]) + 15
        event_rows = records(
            db,
            """SELECT id, title, event_time, location
               FROM calendar_events
               WHERE event_date = ? AND completed = 0 AND event_time != ''
               ORDER BY event_time ASC, id ASC""",
            (today_str,),
        )
        for ev in event_rows:
            ev_time = str(ev["event_time"] or "").strip()
            if not _HHMM_RE.match(ev_time):
                continue
            ev_min = _hhmm_to_minutes(ev_time)
            if now_minutes <= ev_min <= lead_max:
                mins_left = ev_min - now_minutes
                loc = str(ev["location"] or "").strip()
                loc_suffix = f" · {loc}" if loc else ""
                body_text = (
                    f"Начало через {mins_left} мин{loc_suffix}."
                    if mins_left > 0
                    else f"Начинается сейчас{loc_suffix}."
                )
                _dispatch_if_new(
                    db,
                    dedupe_key=f"event:{ev['id']}:{today_str}",
                    kind="event",
                    title=f"Событие в {ev_time}: {ev['title']}",
                    body=body_text,
                    url="/?tab=goals&sub=calendar",
                    tab="goals",
                    sub="calendar",
                    tag=f"ritm-event-{ev['id']}",
                    dispatched=dispatched,
                    skipped=skipped,
                )

    # 4. Female Cycle upcoming warning around 10:00..10:30
    if settings["cycle_enabled"] and (10 * 60 <= now_minutes <= 10 * 60 + 30):
        snap = compute_cycle_snapshot(db, today_str)
        days_until = snap.get("days_until_period")
        if days_until is not None and 1 <= int(days_until) <= int(settings["cycle_days_before"]):
            days_phrase = _plural_ru(int(days_until), "день", "дня", "дней")
            next_start = snap.get("next_period_date") or ""
            _dispatch_if_new(
                db,
                dedupe_key=f"cycle:{today_str}",
                kind="cycle",
                title="Прогноз цикла · Ритм",
                body=f"По прогнозу новый цикл начнётся через {days_phrase} ({next_start}). Берегите себя.",
                url="/?tab=habits&sub=cycle",
                tab="habits",
                sub="cycle",
                tag="ritm-cycle",
                dispatched=dispatched,
                skipped=skipped,
            )

    # 5. Weekly Goals check-in on goals_weekday within 0..25 min after goals_time
    if (
        settings["goals_enabled"]
        and weekday == int(settings["goals_weekday"])
        and _in_window(now_minutes, _hhmm_to_minutes(settings["goals_time"]), 25)
    ):
        g_cnt = record(db, "SELECT COUNT(*) AS cnt FROM goals WHERE status = 'active'")
        active_goals = int(g_cnt["cnt"]) if g_cnt else 0
        if active_goals > 0:
            goals_phrase = _plural_ru(active_goals, "активная цель", "активные цели", "активных целей")
            _dispatch_if_new(
                db,
                dedupe_key=f"goals_checkin:{today_str}",
                kind="goals_checkin",
                title="Еженедельный чек-ин по целям",
                body=f"У вас {goals_phrase} — уделите 2 минуты, чтобы отметить прогресс.",
                url="/?tab=goals",
                tab="goals",
                sub="",
                tag="ritm-goals",
                dispatched=dispatched,
                skipped=skipped,
            )
        else:
            skipped.append("goals_checkin:no_active_goals")

    return {
        "ok": True,
        "active_subscriptions": active_subs,
        "dispatched": dispatched,
        "skipped": skipped,
    }
