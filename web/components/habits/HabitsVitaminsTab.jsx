import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  RotateCcw,
  Settings2,
  Sun,
  Trash2,
} from "lucide-react";
import api from "../../api.js";
import Sheet from "../Sheet.jsx";
import {
  EmptyState,
  GroupHeader,
  GroupList,
  ListRow,
  Pill,
  SegmentedControl,
} from "../UiPrimitives.jsx";
import {
  HABIT_PERIODS,
  WATER_GOAL_PRESETS,
  WATER_QUICK_AMOUNTS,
} from "../../data/presets.js";
import { nowTimeHHMM } from "../../utils/date.js";

const EMPTY_FORM = {
  id: null,
  title: "",
  period_of_day: "morning",
  category: "habit",
  dose_or_note: "",
  target_days_per_week: 7,
};

function recomputeSummary(items) {
  const total = items.length;
  const done = items.filter((h) => h.completed).length;
  const vitamins = items.filter((h) => h.category === "vitamin");
  const vitaminsDone = vitamins.filter((h) => h.completed).length;
  return {
    done,
    total,
    vitamins_done: vitaminsDone,
    vitamins_total: vitamins.length,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

export default function HabitsVitaminsTab({
  selectedDate,
  notify,
  onDataChanged,
  onSummaryChange,
  createTrigger = 0,
  onConsumeCreateTrigger,
}) {
  const [habits, setHabits] = useState([]);
  const [water, setWater] = useState({
    date: selectedDate,
    total_ml: 0,
    goal_ml: 2000,
    percent: 0,
    logs: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all"); // 'all' | 'habit' | 'vitamin'

  // Water sheet state (goal + timestamped logs)
  const [waterBusy, setWaterBusy] = useState(false);
  const [waterSheetOpen, setWaterSheetOpen] = useState(false);
  const [goalInput, setGoalInput] = useState("2000");
  const [savingGoal, setSavingGoal] = useState(false);

  // Habit / Vitamin add & edit sheet
  const [habitSheetOpen, setHabitSheetOpen] = useState(false);
  const [habitForm, setHabitForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [savingHabit, setSavingHabit] = useState(false);

  const loadData = useCallback(async () => {
    setError("");
    try {
      const [habitsRes, waterRes] = await Promise.all([
        api.getHabits(selectedDate),
        api.getWater(selectedDate),
      ]);
      const items = Array.isArray(habitsRes?.items) ? habitsRes.items : [];
      setHabits(items);
      if (waterRes) {
        setWater({
          date: waterRes.date || selectedDate,
          total_ml: Number(waterRes.total_ml) || 0,
          goal_ml: Number(waterRes.goal_ml) || 2000,
          percent: Number(waterRes.percent) || 0,
          logs: Array.isArray(waterRes.logs) ? waterRes.logs : [],
        });
      }
      onSummaryChange?.(habitsRes?.summary || recomputeSummary(items));
    } catch (err) {
      setError(err?.message || "Не удалось загрузить привычки и воду.");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, onSummaryChange]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const counts = useMemo(() => {
    const habitCount = habits.filter((h) => h.category !== "vitamin").length;
    const vitaminCount = habits.filter((h) => h.category === "vitamin").length;
    return { all: habits.length, habit: habitCount, vitamin: vitaminCount };
  }, [habits]);

  const groupedHabits = useMemo(() => {
    const filtered = habits.filter((item) => {
      if (filter === "vitamin") return item.category === "vitamin";
      if (filter === "habit") return item.category !== "vitamin";
      return true;
    });
    return {
      morning: filtered.filter((h) => h.period_of_day === "morning"),
      afternoon: filtered.filter((h) => h.period_of_day === "afternoon"),
      evening: filtered.filter((h) => h.period_of_day === "evening"),
    };
  }, [habits, filter]);

  // --- Water actions ---
  const handleAddWater = async (amountMl) => {
    if (waterBusy) return;
    setWaterBusy(true);
    const prevWater = water;
    const tempId = `temp-${Date.now()}`;
    const loggedAt = nowTimeHHMM();
    const optimisticTotal = prevWater.total_ml + amountMl;
    const optimisticPercent = prevWater.goal_ml
      ? Math.min(100, Math.round((optimisticTotal / prevWater.goal_ml) * 100))
      : 0;

    setWater({
      ...prevWater,
      total_ml: optimisticTotal,
      percent: optimisticPercent,
      logs: [
        ...prevWater.logs,
        {
          id: tempId,
          log_date: selectedDate,
          amount_ml: amountMl,
          logged_at: loggedAt,
        },
      ],
    });

    try {
      const res = await api.logWater({
        date: selectedDate,
        amount_ml: amountMl,
        logged_at: loggedAt,
      });
      setWater({
        date: res.date || selectedDate,
        total_ml: Number(res.total_ml) || 0,
        goal_ml: Number(res.goal_ml) || prevWater.goal_ml,
        percent: Number(res.percent) || 0,
        logs: Array.isArray(res.logs) ? res.logs : [],
      });
      onDataChanged?.();
      notify?.(`+${amountMl} мл воды`, "success");
    } catch (err) {
      setWater(prevWater);
      notify?.(err?.message || "Не удалось записать воду", "error");
    } finally {
      setWaterBusy(false);
    }
  };

  const handleDeleteWaterLog = async (logItem, isUndo = false) => {
    if (!logItem || waterBusy) return;
    if (String(logItem.id).startsWith("temp-")) return;
    setWaterBusy(true);
    const prevWater = water;
    const nextLogs = prevWater.logs.filter((l) => l.id !== logItem.id);
    const nextTotal = Math.max(
      0,
      prevWater.total_ml - (Number(logItem.amount_ml) || 0),
    );
    const nextPercent = prevWater.goal_ml
      ? Math.min(100, Math.round((nextTotal / prevWater.goal_ml) * 100))
      : 0;
    setWater({
      ...prevWater,
      total_ml: nextTotal,
      percent: nextPercent,
      logs: nextLogs,
    });

    try {
      const res = await api.deleteWaterLog(logItem.id);
      setWater({
        date: res.date || selectedDate,
        total_ml: Number(res.total_ml) || 0,
        goal_ml: Number(res.goal_ml) || prevWater.goal_ml,
        percent: Number(res.percent) || 0,
        logs: Array.isArray(res.logs) ? res.logs : nextLogs,
      });
      onDataChanged?.();
      notify?.(
        isUndo
          ? `Отменено −${logItem.amount_ml} мл`
          : `Удалено ${logItem.amount_ml} мл`,
        "info",
      );
    } catch (err) {
      setWater(prevWater);
      notify?.(err?.message || "Не удалось удалить запись", "error");
    } finally {
      setWaterBusy(false);
    }
  };

  const openWaterSheet = () => {
    setGoalInput(String(water.goal_ml || 2000));
    setWaterSheetOpen(true);
  };

  const handleSaveGoal = async (e) => {
    e?.preventDefault();
    const parsed = Math.round(Number(goalInput));
    if (!Number.isFinite(parsed) || parsed < 200 || parsed > 10000) {
      notify?.("Укажите цель от 200 до 10 000 мл", "error");
      return;
    }
    setSavingGoal(true);
    try {
      const res = await api.setWaterGoal(parsed);
      const nextGoal = Number(res?.daily_goal_ml) || parsed;
      setWater((prev) => ({
        ...prev,
        goal_ml: nextGoal,
        percent: nextGoal
          ? Math.min(100, Math.round((prev.total_ml / nextGoal) * 100))
          : 0,
      }));
      setWaterSheetOpen(false);
      onDataChanged?.();
      notify?.(`Цель по воде: ${nextGoal} мл`, "success");
    } catch (err) {
      notify?.(err?.message || "Не удалось обновить цель", "error");
    } finally {
      setSavingGoal(false);
    }
  };

  // --- Habit / Vitamin actions ---
  const handleToggleHabit = async (habit) => {
    const nextCompleted = !habit.completed;
    const prevHabits = habits;
    const optimisticTime = nextCompleted ? nowTimeHHMM() : null;

    const updated = habits.map((item) =>
      item.id === habit.id
        ? {
            ...item,
            completed: nextCompleted,
            completed_at: optimisticTime,
            streak_days: nextCompleted
              ? Math.max(1, (item.streak_days || 0) + (item.completed ? 0 : 1))
              : Math.max(0, (item.streak_days || 0) - 1),
          }
        : item,
    );
    setHabits(updated);
    onSummaryChange?.(recomputeSummary(updated));

    try {
      const saved = await api.toggleHabit(habit.id, {
        date: selectedDate,
        completed: nextCompleted,
      });
      setHabits((current) => {
        const merged = current.map((item) =>
          item.id === habit.id ? { ...item, ...saved } : item,
        );
        onSummaryChange?.(recomputeSummary(merged));
        return merged;
      });
      onDataChanged?.();
    } catch (err) {
      setHabits(prevHabits);
      onSummaryChange?.(recomputeSummary(prevHabits));
      notify?.(err?.message || "Не удалось обновить статус", "error");
    }
  };

  const openCreateSheet = useCallback(
    (period = "morning", category = "habit") => {
      setFormError("");
      setHabitForm({
        ...EMPTY_FORM,
        period_of_day: period,
        category: filter === "vitamin" ? "vitamin" : category,
      });
      setHabitSheetOpen(true);
    },
    [filter],
  );

  useEffect(() => {
    if (createTrigger > 0) {
      openCreateSheet("morning", filter === "vitamin" ? "vitamin" : "habit");
      onConsumeCreateTrigger?.();
    }
  }, [createTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const openEditSheet = (item) => {
    setFormError("");
    setHabitForm({
      id: item.id,
      title: item.title || "",
      period_of_day: item.period_of_day || "morning",
      category: item.category === "vitamin" ? "vitamin" : "habit",
      dose_or_note: item.dose_or_note || "",
      target_days_per_week: Number(item.target_days_per_week) || 7,
    });
    setHabitSheetOpen(true);
  };

  const handleSaveHabit = async (e) => {
    e?.preventDefault();
    const title = habitForm.title.trim();
    if (!title) {
      setFormError(
        habitForm.category === "vitamin"
          ? "Введите название витамина"
          : "Введите название привычки",
      );
      return;
    }

    setSavingHabit(true);
    setFormError("");
    const payload = {
      title,
      period_of_day: habitForm.period_of_day,
      category: habitForm.category,
      dose_or_note: habitForm.dose_or_note.trim(),
      target_days_per_week: Number(habitForm.target_days_per_week) || 7,
    };

    try {
      if (habitForm.id) {
        await api.updateHabit(habitForm.id, payload);
        notify?.("Запись обновлена", "success");
      } else {
        await api.createHabit(payload);
        notify?.(
          payload.category === "vitamin"
            ? "Витамин добавлен"
            : "Привычка добавлена",
          "success",
        );
      }
      setHabitSheetOpen(false);
      await loadData();
      onDataChanged?.();
    } catch (err) {
      setFormError(err?.message || "Не удалось сохранить запись");
    } finally {
      setSavingHabit(false);
    }
  };

  const handleDeleteHabit = async () => {
    if (!habitForm.id || savingHabit) return;
    setSavingHabit(true);
    try {
      await api.deleteHabit(habitForm.id);
      setHabitSheetOpen(false);
      await loadData();
      onDataChanged?.();
      notify?.("Запись удалена", "info");
    } catch (err) {
      setFormError(err?.message || "Не удалось удалить запись");
    } finally {
      setSavingHabit(false);
    }
  };

  const waterPct = Math.min(
    100,
    water.goal_ml > 0 ? Math.round((water.total_ml / water.goal_ml) * 100) : 0,
  );
  const lastWaterLog =
    water.logs.length > 0 ? water.logs[water.logs.length - 1] : null;

  return (
    <div className="mt-stack">
      {/* 1. Compact Water Card (~96px tall) */}
      <section className="water-card" aria-label="Трекер воды">
        <div className="water-card-head">
          <div className="mt-row" style={{ gap: "6px", alignItems: "baseline", minWidth: 0 }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
              Вода
            </span>
            <span style={{ color: "var(--subtle)" }} aria-hidden="true">·</span>
            <strong
              className="tabular"
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "16px",
                fontWeight: 700,
                color: "var(--ink)",
              }}
            >
              {water.total_ml}
            </strong>
            <span className="mt-card-sub tabular" style={{ fontSize: "13px" }}>
              / {water.goal_ml} мл
            </span>
          </div>
          <button
            type="button"
            className="mt-icon-btn"
            aria-label="Цель и записи воды"
            onClick={openWaterSheet}
          >
            <Settings2 size={17} />
          </button>
        </div>

        <div
          className="water-meter"
          role="progressbar"
          aria-valuenow={water.total_ml}
          aria-valuemin={0}
          aria-valuemax={water.goal_ml}
          aria-label="Прогресс выпитой воды"
        >
          <div
            className="water-meter-fill"
            style={{ width: `${waterPct}%` }}
          />
        </div>

        <div className="water-quick-row">
          {WATER_QUICK_AMOUNTS.map((preset) => (
            <button
              key={preset.amount_ml}
              type="button"
              className="mt-btn mt-btn--secondary tabular"
              disabled={waterBusy}
              onClick={() => handleAddWater(preset.amount_ml)}
            >
              +{preset.amount_ml}
            </button>
          ))}
          <button
            type="button"
            className="mt-icon-btn mt-icon-btn--bordered"
            style={{ flexShrink: 0 }}
            aria-label={
              lastWaterLog
                ? `Отменить последнюю запись воды ${lastWaterLog.amount_ml} мл`
                : "Нет записей воды для отмены"
            }
            disabled={waterBusy || !lastWaterLog}
            onClick={() => handleDeleteWaterLog(lastWaterLog, true)}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </section>

      {/* 2. Single Calm Filter Row */}
      <div
        className="mt-chip-row"
        role="group"
        aria-label="Фильтр привычек и витаминов"
      >
        <Pill
          tone="neutral"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        >
          Все ({counts.all})
        </Pill>
        <Pill
          tone="neutral"
          active={filter === "habit"}
          onClick={() => setFilter("habit")}
        >
          Привычки ({counts.habit})
        </Pill>
        <Pill
          tone="neutral"
          active={filter === "vitamin"}
          onClick={() => setFilter("vitamin")}
        >
          Витамины ({counts.vitamin})
        </Pill>
      </div>

      {error ? (
        <div className="mt-card mt-card--compact">
          <p className="mt-form-error">{error}</p>
          <button
            type="button"
            className="mt-btn mt-btn--secondary mt-btn--sm"
            onClick={loadData}
          >
            Повторить
          </button>
        </div>
      ) : null}

      {/* 3. Morning / Afternoon / Evening iOS Grouped Lists */}
      {loading && habits.length === 0 ? (
        <div className="mt-card mt-card--compact">
          <p className="mt-card-sub">Загружаем расписание…</p>
        </div>
      ) : habits.length === 0 ? (
        <div className="mt-card">
          <EmptyState
            icon={<Sun size={22} />}
            title="Пока нет привычек"
            description="Добавьте утренние, дневные или вечерние ритуалы и витамины."
            action={
              <button
                type="button"
                className="mt-btn mt-btn--primary"
                onClick={() => openCreateSheet("morning", "habit")}
              >
                <Plus size={16} />
                <span>Добавить</span>
              </button>
            }
          />
        </div>
      ) : (
        HABIT_PERIODS.map((period) => {
          const periodItems = groupedHabits[period.key] || [];
          const doneCount = periodItems.filter((h) => h.completed).length;
          const totalCount = periodItems.length;

          return (
            <section
              key={period.key}
              className="mt-stack mt-stack--xs"
              aria-label={`Блок ${period.label}`}
            >
              <GroupHeader
                title={period.label}
                meta={`${doneCount}/${totalCount}`}
                action={
                  <button
                    type="button"
                    className="mt-icon-btn"
                    aria-label={`Добавить в блок ${period.label}`}
                    onClick={() =>
                      openCreateSheet(
                        period.key,
                        filter === "vitamin" ? "vitamin" : "habit",
                      )
                    }
                  >
                    <Plus size={16} />
                  </button>
                }
              />

              <GroupList>
                {periodItems.length === 0 ? (
                  <ListRow
                    title={
                      filter === "vitamin"
                        ? "Нет витаминов"
                        : filter === "habit"
                          ? "Нет привычек"
                          : "Добавить запись"
                    }
                    meta="Нажмите, чтобы запланировать"
                    onClick={() =>
                      openCreateSheet(
                        period.key,
                        filter === "vitamin" ? "vitamin" : "habit",
                      )
                    }
                  />
                ) : (
                  periodItems.map((item) => {
                    const isVitamin = item.category === "vitamin";
                    const metaParts = [];
                    if (isVitamin) metaParts.push("Витамин");
                    if (item.dose_or_note) metaParts.push(item.dose_or_note);
                    if (item.completed && item.completed_at) {
                      metaParts.push(item.completed_at);
                    }
                    const meta = metaParts.join(" · ");

                    return (
                      <ListRow
                        key={item.id}
                        checked={Boolean(item.completed)}
                        onToggle={() => handleToggleHabit(item)}
                        onClick={() => openEditSheet(item)}
                        accent="cobalt"
                        title={item.title}
                        meta={meta || undefined}
                        trailing={
                          item.streak_days > 0 ? (
                            <span className="habit-streak tabular">
                              {item.streak_days} дн.
                            </span>
                          ) : null
                        }
                      />
                    );
                  })
                )}
              </GroupList>
            </section>
          );
        })
      )}

      {/* Water Goal & Timestamped Logs Bottom Sheet */}
      <Sheet
        open={waterSheetOpen}
        onClose={() => setWaterSheetOpen(false)}
        title="Вода"
        subtitle={`Выпито ${water.total_ml} из ${water.goal_ml} мл`}
        footer={
          <button
            type="button"
            className="mt-btn mt-btn--primary mt-btn--wide"
            disabled={savingGoal}
            onClick={handleSaveGoal}
          >
            {savingGoal ? "Сохраняем…" : "Сохранить цель"}
          </button>
        }
      >
        <div className="mt-stack">
          <form className="mt-stack" onSubmit={handleSaveGoal}>
            <div className="mt-field">
              <label className="mt-label" htmlFor="water-goal-input">
                Дневная цель (мл)
              </label>
              <input
                id="water-goal-input"
                type="number"
                inputMode="numeric"
                min={200}
                max={10000}
                step={50}
                className="mt-input tabular"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
              />
            </div>

            <div className="mt-chip-row mt-chip-row--wrap">
              {WATER_GOAL_PRESETS.map((ml) => (
                <Pill
                  key={ml}
                  tone="cobalt"
                  active={Number(goalInput) === ml}
                  onClick={() => setGoalInput(String(ml))}
                  className="tabular"
                >
                  {ml} мл
                </Pill>
              ))}
            </div>
          </form>

          {water.logs.length > 0 ? (
            <div className="mt-stack mt-stack--xs">
              <GroupHeader
                title="Записи за день"
                meta={String(water.logs.length)}
              />
              <GroupList>
                {[...water.logs].reverse().map((log) => (
                  <ListRow
                    key={log.id}
                    title={`+${log.amount_ml} мл`}
                    meta={log.logged_at || "Сегодня"}
                    trailing={
                      <button
                        type="button"
                        className="mt-icon-btn"
                        aria-label={`Удалить запись ${log.amount_ml} мл`}
                        disabled={waterBusy}
                        onClick={() => handleDeleteWaterLog(log, false)}
                      >
                        <Trash2 size={15} />
                      </button>
                    }
                  />
                ))}
              </GroupList>
            </div>
          ) : (
            <p className="mt-card-sub">За сегодня ещё нет записей воды.</p>
          )}
        </div>
      </Sheet>

      {/* Add / Edit Habit or Vitamin Bottom Sheet */}
      <Sheet
        open={habitSheetOpen}
        onClose={() => setHabitSheetOpen(false)}
        title={
          habitForm.id
            ? "Редактировать"
            : habitForm.category === "vitamin"
              ? "Новый витамин"
              : "Новая привычка"
        }
        footer={
          <div className="mt-row" style={{ gap: "10px" }}>
            {habitForm.id ? (
              <button
                type="button"
                className="mt-btn mt-btn--danger"
                disabled={savingHabit}
                onClick={handleDeleteHabit}
                aria-label="Удалить запись"
              >
                <Trash2 size={16} />
                <span>Удалить</span>
              </button>
            ) : null}
            <button
              type="button"
              className="mt-btn mt-btn--primary mt-btn--wide"
              disabled={savingHabit}
              onClick={handleSaveHabit}
            >
              {savingHabit
                ? "Сохраняем…"
                : habitForm.id
                  ? "Сохранить"
                  : "Добавить"}
            </button>
          </div>
        }
      >
        <form className="mt-stack" onSubmit={handleSaveHabit}>
          <div className="mt-field">
            <span className="mt-label">Тип</span>
            <SegmentedControl
              value={habitForm.category}
              onChange={(val) =>
                setHabitForm((prev) => ({ ...prev, category: val }))
              }
              options={[
                { value: "habit", label: "Привычка" },
                { value: "vitamin", label: "Витамин" },
              ]}
            />
          </div>

          <div className="mt-field">
            <span className="mt-label">Время дня</span>
            <SegmentedControl
              value={habitForm.period_of_day}
              onChange={(val) =>
                setHabitForm((prev) => ({ ...prev, period_of_day: val }))
              }
              options={HABIT_PERIODS.map((p) => ({
                value: p.key,
                label: p.label,
              }))}
            />
          </div>

          <div className="mt-field">
            <label className="mt-label" htmlFor="habit-title-input">
              Название
            </label>
            <input
              id="habit-title-input"
              type="text"
              className="mt-input"
              placeholder={
                habitForm.category === "vitamin"
                  ? "Например: Витамин Д3 2000 МЕ"
                  : "Например: прогулка 20 минут"
              }
              value={habitForm.title}
              onChange={(e) =>
                setHabitForm((prev) => ({ ...prev, title: e.target.value }))
              }
            />
          </div>

          <div className="mt-field">
            <label className="mt-label" htmlFor="habit-dose-input">
              {habitForm.category === "vitamin"
                ? "Дозировка и приём"
                : "Заметка (необязательно)"}
            </label>
            <input
              id="habit-dose-input"
              type="text"
              className="mt-input"
              placeholder={
                habitForm.category === "vitamin"
                  ? "2000 МЕ после завтрака"
                  : "Например: после пробуждения"
              }
              value={habitForm.dose_or_note}
              onChange={(e) =>
                setHabitForm((prev) => ({ ...prev, dose_or_note: e.target.value }))
              }
            />
          </div>

          <div className="mt-field">
            <span className="mt-label">Дней в неделю</span>
            <div className="mt-chip-row mt-chip-row--wrap">
              {[3, 4, 5, 6, 7].map((days) => (
                <Pill
                  key={days}
                  tone="cobalt"
                  active={Number(habitForm.target_days_per_week) === days}
                  onClick={() =>
                    setHabitForm((prev) => ({
                      ...prev,
                      target_days_per_week: days,
                    }))
                  }
                  className="tabular"
                >
                  {days} дн.
                </Pill>
              ))}
            </div>
          </div>

          {formError ? <p className="mt-form-error">{formError}</p> : null}
        </form>
      </Sheet>
    </div>
  );
}
