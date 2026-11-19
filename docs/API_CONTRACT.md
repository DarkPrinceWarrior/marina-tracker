# Marina Tracker («Ритм») — API Contract

Base URL: `/api` (proxied in Vite dev to `http://127.0.0.1:8098`, served same-origin in production by FastAPI).
Content-Type: `application/json; charset=utf-8`.
Timezone: `Europe/Moscow` (`YYYY-MM-DD` for dates, `HH:MM` 24-hour for times, ISO-8601 for timestamps).

## Conventions

- All boolean flags are returned as JSON booleans (`true`/`false`), stored as `0`/`1` in SQLite.
- Invalid date format returns `422 Unprocessable Entity` with `{"detail": "..."}`.
- Missing resource returns `404 Not Found` with `{"detail": "..."}`.
- Empty/invalid payload fields return `422 Unprocessable Entity`.
- Database path is configurable via `MARINA_DB_PATH` (default: `data/marina_tracker.sqlite3`).

---

## 0. Health

### `GET /api/health`
Response `200`:
```json
{
  "status": "ok",
  "service": "marina-tracker",
  "today": "2026-11-19"
}
```

---

## 1. Today Overview & Daily Reflection (`app/routes/today.py`)

### `GET /api/today?date=YYYY-MM-DD`
`date` is optional (defaults to today in `Europe/Moscow`).

Response `200`:
```json
{
  "date": "2026-11-19",
  "today": "2026-11-19",
  "greeting_period": "morning",
  "overall_progress_pct": 62,
  "summary": {
    "habits": {
      "done": 5,
      "total": 9,
      "vitamins_done": 2,
      "vitamins_total": 3,
      "next_pending": {
        "id": 6,
        "title": "Магний B6",
        "category": "vitamin",
        "period_of_day": "evening",
        "dose_or_note": "400 мг перед сном"
      }
    },
    "water": {
      "total_ml": 1250,
      "goal_ml": 2000,
      "percent": 63
    },
    "workouts": {
      "count": 1,
      "total_minutes": 30,
      "latest": {
        "id": 1,
        "workout_type": "pilates",
        "custom_label": "",
        "label": "Пилатес",
        "duration_min": 30,
        "intensity": "medium",
        "logged_at": "08:30"
      }
    },
    "nutrition": {
      "meals_count": 2,
      "slots_done": ["breakfast", "lunch"],
      "total_kcal": 890,
      "total_grams": 540
    },
    "tasks": {
      "done": 2,
      "total": 5
    },
    "chores": {
      "done": 2,
      "total": 4,
      "shopping_remaining": 5
    },
    "shopping": {
      "household_remaining": 5,
      "groceries_remaining": 5,
      "remaining": 5,
      "total_remaining": 10
    },
    "gratitudes_count": 2,
    "goals": {
      "active_count": 3,
      "avg_progress_pct": 43,
      "needs_attention_count": 1
    },
    "cycle": {
      "cycle_day": 12,
      "phase": "follicular",
      "phase_label": "Фолликулярная фаза",
      "is_period_today": false,
      "last_period_start": "2026-11-08",
      "next_period_date": "2026-12-06",
      "days_until_period": 17,
      "avg_cycle_length": 28,
      "avg_period_length": 5
    }
  },
  "tasks": [],
  "completed_feed": [
    {
      "id": "habit-1",
      "domain": "habit",
      "title": "Стакан тёплой воды",
      "subtitle": "Утро",
      "time": "07:25"
    }
  ],
  "reflection": {
    "log_date": "2026-11-19",
    "summary_note": "",
    "energy_level": 4,
    "mood": "calm",
    "updated_at": "2026-11-19T10:15:00+03:00"
  }
}
```
`completed_feed[].domain` is one of: `"habit" | "vitamin" | "water" | "workout" | "meal" | "chore" | "task"`.

### `PUT /api/today/reflection`
Body:
```json
{
  "date": "2026-11-19",
  "summary_note": "Спокойное утро, сделала пилатес и закрыла рабочие задачи.",
  "energy_level": 4,
  "mood": "calm"
}
```
(`date` optional, defaults to today; `energy_level` `1..5` or `null`; `mood` optional string).
Response `200`: saved reflection object `{log_date, summary_note, energy_level, mood, updated_at}`.

