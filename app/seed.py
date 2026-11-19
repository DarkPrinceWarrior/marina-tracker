"""Idempotent rich Russian demo seed data for Marina Tracker («Ритм»)."""

from __future__ import annotations

from datetime import date, timedelta
import json
import sqlite3

from .db import now_dt, now_iso, today_iso, transaction


def seed_if_empty(db: sqlite3.Connection) -> bool:
    """Populate realistic Russian personal-growth demo data if database is empty."""
    existing = db.execute("SELECT COUNT(*) FROM habits").fetchone()[0]
    if existing > 0:
        return False

    today = now_dt().date()
    today_str = today.isoformat()
    created_ts = now_iso()

    with transaction(db):
        # 1. Settings
        db.execute("INSERT OR REPLACE INTO water_settings(id, daily_goal_ml) VALUES(1, 2000)")
        db.execute(
            "INSERT OR REPLACE INTO cycle_settings(id, avg_cycle_length, avg_period_length) VALUES(1, 28, 5)"
        )

        # 2. Habits & Vitamins (Morning, Afternoon, Evening)
        habits_spec = [
            # Morning
            ("Стакан тёплой воды", "morning", "habit", "Натощак с долькой лимона", "droplets", "sky", 7, 1),
            ("Дыхательная гимнастика 10 мин", "morning", "habit", "Квадратное дыхание у открытого окна", "wind", "sage", 7, 2),
            ("Витамин D3 + K2", "morning", "vitamin", "2000 МЕ после завтрака", "sun", "amber", 7, 3),
            ("Омега-3", "morning", "vitamin", "1000 мг с завтраком", "pill", "amber", 7, 4),
            # Afternoon
            ("Прогулка 20 минут на свежем воздухе", "afternoon", "habit", "Без телефона, спокойный шаг", "footprints", "sage", 6, 5),
            ("Пауза для спины и шеи", "afternoon", "habit", "Мягкая растяжка 5 минут", "activity", "sage", 6, 6),
            ("Железо + Витамин C", "afternoon", "vitamin", "1 капсула в обед", "pill", "rose", 7, 7),
            # Evening
            ("Чтение книги 25 минут", "evening", "habit", "Бумажная книга перед сном", "book-open", "indigo", 6, 8),
            ("Магний B6", "evening", "vitamin", "400 мг за 40 минут до сна", "moon", "indigo", 7, 9),
            ("Вечерний уход за кожей", "evening", "habit", "Очищение, тоник и крем", "sparkles", "rose", 7, 10),
        ]
        habit_ids: list[int] = []
        for title, period, cat, dose, icon, color, target_days, sort_order in habits_spec:
            cur = db.execute(
                """INSERT INTO habits(
                    title, period_of_day, category, dose_or_note, icon, color,
                    target_days_per_week, active, sort_order, created_at
                ) VALUES(?,?,?,?,?,?,?,1,?,?)""",
                (title, period, cat, dose, icon, color, target_days, sort_order, created_ts),
            )
            habit_ids.append(int(cur.lastrowid))

        # Habit logs for past 35 days (so streaks & 30-day goal-linked stats look realistic)
        for offset in range(34, 0, -1):
            d_str = (today - timedelta(days=offset)).isoformat()
            for idx, h_id in enumerate(habit_ids):
                # High consistency (~80-90%) with natural variation
                if (offset + idx * 3) % 7 != 0 or offset <= 5:
                    hour = 7 if idx < 4 else (13 if idx < 7 else 21)
                    minute = (10 + idx * 7) % 55
                    db.execute(
                        """INSERT OR IGNORE INTO habit_logs(habit_id, log_date, completed, completed_at, note)
                           VALUES(?,?,1,?,?)""",
                        (h_id, d_str, f"{hour:02d}:{minute:02d}", ""),
                    )

        # Today's habit logs: morning completed + 1 afternoon completed, evening still open
        today_done_habits = [
            (habit_ids[0], "07:20"),
            (habit_ids[1], "07:40"),
            (habit_ids[2], "08:35"),
            (habit_ids[3], "08:36"),
            (habit_ids[5], "13:15"),
        ]
        for h_id, hhmm in today_done_habits:
            db.execute(
                """INSERT OR IGNORE INTO habit_logs(habit_id, log_date, completed, completed_at, note)
                   VALUES(?,?,1,?,'')""",
                (h_id, today_str, hhmm),
            )

        # 3. Water Logs (today = 1250 ml + yesterday = 2000 ml)
        water_today = [
            (250, "07:22"),
            (250, "09:10"),
            (250, "11:05"),
            (500, "13:20"),
        ]
        for ml, hhmm in water_today:
            db.execute(
                "INSERT INTO water_logs(log_date, amount_ml, logged_at, created_at) VALUES(?,?,?,?)",
                (today_str, ml, hhmm, created_ts),
            )
        yesterday_str = (today - timedelta(days=1)).isoformat()
        for ml, hhmm in [(300, "07:45"), (500, "10:30"), (500, "14:00"), (450, "17:15"), (250, "20:00")]:
            db.execute(
                "INSERT INTO water_logs(log_date, amount_ml, logged_at, created_at) VALUES(?,?,?,?)",
                (yesterday_str, ml, hhmm, created_ts),
            )

        # 4. Workouts (Breathing, Pilates, Qigong over the past 21 days)
        workouts_spec = [
            (0, "pilates", "", 30, "medium", "energized", "Мягкий утренний комплекс на спину и кор", "08:05"),
            (1, "breathing", "", 15, "light", "calm", "Дыхание 4-7-8 перед сном", "21:15"),
            (2, "qigong", "", 25, "light", "balanced", "Восемь кусков парчи на балконе", "09:00"),
            (4, "pilates", "", 40, "medium", "strong", "Укрепление глубоких мышц и осанка", "18:20"),
            (5, "breathing", "", 12, "light", "calm", "Утреннее пробуждение диафрагмы", "07:45"),
            (7, "qigong", "", 30, "light", "calm", "Плавный поток для расслабления плеч", "19:10"),
            (9, "pilates", "", 35, "medium", "energized", "С кольцом и лентой", "18:00"),
            (12, "breathing", "", 15, "light", "calm", "Восстановление в первый день цикла", "20:30"),
            (15, "qigong", "", 25, "light", "balanced", "Утренняя энергия", "08:30"),
            (18, "pilates", "", 35, "medium", "strong", "Мобильность тазобедренных суставов", "18:15"),
        ]
        for days_ago, w_type, custom, dur, intensity, mood, note, hhmm in workouts_spec:
            d_str = (today - timedelta(days=days_ago)).isoformat()
            db.execute(
                """INSERT INTO workouts(
                    log_date, workout_type, custom_label, duration_min, intensity,
                    mood, note, completed, logged_at, created_at
                ) VALUES(?,?,?,?,?,?,?,1,?,?)""",
                (d_str, w_type, custom, dur, intensity, mood, note, hhmm, created_ts),
            )

        # 5. Female Cycle Tracker — 14 realistic past cycles (~12.5+ months up to today)
        # Most recent cycle started 11 days ago (puts today at cycle day 12, follicular phase!)
        # Lengths going backwards from most recent to oldest (13 intervals between 14 starts):
        cycle_intervals = [28, 29, 27, 28, 30, 28, 27, 29, 28, 28, 29, 27, 28]
        period_lengths = [5, 5, 4, 5, 5, 5, 4, 5, 5, 5, 6, 5, 5, 5]
        cycle_notes = [
            "Спокойный старт, тёплый травяной чай и ранний сон",
            "Чуть больше усталости в первый день, помогла дыхательная практика",
            "Лёгкий цикл, самочувствие ровное",
            "Первый день с грелкой, со второго дня бодрость",
            "Длинный цикл после поездки, всё восстановилось мягко",
            "Хороший сон, почти без спазмов",
            "Короткий и спокойный период",
            "Немного тянула поясница, помог лёгкий цигун",
            "Ровное настроение, много воды и магний",
            "Комфортное самочувствие",
            "Чуть дольше обычного, но без дискомфорта",
            "Лёгкое начало и быстрое восстановление",
            "Начало года — регулярный ритм",
        ]
        symptom_profiles = [
            ["cramps", "fatigue"],
            ["fatigue", "bloating"],
            ["mood_swings"],
            ["cramps", "headache"],
            ["fatigue", "tender_breasts"],
            ["bloating"],
        ]

        most_recent_start = today - timedelta(days=11)
        cycle_starts: list[date] = [most_recent_start]
        for interval in cycle_intervals:
            cycle_starts.append(cycle_starts[-1] - timedelta(days=interval))

        for c_idx, start_d in enumerate(cycle_starts):
            p_len = period_lengths[c_idx]
            profile = symptom_profiles[c_idx % len(symptom_profiles)]
            note_first = cycle_notes[c_idx % len(cycle_notes)]
            for day_i in range(p_len):
                log_d = start_d + timedelta(days=day_i)
                if log_d > today:
                    continue
                if day_i == 0:
                    flow = "medium"
                    syms = profile
                    mood = "tired"
                    note = note_first
                elif day_i == 1:
                    flow = "heavy" if c_idx % 2 == 0 else "medium"
                    syms = profile
                    mood = "calm"
                    note = ""
                elif day_i == 2:
                    flow = "medium"
                    syms = [profile[0]] if profile else []
                    mood = "calm"
                    note = ""
                else:
                    flow = "light"
                    syms = []
                    mood = "balanced"
                    note = ""
                db.execute(
                    """INSERT OR REPLACE INTO cycle_days(
                        log_date, is_period, flow, symptoms_json, mood, note, updated_at
                    ) VALUES(?,1,?,?,?,?,?)""",
                    (
                        log_d.isoformat(),
                        flow,
                        json.dumps(syms, ensure_ascii=False),
                        mood,
                        note,
                        created_ts,
                    ),
                )

            # Also add a helpful non-period mid-cycle energy note on recent cycles
            if c_idx < 3:
                ov_d = start_d + timedelta(days=14)
                if ov_d <= today:
                    db.execute(
                        """INSERT OR IGNORE INTO cycle_days(
                            log_date, is_period, flow, symptoms_json, mood, note, updated_at
                        ) VALUES(?,0,'none',?,?,?,?)""",
                        (
                            ov_d.isoformat(),
                            json.dumps(["high_energy"], ensure_ascii=False),
                            "energized",
                            "Много энергии и ясность в голове",
                            created_ts,
                        ),
                    )

        # 6. Nutrition Menu Catalog (rich Russian healthy dishes)
        menu_spec = [
            # Breakfast
            ("Овсянка на миндальном молоке с ягодами", "breakfast", "1 миска", 260, 320, 10.5, 9.0, 48.0, "Завтраки", 1),
            ("Скрэмбл из 2 яиц с авокадо и тостом", "breakfast", "1 порция", 240, 390, 18.0, 24.0, 24.0, "Завтраки", 1),
            ("Творожная запеканка с грушей", "breakfast", "1 кусочек", 190, 280, 19.0, 9.5, 29.0, "Завтраки", 1),
            ("Сырники из фермерского творога", "breakfast", "3 шт", 180, 310, 21.0, 11.0, 31.0, "Завтраки", 0),
            ("Греческий йогурт с гранолой и мёдом", "breakfast", "1 пиала", 220, 295, 14.0, 8.5, 39.0, "Завтраки", 0),
            # Lunch
            ("Киноа с запечённым лососем и брокколи", "lunch", "1 тарелка", 320, 480, 32.0, 19.0, 42.0, "Основные блюда", 1),
            ("Крем-суп из тыквы с тыквенными семечками", "lunch", "1 тарелка", 300, 240, 7.0, 10.0, 31.0, "Супы", 1),
            ("Индейка на гриле с гречкой и свежим салатом", "lunch", "1 порция", 330, 430, 35.0, 11.0, 46.0, "Основные блюда", 1),
            ("Зелёный боул с нутом, шпинатом и тахини", "lunch", "1 боул", 310, 410, 15.0, 18.0, 45.0, "Салаты и боулы", 0),
            ("Куриный бульон с зеленью и перепелиным яйцом", "lunch", "1 тарелка", 280, 195, 19.0, 8.0, 9.0, "Супы", 0),
            # Dinner
            ("Запечённая дорадо с овощами гриль", "dinner", "1 порция", 290, 360, 34.0, 15.0, 18.0, "Ужин", 1),
            ("Тёплый салат с рукколой, креветками и манго", "dinner", "1 тарелка", 260, 310, 26.0, 12.0, 24.0, "Салаты и боулы", 1),
            ("Тушёные кабачки с индейкой и травами", "dinner", "1 порция", 280, 290, 27.0, 10.0, 20.0, "Ужин", 0),
            ("Омлет со шпинатом, томатами и фетой", "dinner", "1 порция", 230, 310, 20.0, 21.0, 9.0, "Ужин", 0),
            # Snacks
            ("Зелёное яблоко и горсть миндаля", "snack", "1 порция", 150, 210, 5.5, 11.0, 24.0, "Перекусы", 1),
            ("Хумус с морковными и огуречными палочками", "snack", "1 порция", 160, 185, 6.5, 9.0, 20.0, "Перекусы", 1),
            ("Матча-латте на овсяном молоке", "snack", "1 чашка", 240, 115, 3.0, 3.5, 17.0, "Напитки", 1),
            ("Кефир 2,5% с семенами чиа", "snack", "1 стакан", 220, 165, 8.0, 7.0, 16.0, "Перекусы", 0),
        ]
        menu_ids: list[int] = []
        for row in menu_spec:
            cur = db.execute(
                """INSERT INTO menu_items(
                    name, meal_slot, default_portion, default_grams, kcal,
                    protein_g, fat_g, carbs_g, category, is_favorite
                ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                row,
            )
            menu_ids.append(int(cur.lastrowid))

        # Today's meal logs (Breakfast + Lunch + Snack logged; Dinner still open to log!)
        today_meals = [
            (today_str, "breakfast", menu_ids[0], menu_spec[0][0], 1.0, "миска", 260, "08:25", 320, "С голубикой и корицей"),
            (today_str, "lunch", menu_ids[5], menu_spec[5][0], 1.0, "тарелка", 320, "13:10", 480, "Очень сытно"),
            (today_str, "snack", menu_ids[16], menu_spec[16][0], 1.0, "чашка", 240, "15:40", 115, "Без сахара"),
        ]
        for m_date, slot, m_id, name, val, unit, grams, hhmm, kcal, note in today_meals:
            db.execute(
                """INSERT INTO meal_logs(
                    log_date, meal_slot, menu_item_id, dish_name, amount_value,
                    amount_unit, grams, eaten_at, kcal, note, completed, created_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,1,?)""",
                (m_date, slot, m_id, name, val, unit, grams, hhmm, kcal, note, created_ts),
            )

        # Past 6 days of meals for 7-day consistency overview
        for offset in range(1, 7):
            d_str = (today - timedelta(days=offset)).isoformat()
            b_idx = offset % 4
            l_idx = 5 + (offset % 4)
            d_idx = 10 + (offset % 4)
            for slot, idx, hhmm in [("breakfast", b_idx, "08:30"), ("lunch", l_idx, "13:30"), ("dinner", d_idx, "19:15")]:
                item = menu_spec[idx]
                db.execute(
                    """INSERT INTO meal_logs(
                        log_date, meal_slot, menu_item_id, dish_name, amount_value,
                        amount_unit, grams, eaten_at, kcal, note, completed, created_at
                    ) VALUES(?,?,?,?,1.0,'порц.',?,?,?,'',1,?)""",
                    (d_str, slot, menu_ids[idx], item[0], item[3], hhmm, item[4], created_ts),
                )

        # 7. Multi-Year Goals (1, 2, 3 years) with Milestones & Check-ins
        goals_spec = [
            (
                "Гибкое и сильное тело без боли в спине",
                "Регулярная практика пилатеса, цигуна и утреннего дыхания как естественная часть жизни.",
                "Здоровье и тело",
                2,
                (today - timedelta(days=280)).isoformat(),
                (today + timedelta(days=450)).isoformat(),
                42,
                habit_ids[1],  # linked to morning breathing habit
                "active",
                "weekly",
                (today - timedelta(days=3)).isoformat(),
            ),
            (
                "Свободный разговорный итальянский (уровень B2)",
                "Учить язык с удовольствием: книги, подкасты, разговорный клуб и поездка в Тоскану.",
                "Личностный рост",
                3,
                (today - timedelta(days=340)).isoformat(),
                (today + timedelta(days=755)).isoformat(),
                22,
                habit_ids[7],  # linked to reading habit
                "active",
                "weekly",
                (today - timedelta(days=11)).isoformat(),  # overdue check-in -> 'attention'!
            ),
            (
                "Собственный уютный ритуал дома и осознанное пространство",
                "Минимализм в шкафах, капсульный гардероб, порядок без стресса и живые растения.",
                "Дом и уют",
                1,
                (today - timedelta(days=140)).isoformat(),
                (today + timedelta(days=225)).isoformat(),
                58,
                None,
                "active",
                "biweekly",
                (today - timedelta(days=4)).isoformat(),  # ahead of pace -> 'ahead'!
            ),
        ]
        goal_ids: list[int] = []
        for g in goals_spec:
            cur = db.execute(
                """INSERT INTO goals(
                    title, description, category, horizon_years, start_date, target_date,
                    progress_pct, linked_habit_id, status, check_in_cadence, last_checkin_at, created_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (*g, created_ts),
            )
            goal_ids.append(int(cur.lastrowid))

        # Milestones
        milestones_spec = [
            # Goal 1 (2 years)
            (goal_ids[0], "Сформировать стабильную утреннюю привычку дыхания 10 мин", today.year, "Q2", 1, (today - timedelta(days=160)).isoformat(), 1),
            (goal_ids[0], "Пройти базовый курс пилатеса (60 тренировок)", today.year, "Q4", 1, (today - timedelta(days=20)).isoformat(), 2),
            (goal_ids[0], "Освоить полный комплекс цигун «8 кусков парчи»", today.year + 1, "Q2", 0, None, 3),
            (goal_ids[0], "Поддерживать 4 практики в неделю весь второй год", today.year + 1, "Q4", 0, None, 4),
            # Goal 2 (3 years)
            (goal_ids[1], "Закрыть базовую грамматику A1–A2", today.year, "Q3", 1, (today - timedelta(days=60)).isoformat(), 1),
            (goal_ids[1], "Прочитать первую книгу на итальянском в оригинале", today.year + 1, "Q1", 0, None, 2),
            (goal_ids[1], "Еженедельный разговорный клуб уровня B1", today.year + 1, "Q4", 0, None, 3),
            (goal_ids[1], "Сдать пробный экзамен CILS B2", today.year + 2, "Q3", 0, None, 4),
            # Goal 3 (1 year)
            (goal_ids[2], "Разобрать гардероб и оставить только любимые вещи", today.year, "Q3", 1, (today - timedelta(days=90)).isoformat(), 1),
            (goal_ids[2], "Настроить лёгкую систему уборки по зонам", today.year, "Q4", 1, (today - timedelta(days=25)).isoformat(), 2),
            (goal_ids[2], "Обновить текстиль и освещение в спальне", today.year + 1, "Q1", 0, None, 3),
        ]
        for m in milestones_spec:
            db.execute(
                """INSERT INTO goal_milestones(
                    goal_id, title, target_year, target_quarter, completed, completed_at, sort_order
                ) VALUES(?,?,?,?,?,?,?)""",
                m,
            )

        # Check-ins
        checkins_spec = [
            (goal_ids[0], (today - timedelta(days=30)).isoformat(), 38, "Спина стала меньше уставать вечером.", "calm"),
            (goal_ids[0], (today - timedelta(days=3)).isoformat(), 42, "Держу ритм 4 практики в неделю, добавила утренний цигун.", "inspired"),
            (goal_ids[1], (today - timedelta(days=40)).isoformat(), 18, "Слушаю подкаст по утрам во время сборов.", "focused"),
            (goal_ids[1], (today - timedelta(days=11)).isoformat(), 22, "Неделя была плотной, надо вернуться к 20 минутам чтения.", "thoughtful"),
            (goal_ids[2], (today - timedelta(days=4)).isoformat(), 58, "Кухня и прихожая теперь поддерживаются за 10 минут в день.", "happy"),
        ]
        for g_id, c_date, pct, note, feeling in checkins_spec:
            db.execute(
                """INSERT INTO goal_checkins(
                    goal_id, checkin_date, progress_pct, note, feeling, created_at
                ) VALUES(?,?,?,?,?,?)""",
                (g_id, c_date, pct, note, feeling, created_ts),
            )

        # 8. Daily Tasks (Today)
        tasks_today = [
            ("Утренняя практика пилатеса 30 мин", "08:00", "high", "health", goal_ids[0], 1, "08:35", 1),
            ("Разобрать входящие и согласовать план недели", "10:00", "high", "work", None, 1, "10:45", 2),
            ("20 минут итальянского: повторить глаголы", "15:00", "medium", "goal", goal_ids[1], 0, None, 3),
            ("Заказать доставку свежих овощей и лосося", "17:30", "medium", "home", None, 0, None, 4),
            ("Выбрать тёплый плед в спальню", "19:30", "low", "personal", goal_ids[2], 0, None, 5),
        ]
        for title, t_slot, prio, tag, g_id, done, done_at, s_order in tasks_today:
            db.execute(
                """INSERT INTO tasks(
                    task_date, title, time_slot, priority, section_tag, goal_id,
                    completed, completed_at, sort_order, created_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (today_str, title, t_slot, prio, tag, g_id, done, done_at, s_order, created_ts),
            )

        # 9. Home Chores & Shopping
        chores_spec = [
            ("Протереть рабочую поверхность и раковину", "Кухня", "daily", 1),
            ("Загрузить и разобрать посудомойку", "Кухня", "daily", 2),
            ("Проветрить спальню и заправить постель", "Комнаты", "daily", 3),
            ("Освежить зеркало и раковину", "Ванная", "weekly", 4),
            ("Пропылесосить и протереть пол", "Комнаты", "weekly", 5),
            ("Сменить постельное бельё и полотенца", "Стирка", "weekly", 6),
            ("Разобрать холодильник и проверить сроки", "Кухня", "weekly", 7),
            ("Полить и протереть листья у растений", "Комнаты", "monthly", 8),
        ]
        chore_ids: list[int] = []
        for title, zone, freq, s_order in chores_spec:
            cur = db.execute(
                """INSERT INTO chores(title, zone, frequency, active, sort_order, created_at)
                   VALUES(?,?,?,1,?,?)""",
                (title, zone, freq, s_order, created_ts),
            )
            chore_ids.append(int(cur.lastrowid))

        # Chore logs (today + recent days)
        db.execute(
            "INSERT INTO chore_logs(chore_id, log_date, completed, completed_at) VALUES(?,?,1,?)",
            (chore_ids[0], today_str, "09:05"),
        )
        db.execute(
            "INSERT INTO chore_logs(chore_id, log_date, completed, completed_at) VALUES(?,?,1,?)",
            (chore_ids[2], today_str, "07:50"),
        )
        for c_idx, days_ago in [(1, 1), (3, 2), (4, 3), (5, 4), (6, 5), (7, 12)]:
            db.execute(
                "INSERT INTO chore_logs(chore_id, log_date, completed, completed_at) VALUES(?,?,1,?)",
                (chore_ids[c_idx], (today - timedelta(days=days_ago)).isoformat(), "18:30"),
            )

        # Shopping items
        shopping_spec = [
            ("Авокадо спелое", "Овощи и фрукты", "2 шт", 0, None),
            ("Шпинат свежий бэби", "Овощи и фрукты", "1 уп", 0, None),
            ("Голубика", "Овощи и фрукты", "250 г", 1, "09:40"),
            ("Лосось охлаждённый филе", "Белок и рыба", "400 г", 0, None),
            ("Миндальное молоко без сахара", "Молочное", "1 л", 0, None),
            ("Греческий йогурт 2%", "Молочное", "2 баночки", 1, "09:42"),
            ("Киноа белая", "Бакалея", "1 пачка", 0, None),
            ("Средство для стёкол и зеркал", "Для уборки и дома", "1 шт", 0, None),
        ]
        for name, cat, qty, bought, b_at in shopping_spec:
            db.execute(
                """INSERT INTO shopping_items(name, category, quantity, bought, bought_at, created_at)
                   VALUES(?,?,?,?,?,?)""",
                (name, cat, qty, bought, b_at, created_ts),
            )

        # 10. Today's Reflection
        db.execute(
            """INSERT INTO day_reflections(log_date, summary_note, energy_level, mood, updated_at)
               VALUES(?,?,?,?,?)""",
            (
                today_str,
                "Спокойное и собранное утро: сделала пилатес, выпила утренние витамины и успела разобрать главные задачи.",
                4,
                "calm",
                created_ts,
            ),
        )

    return True
