import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CloudSun,
  Droplets,
  Flame,
  Moon,
  Pencil,
  Pill as PillIcon,
  Plus,
  RotateCcw,
  Settings2,
  Sun,
  Trash2,
} from "lucide-react";
import api from "../../api.js";
import Sheet from "../Sheet.jsx";
import {
  CheckRow,
  EmptyState,
  Pill,
  SegmentedControl,
} from "../UiPrimitives.jsx";
import {
  HABIT_PERIODS,
  WATER_GOAL_PRESETS,
  WATER_QUICK_AMOUNTS,
} from "../../data/presets.js";
import { formatCountRu, nowTimeHHMM } from "../../utils/date.js";

const PERIOD_ICONS = {
  morning: Sun,
  afternoon: CloudSun,
  evening: Moon,
};

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

  // Water UI state
  const [waterLogsOpen, setWaterLogsOpen] = useState(false);
  const [waterBusy, setWaterBusy] = useState(false);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
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

  const summary = useMemo(() => recomputeSummary(habits), [habits]);

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
      notify?.(`+${amountMl} мл воды записано`, "success");
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
    const nextTotal = Math.max(0, prevWater.total_ml - (Number(logItem.amount_ml) || 0));
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
          : `Запись ${logItem.amount_ml} мл удалена`,
        "info",
      );
    } catch (err) {
      setWater(prevWater);
      notify?.(err?.message || "Не удалось удалить запись воды", "error");
    } finally {
      setWaterBusy(false);
    }
  };

  const openGoalSheet = () => {
    setGoalInput(String(water.goal_ml || 2000));
    setGoalSheetOpen(true);
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
        percent: nextGoal ? Math.min(100, Math.round((prev.total_ml / nextGoal) * 100)) : 0,
      }));
      setGoalSheetOpen(false);
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
          ? "Введите название витамина или добавки"
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
            ? "Витамин добавлен в расписание"
            : "Новая привычка добавлена",
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

  const waterRemaining = Math.max(0, (water.goal_ml || 2000) - (water.total_ml || 0));
  const waterPct = Math.min(
    100,
    water.goal_ml > 0 ? Math.round((water.total_ml / water.goal_ml) * 100) : 0,
  );
  const lastWaterLog = water.logs.length > 0 ? water.logs[water.logs.length - 1] : null;

  return (
    <div className="mt-stack">
      {/* 1. Water Tracker Hero Card */}
      <section className="mt-card water-card" data-accent="water" aria-label="Трекер воды">
        <div className="mt-card-head">
          <div className="mt-row" style={{ gap: "8px" }}>
            <Pill tone="water" icon={<Droplets size={13} />}>
              Вода
            </Pill>
            <span className="mt-card-sub tabular">
              {waterRemaining > 0
                ? `Осталось ${waterRemaining} мл`
                : "Дневная цель выполнена"}
            </span>
          </div>
          <button
            type="button"
            className="mt-icon-btn"
            aria-label="Изменить дневную цель воды"
            onClick={openGoalSheet}
          >
            <Settings2 size={18} />
          </button>
        </div>

        <div className="mt-row mt-row--between" style={{ alignItems: "baseline" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
            <strong
              className="tabular"
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "26px",
                lineHeight: "30px",
                letterSpacing: "-0.025em",
                color: "var(--ink)",
              }}
            >
              {water.total_ml}
            </strong>
            <span className="mt-card-sub tabular" style={{ fontSize: "14px" }}>
              / {water.goal_ml} мл
            </span>
          </div>
          <Pill tone={waterPct >= 100 ? "success" : "water"} className="tabular">
            {waterPct}%
          </Pill>
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
              className="mt-btn mt-btn--soft mt-btn--sm tabular"
              data-accent="water"
              disabled={waterBusy}
              onClick={() => handleAddWater(preset.amount_ml)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {water.logs.length > 0 ? (
          <div className="mt-stack mt-stack--sm">
            <div className="mt-row mt-row--between" style={{ gap: "8px" }}>
              <button
                type="button"
                className="mt-btn mt-btn--ghost mt-btn--sm"
                style={{ paddingInline: "6px" }}
                aria-expanded={waterLogsOpen}
                onClick={() => setWaterLogsOpen((v) => !v)}
              >
                <span className="mt-card-sub tabular">
                  Записи за день ({water.logs.length})
                </span>
                {waterLogsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {lastWaterLog ? (
                <button
                  type="button"
                  className="mt-btn mt-btn--ghost mt-btn--sm"
                  aria-label={`Отменить последнюю запись воды ${lastWaterLog.amount_ml} мл`}
                  disabled={waterBusy}
                  onClick={() => handleDeleteWaterLog(lastWaterLog, true)}
                >
                  <RotateCcw size={14} />
                  <span>Отменить</span>
                </button>
              ) : null}
            </div>

            {waterLogsOpen ? (
              <div className="water-log-list">
                {[...water.logs].reverse().map((log) => (
                  <div key={log.id} className="water-log-item">
                    <div className="mt-row" style={{ gap: "10px" }}>
                      <span className="mt-pill mt-pill--water tabular">
                        {log.logged_at || "—"}
                      </span>
                      <span className="tabular" style={{ fontWeight: 600, color: "var(--ink)" }}>
                        +{log.amount_ml} мл
                      </span>
                    </div>
                    <button
                      type="button"
                      className="mt-icon-btn"
                      aria-label={`Удалить запись ${log.amount_ml} мл`}
                      disabled={waterBusy}
                      onClick={() => handleDeleteWaterLog(log, false)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* 2. Balanced Single-Row Filter Bar */}
      <div
        className="mt-chip-row"
        role="group"
        aria-label="Фильтр привычек и витаминов"
      >
        <Pill
          tone="habits"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        >
          Все ({counts.all})
        </Pill>
        <Pill
          tone="habits"
          active={filter === "habit"}
          onClick={() => setFilter("habit")}
        >
          Привычки ({counts.habit})
        </Pill>
        <Pill
          tone="brand"
          active={filter === "vitamin"}
          onClick={() => setFilter("vitamin")}
        >
          Витамины ({counts.vitamin})
        </Pill>
      </div>

      {/* Compact Day Summary Line */}
      {!loading && habits.length > 0 ? (
        <div className="mt-row mt-row--between" style={{ paddingInline: "2px" }}>
          <span className="mt-card-sub tabular">
            Выполнено за день: <strong>{summary.done} из {summary.total}</strong>
          </span>
          <span className="mt-card-sub tabular">
            Витамины: <strong>{summary.vitamins_done}/{summary.vitamins_total}</strong>
          </span>
        </div>
      ) : null}

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

      {/* 3. Morning / Afternoon / Evening Blocks */}
      {loading && habits.length === 0 ? (
        <div className="mt-card">
          <p className="mt-card-sub">Загружаем расписание привычек и витаминов…</p>
        </div>
      ) : habits.length === 0 ? (
        <div className="mt-card">
          <EmptyState
            icon={<Sun size={24} />}
            title="Пока нет привычек и витаминов"
            description="Добавьте утренние, дневные или вечерние ритуалы и приём витаминов."
            action={
              <button
                type="button"
                className="mt-btn mt-btn--primary"
                onClick={() => openCreateSheet("morning", "habit")}
              >
                <Plus size={17} />
                <span>Добавить первую запись</span>
              </button>
            }
          />
        </div>
      ) : (
        HABIT_PERIODS.map((period) => {
          const periodItems = groupedHabits[period.key] || [];
          const doneCount = periodItems.filter((h) => h.completed).length;
          const totalCount = periodItems.length;
          const allDone = totalCount > 0 && doneCount === totalCount;
          const PeriodIcon = PERIOD_ICONS[period.key] || Sun;

          return (
            <section
              key={period.key}
              className="mt-card habits-period-card"
              aria-label={`Блок ${period.label}`}
            >
              <div className="habits-period-head">
                <div className="mt-row" style={{ gap: "10px", minWidth: 0 }}>
                  <span
                    className="mt-pill mt-pill--habits"
                    aria-hidden="true"
                    style={{ paddingInline: "8px" }}
                  >
                    <PeriodIcon size={15} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <h2 className="mt-card-title">{period.label}</h2>
                    <p className="mt-card-sub tabular">{period.window}</p>
                  </div>
                </div>

                <div className="mt-row" style={{ gap: "6px" }}>
                  <Pill tone={allDone ? "success" : "neutral"} className="tabular">
                    {doneCount}/{totalCount}
                  </Pill>
                  <button
                    type="button"
                    className="mt-icon-btn"
                    aria-label={`Добавить в блок ${period.label}`}
                    onClick={() =>
                      openCreateSheet(period.key, filter === "vitamin" ? "vitamin" : "habit")
                    }
                  >
                    <Plus size={17} />
                  </button>
                </div>
              </div>

              {periodItems.length === 0 ? (
                <p className="mt-card-sub" style={{ paddingTop: "4px" }}>
                  {filter === "vitamin"
                    ? "Нет витаминов на это время дня."
                    : filter === "habit"
                      ? "Нет привычек на это время дня."
                      : "Пока ничего не запланировано."}
                </p>
              ) : (
                <div className="mt-stack mt-stack--sm">
                  {periodItems.map((item) => {
                    const isVitamin = item.category === "vitamin";
                    const metaParts = [];
                    if (item.dose_or_note) metaParts.push(item.dose_or_note);
                    if (item.completed && item.completed_at) {
                      metaParts.push(`Отмечено в ${item.completed_at}`);
                    }
                    const subtitle = metaParts.join(" · ");

                    return (
                      <CheckRow
                        key={item.id}
                        checked={Boolean(item.completed)}
                        onToggle={() => handleToggleHabit(item)}
                        accent={isVitamin ? "brand" : "habits"}
                        title={item.title}
                        subtitle={subtitle || undefined}
                        badge={
                          <span className="mt-row" style={{ gap: "6px", flexWrap: "wrap" }}>
                            {isVitamin ? (
                              <Pill tone="brand" icon={<PillIcon size={11} />}>
                                Витамин
                              </Pill>
                            ) : null}
                            {item.streak_days > 0 ? (
                              <span
                                className="habit-streak tabular"
                                title={`Серия: ${formatCountRu(item.streak_days, "день", "дня", "дней")}`}
                              >
                                <Flame size={12} />
                                {item.streak_days} дн.
                              </span>
                            ) : null}
                          </span>
                        }
                        trailing={
                          <button
                            type="button"
                            className="mt-icon-btn"
                            aria-label={`Редактировать «${item.title}»`}
                            onClick={() => openEditSheet(item)}
                          >
                            <Pencil size={15} />
                          </button>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </section>
          );
        })
      )}

      {/* Water Daily Goal Bottom Sheet */}
      <Sheet
        open={goalSheetOpen}
        onClose={() => setGoalSheetOpen(false)}
        title="Дневная цель по воде"
        subtitle="Комфортный ориентир на каждый день"
        footer={
          <button
            type="button"
            className="mt-btn mt-btn--primary mt-btn--wide"
            data-accent="water"
            disabled={savingGoal}
            onClick={handleSaveGoal}
          >
            {savingGoal ? "Сохраняем…" : "Сохранить цель"}
          </button>
        }
      >
        <form className="mt-stack" onSubmit={handleSaveGoal}>
          <div className="mt-field">
            <label className="mt-label" htmlFor="water-goal-input">
              Цель в миллилитрах (мл)
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

          <div className="mt-field">
            <span className="mt-label">Быстрый выбор</span>
            <div className="mt-chip-row">
              {WATER_GOAL_PRESETS.map((ml) => (
                <Pill
                  key={ml}
                  tone="water"
                  active={Number(goalInput) === ml}
                  onClick={() => setGoalInput(String(ml))}
                  className="tabular"
                >
                  {ml} мл
                </Pill>
              ))}
            </div>
          </div>
        </form>
      </Sheet>

      {/* Add / Edit Habit or Vitamin Bottom Sheet */}
      <Sheet
        open={habitSheetOpen}
        onClose={() => setHabitSheetOpen(false)}
        title={
          habitForm.id
            ? "Редактировать запись"
            : habitForm.category === "vitamin"
              ? "Новый витамин"
              : "Новая привычка"
        }
        subtitle="Выберите время дня и удобную заметку или дозировку"
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
              data-accent="habits"
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
            <span className="mt-label">Тип записи</span>
            <SegmentedControl
              value={habitForm.category}
              onChange={(val) =>
                setHabitForm((prev) => ({ ...prev, category: val }))
              }
              accent="habits"
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
              accent="habits"
              options={HABIT_PERIODS.map((p) => ({
                value: p.key,
                label: p.label,
              }))}
            />
          </div>

          <div className="mt-field">
            <label className="mt-label" htmlFor="habit-title-input">
              {habitForm.category === "vitamin"
                ? "Название витамина или добавки"
                : "Название привычки"}
            </label>
            <input
              id="habit-title-input"
              type="text"
              className="mt-input"
              placeholder={
                habitForm.category === "vitamin"
                  ? "Например: Витамин D3 2000 МЕ"
                  : "Например: Прогулка 20 минут"
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
                ? "Дозировка и правило приёма"
                : "Заметка или ориентир (необязательно)"}
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
            <span className="mt-label">Цель дней в неделю</span>
            <div className="mt-chip-row">
              {[3, 4, 5, 6, 7].map((days) => (
                <Pill
                  key={days}
                  tone="habits"
                  active={Number(habitForm.target_days_per_week) === days}
                  onClick={() =>
                    setHabitForm((prev) => ({ ...prev, target_days_per_week: days }))
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