### `GET /api/gratitudes?date=YYYY-MM-DD&days=30`
Response `200`:
```json
{
  "date": "2026-11-19",
  "items": [
    {"id": 1, "log_date": "2026-11-19", "content": "...", "category": "self", "created_at": "..."}
  ],
  "recent": [],
  "total_count": 4
}
```
`category`: `"self" | "people" | "day" | "body" | "other"`.

### `POST /api/gratitudes`
Body: `{date?, log_date?, content, category?}` -> Response `201`: `GratitudeItem`.

### `PATCH /api/gratitudes/{id}`
Body: `{date?, content?, category?}` -> Response `200`: `GratitudeItem`.

### `DELETE /api/gratitudes/{id}`
Response `200`: `{"deleted": true, "id": 1}`.

---

## 2. Daily Tasks (`app/routes/tasks_goals.py`)

### `GET /api/tasks?date=YYYY-MM-DD&status=all`
`status`: `"all" | "active" | "completed"`.
Response `200`:
```json
{
  "date": "2026-11-19",
  "items": [
    {
      "id": 1,
      "task_date": "2026-11-19",
      "title": "Записаться на осмотр к стоматологу",
      "time_slot": "10:30",
      "priority": "high",
      "section_tag": "health",
      "goal_id": null,
      "goal_title": null,
      "completed": false,
      "completed_at": null,
      "sort_order": 0,
      "created_at": "2026-11-19T08:00:00+03:00"
    }
  ],
  "done": 2,
  "total": 5
}
```
Enums:
- `priority`: `"low" | "medium" | "high"`
- `section_tag`: `"personal" | "work" | "health" | "home" | "goal"`

### `POST /api/tasks`
Body: `{title, task_date?, time_slot?, priority?, section_tag?, goal_id?, sort_order?}`
Response `201`: `TaskItem`.

### `PATCH /api/tasks/{id}`
Body (all optional): `{title?, task_date?, time_slot?, priority?, section_tag?, goal_id?, completed?, sort_order?}`
Response `200`: `TaskItem`.

### `POST /api/tasks/{id}/toggle`
Body (optional): `{completed?: boolean}` (flips if omitted).
Response `200`: `TaskItem`.

### `POST /api/tasks/{id}/reschedule`
Body: `{task_date?: "YYYY-MM-DD", days?: int}` (if `task_date` omitted, shifts current `task_date` by `days`, default `+1`).
Response `200`: `TaskItem`.

### `DELETE /api/tasks/{id}`
Response `200`: `{"deleted": true, "id": 1}`.

---

## 3. Goals (`1 месяц` / `1 год` / `5 лет`), Yearly Wishes & Calendar Events (`app/routes/tasks_goals.py`)

### Canonical 7 Goal & Wish Categories
`Здоровье и спорт`, `Семья и отношения`, `Друзья и социум`, `Развлечения и отдых`, `Хобби и увлечения`, `Деньги и благосостояние`, `Работа и бизнес`.

### `GET /api/goals?status=all&horizon=all&category=`
- `status`: `"all" | "active" | "completed" | "paused"`
- `horizon`: `"all" | "month" | "1y" | "5y"` (legacy `"1" | "2-3" | "5"` also accepted)
- `category`: optional exact Russian category name (or `"all"` / omitted for all)

Each `GoalDetail` additionally includes:
- `horizon_unit`: `"month" | "year"` (`1 месяц` stores `horizon_unit="month", horizon_years=1`; `1 год` stores `horizon_unit="year", horizon_years=1`; `5 лет` stores `horizon_unit="year", horizon_years=5`)
- `parent_goal_id`: `int | null`
- `parent_goal_title`: `str | null`
- `mini_goals`: `[{id, title, progress_pct, status, target_date, pace_status, pace_label, horizon_unit, horizon_years}]`

