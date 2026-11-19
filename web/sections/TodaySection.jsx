import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Award, Bell, Smartphone } from "lucide-react";
import api, { withOptimistic } from "../api.js";
import {
  DateStrip,
  MetricStrip,
  PageHeader,
} from "../components/UiPrimitives.jsx";
import DailyTaskPlanner from "../components/today/DailyTaskPlanner.jsx";
import DailyAccomplishments from "../components/today/DailyAccomplishments.jsx";
import TaskFormSheet from "../components/today/TaskFormSheet.jsx";
import {
  WEEKDAY_SHORT_RU,
  addDays,
  formatDateShortRu,
  formatRelativeDayRu,
  getWeekdayIndex,
  todayISO,
} from "../utils/date.js";

function detectStandaloneMode() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone === true
  );
}

export default function TodaySection({
  selectedDate,
  todayDate = todayISO(),
  onSelectDate,
  onNavigate,
  navRequest = null,
  onConsumeNavRequest,
  notify,
  onOpenInstallGuide,
  onOpenYearReview,
  onOpenNotifications,
  pushEnabled = false,
  onDataChanged,
}) {
  const activeDate = selectedDate || todayDate;

  const [data, setData] = useState(null);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isStandalone, setIsStandalone] = useState(detectStandaloneMode);

  const [quickWaterBusy, setQuickWaterBusy] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState(null);

  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [savingTask, setSavingTask] = useState(false);

  const [doneSheetOpen, setDoneSheetOpen] = useState(false);
  const [reflectionSheetOpen, setReflectionSheetOpen] = useState(false);
  const [gratitudeSheetOpen, setGratitudeSheetOpen] = useState(false);

  const reqSeqRef = useRef(0);

  useEffect(() => {
    if (!navRequest?.seq) return;
    if (navRequest.subTab === "gratitude") {
      setGratitudeSheetOpen(true);
    } else if (navRequest.subTab === "reflection") {
      setReflectionSheetOpen(true);
    } else if (navRequest.subTab === "done") {
      setDoneSheetOpen(true);
    }
    onConsumeNavRequest?.(navRequest.seq);
  }, [navRequest, onConsumeNavRequest]);

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
      // Optional for initial Today render
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

  const compactDateLabel = useMemo(() => {
    const wd = WEEKDAY_SHORT_RU[getWeekdayIndex(activeDate)] || "";
    return `${wd}, ${formatDateShortRu(activeDate)}`;
  }, [activeDate]);

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
                  percent: Math.min(
                    100,
                    Math.round((nextTotal * 100) / Math.max(1, goalMl))
                  ),
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
            notify?.(`Выполнено: ${task.title}`, "success");
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
    setSavingTask(true);
    const nextDate = addDays(task.task_date || activeDate, 1);
    try {
      await api.rescheduleTask(task.id, { task_date: nextDate });
      setTaskSheetOpen(false);
      setEditingTask(null);
      await loadToday(activeDate, { silent: true });
      onDataChanged?.();
      notify?.(
        `Перенесено на ${formatRelativeDayRu(nextDate).toLowerCase()}`,
        "info"
      );
    } catch (err) {
      notify?.(err?.message || "Не удалось перенести задачу", "error");
    } finally {
      setBusyTaskId(null);
      setSavingTask(false);
    }
  };

  const handleDeleteTask = async (task) => {
    if (!task?.id) return;
    setBusyTaskId(task.id);
    setSavingTask(true);
    try {
      await api.deleteTask(task.id);
      setTaskSheetOpen(false);
      setEditingTask(null);
      await loadToday(activeDate, { silent: true });
      onDataChanged?.();
      notify?.("Задача удалена", "info");
    } catch (err) {
      notify?.(err?.message || "Не удалось удалить задачу", "error");
    } finally {
      setBusyTaskId(null);
      setSavingTask(false);
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

  const water = summary?.water || { total_ml: 0, goal_ml: 2000, percent: 0 };
  const cycle = summary?.cycle || null;
  const waterReached = water.total_ml >= water.goal_ml;
  const gratitudesCount = summary?.gratitudes_count ?? 0;

  const metricItems = [
    {
      key: "day",
      label: "День",
      value: `${overallPct}%`,
      tone: "cobalt",
      onClick: () => setDoneSheetOpen(true),
      ariaLabel: `Прогресс дня ${overallPct}% — открыть выполненное`,
    },
    {
      key: "water",
      label: "Вода +250",
      value: `${water.total_ml}/${water.goal_ml}`,
      tone: waterReached ? "success" : "cobalt",
      onClick: handleQuickAddWater,
      ariaLabel: `Вода ${water.total_ml} из ${water.goal_ml} мл — добавить 250 мл`,
    },
    {
      key: "cycle",
      label: "Цикл",
      value: cycle?.cycle_day ? `${cycle.cycle_day} дн.` : "—",
      tone: cycle?.is_period_today ? "coral" : "neutral",
      onClick: () => onNavigate?.("habits", "cycle"),
      ariaLabel: cycle?.cycle_day
        ? `День цикла ${cycle.cycle_day} — открыть календарь`
        : "Открыть календарь цикла",
    },
  ];

  return (
    <div className="mt-section">
      <div className="mt-stack mt-stack--sm">
        <PageHeader
          title="Сегодня"
          subtitle={compactDateLabel}
          secondaryAction={
            onOpenYearReview || onOpenNotifications ? (
              <>
                {onOpenYearReview ? (
                  <button
                    type="button"
                    className="mt-icon-btn"
                    aria-label="Итоги года"
                    title="Итоги года"
                    onClick={onOpenYearReview}
                  >
                    <Award size={19} />
                  </button>
                ) : null}
                {onOpenNotifications ? (
                  <button
                    type="button"
                    className="mt-icon-btn"
                    aria-label="Уведомления"
                    title="Уведомления"
                    onClick={onOpenNotifications}
                  >
                    <Bell size={19} />
                    {pushEnabled ? (
                      <span className="mt-bell-dot" aria-hidden="true" />
                    ) : null}
                  </button>
                ) : null}
              </>
            ) : null
          }
          action={
            !isStandalone && onOpenInstallGuide ? (
              <button
                type="button"
                className="mt-icon-btn"
                aria-label="На экран «Домой»"
                title="На экран «Домой»"
                onClick={onOpenInstallGuide}
              >
                <Smartphone size={19} />
              </button>
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
        <div className="mt-card mt-card--compact">
          <p className="mt-card-sub">Загружаем сводку дня…</p>
        </div>
      ) : (
        <>
          <MetricStrip items={metricItems} />

          <DailyTaskPlanner
            tasks={tasks}
            onAddTask={() => {
              setEditingTask(null);
              setTaskSheetOpen(true);
            }}
            onEditTask={(task) => {
              setEditingTask(task);
              setTaskSheetOpen(true);
            }}
            onToggleTask={handleToggleTask}
            busyTaskId={busyTaskId}
          />

          <DailyAccomplishments
            feed={completedFeed}
            reflection={reflection}
            gratitudesCountHint={gratitudesCount}
            selectedDate={activeDate}
            todayDate={todayDate}
            notify={notify}
            onNavigate={onNavigate}
            onSaveReflection={handleSaveReflection}
            onGratitudeChanged={() => {
              loadToday(activeDate, { silent: true });
              onDataChanged?.();
            }}
            doneSheetOpen={doneSheetOpen}
            onOpenDoneSheet={() => setDoneSheetOpen(true)}
            onCloseDoneSheet={() => setDoneSheetOpen(false)}
            reflectionSheetOpen={reflectionSheetOpen}
            onOpenReflectionSheet={() => setReflectionSheetOpen(true)}
            onCloseReflectionSheet={() => setReflectionSheetOpen(false)}
            gratitudeSheetOpen={gratitudeSheetOpen}
            onOpenGratitudeSheet={() => setGratitudeSheetOpen(true)}
            onCloseGratitudeSheet={() => setGratitudeSheetOpen(false)}
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
        onReschedule={handleRescheduleTask}
        onDelete={handleDeleteTask}
        saving={savingTask}
      />
    </div>
  );
}
