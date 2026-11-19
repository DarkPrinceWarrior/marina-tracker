import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Droplets,
  Flame,
  HeartPulse,
  Home,
  Pill as CapsuleIcon,
  Smartphone,
  Target,
  UtensilsCrossed,
} from "lucide-react";
import api, { withOptimistic } from "../api.js";
import {
  DateStrip,
  Pill,
  ProgressRing,
  SectionHeader,
} from "../components/UiPrimitives.jsx";
import DailyTaskPlanner from "../components/today/DailyTaskPlanner.jsx";
import DailyAccomplishments from "../components/today/DailyAccomplishments.jsx";
import TaskFormSheet from "../components/today/TaskFormSheet.jsx";
import {
  APP_BRAND,
  CYCLE_PHASES,
  formatCountRu,
  getGreetingByHour,
} from "../data/presets.js";
import {
  addDays,
  formatDateFullRu,
  formatRelativeDayRu,
  todayISO,
} from "../utils/date.js";

function detectStandaloneMode() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone === true
  );
}

function getGreetingFromPeriod(period) {
  if (period === "morning") return `Доброе утро, ${APP_BRAND.ownerName}`;
  if (period === "afternoon") return `Добрый день, ${APP_BRAND.ownerName}`;
  if (period === "evening") return `Добрый вечер, ${APP_BRAND.ownerName}`;
  return getGreetingByHour();
}