### `GET /api/wishes?year=2026&category=`
Response `200`:
```json
{
  "year": 2026,
  "items": [
    {
      "id": 1,
      "target_year": 2026,
      "title": "Съездить на выходные к морю без рабочего ноутбука",
      "category": "Развлечения и отдых",
      "note": "Три дня у воды и долгие прогулки",
      "fulfilled": true,
      "fulfilled_at": "2026-10-10",
      "sort_order": 1,
      "created_at": "..."
    }
  ],
  "summary": {"total": 6, "fulfilled": 2, "remaining": 4, "percent": 33},
  "by_category": {"Развлечения и отдых": []}
}
```

### `POST /api/wishes` (201) / `PATCH /api/wishes/{id}` / `POST /api/wishes/{id}/toggle` / `DELETE /api/wishes/{id}`
Full CRUD + fulfillment toggle (`fulfilled_at` set to `today_iso()` when fulfilled, else `null`).

### `GET /api/events?year=YYYY&month=MM&date=YYYY-MM-DD`
Response `200`:
```json
{
  "year": 2026,
  "month": 11,
  "today": "2026-11-19",
  "date": null,
  "items": [
    {
      "id": 1,
      "event_date": "2026-11-21",
      "event_time": "11:30",
      "title": "Запись к стоматологу",
      "category": "doctor",
      "location": "Клиника на Патриарших",
      "note": "Плановый осмотр и чистка",
      "completed": false,
      "completed_at": null,
      "created_at": "..."
    }
  ],
  "month_days_map": {"2026-11-21": []},
  "upcoming": []
}
```
`category`: `"doctor" | "beauty" | "meeting" | "event" | "personal" | "home"`.

### `POST /api/events` (201) / `PATCH /api/events/{id}` / `POST /api/events/{id}/toggle` / `DELETE /api/events/{id}`
Full CRUD + completion toggle for scheduled appointments and events.

Response `200`:
```json
{
  "items": [
    {
      "id": 1,
      "title": "Гибкое и сильное тело через регулярную практику",
      "description": "Пилатес, цигун и дыхание 4 раза в неделю без перерывов",
      "category": "Здоровье и тело",
      "horizon_years": 2,
      "start_date": "2026-01-15",
      "target_date": "2028-01-15",
      "progress_pct": 45,
      "expected_progress_pct": 42,
      "pace_status": "on_track",
      "pace_label": "В графике",
      "days_remaining": 422,
      "checkin_overdue": false,
      "days_since_checkin": 3,
      "linked_habit_id": 4,
      "linked_habit": {
        "id": 4,
        "title": "Утренняя растяжка и дыхание",
        "completions_30d": 22,
        "target_30d": 21,
        "rate_30d_pct": 100
      },
      "status": "active",
      "check_in_cadence": "weekly",
      "last_checkin_at": "2026-11-16",
      "created_at": "2026-01-15T10:00:00+03:00",
      "milestones": [
        {
          "id": 1,
          "goal_id": 1,
          "title": "100 тренировок за первый год",
          "target_year": 2026,
          "target_quarter": "Q4",
          "completed": true,
          "completed_at": "2026-10-28",
          "sort_order": 0
        }
      ],
      "checkins": [
        {
          "id": 1,
          "goal_id": 1,
          "checkin_date": "2026-11-16",
          "progress_pct": 45,
          "note": "Спина стала заметно свободнее, держу ритм 4 раза в неделю.",
          "feeling": "inspired",
          "created_at": "2026-11-16T20:10:00+03:00"
        }
      ]
    }
  ],
  "summary": {
    "active_count": 3,
    "completed_count": 0,
    "avg_progress_pct": 43,
    "needs_attention_count": 1,
    "due_checkin_count": 1
  }
}
```
Pace rules:
- `expected_progress_pct` = clamped elapsed fraction between `start_date` and `target_date` (`0..100`).
- `checkin_overdue` = true if `status == "active"` and days since `last_checkin_at` (or `start_date`) exceeds cadence (`weekly`: 7d, `biweekly`: 14d, `monthly`: 30d).
- `pace_status`:
  - `"ahead"` (`"Опережаю план"`) if `progress_pct >= expected_progress_pct + 8` and not overdue (or `progress_pct == 100`)
  - `"attention"` (`"Нужно внимание"`) if `progress_pct <= expected_progress_pct - 10` OR `checkin_overdue`
  - `"on_track"` (`"В графике"`) otherwise.

