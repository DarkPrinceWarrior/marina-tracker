"""Comprehensive API integration tests for Marina Tracker («Ритм»)."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
import importlib

from fastapi.testclient import TestClient
import pytest


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Provide an isolated FastAPI TestClient backed by a fresh temp SQLite DB."""
    db_file = tmp_path / "marina_test.sqlite3"
    monkeypatch.setenv("MARINA_DB_PATH", str(db_file))

    import app.main as app_main

    importlib.reload(app_main)
    with TestClient(app_main.app) as test_client:
        yield test_client


# ---------------------------------------------------------------------------
# 0. Health, SPA Root, PWA Assets & Seed Idempotency
# ---------------------------------------------------------------------------


def test_health_and_pwa_assets(client: TestClient):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "marina-tracker"
    date.fromisoformat(body["today"])

    # SPA root returns 200 HTML with iPhone PWA meta tags when dist/ is built
    root_res = client.get("/")
    assert root_res.status_code == 200
    if "text/html" in root_res.headers.get("content-type", ""):
        assert 'apple-mobile-web-app-capable' in root_res.text
        assert 'viewport-fit=cover' in root_res.text

    # Unknown API route must return 404, never SPA fallback
    missing_api = client.get("/api/definitely-missing-endpoint")
    assert missing_api.status_code == 404

    # Manifest
    manifest_res = client.get("/manifest.webmanifest")
    assert manifest_res.status_code == 200
    assert "manifest+json" in manifest_res.headers.get("content-type", "")
    manifest = manifest_res.json()
    assert manifest["display"] == "standalone"
    assert len(manifest.get("icons", [])) >= 2

    # Service Worker
    sw_res = client.get("/sw.js")
    assert sw_res.status_code == 200
    assert "javascript" in sw_res.headers.get("content-type", "")
    assert "no-cache" in sw_res.headers.get("cache-control", "")
    assert sw_res.headers.get("service-worker-allowed") == "/"

    # Brand PNG & SVG icons
    png_icons = [
        "/icons/apple-touch-icon.png",
        "/icons/icon-192.png",
        "/icons/icon-512.png",
        "/icons/icon-512-maskable.png",
    ]
    for icon_path in png_icons:
        icon_res = client.get(icon_path)
        assert icon_res.status_code == 200, f"Missing icon: {icon_path}"
        assert icon_res.content[:8] == b"\x89PNG\r\n\x1a\n", f"Invalid PNG: {icon_path}"

    svg_res = client.get("/icons/icon.svg")
    assert svg_res.status_code == 200
    assert "<svg" in svg_res.text


def test_seed_is_idempotent(client: TestClient):
    from contextlib import closing
    from app.db import connect
    from app.seed import seed_if_empty

    before_habits = len(client.get("/api/habits").json()["items"])
    before_menu = client.get("/api/nutrition/menu").json()["total"]
    before_goals = len(client.get("/api/goals").json()["items"])

    with closing(connect()) as db:
        seed_if_empty(db)

    assert len(client.get("/api/habits").json()["items"]) == before_habits
    assert client.get("/api/nutrition/menu").json()["total"] == before_menu
    assert len(client.get("/api/goals").json()["items"]) == before_goals


def test_seeded_copy_has_no_english_leaks(client: TestClient):
    """Ensure all user-visible Russian seeded content is free of leaked English tokens."""
    import re

    today = client.get("/api/health").json()["today"]
    corpus_parts: list[str] = []

    for h in client.get(f"/api/habits?date={today}").json()["items"]:
        corpus_parts.extend([h["title"], h.get("dose_or_note", "")])
    for t in client.get(f"/api/tasks?date={today}").json()["items"]:
        corpus_parts.append(t["title"])
    for g in client.get("/api/goals").json()["items"]:
        corpus_parts.extend([g["title"], g.get("description", ""), g.get("category", "")])
        for m in g.get("milestones", []):
            corpus_parts.append(m["title"])
        for c in g.get("checkins", []):
            corpus_parts.append(c.get("note", ""))
    for m in client.get("/api/nutrition/menu").json()["items"]:
        corpus_parts.extend([m["name"], m.get("category", "")])
    for ch in client.get(f"/api/home/chores?date={today}").json()["items"]:
        corpus_parts.extend([ch["title"], ch.get("zone", "")])
    for sh in client.get("/api/home/shopping").json()["items"]:
        corpus_parts.extend([sh["name"], sh.get("category", "")])
    for gr in client.get(f"/api/gratitudes?date={today}&days=60").json()["recent"]:
        corpus_parts.append(gr["content"])
    dt_today = date.fromisoformat(today)
    for ev in client.get(f"/api/events?year={dt_today.year}&month={dt_today.month}").json()["upcoming"]:
        corpus_parts.extend([ev["title"], ev.get("location", ""), ev.get("note", "")])
    for w in client.get(f"/api/wishes?year={dt_today.year}").json()["items"]:
        corpus_parts.extend([w["title"], w.get("category", ""), w.get("note", "")])

    corpus = "\n".join(corpus_parts)
    leaked = re.findall(r"\b(?:Q[1-4]|A[12]|B[12]|C[12]|CILS|PWA|Todo|Failed to fetch)\b", corpus)
    assert not leaked, f"Leaked English tokens in seeded Russian data: {leaked}"


# ---------------------------------------------------------------------------
# 1. Today Overview & Reflection
# ---------------------------------------------------------------------------


def test_today_summary_and_reflection_persistence(client: TestClient):
    today = client.get("/api/health").json()["today"]

    res = client.get(f"/api/today?date={today}")
    assert res.status_code == 200
    data = res.json()
    assert data["date"] == today
    assert 0 <= data["overall_progress_pct"] <= 100
    assert data["greeting_period"] in {"morning", "afternoon", "evening"}

    summary = data["summary"]
    for key in ("habits", "water", "workouts", "nutrition", "tasks", "chores", "goals", "cycle"):
        assert key in summary, f"Missing summary block: {key}"

    assert summary["habits"]["total"] >= 6
    assert summary["water"]["goal_ml"] > 0
    assert summary["cycle"]["cycle_day"] >= 1
    assert summary["cycle"]["phase"] in {"menstruation", "follicular", "ovulation", "luteal"}
    assert isinstance(data["completed_feed"], list)
    assert len(data["completed_feed"]) >= 1

    # Invalid date returns 422
    assert client.get("/api/today?date=2026-99-99").status_code == 422

    # Save and reload daily reflection
    note_text = "Прекрасный день: сделала пилатес, выпила норму воды и разобрала задачи."
    put_res = client.put(
        "/api/today/reflection",
        json={
            "date": today,
            "summary_note": note_text,
            "energy_level": 5,
            "mood": "inspired",
        },
    )
    assert put_res.status_code == 200
    saved = put_res.json()
    assert saved["summary_note"] == note_text
    assert saved["energy_level"] == 5
    assert saved["mood"] == "inspired"

    reloaded = client.get(f"/api/today?date={today}").json()
    assert reloaded["reflection"]["summary_note"] == note_text
    assert reloaded["reflection"]["energy_level"] == 5
    assert reloaded["reflection"]["mood"] == "inspired"

    # Out-of-range energy level rejected
    bad_res = client.put(
        "/api/today/reflection",
        json={"date": today, "summary_note": "test", "energy_level": 7},
    )
    assert bad_res.status_code == 422