export default function TodaySection({
  selectedDate,
  todayDate = todayISO(),
  onSelectDate,
  onNavigate,
  notify,
  onOpenInstallGuide,
  onOpenYearReview,
  onDataChanged,
}) {
  const activeDate = selectedDate || todayDate;

  const [data, setData] = useState(null);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isStandalone, setIsStandalone] = useState(detectStandaloneMode);

  const [quickWaterBusy, setQuickWaterBusy] = useState(false);
  const [quickHabitBusy, setQuickHabitBusy] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState(null);

  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [savingTask, setSavingTask] = useState(false);

  const reqSeqRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(display-mode: standalone)");
    const sync = () => setIsStandalone(detectStandaloneMode());
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  const loadToday = useCallback(
    async (dateStr = activeDate, { silent = false } = {}) => {
      const seq = ++reqSeqRef.current;
      if (!silent) setError("");
      try {
        const res = await api.getToday(dateStr);
        if (seq !== reqSeqRef.current) return;
        setData(res);
      } catch (err) {
        if (seq !== reqSeqRef.current) return;
        setError(err?.message || "Не удалось загрузить сводку дня.");
      } finally {
        if (seq === reqSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [activeDate]
  );

  const loadGoals = useCallback(async () => {
    try {
      const res = await api.getGoals({ status: "active" });
      setGoals(Array.isArray(res?.items) ? res.items : []);
    } catch {
      // Non-critical for initial Today render
    }
  }, []);

  useEffect(() => {
    loadToday(activeDate);
  }, [activeDate, loadToday]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const summary = data?.summary;
  const tasks = data?.tasks || [];
  const completedFeed = data?.completed_feed || [];
  const reflection = data?.reflection || null;
  const overallPct = data?.overall_progress_pct ?? 0;

  const dateMarkers = useMemo(() => {
    if (!data) return {};
    const status = summary?.cycle?.is_period_today
      ? "period"
      : overallPct >= 80
        ? "done"
        : overallPct > 0
          ? "partial"
          : undefined;
    return status ? { [activeDate]: status } : {};
  }, [data, summary?.cycle?.is_period_today, overallPct, activeDate]);

  const greeting = useMemo(() => {
    if (data?.greeting_period) {
      return getGreetingFromPeriod(data.greeting_period);
    }
    return getGreetingByHour();
  }, [data?.greeting_period]);

  const handleQuickAddWater = async () => {
    if (quickWaterBusy) return;
    setQuickWaterBusy(true);
    try {
      await withOptimistic({
        apply: () => {
          const prev = data;
          setData((curr) => {
            if (!curr?.summary?.water) return curr;
            const nextTotal = (curr.summary.water.total_ml || 0) + 250;
            const goalMl = curr.summary.water.goal_ml || 2000;
            return {
              ...curr,
              summary: {
                ...curr.summary,
                water: {
                  ...curr.summary.water,
                  total_ml: nextTotal,
                  percent: Math.min(100, Math.round((nextTotal * 100) / Math.max(1, goalMl))),
                },
              },
            };
          });
          return prev;
        },
        commit: async () => {
          await api.logWater({ date: activeDate, amount_ml: 250 });
          await loadToday(activeDate, { silent: true });
          onDataChanged?.();
          notify?.("+250 мл воды добавлено", "success");
        },
        rollback: (prev) => setData(prev),
        onError: (err) =>
          notify?.(err?.message || "Не удалось записать воду", "error"),
      });
    } catch {
      // Handled in onError
    } finally {
      setQuickWaterBusy(false);
    }
  };

  const handleQuickCompleteHabit = async () => {
    const nextPending = summary?.habits?.next_pending;
    if (!nextPending) {
      onNavigate?.("habits", "habits");
      return;
    }
    if (quickHabitBusy) return;
    setQuickHabitBusy(true);
    try {
      await api.toggleHabit(nextPending.id, {
        date: activeDate,
        completed: true,
      });
      await loadToday(activeDate, { silent: true });
      onDataChanged?.();
      notify?.(`Отмечено: ${nextPending.title}`, "success");
    } catch (err) {
      notify?.(err?.message || "Не удалось отметить привычку", "error");
    } finally {
      setQuickHabitBusy(false);
    }
  };

  const handleToggleTask = async (task) => {
    if (!task?.id) return;
    setBusyTaskId(task.id);
    const nextCompleted = !task.completed;
    try {
      await withOptimistic({
        apply: () => {
          const prev = data;
          setData((curr) => {
            if (!curr) return curr;
            const nextTasks = (curr.tasks || []).map((t) =>
              t.id === task.id ? { ...t, completed: nextCompleted } : t
            );
            const doneCount = nextTasks.filter((t) => t.completed).length;
            return {
              ...curr,
              tasks: nextTasks,
              summary: curr.summary
                ? {
                    ...curr.summary,
                    tasks: { done: doneCount, total: nextTasks.length },
                  }
                : curr.summary,
            };
          });
          return prev;
        },
        commit: async () => {
          await api.toggleTask(task.id, nextCompleted);
          await loadToday(activeDate, { silent: true });
          onDataChanged?.();
          if (nextCompleted) {
            notify?.(`Задача выполнена: ${task.title}`, "success");
          }
        },
        rollback: (prev) => setData(prev),
        onError: (err) =>
          notify?.(err?.message || "Не удалось обновить задачу", "error"),
      });
    } catch {
      // Handled in onError
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleRescheduleTask = async (task) => {
    if (!task?.id) return;
    setBusyTaskId(task.id);
    const nextDate = addDays(task.task_date || activeDate, 1);
    try {
      await api.rescheduleTask(task.id, { task_date: nextDate });
      await loadToday(activeDate, { silent: true });
      onDataChanged?.();
      notify?.(`Перенесено на ${formatRelativeDayRu(nextDate).toLowerCase()}`, "info");
    } catch (err) {
      notify?.(err?.message || "Не удалось перенести задачу", "error");
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleDeleteTask = async (task) => {
    if (!task?.id) return;
    setBusyTaskId(task.id);
    try {
      await api.deleteTask(task.id);
      if (editingTask?.id === task.id) {
        setTaskSheetOpen(false);
        setEditingTask(null);
      }
      await loadToday(activeDate, { silent: true });
      onDataChanged?.();
      notify?.("Задача удалена", "info");
    } catch (err) {
      notify?.(err?.message || "Не удалось удалить задачу", "error");
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleSaveTask = async (payload) => {
    setSavingTask(true);
    try {
      if (payload.id) {
        const { id, ...patch } = payload;
        await api.updateTask(id, patch);
        notify?.("Задача обновлена", "success");
      } else {
        await api.createTask(payload);
        notify?.("Задача добавлена", "success");
      }
      setTaskSheetOpen(false);
      setEditingTask(null);
      await loadToday(activeDate, { silent: true });
      onDataChanged?.();
    } finally {
      setSavingTask(false);
    }
  };

  const handleSaveReflection = async (payload, { silent = false } = {}) => {
    try {
      const saved = await api.saveReflection(payload);
      setData((curr) => (curr ? { ...curr, reflection: saved } : curr));
      if (!silent) {
        notify?.("Итог дня сохранён", "success");
      }
    } catch (err) {
      notify?.(err?.message || "Не удалось сохранить заметку", "error");
      throw err;
    }
  };

  const openCreateTask = () => {
    setEditingTask(null);
    setTaskSheetOpen(true);
  };

  const openEditTask = (task) => {
    setEditingTask(task);
    setTaskSheetOpen(true);
  };

  const habits = summary?.habits || {
    done: 0,
    total: 0,
    vitamins_done: 0,
    vitamins_total: 0,
    next_pending: null,
  };
  const water = summary?.water || { total_ml: 0, goal_ml: 2000, percent: 0 };
  const workouts = summary?.workouts || {
    count: 0,
    total_minutes: 0,
    latest: null,
  };
  const nutrition = summary?.nutrition || {
    meals_count: 0,
    slots_done: [],
    total_kcal: 0,
    total_grams: 0,
  };
  const chores = summary?.chores || {
    done: 0,
    total: 0,
    shopping_remaining: 0,
  };
  const goalsSummary = summary?.goals || {
    active_count: 0,
    avg_progress_pct: 0,
    needs_attention_count: 0,
  };
  const cycle = summary?.cycle || null;
  const cyclePhaseMeta = cycle?.phase ? CYCLE_PHASES[cycle.phase] : null;
  const waterReached = water.total_ml >= water.goal_ml;

  return (
    <div className="mt-section">
      {/* 1. Top Hero & 7-Day Date Strip */}
      <div className="mt-stack mt-stack--sm">
        <SectionHeader
          eyebrow={formatDateFullRu(activeDate)}
          title={greeting}
          action={
            !isStandalone && onOpenInstallGuide ? (
              <Pill
                tone="brand"
                icon={<Smartphone size={14} />}
                onClick={onOpenInstallGuide}
                aria-label="Установить приложение на экран Домой"
              >
                На экран
              </Pill>
            ) : null
          }
        />
        <DateStrip
          selectedDate={activeDate}
          todayDate={todayDate}
          onSelectDate={onSelectDate}
          markers={dateMarkers}
        />
      </div>

      {error ? (
        <div className="mt-card mt-card--compact">
          <p className="mt-form-error">{error}</p>
          <button
            type="button"
            className="mt-btn mt-btn--secondary mt-btn--sm"
            onClick={() => loadToday(activeDate)}
          >
            Повторить загрузку
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="mt-card">
          <p className="mt-card-sub">Загружаем ваш ритм дня...</p>
        </div>
      ) : (
        <>
          {/* 2. Daily Progress Overview Card */}
          <section className="today-hero-card" aria-label="Сводка дня">
            <div className="today-overview-row">
              <ProgressRing
                percent={overallPct}
                size={78}
                strokeWidth={7}
                color="var(--brand)"
                sublabel="дня"
              />
              <div className="today-overview-copy">
                <strong>
                  {activeDate === todayDate
                    ? "Ритм сегодняшнего дня"
                    : `Обзор за ${formatRelativeDayRu(activeDate).toLowerCase()}`}
                </strong>
                <span>
                  {completedFeed.length > 0
                    ? `${formatCountRu(completedFeed.length, "шаг", "шага", "шагов")} · задачи ${summary?.tasks?.done ?? 0}/${summary?.tasks?.total ?? 0}`
                    : "Отмечайте шаги в удобном ритме"}
                </span>
              </div>
            </div>

            <div className="today-domain-grid">
              <button
                type="button"
                className="today-domain-tile today-domain-tile--habits"
                onClick={() => onNavigate?.("habits", "habits")}
              >
                <span className="today-domain-tile-head">
                  <span>Привычки и вода</span>
                  <HeartPulse size={15} aria-hidden="true" />
                </span>
                <strong className="tabular">
                  {habits.done}/{habits.total}
                </strong>
                <small className="tabular">
                  Вода {water.total_ml} / {water.goal_ml} мл
                </small>
              </button>

              <button
                type="button"
                className="today-domain-tile today-domain-tile--nutrition"
                onClick={() => onNavigate?.("nutrition", "day")}
              >
                <span className="today-domain-tile-head">
                  <span>Питание</span>
                  <UtensilsCrossed size={15} aria-hidden="true" />
                </span>
                <strong className="tabular">
                  {formatCountRu(nutrition.meals_count, "приём", "приёма", "приёмов")}
                </strong>
                <small className="tabular">
                  {nutrition.total_kcal > 0
                    ? `${nutrition.total_kcal} ккал · ${nutrition.total_grams} г`
                    : "Добавить завтрак или обед"}
                </small>
              </button>

              <button
                type="button"
                className="today-domain-tile today-domain-tile--home"
                onClick={() => onNavigate?.("home", "chores")}
              >
                <span className="today-domain-tile-head">
                  <span>Дом</span>
                  <Home size={15} aria-hidden="true" />
                </span>
                <strong className="tabular">
                  {chores.done}/{chores.total}
                </strong>
                <small className="tabular">
                  {chores.shopping_remaining > 0
                    ? `Покупки: ${chores.shopping_remaining}`
                    : "Список покупок чист"}
                </small>
              </button>

              <button
                type="button"
                className="today-domain-tile today-domain-tile--goals"
                onClick={() => onNavigate?.("goals")}
              >
                <span className="today-domain-tile-head">
                  <span>Цели</span>
                  <Target size={15} aria-hidden="true" />
                </span>
                <strong className="tabular">{goalsSummary.avg_progress_pct}%</strong>
                <small className="tabular">
                  {goalsSummary.needs_attention_count > 0
                    ? `Внимание: ${goalsSummary.needs_attention_count}`
                    : formatCountRu(goalsSummary.active_count, "активная", "активные", "активных")}
                </small>
              </button>
            </div>

            {cycle && cycle.cycle_day ? (
              <button
                type="button"
                className="today-cycle-banner"
                onClick={() => onNavigate?.("habits", "cycle")}
              >
                <span className="mt-row" style={{ gap: 8 }}>
                  <Flame size={16} aria-hidden="true" />
                  <span className="tabular">
                    День цикла {cycle.cycle_day} ·{" "}
                    {cycle.phase_label || cyclePhaseMeta?.label || "Цикл"}
                  </span>
                </span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="today-cycle-banner"
                onClick={() => onNavigate?.("habits", "cycle")}
              >
                <span className="mt-row" style={{ gap: 8 }}>
                  <Flame size={16} aria-hidden="true" />
                  <span>Календарь цикла · открыть</span>
                </span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            )}
          </section>

          {/* 3. Quick One-Tap Check Strip («Быстрые отметки») */}
          <section className="mt-stack mt-stack--xs" aria-label="Быстрые отметки">
            <p className="mt-eyebrow" style={{ paddingInline: 2 }}>
              Быстрые отметки
            </p>
            <div className="mt-stack mt-stack--xs">
              <div className="today-quick-strip today-quick-strip--grid">
                <button
                  type="button"
                  className={`today-quick-btn${waterReached ? " is-done" : ""}`}
                  style={{ minWidth: 0, padding: "9px 12px" }}
                  disabled={quickWaterBusy}
                  onClick={handleQuickAddWater}
                >
                  <Droplets
                    size={17}
                    style={{
                      color: waterReached ? "var(--habits)" : "var(--water)",
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />
                  <span
                    style={{
                      minWidth: 0,
                      flex: "1 1 auto",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 1,
                      lineHeight: 1.25,
                    }}
                  >
                    <span className="tabular">+250 мл воды</span>
                    <span
                      className="muted tabular"
                      style={{
                        fontSize: 11.5,
                        fontWeight: 500,
                        maxWidth: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {water.total_ml} / {water.goal_ml} мл
                    </span>
                  </span>
                </button>

                {habits.next_pending ? (
                  <button
                    type="button"
                    className="today-quick-btn"
                    style={{ minWidth: 0, padding: "9px 12px" }}
                    disabled={quickHabitBusy}
                    onClick={handleQuickCompleteHabit}
                  >
                    {habits.next_pending.category === "vitamin" ? (
                      <CapsuleIcon
                        size={17}
                        style={{ color: "var(--brand)", flexShrink: 0 }}
                        aria-hidden="true"
                      />
                    ) : (
                      <CheckCircle2
                        size={17}
                        style={{ color: "var(--habits)", flexShrink: 0 }}
                        aria-hidden="true"
                      />
                    )}
                    <span
                      style={{
                        minWidth: 0,
                        flex: "1 1 auto",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 1,
                        lineHeight: 1.25,
                      }}
                    >
                      <span
                        className="muted"
                        style={{ fontSize: 11, fontWeight: 600 }}
                      >
                        {habits.next_pending.category === "vitamin"
                          ? "Витамин"
                          : "Следующий шаг"}
                      </span>
                      <span
                        style={{
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {habits.next_pending.title}
                      </span>
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="today-quick-btn is-done"
                    style={{ minWidth: 0, padding: "9px 12px" }}
                    onClick={() => onNavigate?.("habits", "habits")}
                  >
                    <CheckCircle2
                      size={17}
                      style={{ flexShrink: 0 }}
                      aria-hidden="true"
                    />
                    <span
                      style={{
                        minWidth: 0,
                        flex: "1 1 auto",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 1,
                        lineHeight: 1.25,
                      }}
                    >
                      <span>Привычки</span>
                      <span style={{ fontSize: 11.5, fontWeight: 500 }}>
                        Все сделаны ✓
                      </span>
                    </span>
                  </button>
                )}
              </div>

              <button
                type="button"
                className={`today-quick-btn${workouts.latest ? " is-done" : ""}`}
                style={{
                  width: "100%",
                  minWidth: 0,
                  justifyContent: "space-between",
                  padding: "10px 13px",
                }}
                onClick={() => onNavigate?.("habits", "workouts")}
              >
                <span
                  className="mt-row"
                  style={{ gap: 8, minWidth: 0, flex: "1 1 auto" }}
                >
                  <Activity
                    size={16}
                    style={{
                      color: workouts.latest ? "var(--habits)" : "var(--brand)",
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />
                  <span
                    className="tabular"
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {workouts.latest
                      ? `Тренировка: ${workouts.latest.label} · ${workouts.latest.duration_min} мин ✓`
                      : "Отметить тренировку"}
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  style={{ flexShrink: 0, opacity: 0.7 }}
                  aria-hidden="true"
                />
              </button>
            </div>
          </section>

          {/* 4. Full Daily Task Planner */}
          <DailyTaskPlanner
            tasks={tasks}
            onAddTask={openCreateTask}
            onEditTask={openEditTask}
            onToggleTask={handleToggleTask}
            onRescheduleTask={handleRescheduleTask}
            onDeleteTask={handleDeleteTask}
            busyTaskId={busyTaskId}
          />

          {/* 5. «Что сделано за день» & Evening Reflection */}
          <DailyAccomplishments
            feed={completedFeed}
            reflection={reflection}
            selectedDate={activeDate}
            onSaveReflection={handleSaveReflection}
            onOpenYearReview={onOpenYearReview}
          />
        </>
      )}

      <TaskFormSheet
        open={taskSheetOpen}
        onClose={() => {
          setTaskSheetOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
        selectedDate={activeDate}
        goals={goals}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        saving={savingTask}
      />
    </div>
  );
}