### `POST /api/goals`
Body:
```json
{
  "title": "Свободный итальянский уровня B2",
  "description": "...",
  "category": "Личностный рост",
  "horizon_years": 3,
  "start_date": "2026-11-19",
  "target_date": "2029-11-19",
  "progress_pct": 0,
  "linked_habit_id": null,
  "check_in_cadence": "weekly",
  "milestones": [
    {"title": "Уровень A2", "target_year": 2027, "target_quarter": "Q2"}
  ]
}
```
Response `201`: `GoalDetail`.

### `PATCH /api/goals/{id}`
Body (all optional): `{title?, description?, category?, horizon_years?, start_date?, target_date?, progress_pct?, linked_habit_id?, status?, check_in_cadence?}`
Response `200`: `GoalDetail`.

### `DELETE /api/goals/{id}`
Response `200`: `{"deleted": true, "id": 1}`.

### `POST /api/goals/{id}/milestones`
Body: `{title, target_year, target_quarter?, sort_order?}`
Response `201`: `{"id": 10, "milestone": MilestoneItem, "goal": GoalDetail}`.

### `PATCH /api/goals/{id}/milestones/{milestone_id}`
Body (all optional): `{title?, target_year?, target_quarter?, completed?, sort_order?}`
When `completed` changes, if milestones exist, updates goal `progress_pct` when `sync_progress` is true (default `true`).
Response `200`: `{"milestone": MilestoneItem, "goal": GoalDetail}`.

### `DELETE /api/goals/{id}/milestones/{milestone_id}`
Response `200`: `{"deleted": true, "id": 10, "goal": GoalDetail}`.

### `POST /api/goals/{id}/checkins`
Body: `{progress_pct: 0..100, note?: str, feeling?: str, checkin_date?: "YYYY-MM-DD"}`
Updates `goals.progress_pct` and `goals.last_checkin_at`.
Response `201`: `{"id": 5, "checkin": CheckinItem, "goal": GoalDetail}`.

---

## 4. Habits, Vitamins, Water & Workouts (`app/routes/habits.py`)

### `GET /api/habits?date=YYYY-MM-DD`
Response `200`:
```json
{
  "date": "2026-11-19",
  "groups": {
    "morning": [],
    "afternoon": [],
    "evening": []
  },
  "items": [
    {
      "id": 1,
      "title": "Стакан тёплой воды",
      "period_of_day": "morning",
      "category": "habit",
      "dose_or_note": "Натощак с лимоном",
      "icon": "droplets",
      "color": "sky",
      "target_days_per_week": 7,
      "active": true,
      "sort_order": 1,
      "completed": true,
      "completed_at": "07:25",
      "note": "",
      "streak_days": 6,
      "week_done": 6,
      "week_target": 7
    }
  ],
  "summary": {
    "done": 5,
    "total": 9,
    "vitamins_done": 2,
    "vitamins_total": 3,
    "percent": 56
  }
}
```
Enums:
- `period_of_day`: `"morning" | "afternoon" | "evening"`
- `category`: `"habit" | "vitamin"`

### `POST /api/habits`
Body: `{title, period_of_day, category?, dose_or_note?, icon?, color?, target_days_per_week?, sort_order?}`
Response `201`: `HabitItem`.

### `PATCH /api/habits/{id}`
Body (all optional): `{title?, period_of_day?, category?, dose_or_note?, icon?, color?, target_days_per_week?, active?, sort_order?}`
Response `200`: `HabitItem`.

### `DELETE /api/habits/{id}`
Response `200`: `{"deleted": true, "id": 1}`.

### `POST /api/habits/{id}/toggle`
Body: `{date?: "YYYY-MM-DD", completed?: boolean, note?: str}`
Response `200`: updated `HabitItem` for that date (with updated `completed`, `completed_at`, `streak_days`, `week_done`).