# ---------------------------------------------------------------------------
# 2. Habits & Vitamins
# ---------------------------------------------------------------------------


def test_habits_and_vitamins_grouped_toggle_streak_crud(client: TestClient):
    today_str = client.get("/api/health").json()["today"]
    today_dt = date.fromisoformat(today_str)

    res = client.get(f"/api/habits?date={today_str}")
    assert res.status_code == 200
    body = res.json()
    assert set(body["groups"].keys()) == {"morning", "afternoon", "evening"}
    assert len(body["groups"]["morning"]) >= 1
    assert len(body["groups"]["afternoon"]) >= 1
    assert len(body["groups"]["evening"]) >= 1

    categories = {item["category"] for item in body["items"]}
    assert {"habit", "vitamin"}.issubset(categories)
    assert body["summary"]["total"] == len(body["items"])
    assert body["summary"]["vitamins_total"] >= 2

    # Create custom vitamin in evening
    create_res = client.post(
        "/api/habits",
        json={
            "title": "Железо бисглицинат",
            "period_of_day": "evening",
            "category": "vitamin",
            "dose_or_note": "25 мг с витамином C",
            "icon": "pill",
            "color": "sage",
            "target_days_per_week": 7,
        },
    )
    assert create_res.status_code == 201
    created = create_res.json()
    habit_id = created["id"]
    assert created["category"] == "vitamin"
    assert created["period_of_day"] == "evening"
    assert created["dose_or_note"] == "25 мг с витамином C"

    # Patch title
    patch_res = client.patch(
        f"/api/habits/{habit_id}",
        json={"title": "Железо мягкое", "dose_or_note": "25 мг после ужина"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["title"] == "Железо мягкое"

    # Toggle across 3 consecutive days ending today -> verify streak >= 3
    for offset in (2, 1, 0):
        day_str = (today_dt - timedelta(days=offset)).isoformat()
        t_res = client.post(
            f"/api/habits/{habit_id}/toggle",
            json={"date": day_str, "completed": True},
        )
        assert t_res.status_code == 200

    check_res = client.get(f"/api/habits?date={today_str}").json()
    mine = next(item for item in check_res["items"] if item["id"] == habit_id)
    assert mine["completed"] is True
    assert mine["completed_at"]
    assert mine["streak_days"] >= 3
    assert mine["week_done"] >= 3

    # Toggle off for today -> preserves active 2-day streak from yesterday
    untoggle = client.post(
        f"/api/habits/{habit_id}/toggle",
        json={"date": today_str, "completed": False},
    )
    assert untoggle.status_code == 200
    assert untoggle.json()["completed"] is False
    assert untoggle.json()["streak_days"] == 2

    # Toggle off yesterday too -> streak drops to 0
    yesterday_str = (today_dt - timedelta(days=1)).isoformat()
    client.post(f"/api/habits/{habit_id}/toggle", json={"date": yesterday_str, "completed": False})
    after_break = client.get(f"/api/habits?date={today_str}").json()
    mine_after = next(item for item in after_break["items"] if item["id"] == habit_id)
    assert mine_after["streak_days"] == 0

    # Delete custom habit
    del_res = client.delete(f"/api/habits/{habit_id}")
    assert del_res.status_code == 200
    assert del_res.json()["deleted"] is True

    # Deleting again returns 404
    assert client.delete(f"/api/habits/{habit_id}").status_code == 404


# ---------------------------------------------------------------------------
# 3. Water Tracker
# ---------------------------------------------------------------------------


def test_water_log_undo_and_goal(client: TestClient):
    today = client.get("/api/health").json()["today"]

    initial = client.get(f"/api/water?date={today}")
    assert initial.status_code == 200
    start_data = initial.json()
    start_total = start_data["total_ml"]
    assert start_data["goal_ml"] > 0

    # Log +250 ml
    add_res = client.post(
        "/api/water/log",
        json={"date": today, "amount_ml": 250, "logged_at": "14:15"},
    )
    assert add_res.status_code == 201
    added = add_res.json()
    log_id = added["id"]
    assert added["total_ml"] == start_total + 250
    assert any(entry["id"] == log_id and entry["logged_at"] == "14:15" for entry in added["logs"])

    # Undo (delete) that entry
    del_res = client.delete(f"/api/water/log/{log_id}")
    assert del_res.status_code == 200
    undone = del_res.json()
    assert undone["deleted"] is True
    assert undone["total_ml"] == start_total

    # Missing log returns 404
    assert client.delete("/api/water/log/999999").status_code == 404

    # Update daily goal
    goal_res = client.put("/api/water/goal", json={"daily_goal_ml": 2400})
    assert goal_res.status_code == 200
    assert goal_res.json()["daily_goal_ml"] == 2400

    reloaded = client.get(f"/api/water?date={today}").json()
    assert reloaded["goal_ml"] == 2400

    # Invalid goal rejected
    assert client.put("/api/water/goal", json={"daily_goal_ml": 50}).status_code == 422


# ---------------------------------------------------------------------------
# 4. Workouts (Breathing, Pilates, Qigong, Custom)
# ---------------------------------------------------------------------------


def test_workouts_breathing_pilates_qigong_crud(client: TestClient):
    today = client.get("/api/health").json()["today"]

    initial = client.get(f"/api/workouts?date={today}&days=30")
    assert initial.status_code == 200
    body = initial.json()
    assert "day_items" in body and "recent_items" in body and "weekly_summary" in body

    created_ids: list[int] = []
    cases = [
        ("breathing", "", "Дыхательная практика", 10, "light"),
        ("pilates", "", "Пилатес", 35, "medium"),
        ("qigong", "", "Цигун", 25, "light"),
        ("other", "Растяжка спины", "Растяжка спины", 20, "medium"),
    ]
    for w_type, custom_label, expected_label, duration, intensity in cases:
        res = client.post(
            "/api/workouts",
            json={
                "log_date": today,
                "workout_type": w_type,
                "custom_label": custom_label,
                "duration_min": duration,
                "intensity": intensity,
                "mood": "calm",
                "note": f"Тест {w_type}",
                "logged_at": "18:00",
            },
        )
        assert res.status_code == 201
        item = res.json()
        assert item["workout_type"] == w_type
        assert item["label"] == expected_label
        assert item["duration_min"] == duration
        created_ids.append(item["id"])

    # Patch first created workout
    patch_res = client.patch(
        f"/api/workouts/{created_ids[0]}",
        json={"duration_min": 15, "intensity": "medium", "note": "Углублённое дыхание"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["duration_min"] == 15

    # Verify list includes all created workouts
    after = client.get(f"/api/workouts?date={today}&days=30").json()
    day_ids = {w["id"] for w in after["day_items"]}
    for cid in created_ids:
        assert cid in day_ids
    assert after["weekly_summary"]["total_sessions"] >= 4

    # Delete created workouts
    for cid in created_ids:
        d_res = client.delete(f"/api/workouts/{cid}")
        assert d_res.status_code == 200
        assert d_res.json()["deleted"] is True

    assert client.delete(f"/api/workouts/{created_ids[0]}").status_code == 404


# ---------------------------------------------------------------------------
# 5. Female Cycle Tracker (12+ Months History, Upsert/Delete, Predictions)
# ---------------------------------------------------------------------------


def test_cycle_12m_seeded_history_upsert_delete_predictions(client: TestClient):
    today_str = client.get("/api/health").json()["today"]
    today_dt = date.fromisoformat(today_str)

    res = client.get(f"/api/cycle/overview?year={today_dt.year}&month={today_dt.month}")
    assert res.status_code == 200
    data = res.json()

    # Must have 12+ months of seeded historical cycles
    history = data["history_12m"]
    assert len(history) >= 12, f"Expected >=12 cycles, got {len(history)}"
    oldest_start = min(date.fromisoformat(c["start_date"]) for c in history)
    newest_start = max(date.fromisoformat(c["start_date"]) for c in history)
    assert (newest_start - oldest_start).days >= 330, "Seeded cycles must span ~12 months"

    # Raw 400-day map must be populated for instant year navigation
    assert len(data["days_map_400d"]) >= 50

    # Predictions & computed stats
    stats = data["stats"]
    assert stats["tracked_cycles_count"] >= 12
    assert 20 <= stats["computed_avg_cycle_length"] <= 40
    assert 2 <= stats["computed_avg_period_length"] <= 10
    assert stats["current_phase"] in {"menstruation", "follicular", "ovulation", "luteal"}
    date.fromisoformat(stats["next_period_start"])
    date.fromisoformat(stats["ovulation_date"])
    assert len(data["predicted_period_dates"]) >= 3
    assert len(data["predicted_fertile_dates"]) >= 3

    # Query a month 8 months ago and verify historical logged days exist
    past_dt = today_dt - timedelta(days=240)
    past_res = client.get(f"/api/cycle/overview?year={past_dt.year}&month={past_dt.month}")
    assert past_res.status_code == 200
    assert len(past_res.json()["month_days"]) >= 3

    # Upsert a cycle day
    target_day = (today_dt - timedelta(days=1)).isoformat()
    put_res = client.put(
        f"/api/cycle/day/{target_day}",
        json={
            "is_period": True,
            "flow": "medium",
            "symptoms": ["cramps", "fatigue"],
            "mood": "calm",
            "note": "Тестовая запись цикла",
        },
    )
    assert put_res.status_code == 200
    saved_day = put_res.json()
    assert saved_day["is_period"] is True
    assert saved_day["flow"] == "medium"
    assert saved_day["symptoms"] == ["cramps", "fatigue"]

    # Delete (clear) that cycle day
    del_res = client.delete(f"/api/cycle/day/{target_day}")
    assert del_res.status_code == 200
    assert del_res.json()["deleted"] is True

    # Update cycle settings
    set_res = client.put(
        "/api/cycle/settings",
        json={"avg_cycle_length": 29, "avg_period_length": 5},
    )
    assert set_res.status_code == 200
    assert set_res.json() == {"avg_cycle_length": 29, "avg_period_length": 5}

    # Validation edge cases
    assert client.put("/api/cycle/day/bad-date", json={"is_period": True}).status_code == 422
    assert (
        client.put("/api/cycle/settings", json={"avg_cycle_length": 10, "avg_period_length": 5}).status_code
        == 422
    )


# ---------------------------------------------------------------------------
# 6. Nutrition & Menu Catalog + Meal Logs (Breakfast/Lunch/Dinner)
# ---------------------------------------------------------------------------


def test_nutrition_menu_catalog_and_meal_logs(client: TestClient):
    today = client.get("/api/health").json()["today"]

    # Menu catalog seeded + slot filter + Russian search (ё/е normalization)
    menu_res = client.get("/api/nutrition/menu")
    assert menu_res.status_code == 200
    menu_data = menu_res.json()
    assert menu_data["total"] >= 12

    bf_menu = client.get("/api/nutrition/menu?slot=breakfast").json()
    assert len(bf_menu["items"]) >= 2
    assert all(item["meal_slot"] in {"breakfast", "any"} for item in bf_menu["items"])

    # Add custom dish to menu
    new_dish_res = client.post(
        "/api/nutrition/menu",
        json={
            "name": "Сырники с греческим йогуртом и мёдом",
            "meal_slot": "breakfast",
            "default_portion": "3 шт",
            "default_grams": 210,
            "kcal": 340,
            "protein_g": 21.0,
            "fat_g": 11.0,
            "carbs_g": 36.0,
            "category": "Творожные завтраки",
            "is_favorite": True,
        },
    )
    assert new_dish_res.status_code == 201
    dish = new_dish_res.json()
    dish_id = dish["id"]

    # Search with 'е' matches 'мёдом'
    search_res = client.get("/api/nutrition/menu?q=медом").json()
    assert any(item["id"] == dish_id for item in search_res["items"])

    # Log breakfast, lunch, dinner with dish, amount, grams, eaten_at time
    meals_to_log = [
        ("breakfast", dish_id, dish["name"], 1.5, "порция", 315, "08:20", 510, "Свежие ягоды"),
        ("lunch", None, "Крем-суп из брокколи и индейка", 1.0, "порция", 320, "13:45", 420, ""),
        ("dinner", None, "Запечённая дорадо с овощами", 1.0, "порция", 280, "19:10", 390, "На пару"),
    ]
    logged_ids: list[int] = []
    for slot, mid, name, amt, unit, grams, eaten_at, kcal, note in meals_to_log:
        m_res = client.post(
            "/api/nutrition/meals",
            json={
                "log_date": today,
                "meal_slot": slot,
                "menu_item_id": mid,
                "dish_name": name,
                "amount_value": amt,
                "amount_unit": unit,
                "grams": grams,
                "eaten_at": eaten_at,
                "kcal": kcal,
                "note": note,
                "completed": True,
            },
        )
        assert m_res.status_code == 201
        m_item = m_res.json()
        assert m_item["meal_slot"] == slot
        assert m_item["grams"] == grams
        assert m_item["eaten_at"] == eaten_at
        logged_ids.append(m_item["id"])

    # Verify day grouping & totals
    day_res = client.get(f"/api/nutrition/day?date={today}")
    assert day_res.status_code == 200
    day_data = day_res.json()
    assert set(day_data["slots"].keys()) == {"breakfast", "lunch", "dinner", "snack"}
    assert any(m["id"] == logged_ids[0] for m in day_data["slots"]["breakfast"])
    assert any(m["id"] == logged_ids[1] for m in day_data["slots"]["lunch"])
    assert any(m["id"] == logged_ids[2] for m in day_data["slots"]["dinner"])
    assert {"breakfast", "lunch", "dinner"}.issubset(set(day_data["totals"]["slots_completed"]))
    assert len(day_data["recent_7d"]) == 7

    # Edit meal grams & time
    patch_meal = client.patch(
        f"/api/nutrition/meals/{logged_ids[0]}",
        json={"grams": 250, "eaten_at": "08:35", "kcal": 400},
    )
    assert patch_meal.status_code == 200
    assert patch_meal.json()["grams"] == 250
    assert patch_meal.json()["eaten_at"] == "08:35"

    # Cleanup meals & custom dish
    for mid in logged_ids:
        assert client.delete(f"/api/nutrition/meals/{mid}").status_code == 200
    assert client.delete(f"/api/nutrition/menu/{dish_id}").status_code == 200
    assert client.delete(f"/api/nutrition/menu/{dish_id}").status_code == 404


# ---------------------------------------------------------------------------
# 7. Daily Tasks CRUD + Toggle + Reschedule
# ---------------------------------------------------------------------------


def test_tasks_crud_toggle_and_reschedule(client: TestClient):
    today_str = client.get("/api/health").json()["today"]
    tomorrow_str = (date.fromisoformat(today_str) + timedelta(days=1)).isoformat()

    # Create task
    create_res = client.post(
        "/api/tasks",
        json={
            "title": "Разобрать зимний гардероб",
            "task_date": today_str,
            "time_slot": "16:00",
            "priority": "high",
            "section_tag": "home",
        },
    )
    assert create_res.status_code == 201
    task = create_res.json()
    task_id = task["id"]
    assert task["completed"] is False

    # Update task
    patch_res = client.patch(
        f"/api/tasks/{task_id}",
        json={"title": "Разобрать гардероб и отдать лишнее", "priority": "medium"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["priority"] == "medium"

    # Toggle completed -> True
    t1 = client.post(f"/api/tasks/{task_id}/toggle")
    assert t1.status_code == 200
    assert t1.json()["completed"] is True
    assert t1.json()["completed_at"]

    # Filter status=completed includes it; status=active excludes it
    comp_ids = {t["id"] for t in client.get(f"/api/tasks?date={today_str}&status=completed").json()["items"]}
    act_ids = {t["id"] for t in client.get(f"/api/tasks?date={today_str}&status=active").json()["items"]}
    assert task_id in comp_ids
    assert task_id not in act_ids

    # Toggle back -> False
    t2 = client.post(f"/api/tasks/{task_id}/toggle", json={"completed": False})
    assert t2.status_code == 200
    assert t2.json()["completed"] is False

    # Reschedule to tomorrow (+1 day)
    resc = client.post(f"/api/tasks/{task_id}/reschedule", json={"days": 1})
    assert resc.status_code == 200
    assert resc.json()["task_date"] == tomorrow_str

    today_ids = {t["id"] for t in client.get(f"/api/tasks?date={today_str}").json()["items"]}
    tomorrow_ids = {t["id"] for t in client.get(f"/api/tasks?date={tomorrow_str}").json()["items"]}
    assert task_id not in today_ids
    assert task_id in tomorrow_ids

    # Delete task
    assert client.delete(f"/api/tasks/{task_id}").status_code == 200
    assert client.delete(f"/api/tasks/{task_id}").status_code == 404

    # Regression: creating a task with time_slot=None must succeed (coerced to "")
    null_slot_res = client.post(
        "/api/tasks",
        json={
            "title": "Задача без времени",
            "task_date": today_str,
            "time_slot": None,
            "priority": "low",
            "section_tag": "personal",
        },
    )
    assert null_slot_res.status_code == 201
    assert null_slot_res.json()["time_slot"] == ""
    assert client.delete(f"/api/tasks/{null_slot_res.json()['id']}").status_code == 200


# ---------------------------------------------------------------------------
# 8. Multi-Year Goals (1-5 Years), Milestones, Check-ins, Pace Watcher & Linked Habit
# ---------------------------------------------------------------------------


def test_goals_crud_milestones_checkins_pace_and_linked_habit(client: TestClient):
    today_str = client.get("/api/health").json()["today"]
    today_dt = date.fromisoformat(today_str)

    # Seeded multi-year goals exist with pace statuses and linked habit stats
    goals_res = client.get("/api/goals")
    assert goals_res.status_code == 200
    g_data = goals_res.json()
    assert len(g_data["items"]) >= 3
    assert g_data["summary"]["active_count"] >= 3

    pace_values = {g["pace_status"] for g in g_data["items"]}
    assert pace_values.issubset({"on_track", "attention", "ahead"})
    assert any(g["linked_habit"] is not None for g in g_data["items"])
    linked_goal = next(g for g in g_data["items"] if g["linked_habit"] is not None)
    assert "completions_30d" in linked_goal["linked_habit"]
    assert "rate_30d_pct" in linked_goal["linked_habit"]

    # Pick an existing habit to link to a new 3-year goal
    first_habit_id = client.get(f"/api/habits?date={today_str}").json()["items"][0]["id"]

    # Create 3-year goal with milestones
    create_res = client.post(
        "/api/goals",
        json={
            "title": "Свободный итальянский уровня B2",
            "description": "Ежедневная практика 20 минут и поездки в Италию",
            "category": "Личностный рост",
            "horizon_years": 3,
            "start_date": today_str,
            "target_date": date(today_dt.year + 3, today_dt.month, min(today_dt.day, 28)).isoformat(),
            "progress_pct": 5,
            "linked_habit_id": first_habit_id,
            "check_in_cadence": "weekly",
            "milestones": [
                {"title": "Уровень A2", "target_year": today_dt.year + 1, "target_quarter": "Q2"},
                {"title": "Уровень B1", "target_year": today_dt.year + 2, "target_quarter": "Q2"},
            ],
        },
    )
    assert create_res.status_code == 201
    goal = create_res.json()
    goal_id = goal["id"]
    assert goal["horizon_years"] == 3
    assert len(goal["milestones"]) == 2
    assert goal["linked_habit"]["id"] == first_habit_id

    # Horizon filter 2-3 includes our 3-year goal
    h_res = client.get("/api/goals?horizon=2-3").json()
    assert any(g["id"] == goal_id for g in h_res["items"])

    # Add a 3rd milestone
    m_add = client.post(
        f"/api/goals/{goal_id}/milestones",
        json={"title": "Сертификат CILS B2", "target_year": today_dt.year + 3, "target_quarter": "Q4"},
    )
    assert m_add.status_code == 201
    new_mid = m_add.json()["id"]
    assert len(m_add.json()["goal"]["milestones"]) == 3

    # Toggle first milestone completed -> syncs progress_pct (~33%)
    first_mid = goal["milestones"][0]["id"]
    m_patch = client.patch(
        f"/api/goals/{goal_id}/milestones/{first_mid}",
        json={"completed": True},
    )
    assert m_patch.status_code == 200
    assert m_patch.json()["milestone"]["completed"] is True
    assert m_patch.json()["goal"]["progress_pct"] == 33

    # Perform a goal check-in -> updates progress_pct, last_checkin_at, pace_status becomes 'ahead'
    checkin_res = client.post(
        f"/api/goals/{goal_id}/checkins",
        json={
            "progress_pct": 40,
            "note": "Прошла первые 5 модулей и слушаю подкасты утром",
            "feeling": "inspired",
            "checkin_date": today_str,
        },
    )
    assert checkin_res.status_code == 201
    updated_goal = checkin_res.json()["goal"]
    assert updated_goal["progress_pct"] == 40
    assert updated_goal["last_checkin_at"] == today_str
    assert updated_goal["pace_status"] == "ahead"
    assert len(updated_goal["checkins"]) >= 1

    # Delete milestone & goal
    assert client.delete(f"/api/goals/{goal_id}/milestones/{new_mid}").status_code == 200
    assert client.delete(f"/api/goals/{goal_id}").status_code == 200
    assert client.delete(f"/api/goals/{goal_id}").status_code == 404


# ---------------------------------------------------------------------------
# 9. Home Chores & Shopping List
# ---------------------------------------------------------------------------


def test_home_chores_and_shopping_crud_toggle_clear(client: TestClient):
    today = client.get("/api/health").json()["today"]

    # Chores list
    chores_res = client.get(f"/api/home/chores?date={today}")
    assert chores_res.status_code == 200
    c_data = chores_res.json()
    assert len(c_data["items"]) >= 4
    assert isinstance(c_data["by_zone"], dict)

    # Create chore
    c_create = client.post(
        "/api/home/chores",
        json={"title": "Протереть зеркала", "zone": "Ванная", "frequency": "weekly"},
    )
    assert c_create.status_code == 201
    chore_id = c_create.json()["id"]

    # Patch chore
    c_patch = client.patch(
        f"/api/home/chores/{chore_id}",
        json={"title": "Протереть зеркала и полки", "frequency": "daily"},
    )
    assert c_patch.status_code == 200
    assert c_patch.json()["frequency"] == "daily"

    # Toggle chore completed -> sets last_completed_date & completed_at
    c_toggle = client.post(
        f"/api/home/chores/{chore_id}/toggle",
        json={"date": today, "completed": True},
    )
    assert c_toggle.status_code == 200
    toggled = c_toggle.json()
    assert toggled["completed"] is True
    assert toggled["last_completed_date"] == today
    assert toggled["completed_at"]

    # Delete chore
    assert client.delete(f"/api/home/chores/{chore_id}").status_code == 200
    assert client.delete(f"/api/home/chores/{chore_id}").status_code == 404

    # Shopping list
    shop_res = client.get("/api/home/shopping")
    assert shop_res.status_code == 200
    s_data = shop_res.json()
    assert s_data["summary"]["total"] >= 4

    # Add 2 shopping items (one to buy, one to keep unbought)
    s1 = client.post(
        "/api/home/shopping",
        json={"name": "Матча церемониальная", "category": "Бакалея", "quantity": "1 банка"},
    )
    s2 = client.post(
        "/api/home/shopping",
        json={"name": "Миндальное молоко", "category": "Молочное", "quantity": "2 л"},
    )
    assert s1.status_code == 201 and s2.status_code == 201
    id_bought = s1.json()["id"]
    id_keep = s2.json()["id"]

    # Mark first as bought
    s_patch = client.patch(f"/api/home/shopping/{id_bought}", json={"bought": True})
    assert s_patch.status_code == 200
    assert s_patch.json()["bought"] is True
    assert s_patch.json()["bought_at"]

    # Clear bought removes id_bought, keeps id_keep
    clear_res = client.post("/api/home/shopping/clear-bought")
    assert clear_res.status_code == 200
    assert clear_res.json()["cleared"] >= 1

    remaining_ids = {item["id"] for item in client.get("/api/home/shopping").json()["items"]}
    assert id_bought not in remaining_ids
    assert id_keep in remaining_ids

    # Delete kept item
    assert client.delete(f"/api/home/shopping/{id_keep}").status_code == 200
    assert client.delete(f"/api/home/shopping/{id_keep}").status_code == 404


# ---------------------------------------------------------------------------
# 10. Phase 4: Gratitudes, Events Calendar, 1m/1y/5y Mini-Goals & Shopping Split
# ---------------------------------------------------------------------------


def test_gratitudes_crud_and_today_summary(client: TestClient):
    today = client.get("/api/health").json()["today"]

    initial = client.get(f"/api/gratitudes?date={today}&days=30")
    assert initial.status_code == 200
    body = initial.json()
    assert body["total_count"] >= 4
    assert isinstance(body["items"], list)
    assert isinstance(body["recent"], list)

    create_res = client.post(
        "/api/gratitudes",
        json={"date": today, "content": "Спасибо за тёплое солнце и тихое утро", "category": "day"},
    )
    assert create_res.status_code == 201
    gr = create_res.json()
    gr_id = gr["id"]
    assert gr["category"] == "day"

    # Today summary exposes gratitudes_count and split shopping counts
    today_summary = client.get(f"/api/today?date={today}").json()["summary"]
    assert today_summary["gratitudes_count"] >= 1
    assert "shopping" in today_summary
    assert today_summary["shopping"]["groceries_remaining"] >= 1
    assert today_summary["shopping"]["household_remaining"] >= 1

    patch_res = client.patch(
        f"/api/gratitudes/{gr_id}",
        json={"content": "Спасибо за спокойное утро и вкусный завтрак", "category": "self"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["category"] == "self"

    assert client.delete(f"/api/gratitudes/{gr_id}").status_code == 200
    assert client.delete(f"/api/gratitudes/{gr_id}").status_code == 404


def test_calendar_events_crud_toggle_and_month_map(client: TestClient):
    today_str = client.get("/api/health").json()["today"]
    today_dt = date.fromisoformat(today_str)

    res = client.get(f"/api/events?year={today_dt.year}&month={today_dt.month}")
    assert res.status_code == 200
    data = res.json()
    assert len(data["upcoming"]) >= 3
    assert isinstance(data["month_days_map"], dict)

    create_res = client.post(
        "/api/events",
        json={
            "event_date": today_str,
            "event_time": "15:30",
            "title": "Приём у косметолога",
            "category": "beauty",
            "location": "Клиника на Патриарших",
            "note": "Увлажняющий уход",
        },
    )
    assert create_res.status_code == 201
    ev = create_res.json()
    ev_id = ev["id"]
    assert ev["completed"] is False

    patch_res = client.patch(
        f"/api/events/{ev_id}",
        json={"event_time": "16:00", "category": "doctor", "title": "Осмотр у врача"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["event_time"] == "16:00"

    tog = client.post(f"/api/events/{ev_id}/toggle", json={"completed": True})
    assert tog.status_code == 200
    assert tog.json()["completed"] is True
    assert tog.json()["completed_at"]

    assert client.delete(f"/api/events/{ev_id}").status_code == 200
    assert client.delete(f"/api/events/{ev_id}").status_code == 404


def test_goals_horizons_month_1y_5y_and_parent_mini_goals(client: TestClient):
    today_str = client.get("/api/health").json()["today"]
    today_dt = date.fromisoformat(today_str)

    # Seeded goals cover 1 месяц, 1 год, and 5 лет
    month_goals = client.get("/api/goals?horizon=month").json()["items"]
    year_goals = client.get("/api/goals?horizon=1y").json()["items"]
    five_goals = client.get("/api/goals?horizon=5y").json()["items"]
    assert len(month_goals) >= 2
    assert len(year_goals) >= 1
    assert len(five_goals) >= 1
    assert any(g.get("parent_goal_id") and g.get("parent_goal_title") for g in month_goals)
    assert any(len(g.get("mini_goals", [])) >= 1 for g in (year_goals + five_goals))

    # Create a 5-year big goal + linked 1-month mini-goal
    big = client.post(
        "/api/goals",
        json={
            "title": "Собственная студия дизайна",
            "category": "Карьера и проекты",
            "horizon_unit": "year",
            "horizon_years": 5,
            "start_date": today_str,
            "target_date": date(today_dt.year + 5, today_dt.month, min(today_dt.day, 28)).isoformat(),
        },
    )
    assert big.status_code == 201
    big_id = big.json()["id"]

    mini = client.post(
        "/api/goals",
        json={
            "title": "Собрать портфолио из 3 проектов",
            "category": "Карьера и проекты",
            "horizon_unit": "month",
            "horizon_years": 1,
            "parent_goal_id": big_id,
            "start_date": today_str,
            "target_date": (today_dt + timedelta(days=30)).isoformat(),
        },
    )
    assert mini.status_code == 201
    mini_data = mini.json()
    assert mini_data["horizon_unit"] == "month"
    assert mini_data["parent_goal_id"] == big_id
    assert mini_data["parent_goal_title"] == "Собственная студия дизайна"

    # Parent big goal now lists the mini-goal in mini_goals
    all_5y = client.get("/api/goals?horizon=5y").json()["items"]
    fetched_big = next(g for g in all_5y if g["id"] == big_id)
    assert any(m["id"] == mini_data["id"] for m in fetched_big["mini_goals"])

    assert client.delete(f"/api/goals/{mini_data['id']}").status_code == 200
    assert client.delete(f"/api/goals/{big_id}").status_code == 200


def test_shopping_groceries_vs_household_strict_isolation(client: TestClient):
    groc = client.get("/api/home/shopping?list_type=groceries").json()
    house = client.get("/api/home/shopping?list_type=household").json()
    assert groc["summary"]["total"] >= 4
    assert house["summary"]["total"] >= 4
    assert {i["id"] for i in groc["items"]}.isdisjoint({i["id"] for i in house["items"]})

    g_new = client.post(
        "/api/home/shopping",
        json={"name": "Спелый манго", "category": "Овощи и фрукты", "quantity": "2 шт", "list_type": "groceries"},
    ).json()
    h_new = client.post(
        "/api/home/shopping",
        json={"name": "Фильтр для пылесоса", "category": "Бытовая техника", "quantity": "1 шт", "list_type": "household"},
    ).json()

    # Mark both bought
    client.patch(f"/api/home/shopping/{g_new['id']}", json={"bought": True})
    client.patch(f"/api/home/shopping/{h_new['id']}", json={"bought": True})

    # Clear ONLY groceries bought -> household bought item must stay untouched!
    clr_g = client.post("/api/home/shopping/clear-bought?list_type=groceries")
    assert clr_g.status_code == 200
    g_ids_after = {i["id"] for i in client.get("/api/home/shopping?list_type=groceries").json()["items"]}
    h_ids_after = {i["id"] for i in client.get("/api/home/shopping?list_type=household").json()["items"]}
    assert g_new["id"] not in g_ids_after
    assert h_new["id"] in h_ids_after

    # Now clear household bought -> removes h_new cleanly
    clr_h = client.post("/api/home/shopping/clear-bought", json={"list_type": "household"})
    assert clr_h.status_code == 200
    h_ids_final = {i["id"] for i in client.get("/api/home/shopping?list_type=household").json()["items"]}
    assert h_new["id"] not in h_ids_final


# ---------------------------------------------------------------------------
# 11. Phase 5: Dual Postgres/SQLite Layer & Native Web Push Notifications
# ---------------------------------------------------------------------------


def test_postgres_sql_translation_and_schema(client: TestClient):
    from app.db import PG_SCHEMA, translate_sql_for_postgres

    # Health exposes active db_backend
    health = client.get("/api/health").json()
    assert health["db_backend"] == "sqlite"

    # ? outside quotes -> %s, while ? inside single-quoted string literals is preserved
    sql1, ret1 = translate_sql_for_postgres(
        "SELECT * FROM tasks WHERE title = 'Что купить?' AND id = ? AND note LIKE '%50%%'"
    )
    assert "'Что купить?'" in sql1
    assert "AND id = %s" in sql1
    assert ret1 is False

    # INSERT OR IGNORE -> INSERT INTO ... ON CONFLICT DO NOTHING
    sql2, ret2 = translate_sql_for_postgres(
        "INSERT OR IGNORE INTO water_settings (id, daily_goal_ml) VALUES (1, ?)"
    )
    assert "INSERT OR IGNORE" not in sql2
    assert "ON CONFLICT DO NOTHING" in sql2
    assert "%s" in sql2
    assert ret2 is False

    # INSERT into ID_PK_TABLES appends RETURNING id
    sql3, ret3 = translate_sql_for_postgres(
        "INSERT INTO tasks (task_date, title, created_at) VALUES (?, ?, ?)"
    )
    assert sql3.rstrip().endswith("RETURNING id")
    assert ret3 is True

    # Non-id PK table (day_reflections) does NOT append RETURNING id
    sql4, ret4 = translate_sql_for_postgres(
        "INSERT INTO day_reflections (log_date, summary_note, updated_at) VALUES (?, ?, ?)"
    )
    assert "RETURNING id" not in sql4
    assert ret4 is False

    # PG_SCHEMA defines all core + Phase 4 + Phase 5 tables
    for table in (
        "habits",
        "habit_logs",
        "water_settings",
        "water_logs",
        "workouts",
        "cycle_settings",
        "cycle_days",
        "menu_items",
        "meal_logs",
        "tasks",
        "goals",
        "goal_milestones",
        "goal_checkins",
        "chores",
        "chore_logs",
        "shopping_items",
        "day_reflections",
        "gratitudes",
        "calendar_events",
        "push_subscriptions",
        "notification_settings",
        "push_deliveries",
    ):
        assert f"CREATE TABLE IF NOT EXISTS {table}" in PG_SCHEMA, f"Missing {table} in PG_SCHEMA"


def test_push_config_subscribe_settings_and_mocked_test_push(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    import json
    from unittest.mock import MagicMock
    import app.routes.push as push_mod

    # Unconfigured by default
    monkeypatch.delenv("VAPID_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)
    monkeypatch.delenv("PUSH_CRON_SECRET", raising=False)

    cfg0 = client.get("/api/push/config")
    assert cfg0.status_code == 200
    assert cfg0.json()["configured"] is False
    assert "vapid_private_key" not in cfg0.text.lower()
    assert "push_cron_secret" not in cfg0.text.lower()

    # Test push returns clear Russian 400 when VAPID is not configured
    assert client.post("/api/push/test").status_code == 400

    # Configure VAPID env vars (never leaked by /api/push/config)
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "BTestPublicKeyBase64UrlExample1234567890")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "SECRET-PRIVATE-KEY-DO-NOT-LEAK")
    monkeypatch.setenv("PUSH_CRON_SECRET", "SECRET-CRON-TOKEN-DO-NOT-LEAK")

    cfg1 = client.get("/api/push/config")
    assert cfg1.status_code == 200
    assert cfg1.json()["configured"] is True
    assert "SECRET-PRIVATE-KEY" not in cfg1.text
    assert "SECRET-CRON-TOKEN" not in cfg1.text

    # Subscribe (idempotent upsert on endpoint)
    ep = "https://web.push.apple.com/QTestEndpoint123"
    sub1 = client.post(
        "/api/push/subscribe",
        json={
            "endpoint": ep,
            "keys": {"p256dh": "p256dh-key-1", "auth": "auth-key-1"},
            "device_label": "iPhone 13",
            "user_agent": "Safari",
        },
    )
    assert sub1.status_code == 200
    assert sub1.json()["ok"] is True
    assert sub1.json()["subscriptions_count"] == 1

    # Re-subscribe same endpoint updates label without creating duplicate
    sub2 = client.post(
        "/api/push/subscribe",
        json={
            "endpoint": ep,
            "keys": {"p256dh": "p256dh-key-2", "auth": "auth-key-2"},
            "device_label": "iPhone 13 Марины",
        },
    )
    assert sub2.status_code == 200
    assert sub2.json()["subscriptions_count"] == 1

    # Update & validate notification settings
    put_set = client.put(
        "/api/push/settings",
        json={
            "enabled": True,
            "morning_time": "08:15",
            "water_interval_hours": 2,
            "events_lead_minutes": 30,
            "cycle_days_before": 3,
            "goals_weekday": 5,
            "quiet_start": "23:00",
            "quiet_end": "07:00",
        },
    )
    assert put_set.status_code == 200
    saved_s = put_set.json()
    assert saved_s["morning_time"] == "08:15"
    assert saved_s["water_interval_hours"] == 2
    assert saved_s["events_lead_minutes"] == 30
    assert saved_s["cycle_days_before"] == 3
    assert saved_s["goals_weekday"] == 5

    # Invalid settings rejected with 422
    assert client.put("/api/push/settings", json={"morning_time": "25:99"}).status_code == 422
    assert client.put("/api/push/settings", json={"water_interval_hours": 7}).status_code == 422

    # Mock pywebpush.webpush -> verify /api/push/test sends Russian payload
    mock_webpush = MagicMock()
    monkeypatch.setattr(push_mod, "webpush", mock_webpush)
    test_res = client.post("/api/push/test")
    assert test_res.status_code == 200
    assert test_res.json()["sent"] == 1
    assert mock_webpush.call_count == 1
    sent_payload = json.loads(mock_webpush.call_args.kwargs["data"])
    assert "Уведомления работают" in sent_payload["title"]

    # Unsubscribe deactivates device
    unsub = client.post("/api/push/unsubscribe", json={"endpoint": ep})
    assert unsub.status_code == 200
    assert unsub.json()["subscriptions_count"] == 0


def test_push_dispatch_auth_quiet_hours_and_deduplication(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    from datetime import datetime
    from unittest.mock import MagicMock
    from zoneinfo import ZoneInfo
    import app.routes.push as push_mod

    monkeypatch.setenv("VAPID_PUBLIC_KEY", "BTestPublicKeyBase64UrlExample1234567890")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "TEST-PRIVATE-KEY")
    monkeypatch.setenv("PUSH_CRON_SECRET", "cron-secret-xyz")

    # Add an active subscription
    client.post(
        "/api/push/subscribe",
        json={
            "endpoint": "https://web.push.apple.com/QDispatchEndpoint",
            "keys": {"p256dh": "k1", "auth": "a1"},
            "device_label": "iPhone",
        },
    )

    # Missing or wrong secret -> 401
    assert client.post("/api/push/dispatch").status_code == 401
    assert (
        client.post("/api/push/dispatch", headers={"Authorization": "Bearer wrong"}).status_code
        == 401
    )

    mock_webpush = MagicMock()
    monkeypatch.setattr(push_mod, "webpush", mock_webpush)

    # Ensure an incomplete morning habit exists so morning reminder fires at 08:35
    today_str = client.get("/api/health").json()["today"]
    client.post(
        "/api/habits",
        json={"title": "Утренний тест-ритуал", "period_of_day": "morning", "category": "habit"},
    )
    y, m, d = (int(x) for x in today_str.split("-"))
    moscow = ZoneInfo("Europe/Moscow")

    # 1. Quiet hours (23:15) -> 200 OK, 0 dispatched
    monkeypatch.setattr(push_mod, "now_dt", lambda: datetime(y, m, d, 23, 15, tzinfo=moscow))
    quiet_res = client.post(
        "/api/push/dispatch", headers={"Authorization": "Bearer cron-secret-xyz"}
    )
    assert quiet_res.status_code == 200
    assert quiet_res.json()["dispatched"] == []
    assert mock_webpush.call_count == 0

    # 2. Morning window (08:35, after 08:30 default) -> dispatches morning reminder ONCE
    monkeypatch.setattr(push_mod, "now_dt", lambda: datetime(y, m, d, 8, 35, tzinfo=moscow))
    first_res = client.post(
        "/api/push/dispatch", headers={"X-Cron-Secret": "cron-secret-xyz"}
    )
    assert first_res.status_code == 200
    body1 = first_res.json()
    assert len(body1["dispatched"]) >= 1
    assert any(item["kind"] == "morning_habits" for item in body1["dispatched"])
    calls_after_first = mock_webpush.call_count
    assert calls_after_first >= 1

    # 3. Second dispatch 5 min later (08:40) -> deduplicated via push_deliveries!
    monkeypatch.setattr(push_mod, "now_dt", lambda: datetime(y, m, d, 8, 40, tzinfo=moscow))
    second_res = client.post(
        "/api/push/dispatch", headers={"Authorization": "Bearer cron-secret-xyz"}
    )
    assert second_res.status_code == 200
    assert not any(item["kind"] == "morning_habits" for item in second_res.json()["dispatched"])
    assert mock_webpush.call_count == calls_after_first


# ---------------------------------------------------------------------------
# 12. Phase 6: 7 Canonical Goal Categories & Yearly Wishes («Список желаний»)
# ---------------------------------------------------------------------------


def test_goals_7_canonical_categories_filter(client: TestClient):
    canonical_7 = {
        "Здоровье и спорт",
        "Семья и отношения",
        "Друзья и социум",
        "Развлечения и отдых",
        "Хобби и увлечения",
        "Деньги и благосостояние",
        "Работа и бизнес",
    }

    all_goals = client.get("/api/goals").json()["items"]
    assert len(all_goals) >= 5
    for g in all_goals:
        assert g["category"] in canonical_7, f"Non-canonical goal category: {g['category']}"

    today_str = client.get("/api/health").json()["today"]
    today_dt = date.fromisoformat(today_str)

    created = client.post(
        "/api/goals",
        json={
            "title": "Провести 4 тёплых ужина с друзьями",
            "category": "Друзья и социум",
            "horizon_unit": "month",
            "horizon_years": 1,
            "start_date": today_str,
            "target_date": (today_dt + timedelta(days=30)).isoformat(),
        },
    )
    assert created.status_code == 201
    gid = created.json()["id"]

    filtered = client.get("/api/goals", params={"category": "Друзья и социум"}).json()["items"]
    assert any(g["id"] == gid for g in filtered)
    assert all(g["category"] == "Друзья и социум" for g in filtered)

    assert client.delete(f"/api/goals/{gid}").status_code == 200


def test_wishes_crud_toggle_and_year_filter(client: TestClient):
    from app.db import PG_SCHEMA, translate_sql_for_postgres

    assert "CREATE TABLE IF NOT EXISTS wishes" in PG_SCHEMA
    pg_sql, returns_id = translate_sql_for_postgres(
        "INSERT INTO wishes (target_year, title, category, created_at) VALUES (?, ?, ?, ?)"
    )
    assert returns_id is True and pg_sql.rstrip().endswith("RETURNING id")

    today_dt = date.fromisoformat(client.get("/api/health").json()["today"])
    year = today_dt.year

    # Seeded wishes for current year (6 total: 2 fulfilled + 4 active)
    initial = client.get(f"/api/wishes?year={year}")
    assert initial.status_code == 200
    body = initial.json()
    assert body["year"] == year
    assert body["summary"]["total"] >= 6
    assert body["summary"]["fulfilled"] >= 2
    assert isinstance(body["by_category"], dict)

    # Create wish
    c_res = client.post(
        "/api/wishes",
        json={
            "title": "Съездить на термальные источники осенью",
            "target_year": year,
            "category": "Развлечения и отдых",
            "note": "С баней и прогулкой в горах",
        },
    )
    assert c_res.status_code == 201
    wish = c_res.json()
    wid = wish["id"]
    assert wish["fulfilled"] is False

    # Patch wish
    p_res = client.patch(
        f"/api/wishes/{wid}",
        json={"category": "Здоровье и спорт", "title": "Выходные на термальных источниках"},
    )
    assert p_res.status_code == 200
    assert p_res.json()["category"] == "Здоровье и спорт"

    # Toggle fulfilled ON -> sets fulfilled_at
    t_on = client.post(f"/api/wishes/{wid}/toggle", json={"fulfilled": True})
    assert t_on.status_code == 200
    assert t_on.json()["fulfilled"] is True
    assert t_on.json()["fulfilled_at"] == today_dt.isoformat()

    # Toggle fulfilled OFF -> clears fulfilled_at
    t_off = client.post(f"/api/wishes/{wid}/toggle", json={"fulfilled": False})
    assert t_off.status_code == 200
    assert t_off.json()["fulfilled"] is False
    assert t_off.json()["fulfilled_at"] is None

    # Different year filter isolates cleanly
    next_yr = client.get(f"/api/wishes?year={year + 2}").json()
    assert all(w["id"] != wid for w in next_yr["items"])

    # Delete wish
    assert client.delete(f"/api/wishes/{wid}").status_code == 200
    assert client.delete(f"/api/wishes/{wid}").status_code == 404


# ---------------------------------------------------------------------------
# 13. Phase 7: Pure Russian Validation & 404 Error Responses
# ---------------------------------------------------------------------------


def test_validation_errors_are_pure_russian(client: TestClient):
    import re

    # Missing required fields -> 422 with pure Russian detail
    r1 = client.post("/api/tasks", json={})
    assert r1.status_code == 422
    detail1 = str(r1.json().get("detail", ""))
    assert detail1, "Empty 422 detail"
    assert not re.search(
        r"\b(Field required|String should|Input should|value is not|Not Found)\b",
        detail1,
        re.IGNORECASE,
    ), f"English validation error leaked: {detail1}"

    # Too-short string / invalid integer -> 422 Russian detail
    r2 = client.post("/api/wishes", json={"title": "", "target_year": "not-a-year"})
    assert r2.status_code == 422
    detail2 = str(r2.json().get("detail", ""))
    assert not re.search(
        r"\b(Field required|String should|Input should|unable to parse)\b",
        detail2,
        re.IGNORECASE,
    ), f"English validation error leaked: {detail2}"

    # Invalid API 404 -> Russian detail
    r3 = client.get("/api/nonexistent-endpoint-check")
    assert r3.status_code == 404
    detail3 = str(r3.json().get("detail", ""))
    assert "Not Found" not in detail3, f"English 404 leaked: {detail3}"