### `GET /api/water?date=YYYY-MM-DD`
Response `200`:
```json
{
  "date": "2026-11-19",
  "total_ml": 1250,
  "goal_ml": 2000,
  "percent": 63,
  "logs": [
    {"id": 1, "log_date": "2026-11-19", "amount_ml": 250, "logged_at": "07:30", "created_at": "..."}
  ]
}
```

### `POST /api/water/log`
Body: `{date?: "YYYY-MM-DD", amount_ml: int, logged_at?: "HH:MM"}`
Response `201`:
```json
{
  "id": 12,
  "log": {"id": 12, "log_date": "2026-11-19", "amount_ml": 250, "logged_at": "10:30", "created_at": "..."},
  "date": "2026-11-19",
  "total_ml": 1500,
  "goal_ml": 2000,
  "percent": 75,
  "logs": []
}
```

### `DELETE /api/water/log/{id}`
Response `200`: `{"deleted": true, "id": 12, "date": "2026-11-19", "total_ml": 1250, "goal_ml": 2000, "percent": 63, "logs": [...]}`.

### `PUT /api/water/goal`
Body: `{daily_goal_ml: int}` (200..10000)
Response `200`: `{"daily_goal_ml": 2200}`.

### `GET /api/workouts?date=YYYY-MM-DD&days=30`
Response `200`:
```json
{
  "date": "2026-11-19",
  "day_items": [],
  "recent_items": [
    {
      "id": 1,
      "log_date": "2026-11-19",
      "workout_type": "pilates",
      "custom_label": "",
      "label": "Пилатес",
      "duration_min": 30,
      "intensity": "medium",
      "mood": "energized",
      "note": "Акцент на спину и осанку",
      "completed": true,
      "logged_at": "08:30",
      "created_at": "..."
    }
  ],
  "weekly_summary": {
    "total_sessions": 4,
    "total_minutes": 115,
    "by_type": {"breathing": 2, "pilates": 1, "qigong": 1, "other": 0}
  }
}
```
Enums:
- `workout_type`: `"breathing" | "pilates" | "qigong" | "other"`
  Labels: `breathing` -> `"Дыхательная практика"`, `pilates` -> `"Пилатес"`, `qigong` -> `"Цигун"`, `other` -> `custom_label or "Тренировка"`
- `intensity`: `"light" | "medium" | "intense"`

### `POST /api/workouts`
Body: `{log_date?, date?, workout_type, custom_label?, duration_min, intensity?, mood?, note?, completed?, logged_at?}`
Response `201`: `WorkoutItem`.

### `PATCH /api/workouts/{id}`
Body (all optional): `{log_date?, workout_type?, custom_label?, duration_min?, intensity?, mood?, note?, completed?, logged_at?}`
Response `200`: `WorkoutItem`.

### `DELETE /api/workouts/{id}`
Response `200`: `{"deleted": true, "id": 1}`.

---

## 5. Female Cycle Tracker — 12+ Months (`app/routes/cycle.py`)

### `GET /api/cycle/overview?year=YYYY&month=MM`
`year` and `month` default to current Moscow year/month.

Response `200`:
```json
{
  "year": 2026,
  "month": 11,
  "today": "2026-11-19",
  "settings": {
    "avg_cycle_length": 28,
    "avg_period_length": 5
  },
  "stats": {
    "computed_avg_cycle_length": 28,
    "computed_avg_period_length": 5,
    "tracked_cycles_count": 13,
    "current_cycle_day": 12,
    "current_phase": "follicular",
    "current_phase_label": "Фолликулярная фаза",
    "last_period_start": "2026-11-08",
    "next_period_start": "2026-12-06",
    "next_period_end": "2026-12-10",
    "days_until_period": 17,
    "ovulation_date": "2026-11-22",
    "fertile_window_start": "2026-11-18",
    "fertile_window_end": "2026-11-23"
  },
  "month_days": [
    {
      "log_date": "2026-11-08",
      "is_period": true,
      "flow": "medium",
      "symptoms": ["cramps", "fatigue"],
      "mood": "calm",
      "note": "Первый день, тёплый чай и спокойный ритм",
      "updated_at": "..."
    }
  ],
  "predicted_period_dates": ["2026-12-06", "2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10"],
  "predicted_fertile_dates": ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"],
  "predicted_ovulation_dates": ["2026-11-22"],
  "history_12m": [
    {
      "cycle_number": 13,
      "start_date": "2026-11-08",
      "end_date": "2026-11-12",
      "period_length": 5,
      "cycle_length": null,
      "dominant_symptoms": ["cramps", "fatigue"],
      "notes": "Первый день, тёплый чай и спокойный ритм"
    }
  ],
  "days_map_400d": {
    "2026-11-08": {
      "log_date": "2026-11-08",
      "is_period": true,
      "flow": "medium",
      "symptoms": ["cramps", "fatigue"],
      "mood": "calm",
      "note": "Первый день, тёплый чай и спокойный ритм",
      "updated_at": "..."
    }
  }
}
```
Enums:
- `flow`: `"none" | "light" | "medium" | "heavy"`
- `current_phase`: `"menstruation" | "follicular" | "ovulation" | "luteal"`
- Recommended symptom keys: `"cramps"`, `"headache"`, `"fatigue"`, `"bloating"`, `"mood_swings"`, `"tender_breasts"`, `"high_energy"`, `"calm_sleep"`

### `PUT /api/cycle/day/{date}`
Body: `{is_period: bool, flow?: "none"|"light"|"medium"|"heavy", symptoms?: list[str], mood?: str, note?: str}`
Response `200`: `CycleDayItem`.

### `DELETE /api/cycle/day/{date}`
Response `200`: `{"deleted": true, "log_date": "YYYY-MM-DD"}`.

### `PUT /api/cycle/settings`
Body: `{avg_cycle_length: int, avg_period_length: int}`
Response `200`: `{"avg_cycle_length": int, "avg_period_length": int}`.

---

## 6. Nutrition & Menu Tracker (`app/routes/nutrition.py`)

### `GET /api/nutrition/menu?slot=&q=`
`slot`: optional `"breakfast" | "lunch" | "dinner" | "snack" | "any"`.
`q`: optional search query (matches Russian name/category case-insensitively with `ё`=`е`).

Response `200`:
```json
{
  "items": [
    {
      "id": 1,
      "name": "Овсянка на миндальном молоке с ягодами",
      "meal_slot": "breakfast",
      "default_portion": "1 миска",
      "default_grams": 260,
      "kcal": 320,
      "protein_g": 10.5,
      "fat_g": 9.0,
      "carbs_g": 48.0,
      "category": "Каши и завтраки",
      "is_favorite": true
    }
  ],
  "total": 18
}
```

### `POST /api/nutrition/menu`
Body: `{name, meal_slot?, default_portion?, default_grams?, kcal?, protein_g?, fat_g?, carbs_g?, category?, is_favorite?}`
Response `201`: `MenuItem`.

### `PATCH /api/nutrition/menu/{id}`
Body (all optional): same fields as POST.
Response `200`: `MenuItem`.

### `DELETE /api/nutrition/menu/{id}`
Response `200`: `{"deleted": true, "id": 1}`.

### `GET /api/nutrition/day?date=YYYY-MM-DD`
Response `200`:
```json
{
  "date": "2026-11-19",
  "slots": {
    "breakfast": [],
    "lunch": [],
    "dinner": [],
    "snack": []
  },
  "items": [
    {
      "id": 1,
      "log_date": "2026-11-19",
      "meal_slot": "breakfast",
      "menu_item_id": 1,
      "dish_name": "Овсянка на миндальном молоке с ягодами",
      "amount_value": 1.0,
      "amount_unit": "миска",
      "grams": 260,
      "eaten_at": "08:15",
      "kcal": 320,
      "note": "С горстью голубики",
      "completed": true,
      "created_at": "..."
    }
  ],
  "totals": {
    "meals_count": 2,
    "total_kcal": 890,
    "total_grams": 540,
    "slots_completed": ["breakfast", "lunch"]
  },
  "recent_7d": [
    {
      "date": "2026-11-13",
      "meals_count": 3,
      "total_kcal": 1480,
      "has_breakfast": true,
      "has_lunch": true,
      "has_dinner": true
    }
  ]
}
```

### `POST /api/nutrition/meals`
Body: `{log_date?, date?, meal_slot, menu_item_id?, dish_name, amount_value?, amount_unit?, grams?, eaten_at?, kcal?, note?, completed?}`
Response `201`: `MealLogItem`.

### `PATCH /api/nutrition/meals/{id}`
Body (all optional): `{log_date?, meal_slot?, menu_item_id?, dish_name?, amount_value?, amount_unit?, grams?, eaten_at?, kcal?, note?, completed?}`
Response `200`: `MealLogItem`.

### `DELETE /api/nutrition/meals/{id}`
Response `200`: `{"deleted": true, "id": 1}`.

---

## 7. Home Chores & Shopping (`app/routes/home.py`)

### `GET /api/home/chores?date=YYYY-MM-DD`
Response `200`:
```json
{
  "date": "2026-11-19",
  "items": [
    {
      "id": 1,
      "title": "Протереть рабочую поверхность и раковину",
      "zone": "Кухня",
      "frequency": "daily",
      "active": true,
      "sort_order": 1,
      "completed": true,
      "completed_at": "09:10",
      "last_completed_date": "2026-11-19",
      "last_completed_at": "09:10"
    }
  ],
  "by_zone": {
    "Кухня": []
  },
  "summary": {
    "done_today": 2,
    "total_active": 8,
    "daily_done": 2,
    "daily_total": 3,
    "weekly_done": 1,
    "weekly_total": 4
  }
}
```
Enums:
- `frequency`: `"daily" | "weekly" | "monthly" | "once"`
- Zones (examples): `"Кухня"`, `"Ванная"`, `"Комнаты"`, `"Стирка"`, `"Общее"`

### `POST /api/home/chores`
Body: `{title, zone?, frequency?, sort_order?}`
Response `201`: `ChoreItem`.

### `PATCH /api/home/chores/{id}`
Body (all optional): `{title?, zone?, frequency?, active?, sort_order?}`
Response `200`: `ChoreItem`.

### `DELETE /api/home/chores/{id}`
Response `200`: `{"deleted": true, "id": 1}`.

### `POST /api/home/chores/{id}/toggle`
Body: `{date?: "YYYY-MM-DD", completed?: boolean}`
Response `200`: updated `ChoreItem`.

### `GET /api/home/shopping?list_type=groceries|household`
`list_type` is optional (`"groceries"` for Питание food list, `"household"` for Дом household list; omitted returns all).
Response `200`:
```json
{
  "list_type": "groceries",
  "items": [
    {
      "id": 1,
      "name": "Авокадо спелое",
      "category": "Овощи и фрукты",
      "quantity": "2 шт",
      "list_type": "groceries",
      "bought": false,
      "bought_at": null,
      "created_at": "..."
    }
  ],
  "by_category": {
    "Овощи и фрукты": []
  },
  "summary": {
    "remaining": 5,
    "bought": 1,
    "total": 6
  }
}
```

### `POST /api/home/shopping`
Body: `{name, category?, quantity?, list_type?}` (`list_type` defaults to `"groceries"`).
Response `201`: `ShoppingItem`.

### `PATCH /api/home/shopping/{id}`
Body (all optional): `{name?, category?, quantity?, list_type?, bought?}`
Response `200`: `ShoppingItem`.

### `DELETE /api/home/shopping/{id}`
Response `200`: `{"deleted": true, "id": 1}`.

### `POST /api/home/shopping/clear-bought?list_type=groceries|household`
Accepts optional query `?list_type=` or JSON `{list_type}` so clearing one list never touches the other.
Response `200`: `{"cleared": 2, "list_type": "groceries"}`.

---

## 8. Web Push Notifications (`app/routes/push.py`)

Environment variables:
- `VAPID_PUBLIC_KEY` (base64url public key exposed via `/api/push/config`)
- `VAPID_PRIVATE_KEY` (PEM or raw base64url private key; escaped `\n` is unescaped automatically; never exposed)
- `VAPID_SUBJECT` (optional, default `mailto:ritm@marina-tracker.app`)
- `PUSH_CRON_SECRET` (optional bearer / `X-Cron-Secret` token protecting `/api/push/dispatch`; never exposed)

### `GET /api/push/config`
Response `200`:
```json
{
  "configured": true,
  "vapid_public_key": "BEl...",
  "subscriptions_count": 1,
  "devices": [
    {
      "id": 1,
      "device_label": "iPhone",
      "updated_at": "2026-11-19T14:00:00+03:00",
      "last_success_at": "2026-11-19T14:05:00+03:00"
    }
  ],
  "settings": {
    "enabled": true,
    "timezone": "Europe/Moscow",
    "morning_enabled": true,
    "morning_time": "08:30",
    "afternoon_enabled": true,
    "afternoon_time": "13:30",
    "evening_enabled": true,
    "evening_time": "20:30",
    "water_enabled": true,
    "water_interval_hours": 3,
    "events_enabled": true,
    "events_lead_minutes": 60,
    "cycle_enabled": true,
    "cycle_days_before": 2,
    "goals_enabled": true,
    "goals_weekday": 6,
    "goals_time": "11:00",
    "quiet_start": "22:30",
    "quiet_end": "07:30",
    "updated_at": ""
  },
  "recent_deliveries": []
}
```

### `POST /api/push/subscribe`
Body: `{endpoint, keys: {p256dh, auth}, device_label?, user_agent?}`
Upserts subscription by `endpoint` and activates it.
Response `200`: `{"ok": true, "id": 1, "subscriptions_count": 1}`.

### `POST /api/push/unsubscribe`
Body: `{endpoint}`
Deactivates subscription by `endpoint`.
Response `200`: `{"ok": true, "subscriptions_count": 0}`.

### `GET /api/push/settings`
Response `200`: `NotificationSettings`.

### `PUT /api/push/settings`
Body (all optional, merged over existing settings): `{enabled?, timezone?, morning_enabled?, morning_time?, afternoon_enabled?, afternoon_time?, evening_enabled?, evening_time?, water_enabled?, water_interval_hours? (2|3|4), events_enabled?, events_lead_minutes? (30|60|120), cycle_enabled?, cycle_days_before? (1|2|3), goals_enabled?, goals_weekday? (0..6), goals_time?, quiet_start?, quiet_end?}`
Response `200`: updated `NotificationSettings`.

### `POST /api/push/test`
Requires configured VAPID keys and at least 1 active subscription (`400` otherwise). Sends immediate test push banner to all active devices.
Response `200`: `{"ok": true, "sent": 1, "failed": 0, "errors": []}`.

### `POST /api/push/dispatch`
Cron endpoint (called every 10 min by GitHub Actions `.github/workflows/push-dispatch.yml`).
Auth: `Authorization: Bearer <PUSH_CRON_SECRET>` or `X-Cron-Secret: <PUSH_CRON_SECRET>` (`401` if `PUSH_CRON_SECRET` is configured and header does not match).
Respects quiet hours and deduplicates via `push_deliveries.dedupe_key` across all 5 rules:
1. Morning / Afternoon / Evening incomplete habits & vitamins (+ evening gratitude/reflection nudge).
2. Water reminders (`10:00..19:30` by `water_interval_hours`) while `total_ml < daily_goal_ml`.
3. Upcoming incomplete today's calendar events within `[now, now + events_lead_minutes + 15m]`.
4. Upcoming female cycle warning (`10:00..10:30`) when `1 <= days_until_period <= cycle_days_before`.
5. Weekly goals check-in on `goals_weekday` within 25 min after `goals_time`.
Response `200`: `{"ok": true, "active_subscriptions": 1, "dispatched": [...], "skipped": [...]}`.
